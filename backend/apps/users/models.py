"""Белый список участников, свои сессии и счётчик неудачных входов (ADR-014)."""

import uuid
from datetime import datetime

from sqlalchemy import BigInteger, CheckConstraint, DateTime, ForeignKey, Index, String, func
from sqlalchemy.orm import Mapped, mapped_column

from core.db import Base


class Member(Base):
    """Аккаунт Aéza, которому разрешено входить, и его роль."""

    __tablename__ = "members"
    __table_args__ = (
        CheckConstraint("role in ('admin', 'user', 'integration')", name="role_known"),
        CheckConstraint("source in ('env', 'panel')", name="source_known"),
        CheckConstraint("email = lower(email)", name="email_lowercase"),
    )

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    email: Mapped[str] = mapped_column(String(255), unique=True)
    # Привязывается при первом входе: дальше участник находится по нему, а не по email.
    aeza_account_id: Mapped[int | None] = mapped_column(BigInteger, unique=True)
    role: Mapped[str] = mapped_column(String(16))
    source: Mapped[str] = mapped_column(String(8))
    enabled: Mapped[bool] = mapped_column(default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    last_login_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    # вход или запрос по X-API-KEY, не чаще раза в минуту
    last_seen_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class AuthSession(Base):
    """Сессия после входа; токен в базе не хранится, только его sha256."""

    __tablename__ = "sessions"
    __table_args__ = (Index("ix_sessions_expires_at", "expires_at"),)

    token_hash: Mapped[str] = mapped_column(String(64), primary_key=True)
    member_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("members.id", ondelete="CASCADE"))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))


class LoginFailure(Base):
    """Неудачный вход по одной из областей: email, IP клиента или сервер целиком."""

    __tablename__ = "login_failures"
    __table_args__ = (Index("ix_login_failures_scope_failed_at", "scope", "failed_at"),)

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    scope: Mapped[str] = mapped_column(String(320))
    failed_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
