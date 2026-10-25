"""Интеграционные события: запись в транзакции изменения, доставка адаптерами, идемпотентность."""

import hashlib
import json
import uuid
from collections.abc import Mapping, Sequence
from datetime import datetime, timedelta
from enum import StrEnum
from typing import Any
from uuid import UUID

import structlog
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from apps.integrations import repository
from apps.integrations.publishers import (
    EventPublisher,
    OutgoingEvent,
    PermanentPublishError,
    TemporaryPublishError,
)
from core.clock import Clock
from core.errors import AppError
from core.metrics import INTEGRATION_DELIVERIES
from core.retry import retry_delay

log = structlog.get_logger(__name__)

SCHEMA_VERSION = 1
KEY_TTL = timedelta(days=1)
EVENT_TTL = timedelta(days=30)


class EventType(StrEnum):
    PAYMENT_CREATED = "payment.created"
    PAYMENT_UPDATED = "payment.updated"
    PAYMENT_STOPPED = "payment.stopped"
    PAYMENT_RESUMED = "payment.resumed"
    OCCURRENCE_DUE_SOON = "occurrence.due_soon"
    OCCURRENCE_PAID = "occurrence.paid"
    OCCURRENCE_UNPAID = "occurrence.unpaid"
    OCCURRENCE_OVERDUE = "occurrence.overdue"


def dedup_key(event_type: EventType, entity_id: UUID) -> str:
    return f"{event_type.value}:{entity_id}"


async def record_event(
    session: AsyncSession,
    targets: Sequence[str],
    event_type: EventType,
    data: Mapping[str, Any],
    *,
    partition_key: UUID,
    occurred_at: datetime,
    dedup: str | None = None,
) -> bool:
    """Пишет событие в текущей транзакции; False - событие с таким `dedup` уже было."""
    event_id = uuid.uuid4()
    payload = {
        "id": str(event_id),
        "type": event_type.value,
        "schemaVersion": SCHEMA_VERSION,
        "occurredAt": occurred_at.isoformat(),
        "data": data,
    }
    return await repository.insert_event(
        session,
        {
            "id": event_id,
            "type": event_type.value,
            "schema_version": SCHEMA_VERSION,
            "dedup_key": dedup,
            "partition_key": str(partition_key),
            "payload": payload,
        },
        targets,
    )


async def recorded_dedup_keys(session: AsyncSession, keys: Sequence[str]) -> set[str]:
    """Какие из ключей уже выпущены: чтобы не собирать данные событий заново на каждом тике."""
    return await repository.existing_dedup_keys(session, keys)


def request_hash(body: Mapping[str, Any]) -> str:
    return hashlib.sha256(json.dumps(body, sort_keys=True, default=str).encode()).hexdigest()


async def replayed_resource(
    session: AsyncSession, actor_id: UUID, key: str, operation: str, body_hash: str
) -> UUID | None:
    """Занимает ключ идемпотентности; при повторе возвращает созданный тогда объект."""
    previous = await repository.claim_key(session, actor_id, key, operation, body_hash)
    if previous is None:
        return None
    if previous.operation != operation or previous.request_hash != body_hash:
        raise AppError(
            "idempotency_key_reused",
            "Ключ Idempotency-Key уже использован с другими данными",
            status_code=400,
        )
    return previous.resource_id


async def remember_resource(
    session: AsyncSession, actor_id: UUID, key: str, resource_id: UUID
) -> None:
    await repository.set_resource(session, actor_id, key, resource_id)


async def pending_stats(session: AsyncSession) -> tuple[int, datetime | None]:
    """Сколько доставок ждёт отправки и когда создана старейшая."""
    return await repository.pending_stats(session)


def _body(payload: Mapping[str, Any]) -> bytes:
    return json.dumps(payload, ensure_ascii=False, separators=(",", ":")).encode()


class EventDeliverer:
    """Доставляет события по одному, каждое в своей транзакции; как отправитель напоминаний."""

    def __init__(
        self,
        session_factory: async_sessionmaker[AsyncSession],
        clock: Clock,
        publishers: Mapping[str, EventPublisher],
    ) -> None:
        self._session_factory = session_factory
        self._clock = clock
        self._publishers = publishers

    async def send_due(self) -> int:
        handled = 0
        while await self.send_one():
            handled += 1
        return handled

    async def send_one(self) -> bool:
        now = self._clock.now()
        async with self._session_factory() as session, session.begin():
            found = await repository.next_delivery(session, now, list(self._publishers))
            if found is None:
                return False
            delivery, event = found
            delivery.attempts += 1
            outgoing = OutgoingEvent(
                event.id, event.type, event.partition_key, _body(event.payload)
            )
            try:
                await self._publishers[delivery.target].publish(outgoing)
            except TemporaryPublishError as error:
                delay = retry_delay(delivery.attempts)
                delivery.next_attempt_at = now + timedelta(seconds=delay)
                delivery.last_error = error.reason
                result = "retry"
                log.warning("event_retry", event_id=str(event.id), target=delivery.target)
            except PermanentPublishError as error:
                delivery.state = "failed"
                delivery.last_error = error.reason
                result = "failed"
                log.error("event_failed", event_id=str(event.id), target=delivery.target)
            else:
                delivery.state = "sent"
                delivery.sent_at = now
                delivery.last_error = None
                result = "sent"
                log.info("event_sent", event_id=str(event.id), target=delivery.target)
            INTEGRATION_DELIVERIES.labels(delivery.target, result).inc()
            return True

    async def close(self) -> None:
        for publisher in self._publishers.values():
            await publisher.close()


async def cleanup(session_factory: async_sessionmaker[AsyncSession], clock: Clock) -> None:
    """Удаляет ключи идемпотентности старше суток и доставленные события старше 30 дней."""
    now = clock.now()
    async with session_factory() as session, session.begin():
        removed = await repository.delete_old(session, now - KEY_TTL, now - EVENT_TTL)
    log.info("integrations_cleanup_done", events_removed=removed)
