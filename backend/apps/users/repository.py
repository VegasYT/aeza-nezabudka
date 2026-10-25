"""Запросы к белому списку, сессиям и счётчику неудачных входов."""

from collections.abc import Sequence
from datetime import datetime
from uuid import UUID

from sqlalchemy import delete, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from apps.users.models import AuthSession, LoginFailure, Member


async def member_by_session(session: AsyncSession, token_hash: str, now: datetime) -> Member | None:
    return await session.scalar(
        select(Member)
        .join(AuthSession, AuthSession.member_id == Member.id)
        .where(AuthSession.token_hash == token_hash, AuthSession.expires_at > now, Member.enabled)
    )


async def member_for_account(
    session: AsyncSession, account_id: int, email: str, *, lock: bool = False
) -> Member | None:
    """Участник, привязанный к аккаунту, или ещё не привязанный с тем же email."""
    statement = (
        select(Member)
        .where(
            or_(
                Member.aeza_account_id == account_id,
                (Member.email == email) & Member.aeza_account_id.is_(None),
            )
        )
        .order_by(Member.aeza_account_id.is_(None))
        .limit(1)
    )
    if lock:
        statement = statement.with_for_update()
    return await session.scalar(statement)


async def list_members(
    session: AsyncSession, roles: Sequence[str], limit: int, offset: int
) -> tuple[list[Member], int]:
    condition = Member.role.in_(roles)
    total = await session.scalar(select(func.count()).select_from(Member).where(condition))
    rows = await session.scalars(
        # администраторы из настроек ("env") первыми
        select(Member)
        .where(condition)
        .order_by(Member.source, Member.email)
        .limit(limit)
        .offset(offset)
    )
    return list(rows), total or 0


async def delete_sessions(session: AsyncSession, member_id: UUID) -> None:
    await session.execute(delete(AuthSession).where(AuthSession.member_id == member_id))


async def failures_since(
    session: AsyncSession, scopes: Sequence[str], since: datetime
) -> dict[str, tuple[int, datetime | None]]:
    """Сколько неудач в окне по каждой области и когда была самая ранняя из них."""
    rows = await session.execute(
        select(LoginFailure.scope, func.count(), func.min(LoginFailure.failed_at))
        .where(LoginFailure.scope.in_(scopes), LoginFailure.failed_at > since)
        .group_by(LoginFailure.scope)
    )
    return {row[0]: (int(row[1]), row[2]) for row in rows.all()}


async def delete_expired(session: AsyncSession, now: datetime, failures_before: datetime) -> None:
    await session.execute(delete(AuthSession).where(AuthSession.expires_at <= now))
    await session.execute(delete(LoginFailure).where(LoginFailure.failed_at < failures_before))
