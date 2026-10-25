"""Как запрос превращается в участника: заголовки и ответы на ошибки проверки."""

import uuid
from typing import Annotated

import httpx
import pytest
from fastapi import Depends, FastAPI

from core.auth import (
    IdentityUnavailable,
    NotAMember,
    Principal,
    Role,
    Unauthenticated,
    current_principal,
)
from core.errors import install_error_handlers

ID = uuid.UUID("2f6c4a1e-8d3b-4c5a-9e7f-1a2b3c4d5e6f")


class Stub:
    def __init__(self, error: Exception | None = None) -> None:
        self.error = error
        self.calls: list[tuple[str, str]] = []

    async def by_token(self, token: str) -> Principal:
        self.calls.append(("token", token))
        if self.error:
            raise self.error
        return Principal(ID, "buh@company.ru", Role.USER)

    async def by_api_key(self, api_key: str) -> Principal:
        self.calls.append(("api_key", api_key))
        if self.error:
            raise self.error
        return Principal(ID, "erp@company.ru", Role.INTEGRATION)


def _client(stub: Stub) -> httpx.AsyncClient:
    app = FastAPI()
    app.state.authenticator = stub
    install_error_handlers(app)

    @app.get("/who")
    async def who(principal: Annotated[Principal, Depends(current_principal)]) -> dict[str, str]:
        return {"login": principal.login, "role": principal.role.value}

    return httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test")


async def test_bearer_token() -> None:
    stub = Stub()
    async with _client(stub) as client:
        response = await client.get("/who", headers={"Authorization": "Bearer abc"})

    assert response.json() == {"login": "buh@company.ru", "role": "user"}
    assert stub.calls == [("token", "abc")]


async def test_api_key() -> None:
    stub = Stub()
    async with _client(stub) as client:
        response = await client.get("/who", headers={"X-API-KEY": "key-1"})

    assert response.json()["role"] == "integration"
    assert stub.calls == [("api_key", "key-1")]


async def test_bearer_wins_over_api_key() -> None:
    stub = Stub()
    async with _client(stub) as client:
        await client.get("/who", headers={"Authorization": "Bearer abc", "X-API-KEY": "key-1"})

    assert stub.calls == [("token", "abc")]


async def test_no_credentials_is_unauthorized() -> None:
    async with _client(Stub()) as client:
        response = await client.get("/who")

    assert response.status_code == 401
    assert response.json()["error"] == "not_auth"
    assert response.headers["WWW-Authenticate"] == "Bearer"


@pytest.mark.parametrize(
    ("error", "status", "code"),
    [
        (Unauthenticated(), 401, "not_auth"),
        (NotAMember(), 403, "not_a_member"),
        (IdentityUnavailable(), 503, "identity_unavailable"),
    ],
    ids=["unauthenticated", "not-a-member", "aeza-down"],
)
async def test_errors_map_to_responses(error: Exception, status: int, code: str) -> None:
    async with _client(Stub(error)) as client:
        response = await client.get("/who", headers={"X-API-KEY": "key-1"})

    assert (response.status_code, response.json()["error"]) == (status, code)
