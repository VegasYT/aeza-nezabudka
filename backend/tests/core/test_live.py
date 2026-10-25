"""События через NOTIFY на настоящей базе: доставка после коммита, журнал, переподключение."""

import asyncio
import uuid
from collections.abc import AsyncIterator

import pytest
from sqlalchemy import delete, text
from sqlalchemy.ext.asyncio import AsyncEngine, AsyncSession, async_sessionmaker

from apps.audit.models import AuditRecord
from apps.departments.service import DepartmentsService
from core.auth import Principal, Role
from core.live import RESYNC, LiveBroker, LiveEvent, publish

pytestmark = pytest.mark.integration

ADMIN = Principal(uuid.uuid4(), "admin", Role.ADMIN)


@pytest.fixture
async def queue(postgres_url: str) -> AsyncIterator[asyncio.Queue[LiveEvent]]:
    broker = LiveBroker(postgres_url)
    with broker.subscribe() as events:
        task = asyncio.create_task(broker.run())
        # первое событие после LISTEN - resync: дальше брокер точно слушает
        assert await asyncio.wait_for(events.get(), 10) == RESYNC
        yield events
        task.cancel()


async def _next(queue: asyncio.Queue[LiveEvent]) -> LiveEvent:
    return await asyncio.wait_for(queue.get(), 5)


async def test_event_arrives_after_commit_only(
    queue: asyncio.Queue[LiveEvent], migrated_engine: AsyncEngine
) -> None:
    async with AsyncSession(migrated_engine) as session:
        transaction = await session.begin()
        await publish(session, LiveEvent("rolled.back", "all"))
        await transaction.rollback()
        async with session.begin():
            await publish(session, LiveEvent("committed", "all", entity_name="я" * 500))

    event = await _next(queue)

    assert event.type == "committed"
    assert event.entity_name == "я" * 200


async def test_audit_record_publishes_change(
    queue: asyncio.Queue[LiveEvent], migrated_engine: AsyncEngine
) -> None:
    factory = async_sessionmaker(migrated_engine, expire_on_commit=False)
    department = await DepartmentsService(factory).create(ADMIN, f"Склад {uuid.uuid4().hex[:6]}")
    await DepartmentsService(factory).delete(ADMIN, department.id)

    created, deleted = await _next(queue), await _next(queue)
    # данные закоммичены по-настоящему: журнал чистим сами, другие тесты ждут его пустым
    async with factory() as session, session.begin():
        await session.execute(
            delete(AuditRecord).where(AuditRecord.entity_id == str(department.id))
        )

    assert (created.type, created.audience, created.entity_id) == (
        "department.created",
        "all",
        str(department.id),
    )
    assert (deleted.type, deleted.actor_login) == ("department.deleted", "admin")


async def test_lost_connection_gives_resync(
    queue: asyncio.Queue[LiveEvent], migrated_engine: AsyncEngine
) -> None:
    async with migrated_engine.connect() as connection:
        await connection.execute(
            text(
                "select pg_terminate_backend(pid) from pg_stat_activity "
                "where query like 'LISTEN%live_events%'"
            )
        )

    assert await asyncio.wait_for(queue.get(), 10) == RESYNC
