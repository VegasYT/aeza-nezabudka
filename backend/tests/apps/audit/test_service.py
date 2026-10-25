import pytest
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from apps.audit.models import AuditRecord
from apps.audit.service import record
from core.auth import Principal, Role
from tests.auth_helpers import ADMIN_ID

pytestmark = pytest.mark.integration


async def test_record_keeps_author_login_and_drops_secrets(
    session_factory: async_sessionmaker[AsyncSession],
) -> None:
    admin = Principal(ADMIN_ID, "admin", Role.ADMIN)

    async with session_factory() as session, session.begin():
        await record(
            session,
            admin,
            "user.created",
            "user",
            entity_id="5b1d2c3e",
            details={"login": "buh.petrova", "password": "s3cret-pass"},
        )

    async with session_factory() as session:
        saved = (await session.scalars(select(AuditRecord))).one()
    assert (saved.actor_id, saved.actor_login, saved.action) == (ADMIN_ID, "admin", "user.created")
    assert saved.details == {"login": "buh.petrova"}
