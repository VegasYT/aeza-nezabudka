"""Правила сроков, просрочки и итогов: чистые функции без базы и HTTP."""

import calendar
from collections.abc import Iterable, Sequence
from dataclasses import dataclass, replace
from datetime import date, timedelta

from apps.payments.schemas import Currency, Period


@dataclass(frozen=True)
class Schedule:
    """Отрезок расписания: с номера `from_seq` сроки идут от `first_due_date` с шагом
    `every` единиц `period`."""

    anchor_day: int
    first_due_date: date
    from_seq: int
    period: Period = Period.MONTH
    every: int = 1

    @classmethod
    def starting(
        cls, next_due_date: date, from_seq: int = 0, period: Period = Period.MONTH, every: int = 1
    ) -> "Schedule":
        return cls(next_due_date.day, next_due_date, from_seq, period, every)


@dataclass(frozen=True)
class PlannedOccurrence:
    seq: int
    due_date: date


@dataclass(frozen=True)
class OccurrenceState:
    """То, что правилам нужно знать о существующем периоде."""

    seq: int
    due_date: date
    paid_on: date | None
    amount_minor: int
    currency: Currency

    @property
    def paid(self) -> bool:
        return self.paid_on is not None


@dataclass(frozen=True)
class CurrencyTotals:
    currency: Currency
    total_minor: int = 0
    paid_minor: int = 0
    unpaid_minor: int = 0
    overdue_minor: int = 0
    count: int = 0
    paid_count: int = 0
    unpaid_count: int = 0
    overdue_count: int = 0
    # плановые периоды, которых ещё нет в базе; в суммы выше не входят
    planned_minor: int = 0
    planned_count: int = 0


def due_date(schedule: Schedule, seq: int) -> date:
    """Срок периода. День и неделя - через равное число дней; месяц и год - якорный день
    месяца или последний день, если такого числа нет (29 февраля - 28-е в невисокосный год)."""
    steps = (seq - schedule.from_seq) * schedule.every
    if schedule.period is Period.DAY:
        return schedule.first_due_date + timedelta(days=steps)
    if schedule.period is Period.WEEK:
        return schedule.first_due_date + timedelta(weeks=steps)
    if schedule.period is Period.YEAR:
        steps *= 12
    months = schedule.first_due_date.month - 1 + steps
    year = schedule.first_due_date.year + months // 12
    month = months % 12 + 1
    last_day = calendar.monthrange(year, month)[1]
    return date(year, month, min(schedule.anchor_day, last_day))


def occurrences_to_create(
    schedule: Schedule, last_seq: int | None, today: date, room: int | None = None
) -> list[PlannedOccurrence]:
    """Недостающие периоды: все со сроком до сегодня включительно и ровно один будущий.

    `last_seq` - номер последнего существующего периода; номер меньше `from_seq` значит,
    что периодов этого отрезка расписания ещё нет. `room` - сколько периодов ещё можно
    создать у платежа с ограниченным числом оплат (None - без ограничения).
    """
    if last_seq is not None and last_seq >= schedule.from_seq:
        if due_date(schedule, last_seq) > today:
            return []
        seq = last_seq + 1
    else:
        seq = schedule.from_seq
    planned: list[PlannedOccurrence] = []
    while room is None or len(planned) < room:
        planned.append(PlannedOccurrence(seq, due_date(schedule, seq)))
        if planned[-1].due_date > today:
            break
        seq += 1
    return planned


def planned_between(
    schedule: Schedule, last_seq: int | None, start: date, end: date, room: int | None = None
) -> list[PlannedOccurrence]:
    """Сроки ещё не созданных периодов с `start` по `end` включительно; не больше `room`
    периодов от следующего, если число оплат ограничено."""
    if last_seq is not None and last_seq >= schedule.from_seq:
        seq = last_seq + 1
    else:
        seq = schedule.from_seq
    planned = []
    left = room
    while (due := due_date(schedule, seq)) <= end and (left is None or left > 0):
        if due >= start:
            planned.append(PlannedOccurrence(seq, due))
        if left is not None:
            left -= 1
        seq += 1
    return planned


def occurrence_room(limit: int | None, existing: int) -> int | None:
    """Сколько периодов ещё можно создать: None - без ограничения."""
    return None if limit is None else max(limit - existing, 0)


def add_planned(
    totals: Sequence[CurrencyTotals], planned: Iterable[tuple[Currency, int]]
) -> list[CurrencyTotals]:
    """Добавляет к итогам плановые суммы: пары (валюта, сумма)."""
    by_currency = {item.currency: item for item in totals}
    for currency, amount in planned:
        current = by_currency[currency]
        by_currency[currency] = replace(
            current,
            planned_minor=current.planned_minor + amount,
            planned_count=current.planned_count + 1,
        )
    return [by_currency[item.currency] for item in totals]


def month_ranges(start: date, end: date) -> list[tuple[date, date]]:
    """Календарные месяцы между датами, обрезанные по краям диапазона."""
    ranges = []
    month_start = start.replace(day=1)
    while month_start <= end:
        last = calendar.monthrange(month_start.year, month_start.month)[1]
        month_end = month_start.replace(day=last)
        ranges.append((max(month_start, start), min(month_end, end)))
        month_start = month_end + timedelta(days=1)
    return ranges


def is_replaceable(state: OccurrenceState, today: date) -> bool:
    """Период, который меняет правка платежа: не оплачен и ещё не просрочен."""
    return not state.paid and state.due_date >= today


def removed_on_stop(state: OccurrenceState, today: date) -> bool:
    """Период, который удаляет прекращение: не оплачен и срок позже сегодня."""
    return not state.paid and state.due_date > today


def next_segment_from_seq(remaining: Iterable[OccurrenceState]) -> int:
    """Номер, с которого начинается новый отрезок расписания после смены даты."""
    return max((state.seq for state in remaining), default=-1) + 1


def next_due_date_error(next_due_date: date, today: date) -> str | None:
    if next_due_date < today:
        return "Дата ближайшей оплаты не может быть раньше сегодняшней"
    return None


def paid_on_error(paid_on: date, today: date) -> str | None:
    if paid_on > today:
        return "Дата оплаты не может быть позже сегодняшней"
    return None


def overdue_days(due: date, paid_on: date | None, today: date) -> int:
    """Дни просрочки: до сегодня у неоплаченного, до даты оплаты у оплаченного."""
    reference = today if paid_on is None else paid_on
    return max(0, (reference - due).days)


def is_overdue(due: date, paid_on: date | None, today: date) -> bool:
    return overdue_days(due, paid_on, today) > 0


def summarize(states: Sequence[OccurrenceState], today: date) -> list[CurrencyTotals]:
    """Итоги по каждой валюте отдельно; все три валюты есть всегда, суммы не смешиваются."""
    totals = {currency: CurrencyTotals(currency) for currency in Currency}
    for state in states:
        current = totals[state.currency]
        unpaid = 0 if state.paid else state.amount_minor
        overdue = unpaid if is_overdue(state.due_date, state.paid_on, today) else 0
        totals[state.currency] = CurrencyTotals(
            currency=state.currency,
            total_minor=current.total_minor + state.amount_minor,
            paid_minor=current.paid_minor + (state.amount_minor - unpaid),
            unpaid_minor=current.unpaid_minor + unpaid,
            overdue_minor=current.overdue_minor + overdue,
            count=current.count + 1,
            paid_count=current.paid_count + int(state.paid),
            unpaid_count=current.unpaid_count + int(not state.paid),
            overdue_count=current.overdue_count + int(overdue > 0),
        )
    return list(totals.values())
