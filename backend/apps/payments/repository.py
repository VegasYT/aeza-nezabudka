from collections.abc import Sequence
from dataclasses import dataclass
from datetime import date, datetime
from typing import Any
from uuid import UUID

from sqlalchemy import (
    ColumnElement,
    Row,
    ScalarSelect,
    Select,
    and_,
    case,
    delete,
    func,
    not_,
    or_,
    select,
    update,
)
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncSession

from apps.departments.service import department_name
from apps.payments.domain import (
    CurrencyTotals,
    OccurrenceState,
    PlannedOccurrence,
    Schedule,
    occurrence_room,
    occurrences_to_create,
    planned_between,
)
from apps.payments.models import PaymentOccurrence, RecurringPayment
from apps.payments.schemas import (
    WITHOUT_DEPARTMENT,
    Currency,
    OccurrenceStatus,
    PaymentOccurrenceQuery,
    Period,
    RecurringPaymentQuery,
    RecurringPaymentStatus,
    SortOrder,
    SummaryQuery,
)


@dataclass(frozen=True)
class PaymentRow:
    payment: RecurringPayment
    next_due_date: date | None
    department_name: str | None
    overdue_count: int
    oldest_overdue_days: int | None
    paid_occurrences: int

    @property
    def completed(self) -> bool:
        limit = self.payment.occurrence_limit
        return limit is not None and self.paid_occurrences >= limit


@dataclass(frozen=True)
class PlannedRow:
    payment_id: UUID
    payment_name: str
    department_id: UUID | None
    department_name: str | None
    due_date: date
    amount_minor: int
    currency: Currency


@dataclass(frozen=True)
class OccurrenceRow:
    occurrence: PaymentOccurrence
    payment_name: str
    payment_stopped: bool
    department_id: UUID | None
    department_name: str | None


def schedule_of(payment: RecurringPayment) -> Schedule:
    return Schedule(
        payment.anchor_day,
        payment.schedule_first_due_date,
        payment.schedule_from_seq,
        Period(payment.period),
        payment.period_count,
    )


def state_of(occurrence: PaymentOccurrence) -> OccurrenceState:
    return OccurrenceState(
        occurrence.seq,
        occurrence.due_date,
        occurrence.paid_on,
        occurrence.amount_minor,
        Currency(occurrence.currency),
    )


def _next_due_date(today: date) -> ScalarSelect[date]:
    return (
        select(func.min(PaymentOccurrence.due_date))
        .where(
            PaymentOccurrence.recurring_payment_id == RecurringPayment.id,
            PaymentOccurrence.paid_on.is_(None),
            PaymentOccurrence.due_date >= today,
            RecurringPayment.stopped_at.is_(None),
        )
        .scalar_subquery()
    )


def _payment_columns(today: date) -> tuple[Any, ...]:
    overdue = (
        PaymentOccurrence.recurring_payment_id == RecurringPayment.id,
        PaymentOccurrence.paid_on.is_(None),
        PaymentOccurrence.due_date < today,
    )
    return (
        RecurringPayment,
        _next_due_date(today),
        department_name(RecurringPayment.department_id),
        select(func.count()).where(*overdue).scalar_subquery(),
        select(func.min(PaymentOccurrence.due_date)).where(*overdue).scalar_subquery(),
        select(func.count())
        .where(
            PaymentOccurrence.recurring_payment_id == RecurringPayment.id,
            PaymentOccurrence.paid_on.is_not(None),
        )
        .scalar_subquery(),
    )


def _payment_row(row: Sequence[Any], today: date) -> PaymentRow:
    oldest: date | None = row[4]
    return PaymentRow(
        row[0], row[1], row[2], row[3], None if oldest is None else (today - oldest).days, row[5]
    )


def _department_condition(department_id: UUID | str | None) -> ColumnElement[bool] | None:
    if department_id is None:
        return None
    if department_id == WITHOUT_DEPARTMENT:
        return RecurringPayment.department_id.is_(None)
    return RecurringPayment.department_id == department_id


def _search_conditions(
    department_id: UUID | str | None,
    q: str | None,
    payment_status: RecurringPaymentStatus | None,
) -> list[ColumnElement[bool]]:
    """Фильтры по платежу, общие для списков платежей, периодов и итогов."""
    conditions: list[ColumnElement[bool]] = []
    if (department := _department_condition(department_id)) is not None:
        conditions.append(department)
    if q is not None:
        conditions.append(RecurringPayment.name.icontains(q, autoescape=True))
    if payment_status is RecurringPaymentStatus.ACTIVE:
        conditions.append(RecurringPayment.stopped_at.is_(None))
    elif payment_status is RecurringPaymentStatus.STOPPED:
        conditions.append(RecurringPayment.stopped_at.is_not(None))
    return conditions


