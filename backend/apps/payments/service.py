"""Сценарии регулярных платежей и периодов: транзакция, правила домена, журнал."""

from collections.abc import Awaitable, Sequence
from dataclasses import dataclass
from datetime import date, datetime, timedelta
from typing import Any, Protocol
from uuid import UUID

from fastapi import Request
from sqlalchemy import Select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from apps.audit.service import record
from apps.departments.service import department_exists
from apps.integrations.service import (
    EventType,
    dedup_key,
    record_event,
    recorded_dedup_keys,
    remember_resource,
    replayed_resource,
    request_hash,
)
from apps.payments import repository
from apps.payments.domain import (
    CurrencyTotals,
    add_planned,
    due_date,
    is_replaceable,
    month_ranges,
    next_due_date_error,
    next_segment_from_seq,
    paid_on_error,
    removed_on_stop,
)
from apps.payments.models import PaymentOccurrence, RecurringPayment
from apps.payments.repository import (
    OccurrenceRow,
    PaymentRow,
    PlannedRow,
    schedule_of,
    state_of,
)
from apps.payments.schemas import (
    Currency,
    ForecastQuery,
    PaymentOccurrenceQuery,
    PaymentOccurrenceUpdate,
    Period,
    RecurringPaymentCreate,
    RecurringPaymentQuery,
    RecurringPaymentResume,
    RecurringPaymentUpdate,
    SummaryQuery,
)
from core.auth import Principal
from core.clock import Clock
from core.errors import AppError, invalid_field, not_found
from core.metrics import OPEN_AMOUNT, OPEN_OCCURRENCES, PAYMENTS_ACTIVE


def _invalid(field: str, message: str) -> AppError:
    return invalid_field(field, message)


async def _check_department(session: AsyncSession, department_id: UUID | None) -> None:
    if department_id is not None and not await department_exists(session, department_id):
        raise _invalid("department_id", "Отдел не найден")


def _payment_not_found(payment_id: UUID) -> AppError:
    return not_found("RecurringPayment", payment_id, "Регулярный платёж не найден")


def _payment_stopped() -> AppError:
    return AppError("payment_stopped", "Платёж прекращён и не меняется", status_code=409)


def _payment_active() -> AppError:
    return AppError("payment_active", "Платёж и так действует", status_code=409)


def _snapshot(row: PaymentRow) -> dict[str, Any]:
    payment = row.payment
    return {
        "name": payment.name,
        "amount_minor": payment.amount_minor,
        "currency": payment.currency,
        "schedule_first_due_date": payment.schedule_first_due_date.isoformat(),
        "period": payment.period,
        "period_count": payment.period_count,
        "occurrence_limit": payment.occurrence_limit,
        "department_id": None if payment.department_id is None else str(payment.department_id),
        "department_name": row.department_name,
    }


def _department_data(department_id: UUID | None, name: str | None) -> dict[str, str] | None:
    if department_id is None or name is None:
        return None
    return {"id": str(department_id), "name": name}


def _payment_data(row: PaymentRow) -> dict[str, Any]:
    payment = row.payment
    return {
        "id": str(payment.id),
        "name": payment.name,
        "amountMinor": payment.amount_minor,
        "currency": payment.currency,
        "anchorDay": payment.anchor_day,
        "period": payment.period,
        "periodCount": payment.period_count,
        "occurrenceLimit": payment.occurrence_limit,
        "nextDueDate": None if row.next_due_date is None else row.next_due_date.isoformat(),
        "department": _department_data(payment.department_id, row.department_name),
        "stopped": payment.stopped_at is not None,
    }


def _occurrence_data(row: OccurrenceRow, actor_login: str | None) -> dict[str, Any]:
    occurrence = row.occurrence
    return {
        "payment": {
            "id": str(occurrence.recurring_payment_id),
            "name": row.payment_name,
            "department": _department_data(row.department_id, row.department_name),
            "stopped": row.payment_stopped,
        },
        "occurrence": {
            "id": str(occurrence.id),
            "dueDate": occurrence.due_date.isoformat(),
            "amountMinor": occurrence.amount_minor,
            "currency": occurrence.currency,
            "paidOn": None if occurrence.paid_on is None else occurrence.paid_on.isoformat(),
            "paidByLogin": occurrence.paid_by_login,
        },
        "actorLogin": actor_login,
    }


