from datetime import date
from typing import Any

import httpx
import pytest
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from apps.audit.models import AuditRecord
from tests.apps.payments.conftest import ADMIN, USER, MovableClock, create_payment, occurrences

pytestmark = pytest.mark.integration

MISSING_ID = "3c2b1a09-8f7e-4d6c-9b5a-4f3e2d1c0b9a"


async def _period(api: httpx.AsyncClient, payment: dict[str, Any], due: str) -> dict[str, Any]:
    return next(o for o in await occurrences(api, payment["id"]) if o["dueDate"] == due)


async def _mark(api: httpx.AsyncClient, occurrence_id: str, body: dict[str, Any]) -> httpx.Response:
    return await api.patch(f"/api/v1/payment-occurrences/{occurrence_id}", json=body, headers=USER)


async def _list(api: httpx.AsyncClient, **params: str) -> list[dict[str, Any]]:
    response = await api.get("/api/v1/payment-occurrences", params=params, headers=USER)
    assert response.status_code == 200, response.text
    return list(response.json()["items"])


async def test_status_filters_and_overdue_days(api: httpx.AsyncClient, clock: MovableClock) -> None:
    clock.current = date(2026, 10, 1)
    paid = await create_payment(api, "2026-10-01", name="Сервер")
    await create_payment(api, "2026-10-20", name="Аренда")
    october_first = await _period(api, paid, "2026-10-01")
    await _mark(api, october_first["id"], {"paid": True})
    clock.current = date(2026, 10, 24)

    overdue = await _list(api, status="overdue")
    paid_items = await _list(api, status="paid")

    assert [(o["dueDate"], o["daysOverdue"], o["overdue"]) for o in overdue] == [
        ("2026-10-20", 4, True)
    ]
    assert [o["dueDate"] for o in paid_items] == ["2026-10-01"]


async def test_range_order_and_pages(api: httpx.AsyncClient, clock: MovableClock) -> None:
    clock.current = date(2026, 10, 1)
    await create_payment(api, "2026-10-01", name="Сервер")
    clock.current = date(2026, 10, 24)

    in_october = await _list(api, **{"from": "2026-10-01", "to": "2026-10-31"})
    newest_first = await _list(api, order="desc")
    page = await api.get(
        "/api/v1/payment-occurrences", params={"limit": 1, "offset": 1}, headers=USER
    )

    assert [o["dueDate"] for o in in_october] == ["2026-10-01"]
    assert [o["dueDate"] for o in newest_first] == ["2026-11-01", "2026-10-01"]
    assert (page.json()["total"], [o["dueDate"] for o in page.json()["items"]]) == (
        2,
        ["2026-11-01"],
    )


async def test_mark_correct_and_cancel(
    api: httpx.AsyncClient,
    clock: MovableClock,
    session_factory: async_sessionmaker[AsyncSession],
) -> None:
    clock.current = date(2026, 10, 5)
    payment = await create_payment(api, "2026-10-05")
    october = await _period(api, payment, "2026-10-05")
    clock.current = date(2026, 10, 24)

    marked = (await _mark(api, october["id"], {"paid": True})).json()
    late = (await _mark(api, october["id"], {"paid": True, "paidOn": "2026-10-08"})).json()
    corrected = (await _mark(api, october["id"], {"paid": True, "paidOn": "2026-10-05"})).json()
    cancelled = (await _mark(api, october["id"], {"paid": False})).json()
    one = await api.get(f"/api/v1/payment-occurrences/{october['id']}", headers=USER)

    assert (marked["paid"], marked["paidOn"], marked["paidByLogin"]) == (
        True,
        "2026-10-24",
        "buh.petrova",
    )
    assert (late["overdue"], late["daysOverdue"]) == (True, 3)
    assert (corrected["overdue"], corrected["daysOverdue"], corrected["dueDate"]) == (
        False,
        0,
        "2026-10-05",
    )
    assert (cancelled["paid"], cancelled["paidOn"], cancelled["paidByLogin"]) == (
        False,
        None,
        None,
    )
    assert (cancelled["overdue"], one.json()["paid"]) == (True, False)
    async with session_factory() as session:
        actions = list(
            await session.scalars(
                select(AuditRecord.action).where(AuditRecord.entity_id == october["id"])
            )
        )
    assert sorted(actions) == ["occurrence.paid"] * 3 + ["occurrence.unpaid"]


async def test_future_payment_date_and_missing_period(api: httpx.AsyncClient) -> None:
    payment = await create_payment(api, "2026-11-05")
    period = await _period(api, payment, "2026-11-05")

    future = await _mark(api, period["id"], {"paid": True, "paidOn": "2026-10-25"})
    missing = await api.get(f"/api/v1/payment-occurrences/{MISSING_ID}", headers=USER)
    missing_patch = await _mark(api, MISSING_ID, {"paid": True})

    assert (future.status_code, {f["field"] for f in future.json()["payload"]}) == (400, {"paidOn"})
    assert (missing.status_code, missing.json()["error"]) == (404, "not_found")
    assert missing_patch.status_code == 404


async def test_stopped_payment_periods_stay_in_list(api: httpx.AsyncClient) -> None:
    payment = await create_payment(api, "2026-10-24")
    await api.delete(f"/api/v1/recurring-payments/{payment['id']}", headers=ADMIN)

    items = await occurrences(api, payment["id"])

    assert [(o["dueDate"], o["recurringPayment"]["stopped"]) for o in items] == [
        ("2026-10-24", True)
    ]
