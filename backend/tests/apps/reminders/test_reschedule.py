"""Правка платежа с той же датой не пересоздаёт периоды и напоминания."""

from datetime import date

import httpx
import pytest
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.worker import tick
from apps.reminders.service import ReminderSender
from tests.apps.payments.conftest import ADMIN, create_payment, occurrences
from tests.apps.reminders.conftest import REMINDERS, FakeNotifier, ReminderClock, notifications

pytestmark = pytest.mark.integration


async def test_same_date_keeps_anchor_periods_and_reminders(
    api: httpx.AsyncClient,
    clock: ReminderClock,
    session_factory: async_sessionmaker[AsyncSession],
) -> None:
    payment = await create_payment(api, "2026-10-31")
    clock.current = date(2026, 11, 1)
    await tick(session_factory, clock, REMINDERS)
    clock.current = date(2026, 11, 28)
    await tick(session_factory, clock, REMINDERS)
    before_periods = await occurrences(api, payment["id"])
    before_reminders = {n.id for n in await notifications(session_factory)}

    responses = [
        await api.patch(
            f"/api/v1/recurring-payments/{payment['id']}",
            json={"nextDueDate": "2026-11-30"},
            headers=ADMIN,
        )
        for _ in range(2)
    ]

    assert [r.status_code for r in responses] == [200, 200]
    assert responses[-1].json()["anchorDay"] == 31
    assert await occurrences(api, payment["id"]) == before_periods
    assert {n.id for n in await notifications(session_factory)} == before_reminders


async def test_new_date_still_reschedules(api: httpx.AsyncClient) -> None:
    payment = await create_payment(api, "2026-10-31")

    response = await api.patch(
        f"/api/v1/recurring-payments/{payment['id']}",
        json={"nextDueDate": "2026-11-15"},
        headers=ADMIN,
    )

    assert (response.json()["anchorDay"], response.json()["nextDueDate"]) == (15, "2026-11-15")


async def test_period_shows_when_reminder_was_sent(
    api: httpx.AsyncClient,
    clock: ReminderClock,
    session_factory: async_sessionmaker[AsyncSession],
    bot: FakeNotifier,
) -> None:
    payment = await create_payment(api, "2026-10-26")
    before = (await occurrences(api, payment["id"]))[0]["reminderSentAt"]

    await ReminderSender(session_factory, clock, bot, REMINDERS).send_due()

    assert before is None
    assert (await occurrences(api, payment["id"]))[0]["reminderSentAt"] is not None
