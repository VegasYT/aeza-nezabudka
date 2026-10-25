from datetime import date

import httpx
import pytest
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from apps.payments.domain import summarize
from apps.payments.models import PaymentOccurrence
from apps.payments.repository import state_of
from apps.payments.schemas import Currency
from tests.apps.payments.conftest import USER, MovableClock, create_payment, occurrences

pytestmark = pytest.mark.integration


async def _october(api: httpx.AsyncClient, clock: MovableClock) -> None:
    """RUB 1 000 просрочен на 20 октября, USD 2 500 оплачен 1 октября, EUR 500 на 5 ноября."""
    clock.current = date(2026, 10, 1)
    server = await create_payment(
        api, "2026-10-01", name="Сервер", amount_minor=2_500, currency="USD"
    )
    first = next(o for o in await occurrences(api, server["id"]) if o["dueDate"] == "2026-10-01")
    await api.patch(f"/api/v1/payment-occurrences/{first['id']}", json={"paid": True}, headers=USER)
    await create_payment(api, "2026-10-20", name="Аренда", amount_minor=1_000, currency="RUB")
    clock.current = date(2026, 10, 24)
    await create_payment(api, "2026-11-05", name="Подписка", amount_minor=500, currency="EUR")


def _totals(body: dict[str, object]) -> dict[str, tuple[int, ...]]:
    return {
        item["currency"]: (
            item["totalMinor"],
            item["paidMinor"],
            item["unpaidMinor"],
            item["overdueMinor"],
            item["count"],
        )
        for item in body["currencies"]  # type: ignore[attr-defined]
    }


async def test_summary_for_october(api: httpx.AsyncClient, clock: MovableClock) -> None:
    await _october(api, clock)

    response = await api.get(
        "/api/v1/payments/summary", params={"from": "2026-10-01", "to": "2026-10-31"}, headers=USER
    )

    body = response.json()
    assert (body["from"], body["to"], body["departmentId"]) == ("2026-10-01", "2026-10-31", None)
    assert _totals(body) == {
        "RUB": (1_000, 0, 1_000, 1_000, 1),
        "USD": (2_500, 2_500, 0, 0, 1),
        "EUR": (0, 0, 0, 0, 0),
    }


async def test_summary_matches_domain_rules(
    api: httpx.AsyncClient,
    clock: MovableClock,
    session_factory: async_sessionmaker[AsyncSession],
) -> None:
    await _october(api, clock)

    response = await api.get("/api/v1/payments/summary", headers=USER)

    async with session_factory() as session:
        states = [state_of(o) for o in await session.scalars(select(PaymentOccurrence))]
    expected = summarize(states, clock.today())
    assert _totals(response.json()) == {
        totals.currency.value: (
            totals.total_minor,
            totals.paid_minor,
            totals.unpaid_minor,
            totals.overdue_minor,
            totals.count,
        )
        for totals in expected
    }
    assert [t.currency for t in expected] == [Currency.RUB, Currency.USD, Currency.EUR]
