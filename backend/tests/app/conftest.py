"""Клиент API без базы: для тестов контракта и документации."""

from collections.abc import AsyncIterator

import httpx
import pytest
from fastapi import FastAPI
from pydantic import SecretStr

from app.main import create_app
from apps.departments.service import departments_service
from apps.payments.service import payments_service
from apps.reminders.service import telegram_links
from apps.users.service import auth_service, users_service
from core.config import Settings
from core.errors import NotImplementedYet
from core.logging import RequestContextMiddleware
from tests.auth_helpers import FakeAuthenticator

# Engine создаётся лениво: к этому адресу никто не подключается.
OFFLINE_DATABASE_URL = "postgresql+asyncpg://app:app@127.0.0.1:1/app"


class _NoBackend:
    """Сервис без базы и Aéza: любая операция отвечает 501, проверяется только доступ."""

    def __getattr__(self, name: str) -> object:
        async def unavailable(*_: object, **__: object) -> None:
            raise NotImplementedYet

        return unavailable


# Одно приложение на прогон: тесты его не меняют, а сборка и схема OpenAPI - самое долгое.
@pytest.fixture(scope="session")
def offline_app() -> FastAPI:
    settings = Settings.model_validate(
        {"database_url": SecretStr(OFFLINE_DATABASE_URL), "tz": "Europe/Moscow", "app_env": "test"}
    )
    app = create_app(settings, authenticator=FakeAuthenticator())
    for service in (
        payments_service,
        users_service,
        auth_service,
        telegram_links,
        departments_service,
    ):
        app.dependency_overrides[service] = _NoBackend
    return app


@pytest.fixture
async def offline_client(offline_app: FastAPI) -> AsyncIterator[httpx.AsyncClient]:
    transport = httpx.ASGITransport(
        app=RequestContextMiddleware(offline_app), raise_app_exceptions=False
    )
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        yield client