async def record_time_events(
    session: AsyncSession, today: date, days_before: int, targets: Sequence[str], now: datetime
) -> int:
    """События `occurrence.due_soon` и `occurrence.overdue`: по одному на период."""
    windows = (
        (EventType.OCCURRENCE_DUE_SOON, today, today + timedelta(days=days_before)),
        (EventType.OCCURRENCE_OVERDUE, None, today - timedelta(days=1)),
    )
    recorded = 0
    for event_type, due_from, due_to in windows:
        rows = await repository.open_occurrences(session, due_from, due_to)
        keys = {row.occurrence.id: dedup_key(event_type, row.occurrence.id) for row in rows}
        done = await recorded_dedup_keys(session, list(keys.values()))
        for row in rows:
            key = keys[row.occurrence.id]
            if key in done:
                continue
            recorded += await record_event(
                session,
                targets,
                event_type,
                _occurrence_data(row, None),
                partition_key=row.occurrence.recurring_payment_id,
                occurred_at=now,
                dedup=key,
            )
    return recorded


class AfterChange(Protocol):
    """Вызывается в транзакции создания и изменения платежа после досоздания периодов."""

    def __call__(
        self, session: AsyncSession, today: date, payment_ids: Sequence[UUID], *, created: bool
    ) -> Awaitable[object]: ...


@dataclass(frozen=True)
class OccurrenceSubject:
    """Период для напоминания: что проверить перед отправкой и что написать."""

    id: UUID
    payment_name: str
    amount_minor: int
    currency: Currency
    due_date: date
    paid: bool
    active: bool
    department_name: str | None
    payment_id: UUID
    paid_on: date | None
    paid_by_login: str | None


def settled_occurrence_ids() -> Select[UUID]:
    """Запрос оплаченных периодов и периодов прекращённых платежей; выполняет вызывающий модуль."""
    return repository.settled_occurrence_ids()


def open_occurrence_departments(
    due_from: date | None,
    due_to: date | None,
    payment_ids: Sequence[UUID] | None = None,
    *,
    first_only: bool = False,
) -> Select[UUID, UUID | None]:
    """Запрос неоплаченных периодов действующих платежей с отделом; выполняет вызывающий модуль."""
    return repository.open_occurrence_departments(
        due_from, due_to, payment_ids, first_only=first_only
    )


async def occurrence_subjects(
    session: AsyncSession, ids: Sequence[UUID]
) -> dict[UUID, OccurrenceSubject]:
    return {
        row.occurrence.id: OccurrenceSubject(
            row.occurrence.id,
            row.payment_name,
            row.occurrence.amount_minor,
            Currency(row.occurrence.currency),
            row.occurrence.due_date,
            row.occurrence.paid_on is not None,
            not row.payment_stopped,
            row.department_name,
            row.occurrence.recurring_payment_id,
            row.occurrence.paid_on,
            row.occurrence.paid_by_login,
        )
        for row in await repository.get_occurrences(session, ids)
    }


async def _apply_limit(
    session: AsyncSession, payment: RecurringPayment, limit: int | None, today: date
) -> None:
    """Новое число оплат: лишние неоплаченные непросроченные периоды удаляются с конца.

    Оплаченные и просроченные периоды не удаляются, поэтому лимит меньше их числа - ошибка.
    """
    occurrences = await repository.payment_occurrences(session, payment.id)
    kept = [o for o in occurrences if not is_replaceable(state_of(o), today)]
    if limit is not None and limit < len(kept):
        raise _invalid(
            "occurrence_limit",
            f"Уже есть {len(kept)} оплаченных или просроченных периодов, меньше нельзя",
        )
    payment.occurrence_limit = limit
    if limit is not None:
        replaceable = sorted(
            (o for o in occurrences if is_replaceable(state_of(o), today)), key=lambda o: o.seq
        )
        extra = replaceable[max(limit - len(kept), 0) :]
        await repository.delete_occurrences(session, [o.id for o in extra])


