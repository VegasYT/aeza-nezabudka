"""Окно напоминаний: своё у платежа и общее из панели."""

import httpx
import pytest
from prometheus_client import REGISTRY
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.worker import tick
from apps.reminders.service import ReminderSender
from tests.apps.payments.conftest import ADMIN, USER, create_payment, occurrences
from tests.apps.reminders.conftest import (
    REMINDERS,
    FakeNotifier,
    ReminderClock,
    drop_created,
    notifications,
)

pytestmark = pytest.mark.integration


async def test_payment_window_brings_reminder_earlier(
    api: httpx.AsyncClient, session_factory: async_sessionmaker[AsyncSession]
) -> None:
    # сегодня 24 октября, срок через 6 дней: общее окно 3 дня, своё у аренды - 7
    rent = await create_payment(api, "2026-10-30", name="Аренда", reminder_days_before=7)
    await create_payment(api, "2026-10-30", name="Подписка")

    queued = await notifications(session_factory)

    assert rent["reminderDaysBefore"] == 7
    assert [str(n.occurrence_id) for n in queued] == [(await occurrences(api, rent["id"]))[0]["id"]]


async def test_sender_and_tick_use_payment_window(
    api: httpx.AsyncClient,
    session_factory: async_sessionmaker[AsyncSession],
    clock: ReminderClock,
    bot: FakeNotifier,
) -> None:
    await create_payment(api, "2026-10-30", reminder_days_before=7)
    await drop_created(session_factory)

    sent = await ReminderSender(session_factory, clock, bot, REMINDERS).send_due()
    await tick(session_factory, clock, REMINDERS)

    assert sent == 1
    assert len(bot.sent) == 1
    labels = {"state": "due_soon", "currency": "RUB"}
    assert REGISTRY.get_sample_value("payment_occurrences_open", labels) == 1


async def test_panel_window_applies_without_restart(
    api: httpx.AsyncClient, session_factory: async_sessionmaker[AsyncSession]
) -> None:
    changed = await api.patch("/api/v1/settings", json={"reminderDaysBefore": 1}, headers=ADMIN)
    await create_payment(api, "2026-10-26")

    current = await api.get("/api/v1/settings", headers=USER)
    log = (await api.get("/api/v1/audit-log", headers=ADMIN)).json()["items"]

    assert changed.status_code == 200, changed.text
    assert current.json()["reminderDaysBefore"] == 1
    assert await notifications(session_factory) == []
    entry = next(e for e in log if e["action"] == "settings.updated")
    assert entry["details"] == {
        "before": {"reminderDaysBefore": 3},
        "after": {"reminderDaysBefore": 1, "fromServerSettings": False},
    }


async def test_settings_rules(api: httpx.AsyncClient) -> None:
    default = await api.get("/api/v1/settings", headers=USER)
    forbidden = await api.patch("/api/v1/settings", json={"reminderDaysBefore": 5}, headers=USER)
    invalid = await api.patch("/api/v1/settings", json={"reminderDaysBefore": 31}, headers=ADMIN)

    assert default.json() | {"today": None} == {
        "today": None,
        "timezone": "Europe/Moscow",
        "reminderDaysBefore": 3,
        "reminderDaysBeforeDefault": 3,
        "receiptsEnabled": False,
    }
    assert (forbidden.status_code, invalid.status_code) == (403, 400)


async def test_panel_window_resets_to_server_value(api: httpx.AsyncClient) -> None:
    await api.patch("/api/v1/settings", json={"reminderDaysBefore": 10}, headers=ADMIN)

    reset = await api.patch("/api/v1/settings", json={"reminderDaysBefore": None}, headers=ADMIN)
    log = (await api.get("/api/v1/audit-log", headers=ADMIN)).json()["items"]

    assert reset.json()["reminderDaysBefore"] == 3
    assert (await api.get("/api/v1/settings", headers=USER)).json()["reminderDaysBefore"] == 3
    assert log[0]["details"] == {
        "before": {"reminderDaysBefore": 10},
        "after": {"reminderDaysBefore": 3, "fromServerSettings": True},
    }


async def test_payment_window_can_return_to_default(api: httpx.AsyncClient) -> None:
    payment = await create_payment(api, "2026-11-01", reminder_days_before=10)

    response = await api.patch(
        f"/api/v1/recurring-payments/{payment['id']}",
        json={"reminderDaysBefore": None},
        headers=ADMIN,
    )
    invalid = await api.patch(
        f"/api/v1/recurring-payments/{payment['id']}",
        json={"reminderDaysBefore": 31},
        headers=ADMIN,
    )

    assert response.json()["reminderDaysBefore"] is None
    assert (await occurrences(api, payment["id"]))[0]["recurringPayment"][
        "reminderDaysBefore"
    ] is None
    assert invalid.status_code == 400
