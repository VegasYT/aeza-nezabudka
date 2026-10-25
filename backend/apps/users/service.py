"""Вход через Aéza, свои сессии и белый список участников (ADR-014)."""

import hashlib
import secrets
import time
from collections.abc import Callable, Sequence
from dataclasses import dataclass
from datetime import datetime, timedelta
from typing import Any
from uuid import UUID

import structlog
from fastapi import Request
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from apps.audit.service import record
from apps.reminders.service import forget_user, set_member_enabled
from apps.users import repository
from apps.users.aeza import AezaAccount, AezaApi, InvalidCode, InvalidCredentials, LoginChallenge
from apps.users.models import AuthSession, LoginFailure, Member
from core.auth import (
    IdentityUnavailable,
    NotAMember,
    Principal,
    Role,
    Unauthenticated,
    identity_unavailable,
    not_a_member,
)
from core.clock import Clock
from core.errors import AppError, not_found
from core.metrics import LOGIN_FAILURES

log = structlog.get_logger(__name__)

FAILURE_WINDOW = timedelta(minutes=10)
FAILURE_RETENTION = timedelta(days=1)
EMAIL_FAILURE_LIMIT = 5
IP_FAILURE_LIMIT = 5
# Все входы уходят в Aéza с одного IP: общий предел не даёт их WAF забанить сервер.
SERVER_FAILURE_LIMIT = 20
SERVER_SCOPE = "server"
API_KEY_CACHE_SECONDS = 60.0
ALL_ROLES = tuple(role.value for role in Role)
SEEN_EVERY = timedelta(minutes=1)
USER_AGENT_LIMIT = 300


def token_hash(value: str) -> str:
    return hashlib.sha256(value.encode()).hexdigest()


def principal_of(member: Member) -> Principal:
    return Principal(member.id, member.email, Role(member.role))


@dataclass(frozen=True)
class SignedIn:
    token: str
    expires_at: datetime
    principal: Principal


def _invalid_credentials() -> AppError:
    return AppError("invalid_credentials", "Неверный email или пароль", status_code=400)


def _invalid_challenge() -> AppError:
    return AppError(
        "invalid_challenge", "Срок входа истёк, введите email и пароль заново", status_code=400
    )


def _invalid_code() -> AppError:
    return AppError("invalid_code", "Неверный код подтверждения", status_code=400)


