"""API Aéza в памяти: аккаунты, challenge, сессии и ключи."""

import itertools
from dataclasses import dataclass

from apps.users.aeza import AezaAccount, InvalidCode, InvalidCredentials, LoginChallenge
from core.auth import IdentityUnavailable, Unauthenticated

PASSWORD = "s3cret-pass"


@dataclass
class _Account:
    id: int
    email: str
    password: str
    tfa_code: str | None
    api_key: str | None


class FakeAeza:
    def __init__(self) -> None:
        self.accounts: dict[str, _Account] = {}
        self.available = True
        self.calls: list[str] = []
        self.logouts: list[str] = []
        self._ids = itertools.count(510_145)
        self._tokens = itertools.count(1)
        self._challenges: dict[str, str] = {}
        self._sessions: dict[str, str] = {}

    def add(
        self,
        email: str,
        *,
        password: str = PASSWORD,
        tfa_code: str | None = None,
        api_key: str | None = None,
    ) -> AezaAccount:
        account = _Account(next(self._ids), email, password, tfa_code, api_key)
        self.accounts[email] = account
        return AezaAccount(account.id, email)

    def rename(self, old_email: str, new_email: str) -> None:
        account = self.accounts.pop(old_email)
        account.email = new_email
        self.accounts[new_email] = account

    def open_sessions(self) -> int:
        return len(self._sessions)

    async def login(self, email: str, password: str) -> LoginChallenge:
        self._call("login")
        account = self.accounts.get(email)
        if account is None or account.password != password:
            raise InvalidCredentials
        challenge = f"challenge-{next(self._tokens)}"
        self._challenges[challenge] = email
        return LoginChallenge(challenge, ("totp",) if account.tfa_code else ())

    async def use_challenge(self, challenge: str) -> str:
        self._call("use_challenge")
        email = self._challenges.pop(challenge, None)
        if email is None or self.accounts[email].tfa_code:
            raise InvalidCode
        return self._open(email)

    async def submit_totp(self, challenge: str, code: str) -> str:
        self._call("submit_totp")
        email = self._challenges.get(challenge)
        if email is None or self.accounts[email].tfa_code != code:
            raise InvalidCode
        del self._challenges[challenge]
        return self._open(email)

    async def account(
        self, *, session: str | None = None, api_key: str | None = None
    ) -> AezaAccount:
        self._call("account")
        if session is not None:
            email = self._sessions.get(session)
        else:
            email = next((a.email for a in self.accounts.values() if a.api_key == api_key), None)
        if email is None:
            raise Unauthenticated
        account = self.accounts[email]
        return AezaAccount(account.id, account.email)

    async def logout(self, session: str) -> None:
        self.logouts.append(session)
        self._sessions.pop(session, None)

    def _open(self, email: str) -> str:
        session = f"aeza-session-{next(self._tokens)}"
        self._sessions[session] = email
        return session

    def _call(self, name: str) -> None:
        self.calls.append(name)
        if not self.available:
            raise IdentityUnavailable
