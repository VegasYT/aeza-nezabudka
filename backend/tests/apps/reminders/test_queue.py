from datetime import date

import httpx
import pytest
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.worker import tick
from apps.reminders.service import enqueue
from core.config import ReminderSettings
from tests.apps.payments.conftest import ADMIN, USER, create_payment, occurrences
from tests.apps.reminders.conftest import REMINDERS, ReminderClock, notifications

pytestmark = pytest.mark.integration


async def test_late_payment_is_queued_in_same_transaction(
    api: httpx.AsyncClient, session_factory: async_sessionmaker[AsyncSession]
) -> None:
    payment = await create_payment(api, "2026-10-25")

    queued = await notifications(session_factory)

    first = (await occurrences(api, payment["id"]))[0]
    assert [(str(n.occurrence_id), n.kind, n.recipient, n.state) for n in queued] == [
        (first["id"], "due_soon", "group", "pending")
    ]


async def test_due_date_moved_into_window_is_queued(
    api: httpx.AsyncClient, session_factory: async_sessionmaker[AsyncSession]
) -> None:
    payment = await create_payment(api, "2026-11-10")
    assert await notifications(session_factory) == []

    response = await api.patch(
        f"/api/v1/recurring-payments/{payment['id']}",
        json={"nextDueDate": "2026-10-26"},
        headers=ADMIN,
    )

    assert response.status_code == 200, response.text
    assert [(n.kind, n.recipient) for n in await notifications(session_factory)] == [
        ("due_soon", "group")
    ]


async def test_paid_and_stopped_are_not_queued(
    api: httpx.AsyncClient,
    clock: ReminderClock,
    session_factory: async_sessionmaker[AsyncSession],
) -> None:
    paid = await create_payment(api, "2026-11-10", name="Оплачен заранее")
    first = (await occurrences(api, paid["id"]))[0]
    await api.patch(f"/api/v1/payment-occurrences/{first['id']}", json={"paid": True}, headers=USER)
    stopped = await create_payment(api, "2026-11-10", name="Прекращён")
    await api.delete(f"/api/v1/recurring-payments/{stopped['id']}", headers=ADMIN)
    clock.current = date(2026, 11, 8)

    await tick(session_factory, clock, REMINDERS)

    assert await notifications(session_factory) == []


async def test_overdue_after_downtime_is_queued_once(
    api: httpx.AsyncClient,
    clock: ReminderClock,
    session_factory: async_sessionmaker[AsyncSession],
) -> None:
    clock.current = date(2026, 10, 20)
    await create_payment(api, "2026-10-20")
    clock.current = date(2026, 10, 24)

    await tick(session_factory, clock, REMINDERS)
    await tick(session_factory, clock, REMINDERS)

    assert sorted(n.kind for n in await notifications(session_factory)) == [
        "due_soon",
        "overdue",
    ]


async def test_tick_creates_next_period(
    api: httpx.AsyncClient,
    clock: ReminderClock,
    session_factory: async_sessionmaker[AsyncSession],
) -> None:
    clock.current = date(2026, 10, 19)
    payment = await create_payment(api, "2026-10-19")
    clock.current = date(2026, 10, 20)

    await tick(session_factory, clock, REMINDERS)

    assert "2026-11-19" in [o["dueDate"] for o in await occurrences(api, payment["id"])]


async def test_nothing_is_queued_without_group_chat(
    api: httpx.AsyncClient, session_factory: async_sessionmaker[AsyncSession]
) -> None:
    await create_payment(api, "2026-11-10")
    disabled = ReminderSettings.model_construct(telegram_chat_id=None, reminder_days_before=30)

    async with session_factory() as session, session.begin():
        queued = await enqueue(session, date(2026, 10, 24), disabled)

    assert queued == 0
