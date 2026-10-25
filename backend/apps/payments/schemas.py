from datetime import date, datetime
from enum import StrEnum
from typing import Annotated, Literal, Self
from uuid import UUID

from pydantic import ConfigDict, Field, JsonValue, StringConstraints, model_validator

from apps.departments.schemas import DepartmentRef
from core.schemas import ApiModel, InputModel, PageQuery

PAYMENT_ID_EXAMPLE = "3c2b1a09-8f7e-4d6c-9b5a-4f3e2d1c0b9a"
OCCURRENCE_ID_EXAMPLE = "7e6d5c4b-3a29-4180-9f8e-7d6c5b4a3928"
_DEPARTMENT_EXAMPLE: dict[str, JsonValue] = {
    "id": "9a8b7c6d-5e4f-4a3b-8c2d-1e0f9a8b7c6d",
    "name": "Офис",
}

AmountMinor = Annotated[
    int,
    Field(gt=0, description="Сумма в минимальных единицах валюты: копейках или центах"),
]
PaymentName = Annotated[
    str,
    StringConstraints(strip_whitespace=True, min_length=1, max_length=200),
    Field(examples=["Аренда офиса"]),
]
WITHOUT_DEPARTMENT = "none"
DepartmentFilter = Annotated[
    UUID | Literal["none"],
    Field(description="id отдела или `none` - только платежи без отдела"),
]
Search = Annotated[
    str,
    StringConstraints(strip_whitespace=True, min_length=1, max_length=200),
    Field(description="Часть названия платежа, без учёта регистра", examples=["аренда"]),
]


class Currency(StrEnum):
    RUB = "RUB"
    USD = "USD"
    EUR = "EUR"


class Period(StrEnum):
    DAY = "day"
    WEEK = "week"
    MONTH = "month"
    YEAR = "year"


OccurrenceLimit = Annotated[
    int,
    Field(
        ge=1,
        le=1000,
        description="Сколько раз оплатить; после этого периоды не создаются. null - бессрочно",
        examples=[4],
    ),
]
ReminderDays = Annotated[
    int,
    Field(
        ge=0,
        le=30,
        description="За сколько дней до срока напоминать; null - общее окно (`GET /settings`)",
        examples=[7],
    ),
]
PeriodCount = Annotated[
    int,
    Field(
        ge=1,
        le=366,
        description="Каждые N единиц period: month и 3 - раз в квартал, day и 10 - каждые 10 дней",
        examples=[1],
    ),
]


class RecurringPaymentStatus(StrEnum):
    ACTIVE = "active"
    STOPPED = "stopped"


class OccurrenceStatus(StrEnum):
    PAID = "paid"
    UNPAID = "unpaid"
    OVERDUE = "overdue"


class SortOrder(StrEnum):
    ASC = "asc"
    DESC = "desc"


class RecurringPayment(ApiModel):
    # Цельный пример на уровне модели: mock-сервер отдаёт его как есть, поля согласованы.
    model_config = ConfigDict(
        json_schema_extra={
            "examples": [
                {
                    "id": PAYMENT_ID_EXAMPLE,
                    "name": "Аренда офиса",
                    "amountMinor": 15000000,
                    "currency": "RUB",
                    "period": "month",
                    "periodCount": 1,
                    "occurrenceLimit": None,
                    "reminderDaysBefore": 7,
                    "paidOccurrences": 3,
                    "completed": False,
                    "anchorDay": 5,
                    "nextDueDate": "2026-11-05",
                    "overdueCount": 1,
                    "oldestOverdueDays": 19,
                    "department": _DEPARTMENT_EXAMPLE,
                    "stoppedAt": None,
                    "createdAt": "2026-10-01T09:00:00Z",
                    "createdByLogin": "admin",
                }
            ]
        }
    )

    id: UUID = Field(examples=[PAYMENT_ID_EXAMPLE])
    name: PaymentName
    amount_minor: AmountMinor = Field(examples=[15000000])
    currency: Currency = Field(examples=[Currency.RUB])
    period: Period = Field(description="Единица повторения: day, week, month или year")
    period_count: PeriodCount
    occurrence_limit: OccurrenceLimit | None
    reminder_days_before: ReminderDays | None
    paid_occurrences: int = Field(ge=0, description="Сколько периодов уже оплачено", examples=[3])
    completed: bool = Field(
        description="Все оплаты по occurrenceLimit сделаны; у бессрочного всегда false",
        examples=[False],
    )
    anchor_day: int = Field(
        ge=1,
        le=31,
        description="Число месяца, от которого считается срок у month и year; "
        "если такого числа нет - последний день месяца",
    )
    next_due_date: date | None = Field(
        description=(
            "Ближайший неоплаченный срок не раньше сегодня; null у прекращённого платежа "
            "и когда ближайший будущий период уже оплачен заранее"
        ),
        examples=["2026-11-05"],
    )
    overdue_count: int = Field(ge=0, description="Сколько периодов просрочено сейчас", examples=[1])
    oldest_overdue_days: int | None = Field(
        description="Дней просрочки у самого старого неоплаченного периода; null - просрочки нет",
        examples=[19],
    )
    department: DepartmentRef | None
    stopped_at: datetime | None = Field(description="null - платёж действует")
    created_at: datetime
    created_by_login: str = Field(examples=["admin"])


