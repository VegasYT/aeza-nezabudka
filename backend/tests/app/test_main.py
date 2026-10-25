from collections.abc import AsyncIterator, Callable
from contextlib import AbstractAsyncContextManager, asynccontextmanager

import httpx
import pytest
from sqlalchemy.ext.asyncio import AsyncEngine, create_async_engine

from app.main import create_asgi_app
from core.clock import FixedClock
from core.config import Settings

pytestmark = pytest.mark.integration

UNREACHABLE_URL = "postgresql+asyncpg://app:pw@127.0.0.1:1/app"

ClientFactory = Callable[[AsyncEngine], AbstractAsyncContextManager[httpx.AsyncClient]]


@pytest.fixture
def client_for(settings: Settings, clock: FixedClock) -> ClientFactory:
    @asynccontextmanager
    async def make(engine: AsyncEngine) -> AsyncIterator[httpx.AsyncClient]:
        app = create_asgi_app(settings, engine=engine, clock=clock)
        transport = httpx.ASGITransport(app=app, raise_app_exceptions=False)
        async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
            yield client

    return make


@pytest.fixture
async def unreachable_engine() -> AsyncIterator[AsyncEngine]:
    engine = create_async_engine(UNREACHABLE_URL)
    yield engine
    await engine.dispose()


@pytest.fixture
async def unmigrated_engine(postgres_url: str) -> AsyncIterator[AsyncEngine]:
    # Служебная база postgres в том же контейнере: в ней нет таблицы версий Alembic.
    engine = create_async_engine(postgres_url.rsplit("/", 1)[0] + "/postgres")
    yield engine
    await engine.dispose()


async def test_ready_when_database_is_migrated(
    client_for: ClientFactory, migrated_engine: AsyncEngine
) -> None:
    async with client_for(migrated_engine) as client:
        health = await client.get("/healthz")
        ready = await client.get("/readyz")

    assert health.status_code == 200
    assert ready.status_code == 200
    assert ready.headers["X-Request-ID"]


async def test_not_ready_when_database_is_unreachable(
    client_for: ClientFactory, unreachable_engine: AsyncEngine
) -> None:
    async with client_for(unreachable_engine) as client:
        health = await client.get("/healthz")
        ready = await client.get("/readyz")

    assert health.status_code == 200
    assert ready.status_code == 503
    assert ready.json()["error"] == "database_unavailable"


async def test_not_ready_when_migrations_are_missing(
    client_for: ClientFactory, unmigrated_engine: AsyncEngine
) -> None:
    async with client_for(unmigrated_engine) as client:
        ready = await client.get("/readyz")

    assert ready.status_code == 503
    assert ready.json()["error"] == "migrations_pending"


async def test_docs_live_under_api_prefix(
    client_for: ClientFactory, migrated_engine: AsyncEngine
) -> None:
    async with client_for(migrated_engine) as client:
        docs = await client.get("/api/v1/docs")
        schema = await client.get("/api/v1/openapi.json")
        unknown = await client.get("/api/v1/nowhere")

    assert docs.status_code == 200
    assert "/api/v1/openapi.json" in docs.text
    assert not {"/healthz", "/readyz"} & set(schema.json().get("paths", {}))
    assert unknown.status_code == 404
    assert (unknown.json()["error"], unknown.json()["message"]) == ("not_found", "Не найдено")
