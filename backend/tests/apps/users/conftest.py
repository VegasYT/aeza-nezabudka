"""API с настоящими сессиями и белым списком; вместо Aéza - фейк в памяти."""

from collections.abc import AsyncIterator
from datetime import UTC, date, datetime, timedelta
from typing import Any

import httpx
import pytest
from sqlalchemy.ext.asyncio import AsyncEngine, AsyncSession, async_sessionmaker

from app.main import create_asgi_app
from apps.users.service import sync_admins
from core.config import IdentitySettings, Settings
from tests.apps.users.fakes import PASSWORD, FakeAeza
from tests.conftest import TODAY

ADMIN_EMAIL = "glavbuh@company.ru"
IDENTITY = IdentitySettings.model_construct(
    aeza_api_url="https://my.aeza.test/api", admin_emails=ADMIN_EMAIL, session_ttl_hours=12
)


class AuthClock:
    """Дату и время двигает тест: так истекают сессии и окно неудачных входов."""

    def __init__(self, today: date) -> None:
        self.current = today
        self.shift = timedelta()

    def now(self) -> datetime:
        return datetime.now(UTC) + self.shift

    def today(self) -> date:
        return self.current


@pytest.fixture
def clock() -> AuthClock:
    return AuthClock(TODAY)


@pytest.fixture
def aeza() -> FakeAeza:
    fake = FakeAeza()
    fake.add(ADMIN_EMAIL)
    return fake


@pytest.fixture
async def api(
    settings: Settings,
    clock: AuthClock,
    migrated_engine: AsyncEngine,
    session_factory: async_sessionmaker[AsyncSession],
    aeza: FakeAeza,
) -> AsyncIterator[httpx.AsyncClient]:
    await sync_admins(session_factory, IDENTITY.admin_email_list)
    app = create_asgi_app(
        settings,
        migrated_engine,
        clock,
        identity=IDENTITY,
        aeza=aeza,
        session_factory=session_factory,
    )
    transport = httpx.ASGITransport(app=app, raise_app_exceptions=False)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        yield client


async def login(
    api: httpx.AsyncClient, email: str, password: str = PASSWORD, ip: str = "10.0.0.1"
) -> httpx.Response:
    return await api.post(
        "/api/v1/auth/login",
        json={"email": email, "password": password},
        headers={"X-Forwarded-For": ip},
    )


async def sign_in(api: httpx.AsyncClient, email: str, ip: str = "10.0.0.1") -> httpx.Response:
    """Шаги 1 и 2 входа без 2FA; возвращает ответ `use-challenge`."""
    first = await login(api, email, ip=ip)
    assert first.status_code == 200, first.text
    return await api.post(
        "/api/v1/auth/use-challenge",
        json={"challenge": first.json()["challenge"]},
        headers={"X-Forwarded-For": ip},
    )


async def bearer(api: httpx.AsyncClient, email: str) -> dict[str, str]:
    response = await sign_in(api, email)
    assert response.status_code == 200, response.text
    body: dict[str, Any] = response.json()
    return {"Authorization": f"Bearer {body['session']}"}
