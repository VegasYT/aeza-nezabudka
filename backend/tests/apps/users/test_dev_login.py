"""Тестовые аккаунты `@dev.local` через API рядом с входом Aéza, белый список общий."""

from collections.abc import AsyncIterator

import httpx
import pytest
from pydantic import SecretStr
from sqlalchemy.ext.asyncio import AsyncEngine, AsyncSession, async_sessionmaker

from app.main import create_asgi_app
from apps.users.dev_aeza import TOTP_CODE
from apps.users.service import sync_admins
from core.config import Settings
from tests.apps.users.conftest import ADMIN_EMAIL, IDENTITY, AuthClock, login, sign_in
from tests.apps.users.fakes import FakeAeza

pytestmark = pytest.mark.integration

PASSWORD = "dev-pass"
DEV_ADMIN = "admin@dev.local"


@pytest.fixture
async def dev_api(
    settings: Settings,
    clock: AuthClock,
    migrated_engine: AsyncEngine,
    session_factory: async_sessionmaker[AsyncSession],
    aeza: FakeAeza,
) -> AsyncIterator[httpx.AsyncClient]:
    await sync_admins(session_factory, (ADMIN_EMAIL, DEV_ADMIN, "chief+2fa@dev.local"))
    app = create_asgi_app(
        settings.model_copy(update={"dev_login_password": SecretStr(PASSWORD)}),
        migrated_engine,
        clock,
        identity=IDENTITY,
        aeza=aeza,
        session_factory=session_factory,
    )
    transport = httpx.ASGITransport(app=app, raise_app_exceptions=False)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        yield client


async def _me(api: httpx.AsyncClient, session: str) -> dict[str, str]:
    response = await api.get("/api/v1/auth/me", headers={"Authorization": f"Bearer {session}"})
    assert response.status_code == 200, response.text
    return dict(response.json())


async def test_dev_and_aeza_accounts_side_by_side(dev_api: httpx.AsyncClient) -> None:
    first = await login(dev_api, DEV_ADMIN, PASSWORD)
    dev = await dev_api.post(
        "/api/v1/auth/use-challenge", json={"challenge": first.json()["challenge"]}
    )
    aeza = await sign_in(dev_api, ADMIN_EMAIL)

    assert first.json()["requirements"] == []
    assert (await _me(dev_api, dev.json()["session"]))["email"] == DEV_ADMIN
    assert (await _me(dev_api, aeza.json()["session"]))["email"] == ADMIN_EMAIL


async def test_2fa_flow(dev_api: httpx.AsyncClient) -> None:
    first = await login(dev_api, "chief+2fa@dev.local", PASSWORD)
    signed = await dev_api.post(
        "/api/v1/auth/tfa/totp", json={"challenge": first.json()["challenge"], "code": TOTP_CODE}
    )

    assert first.json()["requirements"] == ["totp"]
    assert signed.status_code == 200, signed.text


async def test_wrong_password_and_stranger(dev_api: httpx.AsyncClient) -> None:
    wrong = await login(dev_api, DEV_ADMIN, "wrong")
    dev_password_on_aeza = await login(dev_api, ADMIN_EMAIL, PASSWORD)
    stranger = await login(dev_api, "stranger@dev.local", PASSWORD)
    denied = await dev_api.post(
        "/api/v1/auth/use-challenge", json={"challenge": stranger.json()["challenge"]}
    )

    assert wrong.json()["error"] == "invalid_credentials"
    assert dev_password_on_aeza.json()["error"] == "invalid_credentials"
    assert denied.status_code == 403
    assert denied.json()["error"] == "not_a_member"


async def test_api_key(dev_api: httpx.AsyncClient) -> None:
    me = await dev_api.get("/api/v1/auth/me", headers={"X-API-KEY": f"dev:{DEV_ADMIN}:{PASSWORD}"})

    assert me.json()["role"] == "admin"


async def test_challenge_without_password_rejected(dev_api: httpx.AsyncClient) -> None:
    forged = await dev_api.post(
        "/api/v1/auth/use-challenge", json={"challenge": f"dev-challenge:{DEV_ADMIN}"}
    )
    key = await dev_api.get("/api/v1/auth/me", headers={"X-API-KEY": f"dev:{DEV_ADMIN}"})

    assert forged.json()["error"] == "invalid_challenge"
    assert key.status_code == 401
