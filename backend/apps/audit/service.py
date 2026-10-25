"""Журнал действий: запись из других модулей и чтение для администратора."""

import re
from collections.abc import Mapping
from typing import Any

from fastapi import Request
from pydantic.alias_generators import to_camel
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from apps.audit import repository
from apps.audit.models import AuditRecord
from apps.audit.schemas import AuditQuery
from core.auth import Principal

_SECRET_KEY = re.compile(r"password|secret|token", re.IGNORECASE)


async def record(
    session: AsyncSession,
    actor: Principal,
    action: str,
    entity: str,
    *,
    entity_id: object | None = None,
    entity_name: str | None = None,
    details: Mapping[str, Any] | None = None,
) -> None:
    """Добавляет запись в текущую транзакцию сессии; секреты из `details` не сохраняются."""
    session.add(
        AuditRecord(
            actor_id=actor.id,
            actor_login=actor.login,
            action=action,
            entity=entity,
            entity_id=None if entity_id is None else str(entity_id),
            entity_name=entity_name,
            details={k: v for k, v in (details or {}).items() if not _SECRET_KEY.search(k)},
        )
    )


class AuditService:
    def __init__(self, session_factory: async_sessionmaker[AsyncSession]) -> None:
        self._session_factory = session_factory

    async def list_records(self, query: AuditQuery) -> tuple[list[AuditRecord], int]:
        async with self._session_factory() as session:
            return await repository.list_records(session, query)


def camel_keys(value: Any) -> Any:
    """Ключи `details` в camelCase, как остальной API; старые записи хранятся в snake_case."""
    if isinstance(value, dict):
        return {to_camel(str(key)): camel_keys(item) for key, item in value.items()}
    if isinstance(value, list):
        return [camel_keys(item) for item in value]
    return value


def audit_service(request: Request) -> AuditService:
    return AuditService(request.app.state.session_factory)
