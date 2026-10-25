"""Фильтры и поля для экранов панели: без отдела, поиск, действующие, просрочка, счётчики."""

from datetime import date
from typing import Any

import httpx
import pytest
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from apps.payments.service import PaymentsService
from tests.apps.departments.test_api import create_department
from tests.apps.payments.conftest import ADMIN, USER, MovableClock, create_payment

pytestmark = pytest.mark.integration


async def _get(api: httpx.AsyncClient, path: str, **params: str) -> dict[str, Any]:
    response = await api.get(f"/api/v1/{path}", params=params, headers=USER)
    assert response.status_code == 200, response.text
    return dict(response.json())


def _names(page: dict[str, Any]) -> list[str]:
    return sorted(
        item["name"] if "name" in item else item["recurringPayment"]["name"]
        for item in page["items"]
    )


async def test_without_department_search_and_active(api: httpx.AsyncClient) -> None:
    office = await create_department(api, "Офис")
    await create_payment(api, "2026-10-26", name="Аренда офиса", department_id=office["id"])
    await create_payment(api, "2026-10-27", name="Сервер 50%")
    stopped = await create_payment(api, "2026-10-24", name="Старый сервер")
    await api.delete(f"/api/v1/recurring-payments/{stopped['id']}", headers=ADMIN)

    without = await _get(api, "recurring-payments", departmentId="none")
    found = await _get(api, "recurring-payments", q="СЕРВЕР")
    escaped = await _get(api, "recurring-payments", q="50%")
    periods = await _get(api, "payment-occurrences", departmentId="none", paymentStatus="active")
    summary = await _get(api, "payments/summary", departmentId="none", q="сервер")

    assert _names(without) == ["Сервер 50%", "Старый сервер"]
    assert _names(found) == ["Сервер 50%", "Старый сервер"]
    assert _names(escaped) == ["Сервер 50%"]
    assert _names(periods) == ["Сервер 50%"]
    assert summary["departmentId"] == "none"
    assert summary["currencies"][0]["count"] == 2


async def test_overdue_fields_and_counts(
    api: httpx.AsyncClient,
    clock: MovableClock,
    session_factory: async_sessionmaker[AsyncSession],
) -> None:
    clock.current = date(2026, 10, 1)
    payment = await create_payment(api, "2026-10-05")
    clock.current = date(2026, 12, 10)
    await PaymentsService(session_factory, clock).ensure_periods()

    row = (await api.get(f"/api/v1/recurring-payments/{payment['id']}", headers=USER)).json()
    rub = (await _get(api, "payments/summary"))["currencies"][0]

    assert (row["overdueCount"], row["oldestOverdueDays"]) == (3, 66)
    assert (rub["count"], rub["paidCount"], rub["unpaidCount"], rub["overdueCount"]) == (4, 0, 4, 3)


async def test_no_overdue(api: httpx.AsyncClient) -> None:
    payment = await create_payment(api, "2026-10-26")

    assert (payment["overdueCount"], payment["oldestOverdueDays"]) == (0, None)


async def test_clear_validation_messages(api: httpx.AsyncClient) -> None:
    response = await api.post(
        "/api/v1/recurring-payments",
        json={"name": "   ", "amountMinor": 0, "currency": "RUB", "nextDueDate": "2026-10-26"},
        headers=ADMIN,
    )

    assert {(f["field"], f["message"]) for f in response.json()["payload"]} == {
        ("name", "Введите название"),
        ("amountMinor", "Сумма должна быть больше нуля"),
    }


async def test_department_names_and_counts(api: httpx.AsyncClient) -> None:
    office = await create_department(api, "  Офис  ")
    duplicate = await api.post("/api/v1/departments", json={"name": "офис"}, headers=ADMIN)
    await create_payment(api, "2026-10-26", department_id=office["id"])
    stopped = await create_payment(api, "2026-10-27", department_id=office["id"])
    await api.delete(f"/api/v1/recurring-payments/{stopped['id']}", headers=ADMIN)

    listed = await _get(api, "departments")

    assert office["name"] == "Офис"
    assert (duplicate.status_code, duplicate.json()["error"]) == (409, "department_name_taken")
    assert [(d["name"], d["paymentsCount"]) for d in listed["items"]] == [("Офис", 1)]
