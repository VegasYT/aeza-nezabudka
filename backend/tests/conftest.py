"""Общие фикстуры: PostgreSQL в контейнере, миграции, откат изменений после каждого теста."""

import asyncio
import os
from collections.abc import AsyncIterator, Iterator
from datetime import date
from pathlib import Path

import pytest
from alembic import command
from alembic.config import Config
from pydantic import SecretStr
from sqlalchemy.ext.asyncio import (
    AsyncConnection,
    AsyncEngine,
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)
from testcontainers.community.postgres import PostgresContainer

from core.clock import FixedClock
from core.config import Settings

# Ryuk (сборщик забытых контейнеров) не публикует порт в Docker Desktop на Windows;
# контейнеры и так останавливает контекстный менеджер фикстуры.
os.environ.setdefault("TESTCONTAINERS_RYUK_DISABLED", "true")

BACKEND_DIR = Path(__file__).resolve().parent.parent
TODAY = date(2026, 10, 24)


def alembic_config(database_url: str) -> Config:
    config = Config(str(BACKEND_DIR / "alembic.ini"))
    config.attributes["database_url"] = database_url
    return config


async def upgrade_to_head(database_url: str) -> None:
    # env.py сам запускает цикл событий, поэтому Alembic работает в отдельном потоке.
    await asyncio.to_thread(command.upgrade, alembic_config(database_url), "head")


@pytest.fixture(scope="session")
def postgres_url() -> Iterator[str]:
    with PostgresContainer("postgres:17-alpine") as container:
        host = container.get_container_host_ip()
        port = container.get_exposed_port(5432)
        yield (
            f"postgresql+asyncpg://{container.username}:{container.password}"
            f"@{host}:{port}/{container.dbname}"
        )


@pytest.fixture(scope="session")
async def migrated_engine(postgres_url: str) -> AsyncIterator[AsyncEngine]:
    await upgrade_to_head(postgres_url)
    engine = create_async_engine(postgres_url)
    yield engine
    await engine.dispose()


@pytest.fixture
async def db_connection(migrated_engine: AsyncEngine) -> AsyncIterator[AsyncConnection]:
    async with migrated_engine.connect() as connection:
        transaction = await connection.begin()
        yield connection
        await transaction.rollback()


@pytest.fixture
def session_factory(db_connection: AsyncConnection) -> async_sessionmaker[AsyncSession]:
    # Коммит сервиса становится точкой сохранения, внешняя транзакция откатывается в конце теста.
    return async_sessionmaker(
        bind=db_connection, expire_on_commit=False, join_transaction_mode="create_savepoint"
    )


@pytest.fixture
def clock() -> FixedClock:
    return FixedClock(TODAY)


@pytest.fixture
def settings(postgres_url: str) -> Settings:
    return Settings.model_validate(
        {"database_url": SecretStr(postgres_url), "tz": "Europe/Moscow", "app_env": "test"}
    )