async def list_payments(
    session: AsyncSession, query: RecurringPaymentQuery, today: date
) -> tuple[list[PaymentRow], int]:
    conditions = _search_conditions(query.department_id, query.q, query.status)
    total = await session.scalar(
        select(func.count()).select_from(RecurringPayment).where(*conditions)
    )
    rows = await session.execute(
        select(*_payment_columns(today))
        .where(*conditions)
        .order_by(RecurringPayment.name, RecurringPayment.id)
        .limit(query.limit)
        .offset(query.offset)
    )
    return [_payment_row(row, today) for row in rows.all()], total or 0


async def get_payment(
    session: AsyncSession, payment_id: UUID, today: date, *, lock: bool = False
) -> PaymentRow | None:
    statement = select(*_payment_columns(today)).where(RecurringPayment.id == payment_id)
    if lock:
        statement = statement.with_for_update(of=RecurringPayment)
    row = (await session.execute(statement)).first()
    return None if row is None else _payment_row(row, today)


async def payment_occurrences(session: AsyncSession, payment_id: UUID) -> list[PaymentOccurrence]:
    result = await session.scalars(
        select(PaymentOccurrence)
        .where(PaymentOccurrence.recurring_payment_id == payment_id)
        .order_by(PaymentOccurrence.seq)
    )
    return list(result.all())


async def delete_occurrences(session: AsyncSession, ids: Sequence[UUID]) -> None:
    if ids:
        await session.execute(delete(PaymentOccurrence).where(PaymentOccurrence.id.in_(ids)))


async def set_amount(
    session: AsyncSession, ids: Sequence[UUID], amount_minor: int, currency: Currency
) -> None:
    if ids:
        await session.execute(
            update(PaymentOccurrence)
            .where(PaymentOccurrence.id.in_(ids))
            .values(amount_minor=amount_minor, currency=currency.value)
        )


async def ensure_periods(
    session: AsyncSession, today: date, payment_ids: Sequence[UUID] | None = None
) -> int:
    """Досоздаёт недостающие периоды действующих платежей; повтор и гонка дублей не дают."""
    statement = (
        select(RecurringPayment, func.max(PaymentOccurrence.seq), func.count(PaymentOccurrence.id))
        .outerjoin(PaymentOccurrence, PaymentOccurrence.recurring_payment_id == RecurringPayment.id)
        .where(RecurringPayment.stopped_at.is_(None))
        .group_by(RecurringPayment.id)
    )
    if payment_ids is not None:
        statement = statement.where(RecurringPayment.id.in_(payment_ids))
    values: list[dict[str, Any]] = []
    for payment, last_seq, existing in (await session.execute(statement)).all():
        planned: list[PlannedOccurrence] = occurrences_to_create(
            schedule_of(payment),
            last_seq,
            today,
            occurrence_room(payment.occurrence_limit, existing),
        )
        values.extend(
            {
                "recurring_payment_id": payment.id,
                "seq": item.seq,
                "due_date": item.due_date,
                "amount_minor": payment.amount_minor,
                "currency": payment.currency,
            }
            for item in planned
        )
    if not values:
        return 0
    result = await session.execute(
        insert(PaymentOccurrence)
        .values(values)
        .on_conflict_do_nothing(index_elements=["recurring_payment_id", "seq"])
        .returning(PaymentOccurrence.id)
    )
    return len(result.all())


def _occurrence_conditions(
    query: PaymentOccurrenceQuery | SummaryQuery, today: date
) -> list[ColumnElement[bool]]:
    conditions = _search_conditions(query.department_id, query.q, query.payment_status)
    if query.from_ is not None:
        conditions.append(PaymentOccurrence.due_date >= query.from_)
    if query.to is not None:
        conditions.append(PaymentOccurrence.due_date <= query.to)
    if isinstance(query, PaymentOccurrenceQuery):
        if query.currency is not None:
            conditions.append(PaymentOccurrence.currency == query.currency.value)
        if query.recurring_payment_id is not None:
            conditions.append(PaymentOccurrence.recurring_payment_id == query.recurring_payment_id)
        if query.status is OccurrenceStatus.PAID:
            conditions.append(PaymentOccurrence.paid_on.is_not(None))
        elif query.status is OccurrenceStatus.UNPAID:
            conditions.append(PaymentOccurrence.paid_on.is_(None))
        elif query.status is OccurrenceStatus.OVERDUE:
            conditions.append(PaymentOccurrence.paid_on.is_(None))
            conditions.append(PaymentOccurrence.due_date < today)
    return conditions


