"""Клиент API Aéza: вход через challenge и данные аккаунта (ADR-014).

Пути и форматы проверены на my.aeza.ru 2026-10-24; `tfa/totp` взят из кода кабинета Aéza.
"""

from dataclasses import dataclass
from typing import Any, Protocol

import httpx
import structlog

from core.auth import IdentityUnavailable, Unauthenticated

log = structlog.get_logger(__name__)

REQUEST_TIMEOUT_SECONDS = 10.0


class InvalidCredentials(Exception):
    """Неверный email или пароль: Aéza их не различает."""


class InvalidCode(Exception):
    """Неверный код 2FA или истёкший challenge."""


@dataclass(frozen=True)
class LoginChallenge:
    challenge: str
    # Пусто - дополнительных проверок нет, challenge сразу меняется на сессию.
    requirements: tuple[str, ...]


@dataclass(frozen=True)
class AezaAccount:
    id: int
    email: str


class AezaApi(Protocol):
    """Ошибки - исключения этого модуля, `Unauthenticated` и `IdentityUnavailable`."""

    async def login(self, email: str, password: str) -> LoginChallenge: ...

    async def use_challenge(self, challenge: str) -> str:
        """Возвращает сессию Aéza."""
        ...

    async def submit_totp(self, challenge: str, code: str) -> str: ...

    async def account(
        self, *, session: str | None = None, api_key: str | None = None
    ) -> AezaAccount:
        """Аккаунт по сессии Aéza или по ключу `X-API-KEY`."""
        ...

    async def logout(self, session: str) -> None: ...


class AezaClient:
    def __init__(self, base_url: str, http: httpx.AsyncClient | None = None) -> None:
        self._http = http or httpx.AsyncClient(base_url=base_url, timeout=REQUEST_TIMEOUT_SECONDS)

    async def login(self, email: str, password: str) -> LoginChallenge:
        response = await self._send(
            "POST", "/v2/auth/login", json={"email": email, "password": password}
        )
        if response.status_code in {400, 401, 403}:
            raise InvalidCredentials
        body = self._json(response)
        challenge = body.get("challenge")
        requirements = body.get("requirements") or []
        if not isinstance(challenge, str) or not isinstance(requirements, list):
            raise self._unexpected(response)
        return LoginChallenge(challenge, tuple(str(item) for item in requirements))

    async def use_challenge(self, challenge: str) -> str:
        response = await self._send("POST", "/v2/auth/use-challenge", json={"challenge": challenge})
        if response.status_code in {400, 401, 403, 404}:
            raise InvalidCode
        return self._session(response)

    async def submit_totp(self, challenge: str, code: str) -> str:
        response = await self._send(
            "POST", "/v2/auth/tfa/totp", json={"challenge": challenge, "code": code}
        )
        if response.status_code in {400, 401, 403, 404}:
            raise InvalidCode
        return self._session(response)

    async def account(
        self, *, session: str | None = None, api_key: str | None = None
    ) -> AezaAccount:
        headers = (
            {"Authorization": f"Bearer {session}"} if session else {"X-API-KEY": api_key or ""}
        )
        response = await self._send("GET", "/v2/accounts/me", headers=headers)
        if response.status_code in {401, 403}:
            raise Unauthenticated
        body = self._json(response)
        account_id, email = body.get("id"), body.get("email")
        if not isinstance(account_id, int) or not isinstance(email, str):
            raise self._unexpected(response)
        return AezaAccount(account_id, email.lower())

    async def logout(self, session: str) -> None:
        # Не закрытая сессия Aéza истечёт сама; вход от этого не должен падать.
        try:
            await self._http.post("/v2/auth/logout", headers={"Authorization": f"Bearer {session}"})
        except httpx.HTTPError:
            log.warning("aeza_logout_failed")

    async def close(self) -> None:
        await self._http.aclose()

    async def _send(self, method: str, path: str, **kwargs: Any) -> httpx.Response:
        try:
            response = await self._http.request(method, path, **kwargs)
        except httpx.HTTPError as error:
            log.warning("aeza_unavailable", path=path, error=type(error).__name__)
            raise IdentityUnavailable from None
        if response.status_code >= 500 or response.status_code == 429:
            log.warning("aeza_unavailable", path=path, status=response.status_code)
            raise IdentityUnavailable
        return response

    def _session(self, response: httpx.Response) -> str:
        session = self._json(response).get("session")
        if not isinstance(session, str):
            raise self._unexpected(response)
        return session

    def _json(self, response: httpx.Response) -> dict[str, Any]:
        try:
            body = response.json()
        except ValueError:
            raise self._unexpected(response) from None
        if response.status_code >= 300 or not isinstance(body, dict):
            raise self._unexpected(response)
        return body

    @staticmethod
    def _unexpected(response: httpx.Response) -> IdentityUnavailable:
        log.warning("aeza_unexpected_response", path=response.url.path, status=response.status_code)
        return IdentityUnavailable()
