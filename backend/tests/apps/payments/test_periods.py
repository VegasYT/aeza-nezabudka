"""Платежи с любым периодом: от дня до года, каждые N единиц."""

from datetime import date

import httpx
import pytest
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from apps.payments.service import PaymentsService
from tests.apps.payments.conftest import ADMIN, USER, MovableClock, create_payment, occurrences

pytestmark = pytest.mark.integration


async def _forecast(api: httpx.AsyncClient, payment_id: str, to: str) -> list[str]:
    response = await api.get("/api/v1/payments/forecast", params={"to": to}, headers=USER)
    assert response.status_code == 200, response.text
    items = response.json()["items"]
    return [i["dueDate"] for i in items if i["recurringPayment"]["id"] == payment_id]


async def test_yearly_payment(api: httpx.AsyncClient) -> None:
    payment = await create_payment(api, "2026-11-05", period="year")

    assert (payment["period"], payment["periodCount"]) == ("year", 1)
    assert await _forecast(api, payment["id"], "2028-12-31") == ["2027-11-05", "2028-11-05"]


async def test_every_ten_days(api: httpx.AsyncClient) -> None:
    payment = await create_payment(api, "2026-10-26", period="day", period_count=10)

    assert await _forecast(api, payment["id"], "2026-11-20") == ["2026-11-05", "2026-11-15"]


async def test_default_is_monthly(api: httpx.AsyncClient) -> None:
    payment = await create_payment(api, "2026-10-26")

    assert (payment["period"], payment["periodCount"]) == ("month", 1)


async def test_change_period_keeps_next_due(api: httpx.AsyncClient) -> None:
    payment = await create_payment(api, "2026-10-26")

    response = await api.patch(
        f"/api/v1/recurring-payments/{payment['id']}",
        json={"period": "week", "periodCount": 2},
        headers=ADMIN,
    )

    body = response.json()
    assert (body["period"], body["periodCount"], body["nextDueDate"]) == ("week", 2, "2026-10-26")
    assert await _forecast(api, payment["id"], "2026-11-30") == ["2026-11-09", "2026-11-23"]


@pytest.mark.parametrize("count", [0, 367])
async def test_period_count_range(api: httpx.AsyncClient, count: int) -> None:
    response = await api.post(
        "/api/v1/recurring-payments",
        json={
            "name": "Сервер",
            "amountMinor": 100,
            "currency": "USD",
            "period": "day",
            "periodCount": count,
            "nextDueDate": "2026-10-26",
        },
        headers=ADMIN,
    )

    assert response.status_code == 400


async def test_weekly_payment_four_times(
    api: httpx.AsyncClient,
    clock: MovableClock,
    session_factory: async_sessionmaker[AsyncSession],
) -> None:
    clock.current = date(2026, 10, 1)
    payment = await create_payment(
        api, "2026-10-05", period="week", occurrence_limit=4, amount_minor=1_000
    )
    forecast = await _forecast(api, payment["id"], "2026-12-31")

    clock.current = date(2026, 12, 1)
    await PaymentsService(session_factory, clock).ensure_periods()
    periods = await occurrences(api, payment["id"])
    for period in periods:
        await api.patch(
            f"/api/v1/payment-occurrences/{period['id']}", json={"paid": True}, headers=USER
        )
    row = (await api.get(f"/api/v1/recurring-payments/{payment['id']}", headers=USER)).json()

    assert payment["occurrenceLimit"] == 4
    assert forecast == ["2026-10-12", "2026-10-19", "2026-10-26"]
    assert [p["dueDate"] for p in periods] == [
        "2026-10-05",
        "2026-10-12",
        "2026-10-19",
        "2026-10-26",
    ]
    assert (row["paidOccurrences"], row["completed"], row["nextDueDate"]) == (4, True, None)


async def test_change_occurrence_limit(
    api: httpx.AsyncClient,
    clock: MovableClock,
    session_factory: async_sessionmaker[AsyncSession],
) -> None:
    clock.current = date(2026, 10, 1)
    payment = await create_payment(api, "2026-10-05", period="week", occurrence_limit=3)
    clock.current = date(2026, 11, 1)
    await PaymentsService(session_factory, clock).ensure_periods()
    path = f"/api/v1/recurring-payments/{payment['id']}"

    too_small = await api.patch(path, json={"occurrenceLimit": 2}, headers=ADMIN)
    unlimited = await api.patch(path, json={"occurrenceLimit": None}, headers=ADMIN)

    assert too_small.status_code == 400
    assert unlimited.json()["occurrenceLimit"] is None
    assert unlimited.json()["nextDueDate"] == "2026-11-02"
