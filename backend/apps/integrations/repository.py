"""Запросы к outbox событий и ключам идемпотентности."""

from collections.abc import Sequence
from datetime import datetime
from typing import Any
from uuid import UUID

from sqlalchemy import delete, exists, func, select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncSession

from apps.integrations.models import IdempotencyKey, IntegrationDelivery, IntegrationEvent


async def insert_event(
    session: AsyncSession, values: dict[str, Any], targets: Sequence[str]
) -> bool:
    """Записывает событие и доставки; событие с занятым `dedup_key` пропускается."""
    inserted = await session.scalar(
        insert(IntegrationEvent)
        .values(values)
        .on_conflict_do_nothing(index_elements=["dedup_key"])
        .returning(IntegrationEvent.id)
    )
    if inserted is None:
        return False
    if targets:
        await session.execute(
            insert(IntegrationDelivery).values(
                [{"event_id": inserted, "target": target} for target in targets]
            )
        )
    return True


async def existing_dedup_keys(session: AsyncSession, keys: Sequence[str]) -> set[str]:
    if not keys:
        return set()
    rows = await session.scalars(
        select(IntegrationEvent.dedup_key).where(IntegrationEvent.dedup_key.in_(keys))
    )
    return {key for key in rows if key is not None}


async def next_delivery(
    session: AsyncSession, now: datetime, targets: Sequence[str]
) -> tuple[IntegrationDelivery, IntegrationEvent] | None:
    row = (
        await session.execute(
            select(IntegrationDelivery, IntegrationEvent)
            .join(IntegrationEvent)
            .where(
                IntegrationDelivery.state == "pending",
                IntegrationDelivery.next_attempt_at <= now,
                IntegrationDelivery.target.in_(targets),
            )
            .order_by(IntegrationDelivery.next_attempt_at, IntegrationEvent.created_at)
            .limit(1)
            .with_for_update(of=IntegrationDelivery, skip_locked=True)
        )
    ).first()
    return None if row is None else (row[0], row[1])


async def pending_stats(session: AsyncSession) -> tuple[int, datetime | None]:
    row = (
        await session.execute(
            select(func.count(), func.min(IntegrationEvent.created_at))
            .select_from(IntegrationDelivery)
            .join(IntegrationEvent)
            .where(IntegrationDelivery.state == "pending")
        )
    ).one()
    return int(row[0]), row[1]


async def claim_key(
    session: AsyncSession, actor_id: UUID, key: str, operation: str, request_hash: str
) -> IdempotencyKey | None:
    """Занимает ключ; если он уже был, возвращает прежнюю запись."""
    inserted = await session.scalar(
        insert(IdempotencyKey)
        .values(actor_id=actor_id, key=key, operation=operation, request_hash=request_hash)
        .on_conflict_do_nothing(index_elements=["actor_id", "key"])
        .returning(IdempotencyKey.id)
    )
    if inserted is not None:
        return None
    return await session.scalar(
        select(IdempotencyKey).where(IdempotencyKey.actor_id == actor_id, IdempotencyKey.key == key)
    )


async def set_resource(session: AsyncSession, actor_id: UUID, key: str, resource_id: UUID) -> None:
    record = await session.scalar(
        select(IdempotencyKey).where(IdempotencyKey.actor_id == actor_id, IdempotencyKey.key == key)
    )
    if record is not None:
        record.resource_id = resource_id


async def delete_old(session: AsyncSession, keys_before: datetime, events_before: datetime) -> int:
    await session.execute(delete(IdempotencyKey).where(IdempotencyKey.created_at < keys_before))
    undelivered = exists().where(
        IntegrationDelivery.event_id == IntegrationEvent.id, IntegrationDelivery.state != "sent"
    )
    result = await session.execute(
        delete(IntegrationEvent)
        .where(IntegrationEvent.created_at < events_before, ~undelivered)
        .returning(IntegrationEvent.id)
    )
    return len(result.all())
