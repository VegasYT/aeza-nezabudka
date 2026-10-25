from datetime import date

import pytest
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.seed import SEED_ACTOR, seed
from apps.audit.models import AuditRecord
from apps.departments.models import Department
from apps.departments.service import DepartmentsService
from apps.payments.domain import overdue_days
from apps.payments.models import PaymentOccurrence, RecurringPayment
from apps.users.models import Member
from core.config import SeedSettings

pytestmark = pytest.mark.integration

TODAY = date(2026, 10, 24)
SETTINGS = SeedSettings(demo_user_email="user_demo@hackathon.rnd")


async def _periods(
    session_factory: async_sessionmaker[AsyncSession],
) -> dict[str, list[tuple[date, date | None]]]:
    async with session_factory() as session:
        rows = (
            await session.execute(
                select(RecurringPayment.name, PaymentOccurrence.due_date, PaymentOccurrence.paid_on)
                .join(PaymentOccurrence)
                .order_by(PaymentOccurrence.due_date)
            )
        ).all()
    result: dict[str, list[tuple[date, date | None]]] = {}
    for name, due, paid_on in rows:
        result.setdefault(name, []).append((due, paid_on))
    return result


async def test_seed_creates_history_relative_to_today(
    session_factory: async_sessionmaker[AsyncSession],
) -> None:

    created = await seed(session_factory, TODAY, SETTINGS)

    periods = await _periods(session_factory)
    assert created
    assert periods["Аренда офиса"] == [
        (date(2026, 9, 19), date(2026, 9, 19)),
        (date(2026, 10, 19), None),
        (date(2026, 11, 19), None),
    ]
    assert overdue_days(date(2026, 10, 19), None, TODAY) == 5
    assert periods["Сервер"] == [(date(2026, 10, 26), None)]
    assert periods["Подписка"] == [
        (date(2026, 8, 31), date(2026, 9, 3)),
        (date(2026, 9, 30), None),
        (date(2026, 10, 31), None),
    ]
    async with session_factory() as session:
        members = [(m.email, m.role) for m in await session.scalars(select(Member))]
    assert members == [("user_demo@hackathon.rnd", "user")]
    async with session_factory() as session:
        authors = set(await session.scalars(select(AuditRecord.actor_login)))
    assert authors == {"seed"}


async def test_second_run_adds_nothing(session_factory: async_sessionmaker[AsyncSession]) -> None:
    await seed(session_factory, TODAY, SETTINGS)

    created = await seed(session_factory, TODAY, SETTINGS)

    async with session_factory() as session:
        payments = await session.scalar(select(func.count()).select_from(RecurringPayment))
        periods = await session.scalar(select(func.count()).select_from(PaymentOccurrence))
    assert not created
    assert (payments, periods) == (3, 7)
    async with session_factory() as session:
        assert await session.scalar(select(func.count()).select_from(Member)) == 1


async def _departments(session_factory: async_sessionmaker[AsyncSession]) -> dict[str, str]:
    async with session_factory() as session:
        rows = await session.execute(
            select(RecurringPayment.name, Department.name).join(
                Department, Department.id == RecurringPayment.department_id
            )
        )
        return {payment: department for payment, department in rows.all()}


async def test_seed_puts_payments_into_departments(
    session_factory: async_sessionmaker[AsyncSession],
) -> None:
    await seed(session_factory, TODAY, SETTINGS)

    assert await _departments(session_factory) == {
        "Аренда офиса": "Офис",
        "Подписка": "Офис",
        "Сервер": "ИТ",
    }


async def test_seed_reuses_existing_department(
    session_factory: async_sessionmaker[AsyncSession],
) -> None:
    await DepartmentsService(session_factory).create(SEED_ACTOR, "Офис")

    await seed(session_factory, TODAY, SETTINGS)

    async with session_factory() as session:
        names = list(await session.scalars(select(Department.name).order_by(Department.name)))
    assert names == ["ИТ", "Офис"]
