from sqlalchemy import ColumnElement, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from apps.audit.models import AuditRecord
from apps.audit.schemas import AuditQuery


def _conditions(query: AuditQuery) -> list[ColumnElement[bool]]:
    conditions: list[ColumnElement[bool]] = []
    if query.action is not None:
        if query.action.endswith(".*"):
            conditions.append(AuditRecord.action.startswith(query.action[:-1], autoescape=True))
        else:
            conditions.append(AuditRecord.action == query.action)
    if query.entity is not None:
        conditions.append(AuditRecord.entity == query.entity)
    if query.entity_id is not None:
        conditions.append(AuditRecord.entity_id == query.entity_id)
    if query.actor_login is not None:
        conditions.append(func.lower(AuditRecord.actor_login) == query.actor_login.lower())
    if query.from_ is not None:
        conditions.append(AuditRecord.at >= query.from_)
    if query.to is not None:
        conditions.append(AuditRecord.at <= query.to)
    return conditions


async def list_records(session: AsyncSession, query: AuditQuery) -> tuple[list[AuditRecord], int]:
    conditions = _conditions(query)
    total = await session.scalar(select(func.count()).select_from(AuditRecord).where(*conditions))
    rows = await session.scalars(
        select(AuditRecord)
        .where(*conditions)
        .order_by(AuditRecord.at.desc(), AuditRecord.id.desc())
        .limit(query.limit)
        .offset(query.offset)
    )
    return list(rows), total or 0
