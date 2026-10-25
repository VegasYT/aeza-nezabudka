"""Outbox интеграционных событий и ключи идемпотентности (ADR-011)."""

import uuid
from datetime import datetime
from typing import Any

from sqlalchemy import (
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
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from core.db import Base


class IntegrationEvent(Base):
    __tablename__ = "integration_events"
    __table_args__ = (Index("ix_integration_events_created_at", "created_at"),)

    # Он же ключ идемпотентности для получателя.
    id: Mapped[uuid.UUID] = mapped_column(primary_key=True)
    type: Mapped[str] = mapped_column(String(64))
    schema_version: Mapped[int] = mapped_column(SmallInteger)
    # События по времени планировщик пытается поставить на каждом тике; запишется одно.
    dedup_key: Mapped[str | None] = mapped_column(String(128), unique=True)
    partition_key: Mapped[str] = mapped_column(String(64))
    payload: Mapped[dict[str, Any]] = mapped_column(JSONB)
    # Время записи, а не начала транзакции: по нему события одного платежа идут по порядку.
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.clock_timestamp()
    )


class IntegrationDelivery(Base):
    __tablename__ = "integration_deliveries"
    __table_args__ = (
        UniqueConstraint("event_id", "target"),
        CheckConstraint("target in ('webhook', 'kafka')", name="target_known"),
        CheckConstraint("state in ('pending', 'sent', 'failed')", name="state_known"),
        Index(
            "ix_integration_deliveries_pending",
            "next_attempt_at",
            postgresql_where=text("state = 'pending'"),
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, server_default=func.gen_random_uuid())
    event_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("integration_events.id", ondelete="CASCADE")
    )
    target: Mapped[str] = mapped_column(String(16))
    state: Mapped[str] = mapped_column(String(16), server_default="pending")
    attempts: Mapped[int] = mapped_column(server_default="0")
    next_attempt_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.clock_timestamp()
    )
    last_error: Mapped[str | None] = mapped_column(Text)
    sent_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class IdempotencyKey(Base):
    __tablename__ = "idempotency_keys"
    __table_args__ = (
        UniqueConstraint("actor_id", "key"),
        Index("ix_idempotency_keys_created_at", "created_at"),
    )

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, server_default=func.gen_random_uuid())
    actor_id: Mapped[uuid.UUID]
    key: Mapped[str] = mapped_column(String(128))
    operation: Mapped[str] = mapped_column(String(64))
    request_hash: Mapped[str] = mapped_column(String(64))
    resource_id: Mapped[uuid.UUID | None]
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
