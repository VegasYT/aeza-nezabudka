"""Сценарии справочника отделов и функции для модуля платежей."""

from uuid import UUID

from fastapi import Request
from sqlalchemy import ScalarSelect, SQLColumnExpression, delete, func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from apps.audit.service import record
from apps.departments.models import Department
from core.auth import Principal
from core.errors import AppError, not_found


def _not_found(department_id: UUID) -> AppError:
    return not_found("Department", department_id, "Отдел не найден")


def _name_taken() -> AppError:
    return AppError("department_name_taken", "Отдел с таким названием уже есть", status_code=409)


async def department_exists(session: AsyncSession, department_id: UUID) -> bool:
    return await session.get(Department, department_id) is not None


def department_name(department_id: SQLColumnExpression[UUID | None]) -> ScalarSelect[str]:
    """Название отдела по колонке `department_id` для запросов других модулей."""
    return select(Department.name).where(Department.id == department_id).scalar_subquery()


class DepartmentsService:
    def __init__(self, session_factory: async_sessionmaker[AsyncSession]) -> None:
        self._session_factory = session_factory

    async def list_departments(self, limit: int, offset: int) -> tuple[list[Department], int]:
        async with self._session_factory() as session:
            total = await session.scalar(select(func.count()).select_from(Department))
            rows = await session.scalars(
                select(Department).order_by(Department.name).limit(limit).offset(offset)
            )
            return list(rows), total or 0

    async def create(self, actor: Principal, name: str) -> Department:
        try:
            async with self._session_factory() as session, session.begin():
                department = Department(name=name)
                session.add(department)
                await session.flush()
                await record(
                    session,
                    actor,
                    "department.created",
                    "department",
                    entity_id=department.id,
                    entity_name=name,
                    details={"name": name},
                )
                return department
        except IntegrityError:
            raise _name_taken() from None

    async def rename(self, actor: Principal, department_id: UUID, name: str) -> Department:
        try:
            async with self._session_factory() as session, session.begin():
                department = await session.get(Department, department_id, with_for_update=True)
                if department is None:
                    raise _not_found(department_id)
                before = department.name
                department.name = name
                await session.flush()
                await record(
                    session,
                    actor,
                    "department.renamed",
                    "department",
                    entity_id=department_id,
                    entity_name=name,
                    details={"name_before": before, "name": name},
                )
                return department
        except IntegrityError:
            raise _name_taken() from None

    async def delete(self, actor: Principal, department_id: UUID) -> None:
        """Платежи отдела остаются без отдела: ссылку очищает внешний ключ."""
        async with self._session_factory() as session, session.begin():
            result = await session.execute(
                delete(Department).where(Department.id == department_id).returning(Department.name)
            )
            name = result.scalar_one_or_none()
            if name is None:
                raise _not_found(department_id)
            await record(
                session,
                actor,
                "department.deleted",
                "department",
                entity_id=department_id,
                entity_name=name,
                details={"name": name},
            )


def departments_service(request: Request) -> DepartmentsService:
    return DepartmentsService(request.app.state.session_factory)
