from datetime import date, timedelta

import httpx
import pytest
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.worker import tick
from apps.reminders.service import GROUP_PAUSE_SECONDS, ReminderSender
from apps.reminders.telegram import ChatBlocked, TemporaryDeliveryError
from tests.apps.payments.conftest import ADMIN, USER, create_payment, occurrences
from tests.apps.reminders.conftest import (
    GROUP_CHAT,
    REMINDERS,
    FakeNotifier,
    ReminderClock,
    drop_created,
    notifications,
)

pytestmark = pytest.mark.integration


class Monotonic:
    def __init__(self) -> None:
        self.value = 1000.0

    def __call__(self) -> float:
        return self.value


def _sender(
    session_factory: async_sessionmaker[AsyncSession],
    clock: ReminderClock,
    notifier: FakeNotifier,
    monotonic: Monotonic | None = None,
) -> ReminderSender:
    return ReminderSender(
        session_factory, clock, notifier, REMINDERS, monotonic=monotonic or Monotonic()
    )


async def test_sends_reminder_to_group_chat(
    api: httpx.AsyncClient,
    clock: ReminderClock,
    session_factory: async_sessionmaker[AsyncSession],
) -> None:
    await create_payment(api, "2026-10-27")
    await drop_created(session_factory)
    notifier = FakeNotifier()

    handled = await _sender(session_factory, clock, notifier).send_due()

    assert handled == 1
    [(chat, thread, text, buttons)] = notifier.messages
    assert (chat, thread) == (GROUP_CHAT, None)
    assert text.splitlines()[0] == "🔔 <b>Скоро оплата</b> · через 3 дня"
    assert [b.text for b in buttons[0]] == ["✅ Оплачено", "⏰ Напомнить завтра"]
    [sent] = await notifications(session_factory)
    assert (sent.state, sent.external_id, sent.attempts) == ("sent", "1", 1)
    assert sent.sent_at is not None


async def test_paid_after_queueing_is_cancelled(
    api: httpx.AsyncClient,
    clock: ReminderClock,
    session_factory: async_sessionmaker[AsyncSession],
) -> None:
    payment = await create_payment(api, "2026-10-25")
    first = (await occurrences(api, payment["id"]))[0]
    await api.patch(f"/api/v1/payment-occurrences/{first['id']}", json={"paid": True}, headers=USER)
    await drop_created(session_factory)
    notifier = FakeNotifier()

    await _sender(session_factory, clock, notifier).send_due()

    assert notifier.sent == []
    assert [n.state for n in await notifications(session_factory)] == ["cancelled"]


async def test_stopped_after_queueing_is_cancelled(
    api: httpx.AsyncClient,
    clock: ReminderClock,
    session_factory: async_sessionmaker[AsyncSession],
) -> None:
    clock.current = date(2026, 10, 20)
    payment = await create_payment(api, "2026-10-20")
    clock.current = date(2026, 10, 24)
    await tick(session_factory, clock, REMINDERS)
    await api.delete(f"/api/v1/recurring-payments/{payment['id']}", headers=ADMIN)
    notifier = FakeNotifier()

    await _sender(session_factory, clock, notifier).send_due()

    assert notifier.sent == []
    assert {n.kind: n.state for n in await notifications(session_factory)} == {
        "due_soon": "cancelled",
        "overdue": "cancelled",
    }


async def test_overdue_text(
    api: httpx.AsyncClient,
    clock: ReminderClock,
    session_factory: async_sessionmaker[AsyncSession],
) -> None:
    clock.current = date(2026, 10, 23)
    await create_payment(api, "2026-10-23")
    clock.current = date(2026, 10, 24)
    await tick(session_factory, clock, REMINDERS)
    await drop_created(session_factory)
    notifier = FakeNotifier()

    await _sender(session_factory, clock, notifier).send_due()

    assert [text.splitlines()[0] for _, text in notifier.sent] == [
        "🔴 <b>Просрочена оплата</b> · 1 день"
    ]


async def test_temporary_error_is_retried_later(
    api: httpx.AsyncClient,
    clock: ReminderClock,
    session_factory: async_sessionmaker[AsyncSession],
) -> None:
    await create_payment(api, "2026-10-26")
    await drop_created(session_factory)
    notifier = FakeNotifier()
    notifier.errors.append(TemporaryDeliveryError("TelegramNetworkError: сеть недоступна"))
    sender = _sender(session_factory, clock, notifier)

    await sender.send_due()

    [queued] = await notifications(session_factory)
    assert (queued.state, queued.attempts, queued.last_error) == (
        "pending",
        1,
        "TelegramNetworkError: сеть недоступна",
    )
    delay = queued.next_attempt_at - clock.now()
    assert timedelta(seconds=58) < delay <= timedelta(seconds=60)


async def test_rate_limit_uses_telegram_delay(
    api: httpx.AsyncClient,
    clock: ReminderClock,
    session_factory: async_sessionmaker[AsyncSession],
) -> None:
    await create_payment(api, "2026-10-26")
    await drop_created(session_factory)
    notifier = FakeNotifier()
    notifier.errors.append(TemporaryDeliveryError("TelegramRetryAfter", retry_after=17))

    await _sender(session_factory, clock, notifier).send_due()

    [queued] = await notifications(session_factory)
    delay = queued.next_attempt_at - clock.now()
    assert timedelta(seconds=15) < delay <= timedelta(seconds=17)


async def test_permanent_error_fails(
    api: httpx.AsyncClient,
    clock: ReminderClock,
    session_factory: async_sessionmaker[AsyncSession],
) -> None:
    await create_payment(api, "2026-10-26")
    await drop_created(session_factory)
    notifier = FakeNotifier()
    notifier.errors.append(ChatBlocked("TelegramForbiddenError: bot was kicked"))

    await _sender(session_factory, clock, notifier).send_due()

    [failed] = await notifications(session_factory)
    assert (failed.state, failed.last_error) == ("failed", "TelegramForbiddenError: bot was kicked")


async def test_group_chat_pause(
    api: httpx.AsyncClient,
    clock: ReminderClock,
    session_factory: async_sessionmaker[AsyncSession],
) -> None:
    await create_payment(api, "2026-10-26", name="Первый")
    await create_payment(api, "2026-10-27", name="Второй")
    await drop_created(session_factory)
    notifier = FakeNotifier()
    monotonic = Monotonic()
    sender = _sender(session_factory, clock, notifier, monotonic)

    assert await sender.send_due() == 1
    monotonic.value += GROUP_PAUSE_SECONDS - 0.1
    assert await sender.send_due() == 0
    monotonic.value += 0.2
    assert await sender.send_due() == 1

    assert len(notifier.sent) == 2
