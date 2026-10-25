"""Кто делает запрос и что ему можно: своя сессия или ключ аккаунта Aéza (ADR-014)."""

from collections.abc import Awaitable, Callable
from dataclasses import dataclass
from enum import StrEnum
from typing import Annotated, Protocol
from uuid import UUID

from fastapi import Depends, Request, Security
from fastapi.security import HTTPAuthorizationCredentials

from core.errors import AppError
from core.metrics import DEPENDENCY_ERRORS
from core.security import api_key_scheme, bearer_scheme


class Role(StrEnum):
    ADMIN = "admin"
    USER = "user"
    INTEGRATION = "integration"


ADMIN = frozenset({Role.ADMIN})
STAFF = frozenset({Role.ADMIN, Role.USER})
ADMIN_AND_INTEGRATION = frozenset({Role.ADMIN, Role.INTEGRATION})
STAFF_AND_INTEGRATION = frozenset(Role)


@dataclass(frozen=True)
class Principal:
    id: UUID
    login: str
    role: Role


class Unauthenticated(Exception):
    """Токен или ключ не действует."""


class NotAMember(Exception):
    """Аккаунт Aéza есть, но его нет в белом списке или он отключён."""


class IdentityUnavailable(Exception):
    """API Aéza не ответил, а без него операцию не выполнить."""


class Authenticator(Protocol):
    async def by_token(self, token: str) -> Principal: ...

    async def by_api_key(self, api_key: str) -> Principal: ...


def unauthorized() -> AppError:
    return AppError(
        "not_auth",
        "Нужно войти в систему",
        status_code=401,
        headers={"WWW-Authenticate": "Bearer"},
    )


def _forbidden() -> AppError:
    return AppError("forbidden", "Недостаточно прав для этой операции", status_code=403)


def not_a_member() -> AppError:
    return AppError(
        "not_a_member",
        "У этого аккаунта Aéza нет доступа к системе, обратитесь к администратору",
        status_code=403,
    )


def identity_unavailable() -> AppError:
    DEPENDENCY_ERRORS.labels("aeza").inc()
    return AppError("identity_unavailable", "Сервис входа временно недоступен", status_code=503)


async def current_principal(
    request: Request,
    bearer: Annotated[HTTPAuthorizationCredentials | None, Security(bearer_scheme)],
    api_key: Annotated[str | None, Security(api_key_scheme)],
) -> Principal:
    """Зависимость FastAPI: участник по `Authorization: Bearer`, иначе по `X-API-KEY`."""
    authenticator: Authenticator = request.app.state.authenticator
    try:
        if bearer is not None and bearer.credentials:
            return await authenticator.by_token(bearer.credentials)
        if api_key:
            return await authenticator.by_api_key(api_key)
    except Unauthenticated:
        raise unauthorized() from None
    except NotAMember:
        raise not_a_member() from None
    except IdentityUnavailable:
        raise identity_unavailable() from None
    raise unauthorized()


def require_roles(roles: frozenset[Role]) -> Callable[..., Awaitable[Principal]]:
    """Зависимость операции: роль запроса должна входить в `roles`, иначе 403."""

    async def check(principal: Annotated[Principal, Depends(current_principal)]) -> Principal:
        if principal.role not in roles:
            raise _forbidden()
        return principal

    return check
