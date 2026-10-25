from dataclasses import replace
from datetime import date
from uuid import UUID

import pytest

from apps.reminders.domain import (
    PaymentLine,
    ReminderKind,
    due_soon,
    format_amount,
    overdue_reminder,
    paid_card,
    reminder_card,
    still_relevant,
)

PAYMENT_ID = UUID("3c2b1a09-8f7e-4d6c-9b5a-4f3e2d1c0b9a")
TODAY = date(2026, 10, 24)


@pytest.mark.parametrize(
    ("due", "paid", "active", "expected"),
    [
        (date(2026, 10, 27), False, True, True),
        (date(2026, 10, 28), False, True, False),
        (TODAY, False, True, True),
        (date(2026, 10, 23), False, True, False),
        (date(2026, 10, 26), True, True, False),
        (date(2026, 10, 26), False, False, False),
    ],
    ids=["three-days", "four-days", "due-today", "due-passed", "paid", "stopped"],
)
def test_due_soon_window(due: date, paid: bool, active: bool, expected: bool) -> None:
    assert due_soon(due, paid, active, TODAY, days_before=3) is expected


@pytest.mark.parametrize(
    ("due", "paid", "active", "expected"),
    [
        (date(2026, 10, 23), False, True, True),
        (date(2026, 9, 23), False, True, True),
        (TODAY, False, True, False),
        (date(2026, 10, 23), True, True, False),
        (date(2026, 10, 23), False, False, False),
    ],
    ids=["first-overdue-day", "long-overdue", "due-today", "paid-late", "stopped"],
)
def test_overdue_reminder(due: date, paid: bool, active: bool, expected: bool) -> None:
    assert overdue_reminder(due, paid, active, TODAY) is expected


LINE = PaymentLine(
    PAYMENT_ID, "Аренда <офиса>", 15_000_000, "RUB", date(2026, 10, 27), department="Офис"
)


@pytest.mark.parametrize(
    ("due", "head"),
    [
        (date(2026, 10, 27), "🔔 <b>Скоро оплата</b> · через 3 дня"),
        (date(2026, 10, 25), "🔔 <b>Скоро оплата</b> · через 1 день"),
        (TODAY, "🔔 <b>Скоро оплата</b> · срок сегодня"),
    ],
)
def test_due_soon_card_head(due: date, head: str) -> None:
    card = reminder_card(ReminderKind.DUE_SOON, replace(LINE, due_date=due), today=TODAY)

    assert card.text.splitlines()[0] == head


def test_card_details_escape_html_and_name_department() -> None:
    card = reminder_card(
        ReminderKind.OVERDUE, replace(LINE, due_date=date(2026, 10, 21)), today=TODAY
    )

    assert card.text.splitlines() == [
        "🔴 <b>Просрочена оплата</b> · 3 дня",
        "",
        "📄 <b>Аренда &lt;офиса&gt;</b>",
        "💰 <b>150 000,00 RUB</b>",
        "📅 Срок: 21.10.2026",
        "🏢 Отдел: Офис",
    ]


def test_card_buttons() -> None:
    notification = UUID("11111111-1111-1111-1111-111111111111")

    card = reminder_card(
        ReminderKind.DUE_SOON,
        LINE,
        today=TODAY,
        panel_url="https://x.ru",
        notification_id=notification,
    )

    assert [[(b.text, b.callback, b.url) for b in row] for row in card.buttons] == [
        [
            ("✅ Оплачено", f"paid:{notification}", None),
            ("⏰ Напомнить завтра", f"later:{notification}", None),
        ],
        [("🔗 Открыть в панели", None, f"https://x.ru/payments?payment={PAYMENT_ID}")],
    ]


def test_paid_card_drops_actions() -> None:
    card = paid_card(LINE, date(2026, 10, 25), "buh@company.ru")

    assert card.text.splitlines()[0] == "✅ <b>Оплачено</b> · 25.10.2026"
    assert card.text.splitlines()[-1] == "👤 Отметил(а): buh@company.ru"
    assert card.buttons == ()


@pytest.mark.parametrize(
    ("amount", "text"),
    [(1_299, "12,99 EUR"), (5, "0,05 EUR"), (123_456_789_00, "123 456 789,00 EUR")],
)
def test_format_amount(amount: int, text: str) -> None:
    assert format_amount(amount, "EUR") == text


def test_due_soon_is_not_relevant_after_due_date() -> None:
    assert not still_relevant(
        ReminderKind.DUE_SOON, date(2026, 10, 23), False, True, today=TODAY, days_before=3
    )
    assert still_relevant(
        ReminderKind.OVERDUE, date(2026, 10, 23), False, True, today=TODAY, days_before=3
    )