class RecurringPaymentCreate(InputModel):
    model_config = ConfigDict(
        json_schema_extra={
            "examples": [
                {
                    "name": "Аренда офиса",
                    "amountMinor": 15000000,
                    "currency": "RUB",
                    "period": "month",
                    "periodCount": 1,
                    "nextDueDate": "2026-11-05",
                    "departmentId": None,
                }
            ]
        }
    )

    name: PaymentName
    amount_minor: AmountMinor
    currency: Currency
    period: Period = Period.MONTH
    period_count: PeriodCount = 1
    occurrence_limit: OccurrenceLimit | None = None
    reminder_days_before: ReminderDays | None = None
    next_due_date: date = Field(description="Дата ближайшей оплаты, не раньше сегодня")
    department_id: UUID | None = None


class RecurringPaymentUpdate(InputModel):
    """Меняет только неоплаченные периоды со сроком сегодня или позже.

    Смена периода без новой даты продолжает расписание с ближайшего неоплаченного срока.
    """

    model_config = ConfigDict(json_schema_extra={"examples": [{"amountMinor": 16000000}]})

    name: PaymentName | None = None
    amount_minor: AmountMinor | None = None
    currency: Currency | None = None
    period: Period | None = None
    period_count: PeriodCount | None = None
    occurrence_limit: OccurrenceLimit | None = Field(
        default=None,
        description="Сколько раз оплатить всего; null - снять ограничение. Не меньше, чем "
        "уже оплаченных и просроченных периодов",
    )
    reminder_days_before: ReminderDays | None = Field(
        default=None, description="Своё окно напоминания; null - общее окно системы"
    )
    next_due_date: date | None = Field(
        default=None, description="Новая дата ближайшей оплаты, не раньше сегодня"
    )
    department_id: UUID | None = Field(default=None, description="null снимает отдел")

    @model_validator(mode="after")
    def _something_to_change(self) -> Self:
        if not self.model_fields_set:
            raise ValueError("Укажите хотя бы одно поле")
        return self


class RecurringPaymentResume(InputModel):
    model_config = ConfigDict(json_schema_extra={"examples": [{"nextDueDate": "2026-11-05"}]})

    next_due_date: date | None = Field(
        default=None,
        description="С какой даты продолжить, не раньше сегодня; без неё - следующий срок "
        "прежнего расписания",
    )


class RecurringPaymentQuery(PageQuery):
    status: RecurringPaymentStatus | None = Field(default=None, description="Без фильтра - все")
    department_id: DepartmentFilter | None = None
    q: Search | None = None


class PaymentRef(ApiModel):
    id: UUID = Field(examples=[PAYMENT_ID_EXAMPLE])
    name: str = Field(examples=["Аренда офиса"])
    stopped: bool = Field(description="Платёж прекращён", examples=[False])
    reminder_days_before: ReminderDays | None = None


