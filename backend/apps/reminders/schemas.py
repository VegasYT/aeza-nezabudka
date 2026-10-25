"""Схемы личных и групповых чатов Telegram (ADR-010)."""

from datetime import datetime
from uuid import UUID

from pydantic import ConfigDict, Field, model_validator

from core.schemas import ApiModel, InputModel


class TelegramStatus(ApiModel):
    model_config = ConfigDict(
        json_schema_extra={
            "examples": [
                {
                    "linked": True,
                    "telegramUsername": "ivanova_buh",
                    "personalEnabled": True,
                    "blocked": False,
                    "groupChatConfigured": True,
                    "departmentIds": None,
                    "telegramName": "Ирина",
                    "botConfigured": True,
                }
            ]
        }
    )

    linked: bool = Field(description="Привязан ли личный чат", examples=[True])
    telegram_username: str | None = Field(examples=["ivanova_buh"])
    personal_enabled: bool = Field(description="Присылать ли напоминания лично", examples=[True])
    blocked: bool = Field(description="Пользователь заблокировал бота", examples=[False])
    group_chat_configured: bool = Field(
        description="Есть ли общий чат из настроек или подключённая группа", examples=[True]
    )
    department_ids: list[UUID] | None = Field(
        description="Отделы, по платежам которых приходят личные напоминания; null - все платежи"
    )
    telegram_name: str | None = Field(description="Имя в Telegram", examples=["Ирина"])
    bot_configured: bool = Field(
        description="Настроен ли бот в системе; false - привязка недоступна", examples=[True]
    )


class TelegramLink(ApiModel):
    url: str = Field(
        description="Ссылка на бота с одноразовым кодом",
        examples=["https://t.me/invoice_keeper_bot?start=Zx81kQ"],
    )
    expires_at: datetime = Field(description="Когда ссылка перестанет действовать")


class TelegramSettingsUpdate(InputModel):
    """Меняются только переданные поля; хотя бы одно обязательно."""

    model_config = ConfigDict(
        json_schema_extra={"examples": [{"personalEnabled": True, "departmentIds": None}]}
    )

    personal_enabled: bool | None = None
    department_ids: list[UUID] | None = Field(
        default=None,
        min_length=1,
        max_length=100,
        description="null - все платежи, список - только платежи этих отделов",
    )

    @model_validator(mode="after")
    def _something_changes(self) -> "TelegramSettingsUpdate":
        if not self.model_fields_set:
            raise ValueError("нужно поле personalEnabled или departmentIds")
        if "personal_enabled" in self.model_fields_set and self.personal_enabled is None:
            raise ValueError("personalEnabled не может быть null")
        return self


class GroupChat(ApiModel):
    """Подключение группы: без темы или к одной теме супергруппы."""

    id: UUID
    title: str = Field(description="Название группы в Telegram", examples=["Бухгалтерия"])
    thread_id: int | None = Field(
        description="Тема супергруппы; null - сообщения без темы", examples=[7]
    )
    topic_name: str | None = Field(description="Название темы", examples=["Аренда"])
    department_ids: list[UUID] | None = Field(
        description="Отделы, по платежам которых приходят напоминания; null - все платежи"
    )
    blocked: bool = Field(
        description="Бота удалили из группы: напоминания не идут до повторного подключения",
        examples=[False],
    )
    linked_at: datetime = Field(description="Когда группа подключена")


class GroupChatUpdate(InputModel):
    model_config = ConfigDict(json_schema_extra={"examples": [{"departmentIds": None}]})

    department_ids: list[UUID] | None = Field(
        min_length=1,
        max_length=100,
        description="null - все платежи, список - только платежи этих отделов",
    )


class GroupChatLink(ApiModel):
    url: str = Field(
        description="Добавить бота в группу: сообщения пойдут без темы",
        examples=["https://t.me/invoice_keeper_bot?startgroup=Zx81kQ"],
    )
    command: str = Field(
        description="Отправить в теме группы, где бот уже есть: подключит эту тему",
        examples=["/start@invoice_keeper_bot Zx81kQ"],
    )
    expires_at: datetime = Field(description="Когда код перестанет действовать")
