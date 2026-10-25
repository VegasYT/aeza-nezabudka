from datetime import datetime
from typing import Any
from uuid import UUID

from pydantic import Field

from core.schemas import ApiModel, PageQuery


class AuditQuery(PageQuery):
    action: str | None = Field(
        default=None,
        max_length=64,
        description="Действие точно (`payment.updated`) или группа по префиксу (`auth.*`)",
        examples=["member.*"],
    )
    entity: str | None = Field(default=None, max_length=64, examples=["payment"])
    entity_id: str | None = Field(default=None, max_length=64)
    actor_login: str | None = Field(
        default=None, max_length=255, description="Кто сделал, без учёта регистра"
    )
    from_: datetime | None = Field(default=None, alias="from", description="Не раньше")
    to: datetime | None = Field(default=None, description="Не позже")


class AuditEntry(ApiModel):
    id: UUID
    at: datetime
    actor_login: str = Field(examples=["glavbuh@company.ru"])
    action: str = Field(examples=["payment.updated"])
    entity: str = Field(examples=["payment"])
    entity_id: str | None
    entity_name: str | None = Field(
        description="Название на момент действия; null у старых записей", examples=["Аренда офиса"]
    )
    details: dict[str, Any] = Field(description="Подробности, ключи в camelCase")