class Receipt(ApiModel):
    """Чек оплаты периода; сам файл - `GET /payment-occurrences/{id}/receipt`."""

    file_name: str = Field(examples=["receipt.pdf"])
    content_type: str = Field(
        description="application/pdf, image/jpeg, image/png или image/webp",
        examples=["application/pdf"],
    )
    size: int = Field(gt=0, description="Байт", examples=[184320])
    uploaded_at: datetime
    uploaded_by_login: str = Field(examples=["buh.petrova"])


class PaymentOccurrence(ApiModel):
    model_config = ConfigDict(
        json_schema_extra={
            "examples": [
                {
                    "id": OCCURRENCE_ID_EXAMPLE,
                    "recurringPayment": {
                        "id": PAYMENT_ID_EXAMPLE,
                        "name": "Аренда офиса",
                        "stopped": False,
                        "reminderDaysBefore": None,
                    },
                    "department": _DEPARTMENT_EXAMPLE,
                    "dueDate": "2026-10-05",
                    "amountMinor": 15000000,
                    "currency": "RUB",
                    "paid": False,
                    "paidOn": None,
                    "paidByLogin": None,
                    "overdue": True,
                    "daysOverdue": 19,
                }
            ]
        }
    )

    id: UUID = Field(examples=[OCCURRENCE_ID_EXAMPLE])
    recurring_payment: PaymentRef
    department: DepartmentRef | None
    due_date: date = Field(examples=["2026-11-05"])
    amount_minor: AmountMinor = Field(examples=[15000000])
    currency: Currency = Field(examples=[Currency.RUB])
    paid: bool = Field(examples=[False])
    paid_on: date | None = Field(description="Фактическая дата оплаты", examples=[None])
    paid_by_login: str | None = Field(examples=[None])
    overdue: bool = Field(description="Просрочен сейчас или оплачен с опозданием")
    days_overdue: int = Field(ge=0, description="0, если просрочки нет", examples=[0])
    reminder_sent_at: datetime | None = Field(
        default=None, description="Когда ушло последнее напоминание о периоде"
    )
    receipt: Receipt | None = Field(default=None, description="Чек оплаты; null - не приложен")


class PaymentOccurrenceUpdate(InputModel):
    model_config = ConfigDict(json_schema_extra={"examples": [{"paid": True, "paidOn": None}]})

    paid: bool = Field(description="true - отметить оплату или исправить дату, false - отменить")
    paid_on: date | None = Field(
        default=None, description="Фактическая дата, не позже сегодня; без неё - сегодня"
    )


class PaymentOccurrenceQuery(PageQuery):
    status: OccurrenceStatus | None = None
    currency: Currency | None = None
    recurring_payment_id: UUID | None = None
    department_id: DepartmentFilter | None = None
    q: Search | None = None
    payment_status: RecurringPaymentStatus | None = Field(
        default=None, description="active - только действующие платежи, stopped - прекращённые"
    )
    from_: date | None = Field(default=None, alias="from", description="Срок не раньше")
    to: date | None = Field(default=None, description="Срок не позже")
    order: SortOrder = Field(default=SortOrder.ASC, description="Сортировка по сроку")


MAX_RANGE_DAYS = 731


def _check_range(start: date | None, end: date | None) -> None:
    if start is not None and end is not None:
        if end < start:
            raise ValueError("Конец диапазона раньше начала")
        if (end - start).days > MAX_RANGE_DAYS:
            raise ValueError("Диапазон не больше двух лет")


class SummaryQuery(ApiModel):
    from_: date | None = Field(default=None, alias="from", description="Срок не раньше")
    to: date | None = Field(default=None, description="Срок не позже")
    department_id: DepartmentFilter | None = None
    q: Search | None = None
    payment_status: RecurringPaymentStatus | None = Field(
        default=None, description="active - только действующие платежи, stopped - прекращённые"
    )
    include_planned: bool = Field(
        default=False,
        description="Добавить plannedMinor и plannedCount - периоды, которых ещё нет в базе; "
        "нужен `to`",
    )
    group_by: Literal["month"] | None = Field(
        default=None, description="month - ещё и итоги по месяцам; нужны `from` и `to`"
    )
    as_of: date | None = Field(
        default=None,
        description="Снимок на дату: оплаченными считаются периоды с датой оплаты не позже неё, "
        "просрочка считается от неё",
    )

    @model_validator(mode="after")
    def _ranges(self) -> Self:
        if self.include_planned and self.to is None:
            raise ValueError("Для плановых периодов укажите to")
        if self.group_by is not None and (self.from_ is None or self.to is None):
            raise ValueError("Для итогов по месяцам укажите from и to")
        _check_range(self.from_, self.to)
        return self


