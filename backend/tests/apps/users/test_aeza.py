"""Клиент API Aéza на ответах, снятых с my.aeza.ru 2026-10-24."""

import json

import httpx
import pytest

from apps.users.aeza import AezaClient, InvalidCode, InvalidCredentials
from core.auth import IdentityUnavailable, Unauthenticated

BASE = "https://my.aeza.test/api"
ME = {"id": 510145, "status": "active", "email": "User@Hackathon.rnd", "roles": ["user"]}


def _client(handler: httpx.MockTransport) -> AezaClient:
    return AezaClient(BASE, httpx.AsyncClient(base_url=BASE, transport=handler))


def _aeza(request: httpx.Request) -> httpx.Response:  # noqa: PLR0911 - ответ на каждый путь API
    path = request.url.path.removeprefix("/api")
    body = json.loads(request.content) if request.content else {}
    if path == "/v2/auth/login":
        if body["password"] != "right":
            return httpx.Response(
                400,
                json={
                    "statusCode": 400,
                    "message": "Invalid credentials",
                    "error": "invalid_credentials",
                },
            )
        return httpx.Response(200, json={"challenge": "ch-1", "requirements": []})
    if path == "/v2/auth/use-challenge":
        if body["challenge"] != "ch-1":
            return httpx.Response(400, json={"statusCode": 400, "error": "invalid_challenge"})
        return httpx.Response(
            200, json={"session": "sess-1", "expiresAt": "2026-11-23T13:12:55.000Z"}
        )
    if path == "/v2/accounts/me":
        authorized = request.headers.get("authorization") == "Bearer sess-1" or (
            request.headers.get("x-api-key") == "1308_key"
        )
        if not authorized:
            return httpx.Response(401, json={"statusCode": 401, "error": "not_auth"})
        return httpx.Response(200, json=ME)
    if path == "/v2/auth/logout":
        return httpx.Response(204)
    return httpx.Response(404)


async def test_login_and_account_by_session() -> None:
    client = _client(httpx.MockTransport(_aeza))

    challenge = await client.login("user@hackathon.rnd", "right")
    session = await client.use_challenge(challenge.challenge)
    account = await client.account(session=session)
    await client.logout(session)

    assert (challenge.challenge, challenge.requirements) == ("ch-1", ())
    assert session == "sess-1"
    assert (account.id, account.email) == (510145, "user@hackathon.rnd")


async def test_account_by_api_key() -> None:
    account = await _client(httpx.MockTransport(_aeza)).account(api_key="1308_key")

    assert account.id == 510145


async def test_wrong_password_and_challenge() -> None:
    client = _client(httpx.MockTransport(_aeza))

    with pytest.raises(InvalidCredentials):
        await client.login("user@hackathon.rnd", "wrong")
    with pytest.raises(InvalidCode):
        await client.use_challenge("stale")


async def test_unknown_key_is_unauthenticated() -> None:
    with pytest.raises(Unauthenticated):
        await _client(httpx.MockTransport(_aeza)).account(api_key="other")


@pytest.mark.parametrize(
    "answer",
    [
        lambda request: httpx.Response(502, text="Bad Gateway"),
        lambda request: httpx.Response(200, text="<html>WAF</html>"),
        lambda request: httpx.Response(200, json={"unexpected": True}),
    ],
    ids=["5xx", "html", "shape"],
)
async def test_bad_answers_mean_unavailable(answer: object) -> None:
    client = _client(httpx.MockTransport(answer))  # type: ignore[arg-type]

    with pytest.raises(IdentityUnavailable):
        await client.login("user@hackathon.rnd", "right")


async def test_network_error_means_unavailable() -> None:
    def fail(request: httpx.Request) -> httpx.Response:
        raise httpx.ConnectError("нет сети", request=request)

    with pytest.raises(IdentityUnavailable):
        await _client(httpx.MockTransport(fail)).account(api_key="1308_key")


async def test_logout_failure_is_not_fatal() -> None:
    def fail(request: httpx.Request) -> httpx.Response:
        raise httpx.ConnectError("нет сети", request=request)

    await _client(httpx.MockTransport(fail)).logout("sess-1")
