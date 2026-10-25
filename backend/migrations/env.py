"""Окружение Alembic: применяет миграции через asyncpg."""

import asyncio
import sys

from alembic import context
from sqlalchemy import pool
from sqlalchemy.engine import Connection
from sqlalchemy.ext.asyncio import create_async_engine

# Модели модулей импортируются здесь, чтобы автогенерация видела все таблицы.
import apps.audit.models
import apps.departments.models
import apps.integrations.models
import apps.payments.models
import apps.reminders.models
import apps.users.models  # noqa: F401
from core.config import ConfigError, load_settings
from core.db import Base
from core.logging import configure_logging

config = context.config
target_metadata = Base.metadata


def _database_url() -> str:
    # Тесты передают адрес своей базы напрямую, иначе берём DATABASE_URL.
    url = config.attributes.get("database_url")
    if isinstance(url, str):
        return url
    try:
        settings = load_settings()
    except ConfigError as error:
        print(error, file=sys.stderr)
        raise SystemExit(1) from None
    configure_logging("migrate", settings.log_level)
    return settings.database_url.get_secret_value()


def run_migrations_offline() -> None:
    context.configure(
        url=_database_url(),
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
    )
    with context.begin_transaction():
        context.run_migrations()


def _run(connection: Connection) -> None:
    context.configure(connection=connection, target_metadata=target_metadata)
    with context.begin_transaction():
        context.run_migrations()


async def run_migrations_online() -> None:
    engine = create_async_engine(_database_url(), poolclass=pool.NullPool)
    async with engine.connect() as connection:
        await connection.run_sync(_run)
    await engine.dispose()


if context.is_offline_mode():
    run_migrations_offline()
else:
    asyncio.run(run_migrations_online())
