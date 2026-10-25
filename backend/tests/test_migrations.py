import pytest
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncEngine

from tests.conftest import upgrade_to_head

pytestmark = pytest.mark.integration


async def test_repeated_upgrade_changes_nothing(
    migrated_engine: AsyncEngine, postgres_url: str
) -> None:
    async with migrated_engine.connect() as connection:
        before = (await connection.execute(text("select version_num from alembic_version"))).all()

    await upgrade_to_head(postgres_url)

    async with migrated_engine.connect() as connection:
        after = (await connection.execute(text("select version_num from alembic_version"))).all()
    assert before == after
    assert len(after) == 1
