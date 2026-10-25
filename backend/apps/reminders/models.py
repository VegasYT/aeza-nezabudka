"""Очередь напоминаний (outbox, ADR-004), личные и групповые чаты Telegram (ADR-010)."""

import uuid
from datetime import datetime

from sqlalchemy import (
    BigInteger,
    CheckConstraint,
    DateTime,
    ForeignKey,
    Index,
    SmallInteger,
    String,
    Text,
    UniqueConstraint,
    func,
    text,
)
from sqlalchemy.orm import Mapped, mapped_column

from core.db import Base

GROUP_RECIPIENT = "group"
# получатель подключённого группового чата: "chat:<id>"
CHAT_RECIPIENT_PREFIX = "chat:"
TELEGRAM_CHANNEL = "telegram"
PERSONAL_PURPOSE = "personal"
GROUP_PURPOSE = "group"


class Notification(Base):
    __tablename__ = "notifications"
    __table_args__ = (
        UniqueConstraint("occurrence_id", "kind", "channel", "recipient"),
        CheckConstraint("kind in ('due_soon', 'overdue', 'created')", name="kind_known"),
        CheckConstraint("state in ('pending', 'sent', 'cancelled', 'failed')", name="state_known"),
        CheckConstraint("attempts >= 0", name="attempts_non_negative"),
        Index(
            "ix_notifications_pending",
            "next_attempt_at",
            postgresql_where=text("state = 'pending'"),
        ),
    )

    # Строки вставляет insert ... select, поэтому идентификатор и время задаёт база.
    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, server_default=func.gen_random_uuid())
    occurrence_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("payment_occurrences.id", ondelete="CASCADE")
    )
    kind: Mapped[str] = mapped_column(String(16))
    channel: Mapped[str] = mapped_column(String(16))
    # "group" - общий чат, "chat:<id>" - подключённый групповой, иначе id пользователя.
    recipient: Mapped[str] = mapped_column(String(64))
    state: Mapped[str] = mapped_column(String(16), server_default="pending")
    attempts: Mapped[int] = mapped_column(server_default="0")
    next_attempt_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    last_error: Mapped[str | None] = mapped_column(Text)
    sent_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    external_id: Mapped[str | None] = mapped_column(String(64))
    # сообщение переписано в итог (оплачено, платёж прекращён) - больше не правится
    closed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class TelegramLink(Base):
    """Личный чат пользователя с ботом: только для доставки, прав не даёт."""

    __tablename__ = "telegram_links"

    # id участника белого списка; внешнего ключа нет: привязку удаляет сервис участников.
    user_id: Mapped[uuid.UUID] = mapped_column(primary_key=True)
    login: Mapped[str] = mapped_column(String(255))
    chat_id: Mapped[int] = mapped_column(BigInteger, unique=True)
    telegram_username: Mapped[str | None] = mapped_column(String(64))
    # имя (first_name) в Telegram: у многих нет username
    telegram_name: Mapped[str | None] = mapped_column(String(64))
    personal_enabled: Mapped[bool] = mapped_column(server_default=text("true"))
    # участника отключил администратор: напоминания не идут, привязка сохраняется
    member_disabled: Mapped[bool] = mapped_column(server_default=text("false"))
    # false - только платежи отделов из telegram_link_departments
    all_departments: Mapped[bool] = mapped_column(server_default=text("true"))
    linked_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    blocked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class TelegramLinkCode(Base):
    """Одноразовый код ссылки привязки; хранится только его хеш."""

    __tablename__ = "telegram_link_codes"
    __table_args__ = (
        Index("ix_telegram_link_codes_user_id", "user_id"),
        CheckConstraint("purpose in ('personal', 'group')", name="purpose_known"),
    )

    code_hash: Mapped[str] = mapped_column(String(64), primary_key=True)
    # для группового чата - администратор, создавший код
    user_id: Mapped[uuid.UUID]
    login: Mapped[str] = mapped_column(String(255))
    purpose: Mapped[str] = mapped_column(String(16), server_default=PERSONAL_PURPOSE)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    used_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    # в группе с темами код пришёл в "Общее": бот спросил, куда писать; повтор там подключает его
    general_asked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class TelegramChat(Base):
    """Групповой чат, подключённый администратором; общий чат из `.env` здесь не хранится."""

    __tablename__ = "telegram_chats"
    # одна группа подключается по разу на тему; "без темы" тоже один раз
    __table_args__ = (UniqueConstraint("chat_id", "thread_id", postgresql_nulls_not_distinct=True),)

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    chat_id: Mapped[int] = mapped_column(BigInteger)
    # тема супергруппы, из которой подключили бота; None - без темы
    thread_id: Mapped[int | None] = mapped_column(BigInteger)
    topic_name: Mapped[str | None] = mapped_column(String(128))
    title: Mapped[str] = mapped_column(String(255))
    # false - только платежи отделов из telegram_chat_departments
    all_departments: Mapped[bool] = mapped_column(server_default=text("true"))
    linked_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    blocked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class TelegramChatDepartment(Base):
    """Фильтр отделов чата; удалённый отдел пропадает из фильтра вместе со строкой."""

    __tablename__ = "telegram_chat_departments"

    chat_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("telegram_chats.id", ondelete="CASCADE"), primary_key=True
    )
    department_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("departments.id", ondelete="CASCADE"), primary_key=True
    )


class TelegramLinkDepartment(Base):
    """Фильтр отделов личных напоминаний; удаляется вместе с привязкой или отделом."""

    __tablename__ = "telegram_link_departments"

    user_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("telegram_links.user_id", ondelete="CASCADE"), primary_key=True
    )
    department_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("departments.id", ondelete="CASCADE"), primary_key=True
    )


class ReminderDefaults(Base):
    """Общее окно напоминаний из панели; пока строки нет, действует REMINDER_DAYS_BEFORE."""

    __tablename__ = "reminder_defaults"
    __table_args__ = (
        CheckConstraint("id = 1", name="single_row"),
        CheckConstraint("days_before between 0 and 30", name="days_before_range"),
    )

    id: Mapped[int] = mapped_column(SmallInteger, primary_key=True, default=1)
    days_before: Mapped[int] = mapped_column(SmallInteger)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )
