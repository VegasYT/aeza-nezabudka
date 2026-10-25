from datetime import date
from typing import Any
from uuid import uuid4

import httpx
import pytest
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from apps.audit.models import AuditRecord
from apps.reminders.domain import PaymentLine, ReminderKind, reminder_card
from tests.apps.payments.conftest import ADMIN, USER, create_payment, occurrences
from tests.conftest import TODAY

pytestmark = pytest.mark.integration


async def create_department(api: httpx.AsyncClient, name: str) -> dict[str, Any]:
    response = await api.post("/api/v1/departments", json={"name": name}, headers=ADMIN)
    assert response.status_code == 201, response.text
    return dict(response.json())


async def test_create_and_list(
    api: httpx.AsyncClient, session_factory: async_sessionmaker[AsyncSession]
) -> None:
    await create_department(api, "Склад")
    office = await create_department(api, "Офис")

    response = await api.get("/api/v1/departments", headers=USER)

    items = response.json()["items"]
    assert [item["name"] for item in items] == ["Офис", "Склад"]
    assert items[0] == office
    assert response.json()["total"] == 2
    async with session_factory() as session:
        actions = list(await session.scalars(select(AuditRecord.action)))
    assert actions.count("department.created") == 2


async def test_name_must_be_unique(api: httpx.AsyncClient) -> None:
    await create_department(api, "Офис")
    store = await create_department(api, "Склад")

    created = await api.post("/api/v1/departments", json={"name": "Офис"}, headers=ADMIN)
    renamed = await api.patch(
        f"/api/v1/departments/{store['id']}", json={"name": "Офис"}, headers=ADMIN
    )

    assert (created.status_code, created.json()["error"]) == (409, "department_name_taken")
    assert (renamed.status_code, renamed.json()["error"]) == (409, "department_name_taken")


async def test_rename(api: httpx.AsyncClient) -> None:
    office = await create_department(api, "Офис")

    response = await api.patch(
        f"/api/v1/departments/{office['id']}", json={"name": "Головной офис"}, headers=ADMIN
    )

    assert response.json() == {"id": office["id"], "name": "Головной офис", "paymentsCount": 0}


async def test_unknown_department_is_not_found(api: httpx.AsyncClient) -> None:
    missing = "3c2b1a09-8f7e-4d6c-9b5a-4f3e2d1c0b9a"

    renamed = await api.patch(f"/api/v1/departments/{missing}", json={"name": "X"}, headers=ADMIN)
    deleted = await api.delete(f"/api/v1/departments/{missing}", headers=ADMIN)

    assert (renamed.status_code, deleted.status_code) == (404, 404)
    assert deleted.json()["error"] == "not_found"


async def test_user_cannot_create(api: httpx.AsyncClient) -> None:
    response = await api.post("/api/v1/departments", json={"name": "Офис"}, headers=USER)

    assert response.status_code == 403


async def test_payment_with_department(api: httpx.AsyncClient) -> None:
    office = await create_department(api, "Офис")

    payment = await create_payment(api, "2026-11-05", department_id=office["id"])

    office_ref = {"id": office["id"], "name": office["name"]}
    assert payment["department"] == office_ref
    assert [o["department"] for o in await occurrences(api, payment["id"])] == [office_ref]


async def test_department_can_be_removed_from_payment(api: httpx.AsyncClient) -> None:
    office = await create_department(api, "Офис")
    payment = await create_payment(api, "2026-11-05", department_id=office["id"])

    response = await api.patch(
        f"/api/v1/recurring-payments/{payment['id']}", json={"departmentId": None}, headers=ADMIN
    )

    assert response.json()["department"] is None


async def test_deleting_department_keeps_payments(api: httpx.AsyncClient) -> None:
    store = await create_department(api, "Склад")
    first = await create_payment(api, "2026-11-05", name="Стеллажи", department_id=store["id"])
    second = await create_payment(api, "2026-11-06", name="Охрана", department_id=store["id"])

    response = await api.delete(f"/api/v1/departments/{store['id']}", headers=ADMIN)

    assert response.status_code == 204
    for payment in (first, second):
        current = await api.get(f"/api/v1/recurring-payments/{payment['id']}", headers=USER)
        assert current.json()["department"] is None


async def test_filters_by_department(api: httpx.AsyncClient) -> None:
    office = await create_department(api, "Офис")
    store = await create_department(api, "Склад")
    await create_payment(api, "2026-11-05", amount_minor=1_000, department_id=office["id"])
    await create_payment(api, "2026-11-05", amount_minor=2_000, department_id=store["id"])
    only_office = {"departmentId": office["id"]}

    payments = await api.get("/api/v1/recurring-payments", params=only_office, headers=USER)
    periods = await api.get("/api/v1/payment-occurrences", params=only_office, headers=USER)
    summary = await api.get(
        "/api/v1/payments/summary",
        params=only_office | {"from": "2026-11-01", "to": "2026-11-30"},
        headers=USER,
    )

    assert [p["amountMinor"] for p in payments.json()["items"]] == [1_000]
    assert {o["amountMinor"] for o in periods.json()["items"]} == {1_000}
    rub = next(c for c in summary.json()["currencies"] if c["currency"] == "RUB")
    assert rub["totalMinor"] == 1_000


def test_reminder_names_department() -> None:
    line = PaymentLine(
        uuid4(), "Аренда офиса", 15_000_000, "RUB", date(2026, 10, 27), department="Офис"
    )

    card = reminder_card(ReminderKind.DUE_SOON, line, today=TODAY)

    assert "🏢 Отдел: Офис" in card.text.splitlines()
