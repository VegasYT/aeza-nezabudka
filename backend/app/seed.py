"""Тестовые данные для демо: `uv run python -m app.seed`.

Платежи создаются через сервис с часами, которые сдвигаются в прошлое: так появляется
история периодов, а данные проходят те же правила и журнал, что и через API.
"""

import asyncio
import sys
import uuid
from datetime import UTC, date, datetime, timedelta

import structlog
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from apps.departments.service import DepartmentsService
from apps.payments.domain import Schedule, due_date
from apps.payments.models import RecurringPayment
from apps.payments.repository import OccurrenceRow
from apps.payments.schemas import (
    Currency,
    PaymentOccurrenceQuery,
    PaymentOccurrenceUpdate,
    RecurringPaymentCreate,
)
from apps.payments.service import PaymentsService
from apps.users.service import UsersService
from core.auth import Principal, Role
from core.clock import clock_from_settings
from core.config import (
    ConfigError,
    SeedSettings,
    load_seed_settings,
    load_settings,
)
from core.db import create_engine, create_session_factory
from core.errors import AppError
from core.logging import configure_logging

log = structlog.get_logger(__name__)

SEED_ACTOR = Principal(uuid.UUID("00000000-0000-4000-8000-000000005eed"), "seed", Role.ADMIN)


class _ShiftedClock:
    """Часы сида: "сегодня" переставляется на нужную дату истории."""

    def __init__(self, today: date) -> None:
        self.current = today

    def now(self) -> datetime:
        return datetime.combine(self.current, datetime.now(UTC).timetz())

    def today(self) -> date:
        return self.current


def _last_31st_not_after(day: date) -> date:
    month_start = day.replace(day=1)
    while True:
        candidate = due_date(Schedule(31, month_start, 0), 0)
        if candidate.day == 31 and candidate <= day:
            return candidate
        month_start = (month_start - timedelta(days=1)).replace(day=1)


async def _period(service: PaymentsService, payment_id: uuid.UUID, due: date) -> OccurrenceRow:
    rows, _ = await service.list_occurrences(
        PaymentOccurrenceQuery.model_validate({"recurring_payment_id": payment_id, "limit": 100})
    )
    return next(row for row in rows if row.occurrence.due_date == due)


async def _paid_history(
    service: PaymentsService,
    clock: _ShiftedClock,
    data: RecurringPaymentCreate,
    paid_on: date,
) -> None:
    """Платёж, первый период которого оплачен в `paid_on`."""
    clock.current = data.next_due_date
    payment = await service.create(SEED_ACTOR, data)
    first = await _period(service, payment.payment.id, data.next_due_date)
    clock.current = paid_on
    await service.update_occurrence(
        SEED_ACTOR, first.occurrence.id, PaymentOccurrenceUpdate(paid=True, paid_on=paid_on)
    )


async def _department(service: DepartmentsService, name: str) -> uuid.UUID:
    """Отдел с таким названием: созданный сейчас или уже существующий."""
    try:
        return (await service.create(SEED_ACTOR, name)).id
    except AppError as error:
        if error.code != "department_name_taken":
            raise
    departments, _ = await service.list_departments(limit=100, offset=0)
    return next(d.id for d in departments if d.name == name)


async def seed(
    session_factory: async_sessionmaker[AsyncSession],
    today: date,
    settings: SeedSettings,
) -> bool:
    """Создаёт демо-данные; возвращает False, если они уже есть."""
    async with session_factory() as session:
        seeded = await session.scalar(
            select(RecurringPayment.id).where(RecurringPayment.created_by_login == SEED_ACTOR.login)
        )
    created = seeded is None
    if created:
        clock = _ShiftedClock(today)
        service = PaymentsService(session_factory, clock)
        departments = DepartmentsService(session_factory)
        office = await _department(departments, "Офис")
        it = await _department(departments, "ИТ")

        rent_due = today - timedelta(days=5)
        # Если rent_due - 29-31 число, а прошлый месяц короче, якорь станет меньше
        # и просрочка - на день-два больше 5; для демо это неважно.
        rent_start = due_date(Schedule.starting(rent_due), -1)
        await _paid_history(
            service,
            clock,
            RecurringPaymentCreate(
                name="Аренда офиса",
                amount_minor=15_000_000,
                currency=Currency.RUB,
                next_due_date=rent_start,
                department_id=office,
            ),
            paid_on=rent_start,
        )

        subscription_due = _last_31st_not_after(today - timedelta(days=31))
        await _paid_history(
            service,
            clock,
            RecurringPaymentCreate(
                name="Подписка",
                amount_minor=1_299,
                currency=Currency.EUR,
                next_due_date=subscription_due,
                department_id=office,
            ),
            paid_on=subscription_due + timedelta(days=3),
        )

        clock.current = today
        await service.create(
            SEED_ACTOR,
            RecurringPaymentCreate(
                name="Сервер",
                amount_minor=2_500,
                currency=Currency.USD,
                next_due_date=today + timedelta(days=2),
                department_id=it,
            ),
        )
        await service.ensure_periods()

    if settings.demo_user_email is not None:
        await _demo_member(session_factory, settings.demo_user_email)
    return created


async def _demo_member(session_factory: async_sessionmaker[AsyncSession], email: str) -> None:
    """Участник для демо входит своим аккаунтом Aéza: пароль хранит Aéza, сид его не знает."""
    try:
        await UsersService(session_factory).create(SEED_ACTOR, email, Role.USER)
    except AppError as error:
        if error.code != "login_taken":
            raise
        log.info("demo_member_exists", email=email)
    else:
        log.info("demo_member_added", email=email)


async def _main() -> None:
    try:
        settings = load_settings()
        seed_settings = load_seed_settings()
    except ConfigError as error:
        print(error, file=sys.stderr)
        raise SystemExit(1) from None
    configure_logging("seed", settings.log_level)
    engine = create_engine(settings)
    try:
        created = await seed(
            create_session_factory(engine),
            clock_from_settings(settings).today(),
            seed_settings,
        )
    finally:
        await engine.dispose()
    print("Тестовые данные созданы" if created else "Тестовые данные уже есть, платежи не изменены")


if __name__ == "__main__":
    asyncio.run(_main())
