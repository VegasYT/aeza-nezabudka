from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, Query, status

from apps.departments.models import Department as DepartmentRow
from apps.departments.schemas import Department, DepartmentWrite
from apps.departments.service import DepartmentsService, departments_service
from apps.payments.service import PaymentsService, payments_service
from core.auth import ADMIN, Principal, require_roles
from core.schemas import Page, PageQuery, error_responses

router = APIRouter(prefix="/departments", tags=["Отделы"])

Admin = Annotated[Principal, Depends(require_roles(ADMIN))]
Service = Annotated[DepartmentsService, Depends(departments_service)]
Payments = Annotated[PaymentsService, Depends(payments_service)]


async def _departments(rows: list[DepartmentRow], payments: PaymentsService) -> list[Department]:
    counts = await payments.active_counts([row.id for row in rows])
    return [
        Department(id=row.id, name=row.name, payments_count=counts.get(row.id, 0)) for row in rows
    ]


@router.get(
    "",
    summary="Список отделов",
    description="Доступен всем пользователям.",
    responses=error_responses(400, 401),
)
async def list_departments(
    page: Annotated[PageQuery, Query()], service: Service, payments: Payments
) -> Page[Department]:
    rows, total = await service.list_departments(page.limit, page.offset)
    return Page(items=await _departments(rows, payments), total=total)


@router.post(
    "",
    status_code=status.HTTP_201_CREATED,
    summary="Создать отдел",
    description="Название уникально без учёта регистра, пробелы по краям обрезаются "
    "(409 `department_name_taken`). Только администратор.",
    responses=error_responses(400, 401, 403, 409),
)
async def create_department(body: DepartmentWrite, actor: Admin, service: Service) -> Department:
    row = await service.create(actor, body.name)
    return Department(id=row.id, name=row.name, payments_count=0)


@router.patch(
    "/{department_id}",
    summary="Переименовать отдел",
    description="Название уникально без учёта регистра, пробелы по краям обрезаются "
    "(409 `department_name_taken`). Только администратор.",
    responses=error_responses(400, 401, 403, 404, 409),
)
async def update_department(
    department_id: UUID,
    body: DepartmentWrite,
    actor: Admin,
    service: Service,
    payments: Payments,
) -> Department:
    row = await service.rename(actor, department_id, body.name)
    return (await _departments([row], payments))[0]


@router.delete(
    "/{department_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Удалить отдел",
    description="Платежи отдела остаются без отдела. Чат или личные напоминания, где в "
    "фильтре был только этот отдел, переходят на все платежи. Только администратор.",
    responses=error_responses(400, 401, 403, 404),
)
async def delete_department(department_id: UUID, actor: Admin, service: Service) -> None:
    await service.delete(actor, department_id)
