from datetime import date

import pytest

from apps.payments.domain import (
    CurrencyTotals,
    OccurrenceState,
    PlannedOccurrence,
    Schedule,
    add_planned,
    due_date,
    is_overdue,
    is_replaceable,
    month_ranges,
    next_due_date_error,
    next_segment_from_seq,
    occurrence_room,
    occurrences_to_create,
    overdue_days,
    paid_on_error,
    planned_between,
    removed_on_stop,
    summarize,
)
from apps.payments.schemas import Currency, Period

TODAY = date(2026, 10, 24)


def _state(
    seq: int,
    due: date,
    paid_on: date | None = None,
    amount: int = 1000,
    currency: Currency = Currency.RUB,
) -> OccurrenceState:
    return OccurrenceState(seq, due, paid_on, amount, currency)


@pytest.mark.parametrize(
    ("first", "expected"),
    [
        (
            date(2026, 1, 31),
            [
                date(2026, 1, 31),
                date(2026, 2, 28),
                date(2026, 3, 31),
                date(2026, 4, 30),
                date(2026, 5, 31),
            ],
        ),
        (date(2028, 1, 30), [date(2028, 1, 30), date(2028, 2, 29), date(2028, 3, 30)]),
        (date(2026, 12, 15), [date(2026, 12, 15), date(2027, 1, 15)]),
    ],
)
def test_due_dates_follow_anchor_day(first: date, expected: list[date]) -> None:
    schedule = Schedule.starting(first)

    assert [due_date(schedule, seq) for seq in range(len(expected))] == expected


def test_due_dates_of_later_segment_start_from_its_own_date() -> None:
    schedule = Schedule.starting(date(2026, 11, 10), from_seq=3)

    assert [due_date(schedule, seq) for seq in (3, 4)] == [date(2026, 11, 10), date(2026, 12, 10)]


def test_create_first_period_of_new_payment() -> None:
    planned = occurrences_to_create(Schedule.starting(date(2026, 11, 5)), None, TODAY)

    assert planned == [PlannedOccurrence(0, date(2026, 11, 5))]


def test_create_next_period_when_due_date_arrives() -> None:
    planned = occurrences_to_create(Schedule.starting(date(2026, 11, 5)), 0, date(2026, 11, 5))

    assert planned == [PlannedOccurrence(1, date(2026, 12, 5))]


def test_create_missed_periods_after_downtime() -> None:
    planned = occurrences_to_create(Schedule.starting(date(2026, 11, 5)), 0, date(2027, 2, 10))

    assert [p.due_date for p in planned] == [
        date(2026, 12, 5),
        date(2027, 1, 5),
        date(2027, 2, 5),
        date(2027, 3, 5),
    ]
    assert [p.seq for p in planned] == [1, 2, 3, 4]


def test_create_nothing_when_future_period_exists() -> None:
    assert occurrences_to_create(Schedule.starting(date(2026, 11, 5)), 0, TODAY) == []


def test_create_first_period_of_new_segment_after_older_periods() -> None:
    planned = occurrences_to_create(Schedule.starting(date(2026, 11, 10), from_seq=1), 0, TODAY)

    assert planned == [PlannedOccurrence(1, date(2026, 11, 10))]


def test_replace_only_unpaid_periods_due_today_or_later() -> None:
    paid_past = _state(0, date(2026, 10, 5), paid_on=date(2026, 10, 5))
    overdue = _state(1, date(2026, 10, 20))
    due_today = _state(2, TODAY)
    future = _state(3, date(2026, 11, 5))

    assert [is_replaceable(s, TODAY) for s in (paid_past, overdue, due_today, future)] == [
        False,
        False,
        True,
        True,
    ]


