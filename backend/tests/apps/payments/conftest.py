"""Клиент API платежей на настоящей базе с откатом после теста."""

from collections.abc import AsyncIterator
from datetime import UTC, date, datetime
from typing import Any

import httpx
import pytest
from pydantic.alias_generators import to_camel
from sqlalchemy.ext.asyncio import AsyncEngine, AsyncSession, async_sessionmaker

from app.main import create_asgi_app
from core.config import Settings
from tests.auth_helpers import FakeAuthenticator, make_token
from tests.conftest import TODAY

ADMIN = {"Authorization": f"Bearer {make_token()}"}
USER = {"Authorization": f"Bearer {make_token(roles=('user',), login='buh.petrova')}"}


class MovableClock:
    """Часы, которые тест передвигает: так создаётся история периодов."""

    def __init__(self, today: date) -> None:
        self.current = today

    def now(self) -> datetime:
        return datetime.now(UTC)

    def today(self) -> date:
        return self.current


@pytest.fixture
def clock() -> MovableClock:
    return MovableClock(TODAY)


async def create_payment(
    api: httpx.AsyncClient, next_due_date: str, **fields: Any
) -> dict[str, Any]:
    body = {"name": "Аренда офиса", "amountMinor": 15_000_000, "currency": "RUB"}
    response = await api.post(
        "/api/v1/recurring-payments",
        json=body | {to_camel(k): v for k, v in fields.items()} | {"nextDueDate": next_due_date},
        headers=ADMIN,
    )
    assert response.status_code == 201, response.text
    return dict(response.json())


async def occurrences(api: httpx.AsyncClient, payment_id: str) -> list[dict[str, Any]]:
    response = await api.get(
        "/api/v1/payment-occurrences",
        params={"recurringPaymentId": payment_id},
        headers=USER,
    )
    assert response.status_code == 200, response.text
    return list(response.json()["items"])


@pytest.fixture
async def api(
    settings: Settings,
    clock: MovableClock,
    migrated_engine: AsyncEngine,
    session_factory: async_sessionmaker[AsyncSession],
) -> AsyncIterator[httpx.AsyncClient]:
    app = create_asgi_app(
        settings,
        migrated_engine,
        clock,
        authenticator=FakeAuthenticator(),
        session_factory=session_factory,
    )
    transport = httpx.ASGITransport(app=app, raise_app_exceptions=False)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        yield client
