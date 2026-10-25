from datetime import date, datetime
from typing import Annotated
from urllib.parse import quote
from uuid import UUID

from fastapi import APIRouter, Depends, File, Header, Query, Request, Response, UploadFile, status

from apps.departments.schemas import DepartmentRef
from apps.payments.domain import RECEIPT_MAX_BYTES, CurrencyTotals, overdue_days
from apps.payments.models import OccurrenceReceipt
from apps.payments.receipts import ReceiptsService, receipts_of, receipts_service
from apps.payments.repository import OccurrenceRow, PaymentRow, PlannedRow
from apps.payments.schemas import (
    CurrencyTotals as CurrencyTotalsSchema,
)
from apps.payments.schemas import (
    ForecastQuery,
    MonthTotals,
    PaymentOccurrence,
    PaymentOccurrenceQuery,
    PaymentOccurrenceUpdate,
    PaymentRef,
    PaymentsSummary,
    PlannedOccurrence,
    Receipt,
    RecurringPayment,
    RecurringPaymentCreate,
    RecurringPaymentQuery,
    RecurringPaymentResume,
    RecurringPaymentUpdate,
    SummaryQuery,
)
from apps.payments.service import PaymentsService, payments_service
from apps.reminders.service import reminders_sent_at
from core.auth import ADMIN_AND_INTEGRATION, Principal, current_principal, require_roles
from core.schemas import Page, error_responses

router = APIRouter()

Writer = Annotated[Principal, Depends(require_roles(ADMIN_AND_INTEGRATION))]
Anyone = Annotated[Principal, Depends(current_principal)]
Service = Annotated[PaymentsService, Depends(payments_service)]
Receipts = Annotated[ReceiptsService, Depends(receipts_service)]


def _department(department_id: UUID | None, name: str | None) -> DepartmentRef | None:
    if department_id is None or name is None:
        return None
    return DepartmentRef(id=department_id, name=name)


def _payment(row: PaymentRow) -> RecurringPayment:
    payment = row.payment
    return RecurringPayment(
        id=payment.id,
        name=payment.name,
        amount_minor=payment.amount_minor,
        currency=payment.currency,
        period=payment.period,
        period_count=payment.period_count,
        occurrence_limit=payment.occurrence_limit,
        reminder_days_before=payment.reminder_days_before,
        paid_occurrences=row.paid_occurrences,
        completed=row.completed,
        anchor_day=payment.anchor_day,
        next_due_date=row.next_due_date,
        overdue_count=row.overdue_count,
        oldest_overdue_days=row.oldest_overdue_days,
        department=_department(payment.department_id, row.department_name),
        stopped_at=payment.stopped_at,
        created_at=payment.created_at,
        created_by_login=payment.created_by_login,
    )


def _receipt(receipt: OccurrenceReceipt | None) -> Receipt | None:
    if receipt is None:
        return None
    return Receipt(
        file_name=receipt.file_name,
        content_type=receipt.content_type,
        size=receipt.size,
        uploaded_at=receipt.uploaded_at,
        uploaded_by_login=receipt.uploaded_by_login,
    )


def _occurrence(
    row: OccurrenceRow,
    today: date,
    sent_at: dict[UUID, datetime],
    receipts: dict[UUID, OccurrenceReceipt],
) -> PaymentOccurrence:
    occurrence = row.occurrence
    days = overdue_days(occurrence.due_date, occurrence.paid_on, today)
    return PaymentOccurrence(
        id=occurrence.id,
        recurring_payment=PaymentRef(
            id=occurrence.recurring_payment_id,
            name=row.payment_name,
            stopped=row.payment_stopped,
            reminder_days_before=row.reminder_days_before,
        ),
        department=_department(row.department_id, row.department_name),
        due_date=occurrence.due_date,
        amount_minor=occurrence.amount_minor,
        currency=occurrence.currency,
        paid=occurrence.paid_on is not None,
        paid_on=occurrence.paid_on,
        paid_by_login=occurrence.paid_by_login,
        overdue=days > 0,
        days_overdue=days,
        reminder_sent_at=sent_at.get(occurrence.id),
        receipt=_receipt(receipts.get(occurrence.id)),
    )


async def _occurrences(request: Request, rows: list[OccurrenceRow]) -> list[PaymentOccurrence]:
    state = request.app.state
    ids = [row.occurrence.id for row in rows]
    sent_at = await reminders_sent_at(state.session_factory, ids)
    receipts = await receipts_of(state.session_factory, ids)
    return [_occurrence(row, state.clock.today(), sent_at, receipts) for row in rows]


def _planned(row: PlannedRow) -> PlannedOccurrence:
    return PlannedOccurrence(
        recurring_payment=PaymentRef(
            id=row.payment_id,
            name=row.payment_name,
            stopped=False,
            reminder_days_before=row.reminder_days_before,
        ),
        department=_department(row.department_id, row.department_name),
        due_date=row.due_date,
        amount_minor=row.amount_minor,
        currency=row.currency,
    )


def _totals(items: list[CurrencyTotals]) -> list[CurrencyTotalsSchema]:
    return [CurrencyTotalsSchema(**vars(item)) for item in items]