def test_stop_removes_only_unpaid_future_periods() -> None:
    paid_past = _state(0, date(2026, 10, 5), paid_on=date(2026, 10, 5))
    due_today = _state(1, TODAY)
    future = _state(2, date(2026, 11, 5))
    paid_future = _state(3, date(2026, 12, 5), paid_on=TODAY)

    assert [removed_on_stop(s, TODAY) for s in (paid_past, due_today, future, paid_future)] == [
        False,
        False,
        True,
        False,
    ]


def test_new_segment_continues_after_remaining_periods() -> None:
    assert next_segment_from_seq([_state(0, date(2026, 9, 5)), _state(1, date(2026, 10, 5))]) == 2
    assert next_segment_from_seq([]) == 0


@pytest.mark.parametrize(
    ("day", "next_due_rejected", "paid_on_rejected"),
    [(date(2026, 10, 23), True, False), (TODAY, False, False), (date(2026, 10, 25), False, True)],
)
def test_date_error_boundaries(day: date, next_due_rejected: bool, paid_on_rejected: bool) -> None:
    assert (next_due_date_error(day, TODAY) is not None) is next_due_rejected
    assert (paid_on_error(day, TODAY) is not None) is paid_on_rejected


@pytest.mark.parametrize(
    ("due", "paid_on", "today", "days"),
    [
        (date(2026, 10, 24), None, date(2026, 10, 24), 0),
        (date(2026, 10, 24), None, date(2026, 10, 25), 1),
        (date(2026, 10, 5), date(2026, 10, 5), TODAY, 0),
        (date(2026, 10, 5), date(2026, 10, 8), TODAY, 3),
        (date(2026, 10, 5), date(2026, 10, 1), TODAY, 0),
    ],
    ids=["unpaid-due-today", "unpaid-next-day", "paid-on-due", "paid-late", "paid-early"],
)
def test_overdue_days(due: date, paid_on: date | None, today: date, days: int) -> None:
    assert overdue_days(due, paid_on, today) == days
    assert is_overdue(due, paid_on, today) is (days > 0)


def test_overdue_disappears_after_paid_on_correction() -> None:
    due = date(2026, 10, 5)

    assert is_overdue(due, date(2026, 10, 8), TODAY)
    assert not is_overdue(due, date(2026, 10, 5), TODAY)


def test_summarize_keeps_currencies_apart() -> None:
    rent = _state(0, date(2026, 11, 5), amount=15_000_000, currency=Currency.RUB)
    server = _state(0, date(2026, 10, 20), date(2026, 10, 20), amount=2_500, currency=Currency.USD)

    assert summarize([rent, server], TODAY) == [
        CurrencyTotals(Currency.RUB, 15_000_000, 0, 15_000_000, 0, 1, 0, 1, 0),
        CurrencyTotals(Currency.USD, 2_500, 2_500, 0, 0, 1, 1, 0, 0),
        CurrencyTotals(Currency.EUR),
    ]


def test_summarize_without_periods_has_three_zero_currencies() -> None:
    assert summarize([], TODAY) == [
        CurrencyTotals(c) for c in (Currency.RUB, Currency.USD, Currency.EUR)
    ]


def test_summarize_counts_overdue_only_while_unpaid() -> None:
    unpaid_overdue = _state(0, date(2026, 10, 1))
    paid_late = _state(1, date(2026, 10, 1), paid_on=date(2026, 10, 3))

    rub = summarize([unpaid_overdue, paid_late], TODAY)[0]

    assert (rub.unpaid_minor, rub.overdue_minor, rub.paid_minor) == (1000, 1000, 1000)
    assert (rub.paid_count, rub.unpaid_count, rub.overdue_count) == (1, 1, 1)


def test_planned_between_continues_after_last_period() -> None:
    schedule = Schedule.starting(date(2026, 10, 31))

    planned = planned_between(schedule, 0, date(2026, 11, 1), date(2027, 2, 28))

    assert planned == [
        PlannedOccurrence(1, date(2026, 11, 30)),
        PlannedOccurrence(2, date(2026, 12, 31)),
        PlannedOccurrence(3, date(2027, 1, 31)),
        PlannedOccurrence(4, date(2027, 2, 28)),
    ]