class ForecastQuery(PageQuery):
    from_: date | None = Field(
        default=None, alias="from", description="Срок не раньше; без него - сегодня"
    )
    to: date = Field(description="Срок не позже, не дальше двух лет от начала")
    department_id: DepartmentFilter | None = None
    q: Search | None = None

    @model_validator(mode="after")
    def _range(self) -> Self:
        _check_range(self.from_, self.to)
        return self


class PlannedOccurrence(ApiModel):
    """Будущий период по расписанию; в базе его ещё нет, отметить оплату нельзя."""

    recurring_payment: PaymentRef
    department: DepartmentRef | None
    due_date: date = Field(examples=["2027-01-05"])
    amount_minor: AmountMinor = Field(examples=[15000000])
    currency: Currency = Field(examples=[Currency.RUB])


class CurrencyTotals(ApiModel):
    currency: Currency
    total_minor: int = Field(ge=0, examples=[15000000])
    paid_minor: int = Field(ge=0, examples=[0])
    unpaid_minor: int = Field(ge=0, examples=[15000000])
    overdue_minor: int = Field(ge=0, description="Часть неоплаченного", examples=[0])
    count: int = Field(ge=0, description="Сколько периодов", examples=[1])
    paid_count: int = Field(ge=0, description="Сколько оплачено", examples=[0])
    unpaid_count: int = Field(ge=0, description="Сколько не оплачено", examples=[1])
    overdue_count: int = Field(
        ge=0, description="Сколько просрочено, часть неоплаченных", examples=[1]
    )
    planned_minor: int = Field(
        default=0, ge=0, description="Сумма плановых периодов, только с includePlanned"
    )
    planned_count: int = Field(default=0, ge=0, description="Сколько плановых периодов")


class MonthTotals(ApiModel):
    month: str = Field(description="Месяц ГГГГ-ММ", examples=["2026-10"])
    currencies: list[CurrencyTotals]


class PaymentsSummary(ApiModel):
    model_config = ConfigDict(
        json_schema_extra={
            "examples": [
                {
                    "from": "2026-10-01",
                    "to": "2026-10-31",
                    "departmentId": None,
                    "currencies": [
                        {
                            "currency": "RUB",
                            "totalMinor": 15000000,
                            "paidMinor": 0,
                            "unpaidMinor": 15000000,
                            "overdueMinor": 15000000,
                            "count": 1,
                            "paidCount": 0,
                            "unpaidCount": 1,
                            "overdueCount": 1,
                        },
                        {
                            "currency": "USD",
                            "totalMinor": 2500,
                            "paidMinor": 2500,
                            "unpaidMinor": 0,
                            "overdueMinor": 0,
                            "count": 1,
                            "paidCount": 1,
                            "unpaidCount": 0,
                            "overdueCount": 0,
                        },
                        {
                            "currency": "EUR",
                            "totalMinor": 1299,
                            "paidMinor": 0,
                            "unpaidMinor": 1299,
                            "overdueMinor": 0,
                            "count": 1,
                            "paidCount": 0,
                            "unpaidCount": 1,
                            "overdueCount": 0,
                        },
                    ],
                }
            ]
        }
    )

    from_: date | None = Field(serialization_alias="from")
    to: date | None
    department_id: UUID | Literal["none"] | None
    as_of: date | None = None
    months: list[MonthTotals] | None = Field(
        default=None, description="Только с groupBy=month, по месяцам от from до to"
    )
    currencies: list[CurrencyTotals] = Field(
        description="Всегда три элемента: RUB, USD, EUR; суммы не складываются между валютами"
    )
