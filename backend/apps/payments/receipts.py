"""Чеки оплаты периодов (ADR-017): файл в S3-хранилище, запись о нём в базе."""

import hashlib
import uuid
from collections.abc import Sequence
from dataclasses import dataclass
from datetime import timedelta
from uuid import UUID

import structlog
from fastapi import Request
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from apps.audit.service import record
from apps.payments import repository
from apps.payments.domain import RECEIPT_MAX_BYTES, receipt_name, receipt_type
from apps.payments.models import OccurrenceReceipt
from core.auth import Principal
from core.clock import Clock
from core.errors import AppError, invalid_field, not_found
from core.storage import ObjectStorage, StorageError

log = structlog.get_logger(__name__)

PREFIX = "receipts/"
# объект без записи моложе суток может ждать коммита своей записи
ORPHAN_AGE = timedelta(days=1)


def receipts_disabled() -> AppError:
    return AppError("receipts_disabled", "Хранилище чеков не настроено", status_code=409)


def _storage_unavailable() -> AppError:
    return AppError(
        "storage_unavailable", "Хранилище чеков недоступно, попробуйте позже", status_code=503
    )


def _not_paid() -> AppError:
    return AppError(
        "occurrence_not_paid", "Чек прикладывается к оплаченному периоду", status_code=409
    )


def _no_receipt(occurrence_id: UUID) -> AppError:
    return not_found("Receipt", occurrence_id, "У периода нет чека")


@dataclass(frozen=True)
class ReceiptFile:
    receipt: OccurrenceReceipt
    data: bytes


async def receipts_of(
    session_factory: async_sessionmaker[AsyncSession], occurrence_ids: Sequence[UUID]
) -> dict[UUID, OccurrenceReceipt]:
    if not occurrence_ids:
        return {}
    async with session_factory() as session:
        rows = await session.scalars(
            select(OccurrenceReceipt).where(OccurrenceReceipt.occurrence_id.in_(occurrence_ids))
        )
        return {row.occurrence_id: row for row in rows}


class ReceiptsService:
    def __init__(
        self,
        session_factory: async_sessionmaker[AsyncSession],
        clock: Clock,
        storage: ObjectStorage | None,
    ) -> None:
        self._session_factory = session_factory
        self._clock = clock
        self._storage = storage

    async def attach(
        self,
        actor: Principal,
        occurrence_id: UUID,
        file_name: str | None,
        data: bytes,
        *,
        source: str | None = None,
    ) -> OccurrenceReceipt:
        """Новый чек заменяет прежний: объект пишется под новым ключом, старый удаляется после
        коммита, поэтому сбой не оставляет запись без файла."""
        storage = self._enabled()
        if len(data) > RECEIPT_MAX_BYTES:
            raise invalid_field("file", "Файл больше 10 МБ")
        content_type = receipt_type(data)
        if content_type is None:
            raise invalid_field("file", "Чек - PDF, JPEG, PNG или WebP")
        async with self._session_factory() as session:
            await self._paid_occurrence(session, occurrence_id)
        key = f"{PREFIX}{occurrence_id}/{uuid.uuid4().hex}"
        try:
            await storage.put(key, data, content_type)
        except StorageError:
            raise _storage_unavailable() from None
        try:
            async with self._session_factory() as session, session.begin():
                payment_name = await self._paid_occurrence(session, occurrence_id, lock=True)
                receipt = await session.get(OccurrenceReceipt, occurrence_id)
                replaced = None if receipt is None else receipt.object_key
                if receipt is None:
                    receipt = OccurrenceReceipt(occurrence_id=occurrence_id)
                    session.add(receipt)
                receipt.object_key = key
                receipt.file_name = receipt_name(file_name, content_type)
                receipt.content_type = content_type
                receipt.size = len(data)
                receipt.sha256 = hashlib.sha256(data).hexdigest()
                receipt.uploaded_by_id = actor.id
                receipt.uploaded_by_login = actor.login
                receipt.uploaded_at = self._clock.now()
                await record(
                    session,
                    actor,
                    "receipt.attached",
                    "occurrence",
                    entity_id=occurrence_id,
                    entity_name=payment_name,
                    details={
                        **({"source": source} if source else {}),
                        "file_name": receipt.file_name,
                        "content_type": content_type,
                        "size": len(data),
                        "replaced": replaced is not None,
                    },
                )
        except BaseException:
            await self._forget(key)
            raise
        if replaced is not None:
            await self._forget(replaced)
        return receipt

    async def read(self, occurrence_id: UUID) -> ReceiptFile:
        storage = self._enabled()
        async with self._session_factory() as session:
            receipt = await session.get(OccurrenceReceipt, occurrence_id)
        if receipt is None:
            raise _no_receipt(occurrence_id)
        try:
            return ReceiptFile(receipt, await storage.get(receipt.object_key))
        except StorageError:
            raise _storage_unavailable() from None

    async def delete(self, actor: Principal, occurrence_id: UUID) -> None:
        self._enabled()
        async with self._session_factory() as session, session.begin():
            receipt = await session.get(OccurrenceReceipt, occurrence_id, with_for_update=True)
            if receipt is None:
                raise _no_receipt(occurrence_id)
            row = await repository.get_occurrence(session, occurrence_id)
            key = receipt.object_key
            await session.delete(receipt)
            await record(
                session,
                actor,
                "receipt.deleted",
                "occurrence",
                entity_id=occurrence_id,
                entity_name=None if row is None else row.payment_name,
                details={"file_name": receipt.file_name},
            )
        await self._forget(key)

    async def cleanup(self) -> int:
        """Удаляет объекты без записи о чеке: после сбоя между шагами или отмены оплаты."""
        if self._storage is None:
            return 0
        keys = await self._storage.keys(PREFIX, self._clock.now() - ORPHAN_AGE)
        if not keys:
            return 0
        async with self._session_factory() as session:
            known = set(
                await session.scalars(
                    select(OccurrenceReceipt.object_key).where(
                        OccurrenceReceipt.object_key.in_(keys)
                    )
                )
            )
        orphans = [key for key in keys if key not in known]
        for key in orphans:
            await self._storage.delete(key)
        return len(orphans)

    def _enabled(self) -> ObjectStorage:
        if self._storage is None:
            raise receipts_disabled()
        return self._storage

    @staticmethod
    async def _paid_occurrence(
        session: AsyncSession, occurrence_id: UUID, *, lock: bool = False
    ) -> str:
        row = await repository.get_occurrence(session, occurrence_id, lock=lock)
        if row is None:
            raise not_found("PaymentOccurrence", occurrence_id, "Период оплаты не найден")
        if row.occurrence.paid_on is None:
            raise _not_paid()
        return row.payment_name

    async def _forget(self, key: str) -> None:
        # не удалось - объект без записи уберёт cleanup
        try:
            await self._enabled().delete(key)
        except StorageError:
            log.warning("receipt_delete_failed", key=key)


def receipts_service(request: Request) -> ReceiptsService:
    state = request.app.state
    return ReceiptsService(state.session_factory, state.clock, state.storage)
