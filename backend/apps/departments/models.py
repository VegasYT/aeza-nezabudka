"""Справочник отделов (ADR-012)."""

import uuid
from datetime import datetime

from sqlalchemy import DateTime, Index, String, column, func
from sqlalchemy.orm import Mapped, mapped_column

from core.db import Base


class Department(Base):
    __tablename__ = "departments"
    # "Офис" и "офис" - один отдел
    __table_args__ = (Index("uq_departments_name_lower", func.lower(column("name")), unique=True),)

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    name: Mapped[str] = mapped_column(String(100))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