IdempotencyKey = Annotated[
    str | None,
    Header(
        alias="Idempotency-Key",
        min_length=1,
        max_length=128,
        description="Повтор запроса с тем же ключом не создаёт платёж второй раз",
    ),
]


@router.get(
    "/recurring-payments",
    tags=["Регулярные платежи"],
    summary="Список регулярных платежей",
    description="По названию. Фильтры: статус, отдел (`none` - без отдела), поиск `q`.",
    responses=error_responses(400, 401),
)
async def list_recurring_payments(
    _: Anyone, service: Service, query: Annotated[RecurringPaymentQuery, Query()]
) -> Page[RecurringPayment]:
    rows, total = await service.list_payments(query)
    return Page(items=[_payment(row) for row in rows], total=total)


@router.post(
    "/recurring-payments",
    status_code=status.HTTP_201_CREATED,
    tags=["Регулярные платежи"],
    summary="Создать регулярный платёж",
    description=(
        "Создаёт периоды до ближайшего будущего. Если до срока 3 дня или меньше, "
        "напоминание уходит сразу. Только администратор."
    ),
    responses=error_responses(400, 401, 403),
)
async def create_recurring_payment(
    writer: Writer,
    service: Service,
    body: RecurringPaymentCreate,
    idempotency_key: IdempotencyKey = None,
) -> RecurringPayment:
    return _payment(await service.create(writer, body, idempotency_key=idempotency_key))


@router.get(
    "/recurring-payments/{payment_id}",
    tags=["Регулярные платежи"],
    summary="Регулярный платёж",
    description="С ближайшим сроком и просрочкой.",
    responses=error_responses(400, 401, 404),
)
async def get_recurring_payment(_: Anyone, service: Service, payment_id: UUID) -> RecurringPayment:
    return _payment(await service.get_payment(payment_id))


@router.patch(
    "/recurring-payments/{payment_id}",
    tags=["Регулярные платежи"],
    summary="Изменить регулярный платёж",
    description=(
        "Меняются только неоплаченные периоды со сроком сегодня или позже; оплаченные и "
        "просроченные остаются как были. Прекращённый платёж изменить нельзя (409). "
        "Только администратор."
    ),
    responses=error_responses(400, 401, 403, 404, 409),
)
async def update_recurring_payment(
    writer: Writer, service: Service, payment_id: UUID, body: RecurringPaymentUpdate
) -> RecurringPayment:
    return _payment(await service.update(writer, payment_id, body))


@router.post(
    "/recurring-payments/{payment_id}/resume",
    tags=["Регулярные платежи"],
    summary="Возобновить регулярный платёж",
    description=(
        "Прекращённый платёж снова действует. Оплаченные и просроченные периоды остаются, "
        "новые идут с `nextDueDate`, а без неё - со следующего срока прежнего расписания, "
        "не раньше сегодня. `occurrenceLimit` учитывает уже созданные периоды. "
        "Если до срока 3 дня или меньше, напоминание уходит сразу. "
        "Действующий платёж - 409 `payment_active`. Администратор и интеграция."
    ),
    responses=error_responses(400, 401, 403, 404, 409),
)
async def resume_recurring_payment(
    writer: Writer,
    service: Service,
    payment_id: UUID,
    body: RecurringPaymentResume | None = None,
) -> RecurringPayment:
    return _payment(await service.resume(writer, payment_id, body or RecurringPaymentResume()))


@router.delete(
    "/recurring-payments/{payment_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    tags=["Регулярные платежи"],
    summary="Прекратить регулярный платёж",
    description=(
        "История сохраняется, неоплаченные периоды со сроком позже сегодня и их напоминания "
        "удаляются. Неоплаченный период со сроком сегодня и просроченные остаются: "
        "их всё ещё нужно оплатить. Уже прекращённый - 409 `payment_stopped`. "
        "Только администратор."
    ),
    responses=error_responses(400, 401, 403, 404, 409),
)
async def stop_recurring_payment(writer: Writer, service: Service, payment_id: UUID) -> None:
    await service.stop(writer, payment_id)


@router.get(
    "/payment-occurrences",
    tags=["Периоды оплаты"],
    summary="Список периодов оплаты",
    description="Оплаченные, неоплаченные и просроченные периоды; сортировка по сроку.",
    responses=error_responses(400, 401),
)
async def list_payment_occurrences(
    _: Anyone,
    service: Service,
    request: Request,
    query: Annotated[PaymentOccurrenceQuery, Query()],
) -> Page[PaymentOccurrence]:
    rows, total = await service.list_occurrences(query)
    return Page(items=await _occurrences(request, rows), total=total)


@router.get(
    "/payment-occurrences/{occurrence_id}",
    tags=["Периоды оплаты"],
    summary="Период оплаты",
    description="Срок, сумма, отметка оплаты и время последнего напоминания.",
    responses=error_responses(400, 401, 404),
)
async def get_payment_occurrence(
    _: Anyone, service: Service, request: Request, occurrence_id: UUID
) -> PaymentOccurrence:
    row = await service.get_occurrence(occurrence_id)
    return (await _occurrences(request, [row]))[0]