_OCCURRENCE_COLUMNS = (
    PaymentOccurrence,
    RecurringPayment.name,
    RecurringPayment.stopped_at,
    RecurringPayment.department_id,
    department_name(RecurringPayment.department_id),
)


def _occurrence_row(
    row: Row[PaymentOccurrence, str, datetime | None, UUID | None, str],
) -> OccurrenceRow:
    return OccurrenceRow(row[0], row[1], row[2] is not None, row[3], row[4])


async def list_occurrences(
    session: AsyncSession, query: PaymentOccurrenceQuery, today: date
) -> tuple[list[OccurrenceRow], int]:
    conditions = _occurrence_conditions(query, today)
    joined = select(func.count()).select_from(PaymentOccurrence).join(RecurringPayment)
    total = await session.scalar(joined.where(*conditions))
    order = (
        PaymentOccurrence.due_date.desc()
        if query.order is SortOrder.DESC
        else (PaymentOccurrence.due_date.asc())
    )
    rows = await session.execute(
        select(*_OCCURRENCE_COLUMNS)
        .join(RecurringPayment)
        .where(*conditions)
        .order_by(order, RecurringPayment.name, PaymentOccurrence.id)
        .limit(query.limit)
        .offset(query.offset)
    )
    return [_occurrence_row(row) for row in rows.all()], total or 0


async def get_occurrence(
    session: AsyncSession, occurrence_id: UUID, *, lock: bool = False
) -> OccurrenceRow | None:
    statement = (
        select(*_OCCURRENCE_COLUMNS)
        .join(RecurringPayment)
        .where(PaymentOccurrence.id == occurrence_id)
    )
    if lock:
        statement = statement.with_for_update(of=PaymentOccurrence)
    row = (await session.execute(statement)).first()
    return None if row is None else _occurrence_row(row)


async def get_occurrences(session: AsyncSession, ids: Sequence[UUID]) -> list[OccurrenceRow]:
    rows = await session.execute(
        select(*_OCCURRENCE_COLUMNS).join(RecurringPayment).where(PaymentOccurrence.id.in_(ids))
    )
    return [_occurrence_row(row) for row in rows.all()]


async def open_occurrences(
    session: AsyncSession, due_from: date | None, due_to: date | None
) -> list[OccurrenceRow]:
    ids = open_occurrence_ids(due_from, due_to, None)
    rows = await session.execute(
        select(*_OCCURRENCE_COLUMNS).join(RecurringPayment).where(PaymentOccurrence.id.in_(ids))
    )
    return [_occurrence_row(row) for row in rows.all()]


def open_occurrence_ids(
    due_from: date | None, due_to: date | None, payment_ids: Sequence[UUID] | None
) -> Select[UUID]:
    """Неоплаченные периоды действующих платежей со сроком в границах (включительно)."""
    statement = (
        select(PaymentOccurrence.id)
        .join(RecurringPayment)
        .where(PaymentOccurrence.paid_on.is_(None), RecurringPayment.stopped_at.is_(None))
    )
    if due_from is not None:
        statement = statement.where(PaymentOccurrence.due_date >= due_from)
    if due_to is not None:
        statement = statement.where(PaymentOccurrence.due_date <= due_to)
    if payment_ids is not None:
        statement = statement.where(PaymentOccurrence.recurring_payment_id.in_(payment_ids))
    return statement


def settled_occurrence_ids() -> Select[UUID]:
    """Периоды, о которых напоминать больше не нужно: оплачены или платёж прекращён."""
    return (
        select(PaymentOccurrence.id)
        .join(RecurringPayment)
        .where(
            or_(PaymentOccurrence.paid_on.is_not(None), RecurringPayment.stopped_at.is_not(None))
        )
    )


def open_occurrence_departments(
    due_from: date | None,
    due_to: date | None,
    payment_ids: Sequence[UUID] | None,
    *,
    first_only: bool = False,
) -> Select[UUID, UUID | None]:
    """То же, что `open_occurrence_ids`, вместе с отделом платежа; `first_only` - только
    ближайший период."""
    statement = open_occurrence_ids(due_from, due_to, payment_ids).add_columns(
        RecurringPayment.department_id
    )
    if first_only:
        statement = statement.order_by(PaymentOccurrence.due_date).limit(1)
    return statement


