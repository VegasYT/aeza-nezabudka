from typing import Annotated

from fastapi import APIRouter, Depends, Query

from apps.audit.schemas import AuditEntry, AuditQuery
from apps.audit.service import AuditService, audit_service, camel_keys
from core.auth import ADMIN, Principal, require_roles
from core.schemas import Page, error_responses

router = APIRouter(prefix="/audit-log", tags=["Журнал действий"])


@router.get(
    "",
    summary="Журнал действий",
    description=(
        "Кто и что менял: платежи, оплаты, участники, отделы, чаты, входы. Новые записи сверху. "
        "`action` - действие точно или группа по префиксу (`auth.*`, `member.*`). "
        "Только администратор."
    ),
    responses=error_responses(400, 401, 403),
)
async def list_audit_log(
    query: Annotated[AuditQuery, Query()],
    _: Annotated[Principal, Depends(require_roles(ADMIN))],
    service: Annotated[AuditService, Depends(audit_service)],
) -> Page[AuditEntry]:
    rows, total = await service.list_records(query)
    return Page(
        items=[
            AuditEntry(
                id=row.id,
                at=row.at,
                actor_login=row.actor_login,
                action=row.action,
                entity=row.entity,
                entity_id=row.entity_id,
                entity_name=row.entity_name,
                details=camel_keys(row.details),
            )
            for row in rows
        ],
        total=total,
    )
