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
from core.live import LiveEvent, publish

_SECRET_KEY = re.compile(r"password|secret|token", re.IGNORECASE)
# изменения этих объектов видят все роли, остальные - администраторы (ADR-016)
_PUBLIC_ENTITIES = frozenset({"payment", "occurrence", "department", "settings"})


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
    """Добавляет запись в текущую транзакцию сессии и публикует событие для панели;
    секреты из `details` не сохраняются."""
    target = None if entity_id is None else str(entity_id)
    session.add(
        AuditRecord(
            actor_id=actor.id,
            actor_login=actor.login,
            action=action,
            entity=entity,
            entity_id=target,
            entity_name=entity_name,
            details={k: v for k, v in (details or {}).items() if not _SECRET_KEY.search(k)},
        )
    )
    await publish(
        session,
        LiveEvent(
            type=action,
            audience="all" if entity in _PUBLIC_ENTITIES else "admins",
            entity_type=entity,
            entity_id=target,
            entity_name=entity_name,
            actor_login=actor.login,
            # о смене роли или отключении узнаёт и сам участник
            member_id=target if entity == "member" else None,
        ),
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
