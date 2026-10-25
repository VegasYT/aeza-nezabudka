from datetime import date

import httpx
import pytest
from prometheus_client import REGISTRY
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.worker import tick
from apps.reminders.service import ReminderSender
from apps.reminders.telegram import TemporaryDeliveryError
from tests.apps.payments.conftest import create_payment
from tests.apps.reminders.conftest import REMINDERS, FakeNotifier, ReminderClock, drop_created

pytestmark = pytest.mark.integration


def _value(name: str, **labels: str) -> float:
    return REGISTRY.get_sample_value(name, labels) or 0.0


async def test_tick_reports_queue_size(
    api: httpx.AsyncClient,
    clock: ReminderClock,
    session_factory: async_sessionmaker[AsyncSession],
) -> None:
    await create_payment(api, "2026-10-25", name="Первый")
    await create_payment(api, "2026-10-26", name="Второй")
    await drop_created(session_factory)

    await tick(session_factory, clock, REMINDERS)

    assert _value("outbox_pending", queue="notifications") == 2
    assert _value("outbox_oldest_pending_age_seconds", queue="notifications") >= 0


async def test_retry_is_counted(
    api: httpx.AsyncClient,
    clock: ReminderClock,
    session_factory: async_sessionmaker[AsyncSession],
) -> None:
    await create_payment(api, "2026-10-26")
    notifier = FakeNotifier()
    notifier.errors.append(TemporaryDeliveryError("TelegramNetworkError: сеть недоступна"))
    before = _value("notifications_total", recipient="group", result="retry")

    await ReminderSender(session_factory, clock, notifier, REMINDERS).send_due()

    assert _value("notifications_total", recipient="group", result="retry") == before + 1


async def test_tick_reports_open_payments(
    api: httpx.AsyncClient,
    clock: ReminderClock,
    session_factory: async_sessionmaker[AsyncSession],
) -> None:
    clock.current = date(2026, 10, 20)
    await create_payment(api, "2026-10-20", amount_minor=1_500)
    await create_payment(api, "2026-11-20", name="Позже", currency="USD")
    clock.current = date(2026, 10, 24)

    await tick(session_factory, clock, REMINDERS)

    assert _value("payments_active") == 2
    assert _value("payment_occurrences_open", state="overdue", currency="RUB") == 1
    assert _value("payment_occurrences_open_amount", state="overdue", currency="RUB") == 15.0
    assert _value("payment_occurrences_open", state="due_soon", currency="USD") == 0
