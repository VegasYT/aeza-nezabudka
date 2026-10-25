"""Вход через Aéza, текущий участник и белый список (ADR-014)."""

from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, Query, Request, status
from fastapi.security import HTTPAuthorizationCredentials

from apps.users.models import Member
from apps.users.schemas import (
    CurrentUser,
    LoginChallengeResponse,
    LoginRequest,
    SessionResponse,
    TotpRequest,
    UseChallengeRequest,
    User,
    UserCreate,
    UserUpdate,
)
from apps.users.service import (
    AuthService,
    MemberChange,
    SignedIn,
    UsersService,
    auth_service,
    users_service,
)
from core.auth import ADMIN, Principal, Role, current_principal, require_roles
from core.schemas import Page, PageQuery, error_responses
from core.security import bearer_scheme

# Вход доступен без токена, поэтому живёт в отдельном роутере без общей проверки.
public_router = APIRouter(prefix="/auth", tags=["Вход"])
router = APIRouter()

Admin = Annotated[Principal, Depends(require_roles(ADMIN))]
Users = Annotated[UsersService, Depends(users_service)]
Auth = Annotated[AuthService, Depends(auth_service)]


def _client_ip(request: Request) -> str:
    # Caddy ставит адрес клиента первым в X-Forwarded-For; без прокси - адрес соединения.
    forwarded = request.headers.get("x-forwarded-for", "").split(",")[0].strip()
    return forwarded or (request.client.host if request.client else "unknown")


def _session(result: SignedIn) -> SessionResponse:
    return SessionResponse(session=result.token, expires_at=result.expires_at)


def _user(member: Member) -> User:
    return User(
        id=member.id,
        email=member.email,
        role=Role(member.role),
        enabled=member.enabled,
        editable=member.source != "env",
        linked=member.aeza_account_id is not None,
        created_at=member.created_at,
        last_login_at=member.last_login_at,
        last_seen_at=member.last_seen_at,
    )


@public_router.post(
    "/login",
    summary="Вход аккаунтом Aéza: шаг 1",
    description=(
        "Email и пароль аккаунта Aéza, как `POST /api/v2/auth/login` у Aéza. Ответ - "
        "`challenge` и `requirements` от Aéza. Пустой `requirements` - дальше "
        "`POST /auth/use-challenge`, иначе код 2FA в `POST /auth/tfa/totp`. "
        "400 `invalid_credentials` - неверный email или пароль."
    ),
    responses=error_responses(400, 429, 503),
)
async def login(body: LoginRequest, request: Request, service: Auth) -> LoginChallengeResponse:
    challenge = await service.login(
        body.email, body.password.get_secret_value(), _client_ip(request)
    )
    return LoginChallengeResponse(
        challenge=challenge.challenge, requirements=list(challenge.requirements)
    )


@public_router.post(
    "/use-challenge",
    summary="Вход: шаг 2 без 2FA",
    description=(
        "Меняет `challenge` на токен сессии. 403 `not_a_member` - аккаунта нет в белом списке; "
        "400 `invalid_challenge` - срок входа истёк."
    ),
    responses=error_responses(400, 403, 429, 503),
)
async def use_challenge(
    body: UseChallengeRequest, request: Request, service: Auth
) -> SessionResponse:
    return _session(
        await service.use_challenge(
            body.challenge, _client_ip(request), request.headers.get("user-agent")
        )
    )


@public_router.post(
    "/tfa/totp",
    summary="Вход: шаг 2 с кодом 2FA",
    description="`challenge` и код 2FA аккаунта Aéza. 400 `invalid_code` - неверный код.",
    responses=error_responses(400, 403, 429, 503),
)
async def submit_totp(body: TotpRequest, request: Request, service: Auth) -> SessionResponse:
    signed_in = await service.submit_totp(
        body.challenge, body.code, _client_ip(request), request.headers.get("user-agent")
    )
    return _session(signed_in)


@router.post(
    "/auth/logout",
    status_code=status.HTTP_204_NO_CONTENT,
    tags=["Вход"],
    summary="Выход",
    description="Сессия удаляется, токен больше не действует.",
    responses=error_responses(401),
)
async def logout(
    principal: Annotated[Principal, Depends(current_principal)],
    service: Auth,
    bearer: Annotated[HTTPAuthorizationCredentials | None, Depends(bearer_scheme)],
) -> None:
    if bearer is not None:
        await service.logout(principal, bearer.credentials)


@router.get(
    "/auth/me",
    tags=["Вход"],
    summary="Текущий участник",
    description="Email и роль владельца токена или ключа.",
    responses=error_responses(401),
)
async def get_current_user(
    principal: Annotated[Principal, Depends(current_principal)],
) -> CurrentUser:
    return CurrentUser(id=principal.id, email=principal.login, role=principal.role)


@router.get(
    "/users",
    tags=["Пользователи"],
    summary="Белый список",
    description=(
        "Участники с ролями `user` и `integration` по алфавиту email; администраторы из "
        "настроек не показываются. Только администратор."
    ),
    responses=error_responses(400, 401, 403),
)
async def list_users(_: Admin, service: Users, page: Annotated[PageQuery, Query()]) -> Page[User]:
    members, total = await service.list_members(page.limit, page.offset)
    return Page(items=[_user(m) for m in members], total=total)


@router.post(
    "/users",
    tags=["Пользователи"],
    status_code=status.HTTP_201_CREATED,
    summary="Добавить участника",
    description=(
        "Email аккаунта Aéza и роль. Участник сразу может войти своим аккаунтом Aéza. "
        "Email уже в списке - 409 `login_taken`. Только администратор."
    ),
    responses=error_responses(400, 401, 403, 409),
)
async def create_user(admin: Admin, service: Users, body: UserCreate) -> User:
    return _user(await service.create(admin, body.email, Role(body.role.value)))


@router.patch(
    "/users/{user_id}",
    tags=["Пользователи"],
    summary="Изменить участника",
    description=(
        "Роль или включение. Отключение и смена роли сразу завершают сессии участника. "
        "Администратора из настроек изменить нельзя - 409 `admin_protected`."
    ),
    responses=error_responses(400, 401, 403, 404, 409),
)
async def update_user(admin: Admin, service: Users, user_id: UUID, body: UserUpdate) -> User:
    change = MemberChange(
        role=None if body.role is None else Role(body.role.value), enabled=body.enabled
    )
    return _user(await service.update(admin, user_id, change))


@router.delete(
    "/users/{user_id}",
    tags=["Пользователи"],
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Удалить участника",
    description=(
        "Сессии и привязка Telegram удаляются, история оплат сохраняется с email. "
        "Администратора из настроек удалить нельзя - 409 `admin_protected`."
    ),
    responses=error_responses(400, 401, 403, 404, 409),
)
async def delete_user(admin: Admin, service: Users, user_id: UUID) -> None:
    await service.delete(admin, user_id)