@router.patch(
    "/payment-occurrences/{occurrence_id}",
    tags=["Периоды оплаты"],
    summary="Отметить, исправить или отменить оплату",
    description=(
        "paid=true отмечает оплату или исправляет фактическую дату, paid=false отменяет "
        "отметку, очищает дату и удаляет чек. Срок периода не меняется."
    ),
    responses=error_responses(400, 401, 404),
)
async def update_payment_occurrence(
    principal: Anyone,
    service: Service,
    request: Request,
    occurrence_id: UUID,
    body: PaymentOccurrenceUpdate,
) -> PaymentOccurrence:
    row = await service.update_occurrence(principal, occurrence_id, body)
    return (await _occurrences(request, [row]))[0]


_RECEIPT_ERRORS = error_responses(400, 401, 404, 409, 503)


@router.put(
    "/payment-occurrences/{occurrence_id}/receipt",
    tags=["Периоды оплаты"],
    summary="Приложить чек оплаты",
    description=(
        "Файл в поле `file` (multipart): PDF, JPEG, PNG или WebP до 10 МБ, тип определяется "
        "по содержимому. Только к оплаченному периоду (иначе 409 `occurrence_not_paid`); "
        "новый чек заменяет прежний. Без хранилища - 409 `receipts_disabled`, хранилище "
        "недоступно - 503 `storage_unavailable`. Все роли."
    ),
    responses=_RECEIPT_ERRORS,
)
async def attach_receipt(
    *,
    principal: Anyone,
    receipts: Receipts,
    service: Service,
    request: Request,
    occurrence_id: UUID,
    file: Annotated[UploadFile, File(description="Чек: PDF, JPEG, PNG или WebP до 10 МБ")],
) -> PaymentOccurrence:
    # на байт больше предела: так видно, что файл слишком большой, без чтения целиком
    data = await file.read(RECEIPT_MAX_BYTES + 1)
    await receipts.attach(principal, occurrence_id, file.filename, data)
    row = await service.get_occurrence(occurrence_id)
    return (await _occurrences(request, [row]))[0]


@router.get(
    "/payment-occurrences/{occurrence_id}/receipt",
    tags=["Периоды оплаты"],
    summary="Файл чека оплаты",
    description="Отдаёт файл с его типом и именем; без чека - 404. Все роли.",
    response_class=Response,
    responses={
        200: {
            "description": "Файл чека",
            "content": {
                media: {"schema": {"type": "string", "format": "binary"}}
                for media in ("application/pdf", "image/jpeg", "image/png", "image/webp")
            },
        },
        **_RECEIPT_ERRORS,
    },
)
async def get_receipt(_: Anyone, receipts: Receipts, occurrence_id: UUID) -> Response:
    found = await receipts.read(occurrence_id)
    name = found.receipt.file_name
    ascii_name = name.encode("ascii", "replace").decode().replace('"', "_").replace("?", "_")
    return Response(
        found.data,
        media_type=found.receipt.content_type,
        headers={
            "Content-Disposition": (
                f"inline; filename=\"{ascii_name}\"; filename*=UTF-8''{quote(name)}"
            ),
            "X-Content-Type-Options": "nosniff",
            "Cache-Control": "private, no-store",
        },
    )


@router.delete(
    "/payment-occurrences/{occurrence_id}/receipt",
    tags=["Периоды оплаты"],
    summary="Удалить чек оплаты",
    description="Без чека - 404. Все роли.",
    status_code=status.HTTP_204_NO_CONTENT,
    responses=error_responses(400, 401, 404, 409),
)
async def delete_receipt(principal: Anyone, receipts: Receipts, occurrence_id: UUID) -> None:
    await receipts.delete(principal, occurrence_id)


@router.get(
    "/payments/summary",
    tags=["Итоги"],
    summary="Итоги по валютам",
    description="Суммы периодов со сроком в диапазоне, отдельно по RUB, USD и EUR.",
    responses=error_responses(400, 401),
)
async def get_payments_summary(
    _: Anyone, service: Service, query: Annotated[SummaryQuery, Query()]
) -> PaymentsSummary:
    totals, months = await service.summary(query)
    return PaymentsSummary(
        from_=query.from_,
        to=query.to,
        department_id=query.department_id,
        as_of=query.as_of,
        months=None
        if months is None
        else [MonthTotals(month=month, currencies=_totals(items)) for month, items in months],
        currencies=_totals(totals),
    )


@router.get(
    "/payments/forecast",
    tags=["Итоги"],
    summary="Плановые периоды",
    description=(
        "Будущие периоды действующих платежей по расписанию, которых ещё нет в базе: "
        "для календаря и бюджета. Ничего не записывает. Диапазон не больше двух лет."
    ),
    responses=error_responses(400, 401),
)
async def get_payments_forecast(
    _: Anyone, service: Service, query: Annotated[ForecastQuery, Query()]
) -> Page[PlannedOccurrence]:
    rows, total = await service.forecast(query)
    return Page(items=[_planned(row) for row in rows], total=total)