def _resume_date(
    payment: RecurringPayment, occurrences: Sequence[PaymentOccurrence], today: date
) -> date:
    """Следующий срок прежнего расписания после последнего периода, не раньше сегодня."""
    schedule = schedule_of(payment)
    last_seq = max((occurrence.seq for occurrence in occurrences), default=None)
    seq = schedule.from_seq if last_seq is None or last_seq < schedule.from_seq else last_seq + 1
    due = due_date(schedule, seq)
    # перебор по шагам: даже у ежедневного платежа после долгой паузы это тысячи итераций
    while due < today:
        seq += 1
        due = due_date(schedule, seq)
    return due


def _continuation(
    payment: RecurringPayment,
    occurrences: Sequence[PaymentOccurrence],
    replaceable: Sequence[PaymentOccurrence],
) -> date:
    """Откуда продолжить расписание при смене периода без новой даты.

    Ближайший неоплаченный срок, а если будущий период уже оплачен - следующий срок прежнего
    расписания.
    """
    nearest = min(replaceable, key=lambda occurrence: occurrence.seq, default=None)
    if nearest is not None:
        return nearest.due_date
    schedule = schedule_of(payment)
    last_seq = max((occurrence.seq for occurrence in occurrences), default=None)
    if last_seq is None or last_seq < schedule.from_seq:
        return schedule.first_due_date
    return due_date(schedule, last_seq + 1)


def _same_next_due(replaceable: Sequence[PaymentOccurrence], next_due: date) -> bool:
    """Дата совпала со сроком ближайшего заменяемого периода: расписание не меняется.

    Иначе периоды пересоздались бы с новыми id, а с ними и уже отправленные напоминания,
    и якорь 31 сменился бы на последний день короткого месяца.
    """
    nearest = min(replaceable, key=lambda occurrence: occurrence.seq, default=None)
    return nearest is not None and nearest.due_date == next_due