class AuthService:
    """Вход шагами Aéza: пароль и 2FA проверяет Aéza, доступ и роль - белый список."""

    def __init__(
        self,
        session_factory: async_sessionmaker[AsyncSession],
        clock: Clock,
        aeza: AezaApi,
        session_ttl: timedelta,
    ) -> None:
        self._session_factory = session_factory
        self._clock = clock
        self._aeza = aeza
        self._session_ttl = session_ttl

    async def login(self, email: str, password: str, client_ip: str) -> LoginChallenge:
        """Шаг 1: пароль проверяет Aéza; её `challenge` и `requirements` уходят клиенту как есть."""
        email = email.strip().lower()
        scopes = [f"email:{email}", f"ip:{client_ip}", SERVER_SCOPE]
        await self._check_limits(scopes)
        try:
            return await self._aeza.login(email, password)
        except InvalidCredentials:
            await self._failed(scopes, "invalid_credentials")
            raise _invalid_credentials() from None
        except IdentityUnavailable:
            raise identity_unavailable() from None

    async def use_challenge(
        self, challenge: str, client_ip: str, user_agent: str | None = None
    ) -> SignedIn:
        """Шаг 2 без 2FA: `challenge` меняется в Aéza на сессию, мы выдаём свою."""
        scopes = [f"ip:{client_ip}", SERVER_SCOPE]
        await self._check_limits(scopes)
        try:
            aeza_session = await self._aeza.use_challenge(challenge)
        except InvalidCode:
            await self._failed(scopes, "invalid_challenge")
            raise _invalid_challenge() from None
        except IdentityUnavailable:
            raise identity_unavailable() from None
        return await self._finish(aeza_session, client_ip, user_agent)

    async def submit_totp(
        self, challenge: str, code: str, client_ip: str, user_agent: str | None = None
    ) -> SignedIn:
        """Шаг 2 с 2FA: код проверяет Aéza."""
        scopes = [f"ip:{client_ip}", SERVER_SCOPE]
        await self._check_limits(scopes)
        try:
            aeza_session = await self._aeza.submit_totp(challenge, code.strip())
        except InvalidCode:
            await self._failed(scopes, "invalid_code")
            raise _invalid_code() from None
        except IdentityUnavailable:
            raise identity_unavailable() from None
        return await self._finish(aeza_session, client_ip, user_agent)

    async def logout(self, actor: Principal, token: str) -> None:
        async with self._session_factory() as session, session.begin():
            stored = await session.get(AuthSession, token_hash(token))
            if stored is not None:
                await session.delete(stored)
            await record(
                session, actor, "auth.logout", "member", entity_id=actor.id, entity_name=actor.login
            )

    async def _finish(self, aeza_session: str, client_ip: str, user_agent: str | None) -> SignedIn:
        """Сессия Aéza нужна только узнать аккаунт: закрываем её сразу."""
        try:
            account = await self._aeza.account(session=aeza_session)
        except (IdentityUnavailable, Unauthenticated):
            raise identity_unavailable() from None
        finally:
            await self._aeza.logout(aeza_session)
        now = self._clock.now()
        async with self._session_factory() as session, session.begin():
            member = await _bound_member(session, account)
            if member is None:
                LOGIN_FAILURES.labels("not_a_member").inc()
                raise not_a_member()
            if member.role == Role.INTEGRATION.value:
                # Интеграция работает только по X-API-KEY, в панель её не пускаем.
                LOGIN_FAILURES.labels("integration_account").inc()
                raise AppError(
                    "integration_account",
                    "Аккаунт интеграции работает только по ключу X-API-KEY",
                    status_code=403,
                )
            member.last_login_at = now
            member.last_seen_at = now
            token = secrets.token_urlsafe(32)
            expires_at = now + self._session_ttl
            session.add(
                AuthSession(
                    token_hash=token_hash(token),
                    member_id=member.id,
                    created_at=now,
                    expires_at=expires_at,
                )
            )
            principal = principal_of(member)
            await record(
                session,
                principal,
                "auth.login",
                "member",
                entity_id=member.id,
                entity_name=member.email,
                # по ним в журнале видно, кто входил: человек из браузера или скрипт
                details={"ip": client_ip, "user_agent": (user_agent or "")[:USER_AGENT_LIMIT]},
            )
        log.info("signed_in", member_id=str(member.id))
        return SignedIn(token, expires_at, principal)

    async def _check_limits(self, scopes: Sequence[str]) -> None:
        now = self._clock.now()
        async with self._session_factory() as session:
            counts = await repository.failures_since(session, scopes, now - FAILURE_WINDOW)
        for scope, (count, oldest) in counts.items():
            if count >= _limit(scope) and oldest is not None:
                LOGIN_FAILURES.labels("too_many_attempts").inc()
                retry_after = max(int((oldest + FAILURE_WINDOW - now).total_seconds()) + 1, 1)
                raise AppError(
                    "too_many_attempts",
                    "Слишком много неудачных попыток входа, попробуйте позже",
                    status_code=429,
                    headers={"Retry-After": str(retry_after)},
                )

    async def _failed(self, scopes: Sequence[str], reason: str) -> None:
        LOGIN_FAILURES.labels(reason).inc()
        now = self._clock.now()
        async with self._session_factory() as session, session.begin():
            session.add_all(LoginFailure(scope=scope, failed_at=now) for scope in scopes)


def _limit(scope: str) -> int:
    if scope == SERVER_SCOPE:
        return SERVER_FAILURE_LIMIT
    return EMAIL_FAILURE_LIMIT if scope.startswith("email:") else IP_FAILURE_LIMIT


async def _bound_member(session: AsyncSession, account: AezaAccount) -> Member | None:
    """Включённый участник аккаунта; при первом входе к нему привязывается id аккаунта."""
    member = await repository.member_for_account(session, account.id, account.email, lock=True)
    if member is None or not member.enabled:
        return None
    if member.aeza_account_id is None:
        member.aeza_account_id = account.id
    return member


class MemberAuthenticator:
    """Проверка запроса: своя сессия по базе, `X-API-KEY` через Aéza с коротким кешем."""

    def __init__(
        self,
        session_factory: async_sessionmaker[AsyncSession],
        clock: Clock,
        aeza: AezaApi,
        *,
        monotonic: Callable[[], float] = time.monotonic,
    ) -> None:
        self._session_factory = session_factory
        self._clock = clock
        self._aeza = aeza
        self._monotonic = monotonic
        # Кеш без предела размера: ключей - единицы интеграций, не тысячи.
        self._accounts: dict[str, tuple[float, AezaAccount]] = {}

    async def by_token(self, token: str) -> Principal:
        async with self._session_factory() as session:
            member = await repository.member_by_session(
                session, token_hash(token), self._clock.now()
            )
        if member is None:
            raise Unauthenticated
        return principal_of(member)

    async def by_api_key(self, api_key: str) -> Principal:
        key = token_hash(api_key)
        cached = self._accounts.get(key)
        if cached is not None and cached[0] > self._monotonic():
            account = cached[1]
        else:
            account = await self._aeza.account(api_key=api_key)
            self._accounts[key] = (self._monotonic() + API_KEY_CACHE_SECONDS, account)
        async with self._session_factory() as session, session.begin():
            member = await _bound_member(session, account)
            if member is None:
                raise NotAMember
            now = self._clock.now()
            if member.last_seen_at is None or now - member.last_seen_at >= SEEN_EVERY:
                member.last_seen_at = now
            return principal_of(member)


