"""Журнал операций с участниками и синхронизация администраторов из настроек."""

import pytest
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from apps.audit.models import AuditRecord
from apps.users.models import AuthSession, Member
from apps.users.service import MemberChange, UsersService, sync_admins
from core.auth import Principal, Role
from core.errors import AppError
from tests.auth_helpers import ADMIN_ID

pytestmark = pytest.mark.integration

ADMIN = Principal(ADMIN_ID, "glavbuh@company.ru", Role.ADMIN)


async def _members(session_factory: async_sessionmaker[AsyncSession]) -> dict[str, tuple[str, str]]:
    async with session_factory() as session:
        return {m.email: (m.role, m.source) for m in await session.scalars(select(Member))}


async def test_only_successful_operations_are_audited(
    session_factory: async_sessionmaker[AsyncSession],
) -> None:
    service = UsersService(session_factory)

    created = await service.create(ADMIN, "buh@company.ru", Role.USER)
    with pytest.raises(AppError):
        await service.create(ADMIN, "buh@company.ru", Role.USER)
    await service.update(ADMIN, created.id, MemberChange(role=Role.INTEGRATION))
    await service.delete(ADMIN, created.id)

    async with session_factory() as session:
        records = {r.action: r for r in (await session.scalars(select(AuditRecord))).all()}
    assert set(records) == {"member.created", "member.updated", "member.deleted"}
    assert all(
        r.actor_login == "glavbuh@company.ru" and r.entity_id == str(created.id)
        for r in records.values()
    )
    assert records["member.updated"].details == {
        "email": "buh@company.ru",
        "role": "integration",
        "role_before": "user",
        "enabled_before": True,
    }
    assert records["member.updated"].entity_name == "buh@company.ru"


async def test_first_sync_creates_admins(session_factory: async_sessionmaker[AsyncSession]) -> None:
    await sync_admins(session_factory, ["glavbuh@company.ru", "chief@company.ru"])
    await sync_admins(session_factory, ["glavbuh@company.ru", "chief@company.ru"])

    assert await _members(session_factory) == {
        "glavbuh@company.ru": ("admin", "env"),
        "chief@company.ru": ("admin", "env"),
    }


async def test_removed_admin_loses_access(
    session_factory: async_sessionmaker[AsyncSession],
) -> None:
    await sync_admins(session_factory, ["a@company.ru"])
    async with session_factory() as session, session.begin():
        member = await session.scalar(select(Member).where(Member.email == "a@company.ru"))
        assert member is not None
        session.add(
            AuthSession(
                token_hash="h" * 64,
                member_id=member.id,
                created_at=member.created_at,
                expires_at=member.created_at.replace(year=2100),
            )
        )

    await sync_admins(session_factory, ["b@company.ru"])

    assert await _members(session_factory) == {"b@company.ru": ("admin", "env")}
    async with session_factory() as session:
        assert list(await session.scalars(select(AuthSession))) == []


async def test_panel_member_becomes_admin(
    session_factory: async_sessionmaker[AsyncSession],
) -> None:
    await UsersService(session_factory).create(ADMIN, "buh@company.ru", Role.USER)

    await sync_admins(session_factory, ["buh@company.ru"])

    assert await _members(session_factory) == {"buh@company.ru": ("admin", "env")}