class PaymentsService:
    def __init__(
        self,
        session_factory: async_sessionmaker[AsyncSession],
        clock: Clock,
        *,
        after_change: AfterChange | None = None,
        event_targets: Sequence[str] = (),
    ) -> None:
        self._session_factory = session_factory
        self._clock = clock
        self._after_change = after_change
        self._event_targets = event_targets

    async def create(
        self,
        actor: Principal,
        data: RecurringPaymentCreate,
        *,
        idempotency_key: str | None = None,
    ) -> PaymentRow:
        today = self._clock.today()
        if error := next_due_date_error(data.next_due_date, today):
            raise _invalid("next_due_date", error)
        async with self._session_factory() as session, session.begin():
            if idempotency_key is not None:
                replayed = await replayed_resource(
                    session,
                    actor.id,
                    idempotency_key,
                    "payment.create",
                    request_hash(data.model_dump(mode="json")),
                )
                if replayed is not None:
                    return await self._row(session, replayed, today)
            await _check_department(session, data.department_id)
            payment = RecurringPayment(
                name=data.name,
                amount_minor=data.amount_minor,
                currency=data.currency.value,
                period=data.period.value,
                period_count=data.period_count,
                occurrence_limit=data.occurrence_limit,
                department_id=data.department_id,
                anchor_day=data.next_due_date.day,
                schedule_first_due_date=data.next_due_date,
                schedule_from_seq=0,
                created_by_id=actor.id,
                created_by_login=actor.login,
            )
            session.add(payment)
            await session.flush()
            await repository.ensure_periods(session, today, [payment.id])
            await self._changed(session, today, payment.id, created=True)
            if idempotency_key is not None:
                await remember_resource(session, actor.id, idempotency_key, payment.id)
            row = await self._row(session, payment.id, today)
            await record(
                session,
                actor,
                "payment.created",
                "payment",
                entity_id=payment.id,
                entity_name=payment.name,
                details=_snapshot(row),
            )
            await self._event(session, EventType.PAYMENT_CREATED, _payment_data(row), actor, row)
            return row

    async def active_counts(self, department_ids: Sequence[UUID]) -> dict[UUID, int]:
        """Сколько действующих платежей у каждого отдела."""
        async with self._session_factory() as session:
            return await repository.active_counts(session, department_ids)

    async def list_payments(self, query: RecurringPaymentQuery) -> tuple[list[PaymentRow], int]:
        async with self._session_factory() as session:
            return await repository.list_payments(session, query, self._clock.today())

    async def get_payment(self, payment_id: UUID) -> PaymentRow:
        async with self._session_factory() as session:
            return await self._row(session, payment_id, self._clock.today())

    async def update(
        self, actor: Principal, payment_id: UUID, data: RecurringPaymentUpdate
    ) -> PaymentRow:
        today = self._clock.today()
        changed = data.model_fields_set
        if data.next_due_date is not None and (
            error := next_due_date_error(data.next_due_date, today)
        ):
            raise _invalid("next_due_date", error)
        async with self._session_factory() as session, session.begin():
            if "department_id" in changed:
                await _check_department(session, data.department_id)
            locked = await self._row(session, payment_id, today, lock=True)
            payment = locked.payment
            if payment.stopped_at is not None:
                raise _payment_stopped()
            before = _snapshot(locked)
            occurrences = await repository.payment_occurrences(session, payment_id)
            replaceable = [o for o in occurrences if is_replaceable(state_of(o), today)]

            if data.name is not None:
                payment.name = data.name
            if data.amount_minor is not None or data.currency is not None:
                payment.amount_minor = data.amount_minor or payment.amount_minor
                payment.currency = (data.currency or Currency(payment.currency)).value
                await repository.set_amount(
                    session,
                    [o.id for o in replaceable],
                    payment.amount_minor,
                    Currency(payment.currency),
                )
            period = data.period or Period(payment.period)
            every = data.period_count or payment.period_count
            period_changed = (period.value, every) != (payment.period, payment.period_count)
            start = data.next_due_date
            if start is not None and not period_changed and _same_next_due(replaceable, start):
                start = None
            if start is None and period_changed:
                start = _continuation(payment, occurrences, replaceable)
            if start is not None:
                await repository.delete_occurrences(session, [o.id for o in replaceable])
                remaining = [state_of(o) for o in occurrences if o not in replaceable]
                payment.anchor_day = start.day
                payment.schedule_first_due_date = start
                payment.schedule_from_seq = next_segment_from_seq(remaining)
            payment.period = period.value
            payment.period_count = every
            if "occurrence_limit" in changed:
                await _apply_limit(session, payment, data.occurrence_limit, today)
            if "department_id" in changed:
                payment.department_id = data.department_id
            await session.flush()
            await repository.ensure_periods(session, today, [payment_id])
            await self._changed(session, today, payment_id)
            row = await self._row(session, payment_id, today)
            await record(
                session,
                actor,
                "payment.updated",
                "payment",
                entity_id=payment_id,
                entity_name=payment.name,
                details={"before": before, "after": _snapshot(row)},
            )
            await self._event(session, EventType.PAYMENT_UPDATED, _payment_data(row), actor, row)
            return row

    async def stop(self, actor: Principal, payment_id: UUID) -> None:
        today = self._clock.today()
        async with self._session_factory() as session, session.begin():
            payment = (await self._row(session, payment_id, today, lock=True)).payment
            if payment.stopped_at is not None:
                raise _payment_stopped()
            occurrences = await repository.payment_occurrences(session, payment_id)
            removed = [o.id for o in occurrences if removed_on_stop(state_of(o), today)]
            await repository.delete_occurrences(session, removed)
            payment.stopped_at = self._clock.now()
            await record(
                session,
                actor,
                "payment.stopped",
                "payment",
                entity_id=payment_id,
                entity_name=payment.name,
                details={"removed_periods": len(removed)},
            )
            await session.flush()
            row = await self._row(session, payment_id, today)
            await self._event(session, EventType.PAYMENT_STOPPED, _payment_data(row), actor, row)

    async def resume(
        self, actor: Principal, payment_id: UUID, data: RecurringPaymentResume
    ) -> PaymentRow:
        """Возобновляет прекращённый платёж: история остаётся, новые периоды идут после неё."""
        today = self._clock.today()
        if data.next_due_date is not None and (
            error := next_due_date_error(data.next_due_date, today)
        ):
            raise _invalid("next_due_date", error)
        async with self._session_factory() as session, session.begin():
            payment = (await self._row(session, payment_id, today, lock=True)).payment
            if payment.stopped_at is None:
                raise _payment_active()
            occurrences = await repository.payment_occurrences(session, payment_id)
            start = data.next_due_date or _resume_date(payment, occurrences, today)
            payment.anchor_day = start.day
            payment.schedule_first_due_date = start
            payment.schedule_from_seq = next_segment_from_seq([state_of(o) for o in occurrences])
            payment.stopped_at = None
            await session.flush()
            await repository.ensure_periods(session, today, [payment_id])
            await self._changed(session, today, payment_id)
            row = await self._row(session, payment_id, today)
            await record(
                session,
                actor,
                "payment.resumed",
                "payment",
                entity_id=payment_id,
                entity_name=payment.name,
                details={"next_due_date": start.isoformat()},
            )
            await self._event(session, EventType.PAYMENT_RESUMED, _payment_data(row), actor, row)
            return row

    async def list_occurrences(
        self, query: PaymentOccurrenceQuery
    ) -> tuple[list[OccurrenceRow], int]:
        async with self._session_factory() as session:
            return await repository.list_occurrences(session, query, self._clock.today())

    async def get_occurrence(self, occurrence_id: UUID) -> OccurrenceRow:
        async with self._session_factory() as session:
            return await self._occurrence(session, occurrence_id)

    async def update_occurrence(
        self,
        actor: Principal,
        occurrence_id: UUID,
        data: PaymentOccurrenceUpdate,
        *,
        source: str | None = None,
    ) -> OccurrenceRow:
        """`source` - откуда отметка, если не из панели или API (например, telegram)."""
        today = self._clock.today()
        paid_on = data.paid_on or today
        if data.paid and (error := paid_on_error(paid_on, today)):
            raise _invalid("paid_on", error)
        async with self._session_factory() as session, session.begin():
            locked = await self._occurrence(session, occurrence_id, lock=True)
            occurrence = locked.occurrence
            before = None if occurrence.paid_on is None else occurrence.paid_on.isoformat()
            if data.paid:
                occurrence.paid_on = paid_on
                occurrence.paid_by_id = actor.id
                occurrence.paid_by_login = actor.login
            else:
                occurrence.paid_on = None
                occurrence.paid_by_id = None
                occurrence.paid_by_login = None
            await record(
                session,
                actor,
                "occurrence.paid" if data.paid else "occurrence.unpaid",
                "occurrence",
                entity_id=occurrence_id,
                entity_name=locked.payment_name,
                details={
                    **({"source": source} if source else {}),
                    "payment_id": str(occurrence.recurring_payment_id),
                    "payment_name": locked.payment_name,
                    "due_date": occurrence.due_date.isoformat(),
                    "paid_on_before": before,
                    "paid_on": None
                    if occurrence.paid_on is None
                    else occurrence.paid_on.isoformat(),
                },
            )
            await session.flush()
            updated = await self._occurrence(session, occurrence_id)
            await record_event(
                session,
                self._event_targets,
                EventType.OCCURRENCE_PAID if data.paid else EventType.OCCURRENCE_UNPAID,
                _occurrence_data(updated, actor.login),
                partition_key=occurrence.recurring_payment_id,
                occurred_at=self._clock.now(),
            )
            return updated

    async def summary(
        self, query: SummaryQuery
    ) -> tuple[list[CurrencyTotals], list[tuple[str, list[CurrencyTotals]]] | None]:
        """Итоги за диапазон и, с groupBy=month, по месяцам."""
        today = self._clock.today()
        async with self._session_factory() as session:
            planned: list[PlannedRow] = []
            if query.include_planned and query.to is not None:
                planned = await repository.planned_occurrences(
                    session, query.from_ or today, query.to, query.department_id, query.q
                )
            totals = await repository.summarize(session, query, today)
            totals = add_planned(totals, [(row.currency, row.amount_minor) for row in planned])
            if query.group_by is None or query.from_ is None or query.to is None:
                return totals, None
            months = []
            for start, end in month_ranges(query.from_, query.to):
                part = query.model_copy(update={"from_": start, "to": end})
                month_totals = await repository.summarize(session, part, today)
                month_planned = [
                    (row.currency, row.amount_minor)
                    for row in planned
                    if start <= row.due_date <= end
                ]
                months.append((start.strftime("%Y-%m"), add_planned(month_totals, month_planned)))
            return totals, months

    async def forecast(self, query: ForecastQuery) -> tuple[list[PlannedRow], int]:
        today = self._clock.today()
        async with self._session_factory() as session:
            planned = await repository.planned_occurrences(
                session, query.from_ or today, query.to, query.department_id, query.q
            )
        return planned[query.offset : query.offset + query.limit], len(planned)

    async def report_open(self, days_before: int) -> None:
        """Метрики для дашборда: действующие платежи, просрочка и ближайшие оплаты."""
        today = self._clock.today()
        async with self._session_factory() as session:
            active, rows = await repository.open_snapshot(
                session, today, today + timedelta(days=days_before)
            )
        PAYMENTS_ACTIVE.set(active)
        found = {(state, currency): (count, amount) for state, currency, count, amount in rows}
        for state in ("overdue", "due_soon"):
            for currency in Currency:
                count, amount = found.get((state, currency.value), (0, 0))
                OPEN_OCCURRENCES.labels(state, currency.value).set(count)
                OPEN_AMOUNT.labels(state, currency.value).set(amount / 100)

    async def ensure_periods(self) -> int:
        """Досоздаёт периоды всех действующих платежей; вызывает планировщик."""
        async with self._session_factory() as session, session.begin():
            return await repository.ensure_periods(session, self._clock.today())

    async def _event(
        self,
        session: AsyncSession,
        event_type: EventType,
        payment: dict[str, Any],
        actor: Principal,
        row: PaymentRow,
    ) -> None:
        await record_event(
            session,
            self._event_targets,
            event_type,
            {"payment": payment, "actorLogin": actor.login},
            partition_key=row.payment.id,
            occurred_at=self._clock.now(),
        )

    async def _changed(
        self, session: AsyncSession, today: date, payment_id: UUID, *, created: bool = False
    ) -> None:
        if self._after_change is not None:
            await self._after_change(session, today, [payment_id], created=created)

    @staticmethod
    async def _row(
        session: AsyncSession, payment_id: UUID, today: date, *, lock: bool = False
    ) -> PaymentRow:
        row = await repository.get_payment(session, payment_id, today, lock=lock)
        if row is None:
            raise _payment_not_found(payment_id)
        return row

    @staticmethod
    async def _occurrence(
        session: AsyncSession, occurrence_id: UUID, *, lock: bool = False
    ) -> OccurrenceRow:
        row = await repository.get_occurrence(session, occurrence_id, lock=lock)
        if row is None:
            raise not_found("PaymentOccurrence", occurrence_id, "Период оплаты не найден")
        return row


def payments_service(request: Request) -> PaymentsService:
    return PaymentsService(
        request.app.state.session_factory,
        request.app.state.clock,
        after_change=request.app.state.after_payment_change,
        event_targets=request.app.state.event_targets,
    )
