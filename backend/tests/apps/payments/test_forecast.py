"""Плановые периоды, итоги по месяцам, снимок на дату и время напоминания."""

from datetime import date

import httpx
import pytest

from tests.apps.payments.conftest import ADMIN, USER, MovableClock, create_payment

pytestmark = pytest.mark.integration


async def test_forecast_lists_future_periods_without_saving(api: httpx.AsyncClient) -> None:
    payment = await create_payment(api, "2026-10-31")

    forecast = await api.get("/api/v1/payments/forecast", params={"to": "2027-01-31"}, headers=USER)
    periods = await api.get(
        "/api/v1/payment-occurrences", params={"recurringPaymentId": payment["id"]}, headers=USER
    )

    assert [item["dueDate"] for item in forecast.json()["items"]] == [
        "2026-11-30",
        "2026-12-31",
        "2027-01-31",
    ]
    assert forecast.json()["total"] == 3
    assert periods.json()["total"] == 1


async def test_forecast_range_is_limited(api: httpx.AsyncClient) -> None:
    too_long = await api.get(
        "/api/v1/payments/forecast", params={"from": "2026-10-24", "to": "2029-01-01"}, headers=USER
    )
    reversed_range = await api.get(
        "/api/v1/payments/forecast", params={"from": "2026-12-01", "to": "2026-11-01"}, headers=USER
    )

    assert (too_long.status_code, reversed_range.status_code) == (400, 400)


async def test_summary_by_month_with_planned(api: httpx.AsyncClient) -> None:
    await create_payment(api, "2026-10-26", amountMinor=1_000)

    response = await api.get(
        "/api/v1/payments/summary",
        params={
            "from": "2026-10-01",
            "to": "2026-12-31",
            "groupBy": "month",
            "includePlanned": "true",
        },
        headers=USER,
    )

    body = response.json()
    rub = body["currencies"][0]
    assert (rub["totalMinor"], rub["plannedMinor"], rub["plannedCount"]) == (1_000, 2_000, 2)
    assert [
        (m["month"], m["currencies"][0]["totalMinor"], m["currencies"][0]["plannedMinor"])
        for m in body["months"]
    ] == [
        ("2026-10", 1_000, 0),
        ("2026-11", 0, 1_000),
        ("2026-12", 0, 1_000),
    ]


async def test_summary_month_needs_range(api: httpx.AsyncClient) -> None:
    response = await api.get("/api/v1/payments/summary", params={"groupBy": "month"}, headers=USER)

    assert response.status_code == 400


async def test_summary_as_of_ignores_later_payment(
    api: httpx.AsyncClient, clock: MovableClock
) -> None:
    clock.current = date(2026, 10, 1)
    payment = await create_payment(api, "2026-10-05")
    clock.current = date(2026, 10, 24)
    periods = await api.get(
        "/api/v1/payment-occurrences", params={"recurringPaymentId": payment["id"]}, headers=USER
    )
    october = periods.json()["items"][0]
    await api.patch(
        f"/api/v1/payment-occurrences/{october['id']}",
        json={"paid": True, "paidOn": "2026-10-20"},
        headers=USER,
    )

    params = {"from": "2026-10-01", "to": "2026-10-31"}
    now = (await api.get("/api/v1/payments/summary", params=params, headers=USER)).json()
    before = (
        await api.get(
            "/api/v1/payments/summary", params=params | {"asOf": "2026-10-10"}, headers=USER
        )
    ).json()

    assert now["currencies"][0]["paidCount"] == 1
    assert (before["asOf"], before["currencies"][0]["paidCount"]) == ("2026-10-10", 0)
    assert before["currencies"][0]["overdueCount"] == 1


async def test_audit_log_for_admin(api: httpx.AsyncClient) -> None:
    payment = await create_payment(api, "2026-10-26", name="Аренда офиса")
    await api.patch(
        f"/api/v1/recurring-payments/{payment['id']}", json={"amountMinor": 2_000}, headers=ADMIN
    )

    log = await api.get("/api/v1/audit-log", params={"action": "payment.*"}, headers=ADMIN)
    exact = await api.get("/api/v1/audit-log", params={"action": "payment.created"}, headers=ADMIN)
    as_user = await api.get("/api/v1/audit-log", headers=USER)

    items = log.json()["items"]
    assert [item["action"] for item in items] == ["payment.updated", "payment.created"]
    assert items[0]["entityName"] == "Аренда офиса"
    assert items[0]["details"]["after"]["amountMinor"] == 2_000
    assert items[0]["details"]["before"]["departmentName"] is None
    assert exact.json()["total"] == 1
    assert as_user.status_code == 403
