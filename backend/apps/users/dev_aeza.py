"""Тестовые аккаунты рядом с Aéza: email на `@dev.local` входят по `DEV_LOGIN_PASSWORD`.

Остальные email и токены уходят в настоящую Aéza, поэтому оба входа работают одновременно.
Подменяется только поставщик: белый список, роли, сессии и лимиты общие.
"""

import hashlib
import hmac

from apps.users.aeza import AezaAccount, AezaApi, InvalidCode, InvalidCredentials, LoginChallenge
from core.auth import Unauthenticated

DEV_DOMAIN = "@dev.local"
# email с этой меткой требует код 2FA: так проверяется экран кода без настоящей 2FA
TOTP_MARKER = "+2fa"
TOTP_CODE = "000000"
_CHALLENGE = "dev-challenge"
_TOTP_CHALLENGE = "dev-challenge-2fa"
_SESSION = "dev-session"
_API_KEY = "dev"
_KINDS = frozenset({_CHALLENGE, _TOTP_CHALLENGE, _SESSION, _API_KEY})


def _is_dev(token: str) -> bool:
    return token.partition(":")[0] in _KINDS


class DevAeza:
    """Токены без состояния: email и подпись паролем, поэтому переживают перезапуск api.

    Без подписи challenge собирался бы из одного email, и вход обходил бы пароль.
    """

    def __init__(self, password: str, real: AezaApi) -> None:
        self._password = password.encode()
        self._real = real

    async def login(self, email: str, password: str) -> LoginChallenge:
        if not email.endswith(DEV_DOMAIN):
            return await self._real.login(email, password)
        if not hmac.compare_digest(password.encode(), self._password):
            raise InvalidCredentials
        if TOTP_MARKER in email:
            return LoginChallenge(self._token(_TOTP_CHALLENGE, email), ("totp",))
        return LoginChallenge(self._token(_CHALLENGE, email), ())

    async def use_challenge(self, challenge: str) -> str:
        if not _is_dev(challenge):
            return await self._real.use_challenge(challenge)
        return self._token(_SESSION, self._email(challenge, _CHALLENGE, InvalidCode))

    async def submit_totp(self, challenge: str, code: str) -> str:
        if not _is_dev(challenge):
            return await self._real.submit_totp(challenge, code)
        if code != TOTP_CODE:
            raise InvalidCode
        return self._token(_SESSION, self._email(challenge, _TOTP_CHALLENGE, InvalidCode))

    async def account(
        self, *, session: str | None = None, api_key: str | None = None
    ) -> AezaAccount:
        if session is not None and _is_dev(session):
            email = self._email(session, _SESSION, Unauthenticated)
        elif session is None and api_key is not None and _is_dev(api_key):
            email = self._api_key_email(api_key)
        else:
            return await self._real.account(session=session, api_key=api_key)
        return AezaAccount(account_id(email), email)

    async def logout(self, session: str) -> None:
        if not _is_dev(session):
            await self._real.logout(session)

    def _token(self, kind: str, email: str) -> str:
        return f"{kind}:{email}:{self._sign(kind, email)}"

    def _sign(self, kind: str, email: str) -> str:
        return hmac.new(self._password, f"{kind}:{email}".encode(), hashlib.sha256).hexdigest()

    def _email(self, token: str, kind: str, error: type[Exception]) -> str:
        prefix, _, rest = token.partition(":")
        email, _, signature = rest.rpartition(":")
        if (
            prefix != kind
            or not email
            or not hmac.compare_digest(signature.encode(), self._sign(kind, email).encode())
        ):
            raise error
        return email

    def _api_key_email(self, api_key: str) -> str:
        """Ключ `dev:<email>:<пароль>` только для `@dev.local`: чужой аккаунт им не открыть."""
        prefix, _, rest = api_key.partition(":")
        email, _, password = rest.rpartition(":")
        if (
            prefix != _API_KEY
            or not email.endswith(DEV_DOMAIN)
            or not hmac.compare_digest(password.encode(), self._password)
        ):
            raise Unauthenticated
        return email


def account_id(email: str) -> int:
    """Постоянный id по email: к нему привязывается участник при первом входе."""
    return int.from_bytes(hashlib.sha256(email.encode()).digest()[:6], "big")
