"""Схемы входа, текущего участника и белого списка (ADR-014)."""

from datetime import datetime
from enum import StrEnum
from typing import Self
from uuid import UUID

from pydantic import ConfigDict, Field, SecretStr, model_validator

from core.auth import Role
from core.config import EMAIL_PATTERN
from core.schemas import ApiModel, InputModel

_EMAIL = Field(
    max_length=255,
    pattern=EMAIL_PATTERN,
    description="Email аккаунта Aéza",
    examples=["buh.petrova@company.ru"],
)


class MemberRole(StrEnum):
    """Роль, которую администратор может выдать через панель."""

    USER = "user"
    INTEGRATION = "integration"


class CurrentUser(ApiModel):
    id: UUID = Field(examples=["2f6c4a1e-8d3b-4c5a-9e7f-1a2b3c4d5e6f"])
    email: str = Field(examples=["buh.petrova@company.ru"])
    role: Role = Field(description="Роль: администратор, пользователь или внешняя система")


class LoginRequest(InputModel):
    model_config = ConfigDict(
        json_schema_extra={
            "examples": [{"email": "glavbuh@company.ru", "password": "пароль от аккаунта Aéza"}]
        }
    )

    email: str = _EMAIL
    password: SecretStr = Field(min_length=1, max_length=256, description="Пароль аккаунта Aéza")


class LoginChallengeResponse(ApiModel):
    """Ответ Aéza на шаг 1 как есть."""

    challenge: str = Field(description="Передайте в `POST /auth/use-challenge` или `tfa/totp`")
    requirements: list[str] = Field(
        description="Пусто - 2FA не нужна, иначе нужен код в `POST /auth/tfa/totp`",
        examples=[[]],
    )


class UseChallengeRequest(InputModel):
    challenge: str = Field(min_length=1, max_length=512)


class TotpRequest(InputModel):
    challenge: str = Field(min_length=1, max_length=512)
    code: str = Field(min_length=1, max_length=16, description="Код 2FA", examples=["123456"])


class SessionResponse(ApiModel):
    session: str = Field(description="Токен сессии для `Authorization: Bearer`")
    expires_at: datetime = Field(description="Когда сессия закончится; продления нет")


class User(ApiModel):
    """Участник белого списка."""

    id: UUID = Field(examples=["5b1d2c3e-4f5a-6b7c-8d9e-0f1a2b3c4d5e"])
    email: str = Field(examples=["buh.petrova@company.ru"])
    role: Role
    enabled: bool = Field(description="Может ли участник входить", examples=[True])
    editable: bool = Field(
        description="false - администратор из настроек: панель его не меняет и не удаляет",
        examples=[True],
    )
    linked: bool = Field(description="Участник уже входил, аккаунт Aéza привязан", examples=[True])
    created_at: datetime
    last_login_at: datetime | None
    last_seen_at: datetime | None = Field(
        description="Последний вход или запрос по X-API-KEY, с точностью до минуты"
    )


class UserCreate(InputModel):
    model_config = ConfigDict(
        json_schema_extra={"examples": [{"email": "buh.petrova@company.ru", "role": "user"}]}
    )

    email: str = _EMAIL
    role: MemberRole = MemberRole.USER


class UserUpdate(InputModel):
    model_config = ConfigDict(json_schema_extra={"examples": [{"enabled": False}]})

    role: MemberRole | None = None
    enabled: bool | None = None

    @model_validator(mode="after")
    def _something_to_change(self) -> Self:
        if self.role is None and self.enabled is None:
            raise ValueError("Укажите хотя бы одно поле")
        return self
