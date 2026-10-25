"""API платежей с включёнными адаптерами событий на базе с откатом."""

import uuid
from collections.abc import AsyncIterator
from typing import Any

import httpx
import pytest
from pydantic import SecretStr
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncEngine, AsyncSession, async_sessionmaker

from app.main import create_asgi_app
from apps.integrations.models import IntegrationDelivery, IntegrationEvent
from core.config import IntegrationSettings, Settings
from tests.apps.payments.conftest import MovableClock, clock
from tests.auth_helpers import FakeAuthenticator, make_token

__all__ = ["clock"]

WEBHOOK_SECRET = "webhook-secret"
INTEGRATIONS = IntegrationSettings.model_construct(
    webhook_url="http://127.0.0.1:1/hook",
    webhook_secret=SecretStr(WEBHOOK_SECRET),
    kafka_brokers="127.0.0.1:1",
    kafka_topic="invoice-keeper.events",
)
ERP_ID = uuid.UUID("7f2b9c65-1a0d-4e77-8b4e-2c3d4e5f6071")
ERP = {
    "Authorization": "Bearer "
    + make_token(roles=("integration",), login="service-account-1c", subject=ERP_ID)
}


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
        integrations=INTEGRATIONS,
    )
    transport = httpx.ASGITransport(app=app, raise_app_exceptions=False)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        yield client


async def events(session_factory: async_sessionmaker[AsyncSession]) -> list[dict[str, Any]]:
    async with session_factory() as session:
        rows = await session.scalars(select(IntegrationEvent).order_by(IntegrationEvent.created_at))
        return [row.payload for row in rows]


async def deliveries(
    session_factory: async_sessionmaker[AsyncSession],
) -> list[IntegrationDelivery]:
    async with session_factory() as session:
        return list(await session.scalars(select(IntegrationDelivery)))
