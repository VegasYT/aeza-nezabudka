"""Тестовые токены без базы и Aéza: в быстрых тестах участника задаёт сам токен."""

import uuid

from core.auth import Principal, Role, Unauthenticated

ADMIN_ID = uuid.UUID("2f6c4a1e-8d3b-4c5a-9e7f-1a2b3c4d5e6f")
_PREFIX = "test-token"
# Порядок задаёт приоритет, как у ролей участника: администратор важнее остальных.
_ROLE_PRIORITY = (Role.ADMIN, Role.INTEGRATION, Role.USER)


def make_token(
    *,
    roles: tuple[str, ...] = ("admin", "user"),
    login: str = "admin",
    subject: uuid.UUID = ADMIN_ID,
) -> str:
    role = next(r for r in _ROLE_PRIORITY if r.value in roles)
    return f"{_PREFIX}:{role.value}:{login}:{subject}"


class FakeAuthenticator:
    """Читает участника из токена `make_token`; настоящие сессии проверяют тесты модуля users."""

    async def by_token(self, token: str) -> Principal:
        try:
            prefix, role, login, subject = token.split(":")
            if prefix != _PREFIX:
                raise ValueError(prefix)
            return Principal(uuid.UUID(subject), login, Role(role))
        except ValueError:
            raise Unauthenticated from None

    async def by_api_key(self, api_key: str) -> Principal:
        raise Unauthenticated
