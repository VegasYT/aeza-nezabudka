from collections.abc import AsyncIterator

import httpx
import pytest
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncEngine, AsyncSession, async_sessionmaker

from app.main import create_asgi_app
from app.seed import seed
from app.smoke import SmokeFailed, run_smoke
from apps.payments.models import RecurringPayment
from core.clock import FixedClock
from core.config import Settings
from tests.app.test_seed import SETTINGS
from tests.auth_helpers import FakeAuthenticator, make_token
from tests.conftest import TODAY

pytestmark = pytest.mark.integration


@pytest.fixture
async def client(
    settings: Settings,
    migrated_engine: AsyncEngine,
    session_factory: async_sessionmaker[AsyncSession],
) -> AsyncIterator[httpx.AsyncClient]:
    app = create_asgi_app(
        settings,
        migrated_engine,
        FixedClock(TODAY),
        authenticator=FakeAuthenticator(),
        session_factory=session_factory,
    )
    token = make_token(roles=("integration",), login="service-account-smoke")
    async with httpx.AsyncClient(
        transport=httpx.ASGITransport(app=app, raise_app_exceptions=False),
        base_url="http://test",
        headers={"Authorization": f"Bearer {token}"},
    ) as http:
        yield http


async def _overdue(client: httpx.AsyncClient) -> list[str]:
    response = await client.get("/api/v1/payment-occurrences", params={"status": "overdue"})
    return [item["id"] for item in response.json()["items"]]


async def test_smoke_passes_on_seed_and_restores_it(
    client: httpx.AsyncClient, session_factory: async_sessionmaker[AsyncSession]
) -> None:
    await seed(session_factory, TODAY, SETTINGS)
    before = await _overdue(client)

    await run_smoke(client, TODAY)

    assert await _overdue(client) == before
    assert before
    async with session_factory() as session:
        smoke = await session.scalar(
            select(RecurringPayment).where(RecurringPayment.name.startswith("Smoke"))
        )
    assert smoke is not None
    assert smoke.stopped_at is not None


async def test_smoke_without_seed_fails_on_overdue_step(client: httpx.AsyncClient) -> None:
    with pytest.raises(SmokeFailed, match="Исправление даты оплаты убирает просрочку"):
        await run_smoke(client, TODAY)
