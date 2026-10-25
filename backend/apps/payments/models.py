"""Таблицы регулярных платежей и периодов оплаты (ADR-003)."""

import uuid
from datetime import date, datetime

from sqlalchemy import (
    BigInteger,
    CheckConstraint,
    Date,
    DateTime,
    ForeignKey,
    Index,
    SmallInteger,
    String,
    UniqueConstraint,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column

from core.db import Base

CURRENCY_CHECK = "currency in ('RUB', 'USD', 'EUR')"


class RecurringPayment(Base):
    __tablename__ = "recurring_payments"
    __table_args__ = (
        CheckConstraint("amount_minor > 0", name="amount_positive"),
        CheckConstraint(CURRENCY_CHECK, name="currency_known"),
        CheckConstraint("period in ('day', 'week', 'month', 'year')", name="period_known"),
        CheckConstraint("period_count between 1 and 366", name="period_count_range"),
        CheckConstraint("occurrence_limit between 1 and 1000", name="occurrence_limit_range"),
        CheckConstraint("anchor_day between 1 and 31", name="anchor_day_range"),
        CheckConstraint("schedule_from_seq >= 0", name="from_seq_non_negative"),
    )

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    name: Mapped[str] = mapped_column(String(200))
    amount_minor: Mapped[int] = mapped_column(BigInteger)
    currency: Mapped[str] = mapped_column(String(3))
    period: Mapped[str] = mapped_column(String(16))
    # каждые period_count единиц period: month и 3 - раз в квартал
    period_count: Mapped[int] = mapped_column(SmallInteger, server_default="1")
    # сколько раз оплатить; None - бессрочно
    occurrence_limit: Mapped[int | None] = mapped_column(SmallInteger)
    anchor_day: Mapped[int] = mapped_column(SmallInteger)
    schedule_first_due_date: Mapped[date] = mapped_column(Date)
    schedule_from_seq: Mapped[int]
    # Удаление отдела оставляет платёж без отдела (ADR-012).
    department_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("departments.id", ondelete="SET NULL")
    )
    stopped_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_by_id: Mapped[uuid.UUID]
    created_by_login: Mapped[str] = mapped_column(String(255))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )


class PaymentOccurrence(Base):
    __tablename__ = "payment_occurrences"
    __table_args__ = (
        UniqueConstraint("recurring_payment_id", "seq"),
        CheckConstraint("seq >= 0", name="seq_non_negative"),
        CheckConstraint("amount_minor > 0", name="amount_positive"),
        CheckConstraint(CURRENCY_CHECK, name="currency_known"),
        CheckConstraint("(paid_on is null) = (paid_by_login is null)", name="paid_with_author"),
        Index("ix_payment_occurrences_due_date", "due_date"),
    )

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    recurring_payment_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("recurring_payments.id"))
    seq: Mapped[int]
    due_date: Mapped[date] = mapped_column(Date)
    amount_minor: Mapped[int] = mapped_column(BigInteger)
    currency: Mapped[str] = mapped_column(String(3))
    paid_on: Mapped[date | None] = mapped_column(Date)
    paid_by_id: Mapped[uuid.UUID | None]
    paid_by_login: Mapped[str | None] = mapped_column(String(255))
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )
