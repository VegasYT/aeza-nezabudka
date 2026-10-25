from collections import Counter
from datetime import date

import httpx
import pytest
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.worker import tick
from apps.payments.schemas import Currency, RecurringPaymentCreate
from apps.payments.service import PaymentsService
from core.auth import Principal, Role
from core.config import ReminderSettings
from tests.apps.integrations.conftest import deliveries, events
from tests.apps.payments.conftest import ADMIN, USER, MovableClock, create_payment, occurrences
from tests.auth_helpers import ADMIN_ID

pytestmark = pytest.mark.integration

REMINDERS = ReminderSettings.model_construct(telegram_chat_id=None, reminder_days_before=3)


async def test_payment_lifecycle_events(
    api: httpx.AsyncClient, session_factory: async_sessionmaker[AsyncSession]
) -> None:
    payment = await create_payment(api, "2026-11-05")
    await api.patch(
        f"/api/v1/recurring-payments/{payment['id']}", json={"name": "Офис"}, headers=ADMIN
    )
    await api.delete(f"/api/v1/recurring-payments/{payment['id']}", headers=ADMIN)

    recorded = await events(session_factory)

    assert [e["type"] for e in recorded] == [
        "payment.created",
        "payment.updated",
        "payment.stopped",
    ]
    created = recorded[0]
    assert (created["schemaVersion"], created["data"]["actorLogin"]) == (1, "admin")
    assert created["data"]["payment"] | {"id": None} == {
        "id": None,
        "name": "Аренда офиса",
        "amountMinor": 15_000_000,
        "currency": "RUB",
        "anchorDay": 5,
        "period": "month",
        "periodCount": 1,
        "occurrenceLimit": None,
        "reminderDaysBefore": None,
        "nextDueDate": "2026-11-05",
        "department": None,
        "stopped": False,
    }
    assert recorded[2]["data"]["payment"]["stopped"] is True
    assert Counter(d.target for d in await deliveries(session_factory)) == {
        "webhook": 3,
        "kafka": 3,
    }


async def test_paid_and_unpaid_events(
    api: httpx.AsyncClient, session_factory: async_sessionmaker[AsyncSession]
) -> None:
    payment = await create_payment(api, "2026-11-05")
    first = (await occurrences(api, payment["id"]))[0]
    url = f"/api/v1/payment-occurrences/{first['id']}"
    await api.patch(url, json={"paid": True, "paidOn": "2026-10-23"}, headers=USER)
    await api.patch(url, json={"paid": False}, headers=USER)

    paid, unpaid = (await events(session_factory))[1:]

    assert (paid["type"], unpaid["type"]) == ("occurrence.paid", "occurrence.unpaid")
    assert paid["data"]["occurrence"] | {"id": None} == {
        "id": None,
        "dueDate": "2026-11-05",
        "amountMinor": 15_000_000,
        "currency": "RUB",
        "paidOn": "2026-10-23",
        "paidByLogin": "buh.petrova",
    }
    assert paid["data"]["actorLogin"] == "buh.petrova"
    assert paid["data"]["payment"]["name"] == "Аренда офиса"


async def test_failed_change_records_no_event(
    api: httpx.AsyncClient, session_factory: async_sessionmaker[AsyncSession]
) -> None:
    payment = await create_payment(api, "2026-11-05")
    await api.delete(f"/api/v1/recurring-payments/{payment['id']}", headers=ADMIN)

    response = await api.patch(
        f"/api/v1/recurring-payments/{payment['id']}", json={"name": "Офис"}, headers=ADMIN
    )

    assert response.status_code == 409
    assert [e["type"] for e in await events(session_factory)] == [
        "payment.created",
        "payment.stopped",
    ]


async def test_time_events_are_recorded_once(
    api: httpx.AsyncClient,
    clock: MovableClock,
    session_factory: async_sessionmaker[AsyncSession],
) -> None:
    clock.current = date(2026, 10, 20)
    await create_payment(api, "2026-10-20")
    await tick(session_factory, clock, REMINDERS, ("webhook",))
    clock.current = date(2026, 10, 24)

    await tick(session_factory, clock, REMINDERS, ("webhook",))
    await tick(session_factory, clock, REMINDERS, ("webhook",))

    recorded = Counter(e["type"] for e in await events(session_factory))
    assert recorded == {"payment.created": 1, "occurrence.due_soon": 1, "occurrence.overdue": 1}
    overdue = next(e for e in await events(session_factory) if e["type"] == "occurrence.overdue")
    assert overdue["data"]["actorLogin"] is None


async def test_without_adapters_events_are_only_stored(
    clock: MovableClock, session_factory: async_sessionmaker[AsyncSession]
) -> None:
    await PaymentsService(session_factory, clock).create(
        Principal(ADMIN_ID, "admin", Role.ADMIN),
        RecurringPaymentCreate(
            name="Сервер",
            amount_minor=2_500,
            currency=Currency.USD,
            next_due_date=date(2026, 11, 1),
        ),
    )

    assert [e["type"] for e in await events(session_factory)] == ["payment.created"]
    assert await deliveries(session_factory) == []
