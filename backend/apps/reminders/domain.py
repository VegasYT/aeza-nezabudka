"""Когда период подходит для напоминания и как выглядит сообщение: без базы и доставки."""

from dataclasses import dataclass
from datetime import date, timedelta
from enum import StrEnum
from html import escape
from uuid import UUID


def due_soon(due_date: date, paid: bool, active: bool, today: date, days_before: int) -> bool:
    """Напоминание до срока: срок от сегодня до сегодня плюс `days_before` дней."""
    return not paid and active and today <= due_date <= today + timedelta(days=days_before)


def overdue_reminder(due_date: date, paid: bool, active: bool, today: date) -> bool:
    """Напоминание о просрочке; одно на период обеспечивает доставка."""
    return not paid and active and today > due_date


class ReminderKind(StrEnum):
    DUE_SOON = "due_soon"
    OVERDUE = "overdue"
    # сообщение в групповые чаты о новом платеже
    CREATED = "created"


def still_relevant(
    kind: ReminderKind, due_date: date, paid: bool, active: bool, *, today: date, days_before: int
) -> bool:
    """Повторная проверка перед отправкой: то же правило, что и при постановке."""
    if kind is ReminderKind.DUE_SOON:
        return due_soon(due_date, paid, active, today, days_before)
    if kind is ReminderKind.CREATED:
        return active
    return overdue_reminder(due_date, paid, active, today)


def format_amount(amount_minor: int, currency: str) -> str:
    """150000000 RUB -> "1 500 000,00 RUB": у RUB, USD и EUR по две цифры после запятой."""
    units, cents = divmod(amount_minor, 100)
    return f"{units:,}".replace(",", " ") + f",{cents:02d} {currency}"


def _days(count: int) -> str:
    if count % 10 == 1 and count % 100 != 11:
        return f"{count} день"
    if 2 <= count % 10 <= 4 and not 12 <= count % 100 <= 14:
        return f"{count} дня"
    return f"{count} дней"


# Кнопки под напоминанием: данные кнопки - действие и id напоминания в очереди.
PAID_ACTION = "paid"
LATER_ACTION = "later"


@dataclass(frozen=True)
class Button:
    text: str
    url: str | None = None
    callback: str | None = None


@dataclass(frozen=True)
class Card:
    """Сообщение Telegram: HTML и ряды кнопок."""

    text: str
    buttons: tuple[tuple[Button, ...], ...] = ()


@dataclass(frozen=True)
class PaymentLine:
    """Что о периоде показать в сообщении."""

    payment_id: UUID
    payment_name: str
    amount_minor: int
    currency: str
    due_date: date
    department: str | None = None


def _details(line: PaymentLine, due_label: str = "Срок") -> list[str]:
    rows = [
        f"📄 <b>{escape(line.payment_name)}</b>",
        f"💰 <b>{format_amount(line.amount_minor, line.currency)}</b>",
        f"📅 {due_label}: {line.due_date.strftime('%d.%m.%Y')}",
    ]
    if line.department is not None:
        rows.append(f"🏢 Отдел: {escape(line.department)}")
    return rows


def _panel_row(line: PaymentLine, panel_url: str | None) -> tuple[Button, ...]:
    if panel_url is None:
        return ()
    return (Button("🔗 Открыть в панели", url=f"{panel_url}/payments?payment={line.payment_id}"),)


def _rows(*rows: tuple[Button, ...]) -> tuple[tuple[Button, ...], ...]:
    return tuple(row for row in rows if row)


def reminder_card(
    kind: ReminderKind,
    line: PaymentLine,
    *,
    today: date,
    panel_url: str | None = None,
    notification_id: UUID | None = None,
    footer: str | None = None,
) -> Card:
    """Напоминание до срока или о просрочке; с `notification_id` - с кнопками действий."""
    if kind is ReminderKind.OVERDUE:
        late = (today - line.due_date).days
        head = f"🔴 <b>Просрочена оплата</b> · {_days(late)}"
    else:
        left = (line.due_date - today).days
        when = "срок сегодня" if left <= 0 else f"через {_days(left)}"
        head = f"🔔 <b>Скоро оплата</b> · {when}"
    rows = [head, "", *_details(line)]
    if footer is not None:
        rows += ["", footer]
    actions: tuple[Button, ...] = ()
    if notification_id is not None:
        actions = (
            Button("✅ Оплачено", callback=f"{PAID_ACTION}:{notification_id}"),
            Button("⏰ Напомнить завтра", callback=f"{LATER_ACTION}:{notification_id}"),
        )
    return Card("\n".join(rows), _rows(actions, _panel_row(line, panel_url)))


def created_card(line: PaymentLine, *, panel_url: str | None = None) -> Card:
    rows = ["🆕 <b>Новый платёж</b>", "", *_details(line, "Первый срок")]
    return Card("\n".join(rows), _rows(_panel_row(line, panel_url)))


def paid_card(
    line: PaymentLine, paid_on: date, paid_by: str | None, *, panel_url: str | None = None
) -> Card:
    """Итог напоминания после оплаты: кнопки действий убраны."""
    rows = [f"✅ <b>Оплачено</b> · {paid_on.strftime('%d.%m.%Y')}", "", *_details(line)]
    if paid_by is not None:
        rows.append(f"👤 Отметил(а): {escape(paid_by)}")
    return Card("\n".join(rows), _rows(_panel_row(line, panel_url)))


def stopped_card(line: PaymentLine, *, panel_url: str | None = None) -> Card:
    rows = ["⛔ <b>Платёж прекращён</b>", "", *_details(line)]
    return Card("\n".join(rows), _rows(_panel_row(line, panel_url)))