def test_planned_between_skips_before_start() -> None:
    schedule = Schedule.starting(date(2026, 10, 5))

    assert [
        p.due_date for p in planned_between(schedule, 0, date(2027, 1, 1), date(2027, 2, 10))
    ] == [
        date(2027, 1, 5),
        date(2027, 2, 5),
    ]


def test_add_planned_keeps_totals_apart() -> None:
    totals = [CurrencyTotals(c) for c in Currency]

    rub, usd, eur = add_planned(
        totals, [(Currency.RUB, 100), (Currency.RUB, 50), (Currency.USD, 7)]
    )

    assert (rub.planned_minor, rub.planned_count, rub.total_minor) == (150, 2, 0)
    assert (usd.planned_minor, eur.planned_count) == (7, 0)


def test_month_ranges_clip_edges() -> None:
    assert month_ranges(date(2026, 10, 24), date(2026, 12, 3)) == [
        (date(2026, 10, 24), date(2026, 10, 31)),
        (date(2026, 11, 1), date(2026, 11, 30)),
        (date(2026, 12, 1), date(2026, 12, 3)),
    ]


@pytest.mark.parametrize(
    ("period", "every", "first", "expected"),
    [
        (
            Period.DAY,
            1,
            date(2026, 12, 30),
            [date(2026, 12, 30), date(2026, 12, 31), date(2027, 1, 1)],
        ),
        (
            Period.DAY,
            10,
            date(2026, 11, 5),
            [date(2026, 11, 5), date(2026, 11, 15), date(2026, 11, 25)],
        ),
        (
            Period.WEEK,
            2,
            date(2026, 11, 2),
            [date(2026, 11, 2), date(2026, 11, 16), date(2026, 11, 30)],
        ),
        (
            Period.MONTH,
            3,
            date(2026, 1, 31),
            [date(2026, 1, 31), date(2026, 4, 30), date(2026, 7, 31)],
        ),
        (
            Period.YEAR,
            1,
            date(2028, 2, 29),
            [date(2028, 2, 29), date(2029, 2, 28), date(2030, 2, 28)],
        ),
        (
            Period.YEAR,
            2,
            date(2026, 11, 5),
            [date(2026, 11, 5), date(2028, 11, 5), date(2030, 11, 5)],
        ),
    ],
)
def test_due_dates_for_any_period(
    period: Period, every: int, first: date, expected: list[date]
) -> None:
    schedule = Schedule.starting(first, period=period, every=every)

    assert [due_date(schedule, seq) for seq in range(3)] == expected


def test_year_keeps_anchor_29_for_leap_years() -> None:
    schedule = Schedule.starting(date(2028, 2, 29), period=Period.YEAR)

    assert due_date(schedule, 4) == date(2032, 2, 29)


def test_occurrence_room_limits_created_periods() -> None:
    schedule = Schedule.starting(date(2026, 10, 5), period=Period.WEEK)

    after_downtime = occurrences_to_create(schedule, None, date(2026, 12, 1), room=4)
    nothing_left = occurrences_to_create(schedule, 3, date(2026, 12, 1), room=0)

    assert [p.due_date for p in after_downtime] == [
        date(2026, 10, 5),
        date(2026, 10, 12),
        date(2026, 10, 19),
        date(2026, 10, 26),
    ]
    assert nothing_left == []


def test_planned_between_respects_room() -> None:
    schedule = Schedule.starting(date(2026, 10, 26), period=Period.WEEK)

    planned = planned_between(schedule, 0, date(2026, 10, 27), date(2026, 12, 31), room=3)

    assert [p.due_date for p in planned] == [
        date(2026, 11, 2),
        date(2026, 11, 9),
        date(2026, 11, 16),
    ]
    assert occurrence_room(None, 10) is None
    assert occurrence_room(4, 6) == 0
