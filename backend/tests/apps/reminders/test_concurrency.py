"""Два тика и два отправителя на разных соединениях; данные коммитятся, тест чистит их сам."""

import asyncio
from collections.abc import AsyncIterator
from datetime import date

import pytest
from sqlalchemy import delete
from sqlalchemy.ext.asyncio import AsyncEngine, AsyncSession, async_sessionmaker

from app.worker import tick
from apps.audit.models import AuditRecord
from apps.payments.models import PaymentOccurrence, RecurringPayment
from apps.payments.schemas import Currency, RecurringPaymentCreate
from apps.payments.service import PaymentsService
from apps.reminders.models import Notification
from apps.reminders.service import ReminderSender
from core.auth import Principal, Role
from tests.apps.reminders.conftest import REMINDERS, FakeNotifier, ReminderClock, notifications
from tests.auth_helpers import ADMIN_ID

pytestmark = pytest.mark.integration


@pytest.fixture
async def committed(
    migrated_engine: AsyncEngine,
) -> AsyncIterator[async_sessionmaker[AsyncSession]]:
    factory = async_sessionmaker(migrated_engine, expire_on_commit=False)
    yield factory
    async with factory() as session, session.begin():
        for model in (Notification, PaymentOccurrence, RecurringPayment, AuditRecord):
            await session.execute(delete(model))


async def test_parallel_ticks_and_senders_send_one_message(
    committed: async_sessionmaker[AsyncSession],
) -> None:
    clock = ReminderClock(date(2026, 10, 20))
    await PaymentsService(committed, clock).create(
        Principal(ADMIN_ID, "admin", Role.ADMIN),
        RecurringPaymentCreate(
            name="Сервер",
            amount_minor=2_500,
            currency=Currency.USD,
            next_due_date=date(2026, 10, 22),
        ),
    )

    await asyncio.gather(tick(committed, clock, REMINDERS), tick(committed, clock, REMINDERS))
    notifier = FakeNotifier(delay=0.2)
    first = ReminderSender(committed, clock, notifier, REMINDERS)
    second = ReminderSender(committed, clock, notifier, REMINDERS)
    await asyncio.gather(first.send_due(), second.send_due())

    assert len(notifier.sent) == 1
    assert [(n.kind, n.state) for n in await notifications(committed)] == [("due_soon", "sent")]