async def active_counts(session: AsyncSession, department_ids: Sequence[UUID]) -> dict[UUID, int]:
    rows = await session.execute(
        select(RecurringPayment.department_id, func.count())
        .where(
            RecurringPayment.department_id.in_(department_ids),
            RecurringPayment.stopped_at.is_(None),
        )
        .group_by(RecurringPayment.department_id)
    )
    return {department_id: count for department_id, count in rows.all() if department_id}


async def open_snapshot(
    session: AsyncSession, today: date, window_end: date
) -> tuple[int, list[tuple[str, str, int, int]]]:
    """Действующие платежи и неоплаченные периоды по состоянию и валюте: (state, currency,
    count, amount_minor). Просроченные считаются и у прекращённых платежей - долг остаётся."""
    active = await session.scalar(
        select(func.count())
        .select_from(RecurringPayment)
        .where(RecurringPayment.stopped_at.is_(None))
    )
    overdue = PaymentOccurrence.due_date < today
    state = case((overdue, "overdue"), else_="due_soon")
    rows = await session.execute(
        select(
            state,
            PaymentOccurrence.currency,
            func.count(),
            func.coalesce(func.sum(PaymentOccurrence.amount_minor), 0),
        )
        .join(RecurringPayment)
        .where(
            PaymentOccurrence.paid_on.is_(None),
            or_(
                overdue,
                and_(
                    PaymentOccurrence.due_date <= window_end,
                    RecurringPayment.stopped_at.is_(None),
                ),
            ),
        )
        .group_by(state, PaymentOccurrence.currency)
    )
    return active or 0, [(s, c, int(n), int(a)) for s, c, n, a in rows.all()]


async def summarize(
    session: AsyncSession, query: SummaryQuery, today: date
) -> list[CurrencyTotals]:
    """Итоги по валютам в SQL; правила те же, что у `domain.summarize`."""
    amount = PaymentOccurrence.amount_minor
    reference = query.as_of or today
    paid: ColumnElement[bool] = PaymentOccurrence.paid_on.is_not(None)
    if query.as_of is not None:
        # снимок на дату: оплата позже неё ещё не случилась
        paid = and_(paid, PaymentOccurrence.paid_on <= query.as_of)
    unpaid = not_(paid)
    overdue = and_(unpaid, PaymentOccurrence.due_date < reference)
    rows = await session.execute(
        select(
            PaymentOccurrence.currency,
            func.coalesce(func.sum(amount), 0),
            func.coalesce(func.sum(amount).filter(paid), 0),
            func.coalesce(func.sum(amount).filter(unpaid), 0),
            func.coalesce(func.sum(amount).filter(overdue), 0),
            func.count(),
            func.count().filter(paid),
            func.count().filter(unpaid),
            func.count().filter(overdue),
        )
        .join(RecurringPayment)
        .where(*_occurrence_conditions(query, today))
        .group_by(PaymentOccurrence.currency)
    )
    found = {
        Currency(currency): CurrencyTotals(Currency(currency), *map(int, numbers))
        for currency, *numbers in rows.all()
    }
    return [found.get(currency, CurrencyTotals(currency)) for currency in Currency]


async def planned_occurrences(
    session: AsyncSession,
    start: date,
    end: date,
    department_id: UUID | str | None,
    q: str | None,
) -> list[PlannedRow]:
    """Будущие периоды действующих платежей, которых ещё нет в базе; в базу не пишет."""
    conditions = _search_conditions(department_id, q, RecurringPaymentStatus.ACTIVE)
    statement = (
        select(
            RecurringPayment,
            func.max(PaymentOccurrence.seq),
            func.count(PaymentOccurrence.id),
            department_name(RecurringPayment.department_id),
        )
        .outerjoin(PaymentOccurrence, PaymentOccurrence.recurring_payment_id == RecurringPayment.id)
        .where(*conditions)
        .group_by(RecurringPayment.id)
    )
    planned = [
        PlannedRow(
            payment.id,
            payment.name,
            payment.department_id,
            name,
            item.due_date,
            payment.amount_minor,
            Currency(payment.currency),
        )
        for payment, last_seq, existing, name in (await session.execute(statement)).all()
        for item in planned_between(
            schedule_of(payment),
            last_seq,
            start,
            end,
            occurrence_room(payment.occurrence_limit, existing),
        )
    ]
    planned.sort(key=lambda row: (row.due_date, row.payment_name, row.payment_id))
    return planned