@dataclass(frozen=True)
class MemberChange:
    role: Role | None = None
    enabled: bool | None = None


class UsersService:
    """Белый список: администратор добавляет и убирает аккаунты Aéza с ролями."""

    def __init__(self, session_factory: async_sessionmaker[AsyncSession]) -> None:
        self._session_factory = session_factory

    async def list_members(self, limit: int, offset: int) -> tuple[list[Member], int]:
        async with self._session_factory() as session:
            return await repository.list_members(session, ALL_ROLES, limit, offset)

    async def create(self, actor: Principal, email: str, role: Role) -> Member:
        try:
            async with self._session_factory() as session, session.begin():
                member = Member(email=email.strip().lower(), role=role.value, source="panel")
                session.add(member)
                await session.flush()
                await self._audit(session, actor, "member.created", member, {"role": role.value})
                return member
        except IntegrityError:
            raise AppError("login_taken", "Этот email уже есть в списке", status_code=409) from None

    async def update(self, actor: Principal, member_id: UUID, change: MemberChange) -> Member:
        async with self._session_factory() as session, session.begin():
            member = await self._editable(session, member_id)
            details: dict[str, Any] = {
                "role_before": member.role,
                "enabled_before": member.enabled,
            }
            if change.role is not None and change.role.value != member.role:
                member.role = change.role.value
                details["role"] = change.role.value
                # Роль в сессии не хранится, но новые права начинаются с нового входа.
                await repository.delete_sessions(session, member.id)
                if change.role is Role.INTEGRATION:
                    # кнопки в Telegram доступны по привязке, у интеграции её быть не должно
                    await forget_user(session, member.id)
            if change.enabled is not None:
                member.enabled = change.enabled
                details["enabled"] = change.enabled
                await set_member_enabled(session, member.id, change.enabled)
                if not change.enabled:
                    # Отключение должно сразу закрыть уже открытые сессии.
                    await repository.delete_sessions(session, member.id)
            await self._audit(session, actor, "member.updated", member, details)
            return member

    async def delete(self, actor: Principal, member_id: UUID) -> None:
        async with self._session_factory() as session, session.begin():
            member = await self._editable(session, member_id)
            await forget_user(session, member.id)
            await self._audit(session, actor, "member.deleted", member, {})
            await session.delete(member)

    @staticmethod
    async def _editable(session: AsyncSession, member_id: UUID) -> Member:
        member = await session.get(Member, member_id, with_for_update=True)
        if member is None:
            raise not_found("Member", member_id, "Участник не найден")
        if member.source == "env":
            raise AppError(
                "admin_protected",
                "Администратора меняют только в настройках системы",
                status_code=409,
            )
        return member

    @staticmethod
    async def _audit(
        session: AsyncSession,
        actor: Principal,
        action: str,
        member: Member,
        details: dict[str, Any],
    ) -> None:
        await record(
            session,
            actor,
            action,
            "member",
            entity_id=member.id,
            entity_name=member.email,
            details={"email": member.email, **details},
        )


async def sync_admins(
    session_factory: async_sessionmaker[AsyncSession], emails: Sequence[str]
) -> None:
    """Администраторы - ровно email из настроек; убранные теряют доступ вместе с сессиями."""
    wanted = {email.lower() for email in emails}
    async with session_factory() as session, session.begin():
        members = {
            member.email: member
            for member in await session.scalars(
                select(Member)
                .where((Member.source == "env") | Member.email.in_(wanted))
                .with_for_update()
            )
        }
        for email, member in members.items():
            if member.source == "env" and email not in wanted:
                await forget_user(session, member.id)
                await session.delete(member)
        for email in wanted:
            admin = members.get(email)
            if admin is None:
                session.add(Member(email=email, role=Role.ADMIN.value, source="env"))
            else:
                admin.role, admin.source, admin.enabled = Role.ADMIN.value, "env", True
    log.info("admins_synced", count=len(wanted))


async def cleanup(session_factory: async_sessionmaker[AsyncSession], clock: Clock) -> None:
    """Удаляет истёкшие сессии и старые записи о неудачных входах."""
    now = clock.now()
    async with session_factory() as session, session.begin():
        await repository.delete_expired(session, now, now - FAILURE_RETENTION)


def users_service(request: Request) -> UsersService:
    return UsersService(request.app.state.session_factory)


def auth_service(request: Request) -> AuthService:
    return AuthService(
        request.app.state.session_factory,
        request.app.state.clock,
        request.app.state.aeza,
        timedelta(hours=request.app.state.session_ttl_hours),
    )
