"""Настройки процессов backend из переменных окружения."""

import re
from datetime import date
from functools import lru_cache
from pathlib import Path
from typing import Literal
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from pydantic import Field, SecretStr, ValidationError, ValidationInfo, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

from core.messages import validation_message

ENV_FILE = Path(__file__).resolve().parent.parent / ".env"


class ConfigError(Exception):
    """Конфигурация не прошла проверку; текст называет переменные, но не их значения."""


class Settings(BaseSettings):
    model_config = SettingsConfigDict(extra="ignore", env_file_encoding="utf-8")

    database_url: SecretStr
    tz: str
    app_env: Literal["development", "test", "production"] = "development"
    clock_today: date | None = None
    # Вход без Aéza с общим паролем (apps/users/dev_aeza.py); читает только api.
    dev_login_password: SecretStr | None = None
    log_level: Literal["debug", "info", "warning", "error"] = "info"
    database_pool_size: int = Field(default=10, ge=1)
    shutdown_timeout: float = Field(default=15.0, gt=0)
    # В контейнере api слушает все интерфейсы; наружу его публикует только Caddy.
    http_host: str = "0.0.0.0"  # noqa: S104
    http_port: int = Field(default=8000, ge=1, le=65535)
    # /healthz и /metrics процесса worker; наружу не публикуется.
    worker_http_port: int = Field(default=9100, ge=1, le=65535)

    @field_validator("database_url")
    @classmethod
    def _asyncpg_url(cls, value: SecretStr) -> SecretStr:
        if not value.get_secret_value().startswith("postgresql+asyncpg://"):
            raise ValueError("ожидается адрес вида postgresql+asyncpg://")
        return value

    @field_validator("tz")
    @classmethod
    def _known_time_zone(cls, value: str) -> str:
        try:
            ZoneInfo(value)
        except (ZoneInfoNotFoundError, ValueError):
            raise ValueError("неизвестный часовой пояс IANA") from None
        return value

    @field_validator("clock_today")
    @classmethod
    def _no_fake_today_in_production(cls, value: date | None, info: ValidationInfo) -> date | None:
        if value is not None and info.data.get("app_env") == "production":
            raise ValueError("подмена даты запрещена при APP_ENV=production")
        return value

    @field_validator("dev_login_password", mode="before")
    @classmethod
    def _empty_password_is_unset(cls, value: object) -> object:
        return None if value == "" else value

    @field_validator("dev_login_password")
    @classmethod
    def _no_dev_login_in_production(
        cls, value: SecretStr | None, info: ValidationInfo
    ) -> SecretStr | None:
        if value is not None and info.data.get("app_env") == "production":
            raise ValueError("вход для разработки запрещён при APP_ENV=production")
        return value

    @property
    def time_zone(self) -> ZoneInfo:
        return ZoneInfo(self.tz)


EMAIL_PATTERN = r"^[^@\s]+@[^@\s]+\.[^@\s]+$"


def _email(value: str) -> str:
    email = value.strip().lower()
    if not re.fullmatch(EMAIL_PATTERN, email):
        raise ValueError("ожидается email")
    return email


class IdentitySettings(BaseSettings):
    """Вход через API Aéza и администраторы из настроек (ADR-014): их читает только процесс api."""

    model_config = SettingsConfigDict(extra="ignore", env_file_encoding="utf-8")

    aeza_api_url: str = Field(default="https://my.aeza.ru/api", description="Адрес API Aéza")
    admin_emails: str = Field(description="Email аккаунтов Aéza администраторов через запятую")
    session_ttl_hours: int = Field(default=12, ge=1, le=720)

    @field_validator("aeza_api_url")
    @classmethod
    def _http_url(cls, value: str) -> str:
        if not value.startswith(("http://", "https://")):
            raise ValueError("ожидается адрес вида http(s)://")
        return value.rstrip("/")

    @field_validator("admin_emails")
    @classmethod
    def _emails(cls, value: str) -> str:
        emails = [_email(item) for item in value.split(",") if item.strip()]
        if not emails:
            raise ValueError("нужен хотя бы один email")
        return ",".join(emails)

    @property
    def admin_email_list(self) -> tuple[str, ...]:
        return tuple(self.admin_emails.split(","))


class SeedSettings(BaseSettings):
    """Участник для демо, которого добавляет команда тестовых данных."""

    model_config = SettingsConfigDict(extra="ignore", env_file_encoding="utf-8")

    demo_user_email: str | None = Field(default=None, description="Email аккаунта Aéza")

    @field_validator("demo_user_email", mode="before")
    @classmethod
    def _optional_email(cls, value: object) -> object:
        if value is None or value == "":
            return None
        return _email(str(value))


class ReminderSettings(BaseSettings):
    """Telegram и окно напоминаний: читают api и worker."""

    model_config = SettingsConfigDict(extra="ignore", env_file_encoding="utf-8")

    telegram_bot_token: SecretStr | None = None
    telegram_chat_id: str | None = Field(default=None, description="Общий чат бухгалтерии")
    # В адресе прокси может быть пароль.
    telegram_proxy_url: SecretStr | None = None
    reminder_days_before: int = Field(default=3, ge=0, le=30)
    # тема супергруппы общего чата: сообщения идут в неё, а не в "Общее"
    telegram_thread_id: int | None = None
    # адрес панели для кнопки "Открыть в панели"; без него кнопки-ссылки нет
    public_url: str | None = None

    @field_validator(
        "telegram_bot_token",
        "telegram_chat_id",
        "telegram_proxy_url",
        "telegram_thread_id",
        "public_url",
        mode="before",
    )
    @classmethod
    def _empty_is_unset(cls, value: object) -> object:
        return None if value == "" else value

    @field_validator("telegram_chat_id")
    @classmethod
    def _chat_needs_token(cls, value: str | None, info: ValidationInfo) -> str | None:
        if value is not None and info.data.get("telegram_bot_token") is None:
            raise ValueError("общий чат задан без TELEGRAM_BOT_TOKEN")
        return value

    @field_validator("public_url")
    @classmethod
    def _panel_url(cls, value: str | None) -> str | None:
        if value is not None and not value.startswith(("http://", "https://")):
            raise ValueError("ожидается адрес вида http(s)://")
        return None if value is None else value.rstrip("/")

    @property
    def group_chat_enabled(self) -> bool:
        return self.telegram_chat_id is not None


class IntegrationSettings(BaseSettings):
    """Адаптеры интеграционных событий (ADR-011): читают api и worker."""

    model_config = SettingsConfigDict(extra="ignore", env_file_encoding="utf-8")

    webhook_url: str | None = None
    webhook_secret: SecretStr | None = None
    kafka_brokers: str | None = Field(default=None, description="host:port через запятую")
    kafka_topic: str = "invoice-keeper.events"

    @field_validator("webhook_url", "webhook_secret", "kafka_brokers", mode="before")
    @classmethod
    def _empty_is_unset(cls, value: object) -> object:
        return None if value == "" else value

    @field_validator("webhook_url")
    @classmethod
    def _http_url(cls, value: str | None) -> str | None:
        if value is not None and not value.startswith(("http://", "https://")):
            raise ValueError("ожидается адрес вида http(s)://")
        return value

    @field_validator("webhook_secret")
    @classmethod
    def _secret_with_url(cls, value: SecretStr | None, info: ValidationInfo) -> SecretStr | None:
        if info.data.get("webhook_url") is not None and value is None:
            raise ValueError("WEBHOOK_URL задан без WEBHOOK_SECRET")
        return value

    @property
    def targets(self) -> tuple[str, ...]:
        """Включённые адаптеры: у каждого задан адрес."""
        enabled = []
        if self.webhook_url is not None:
            enabled.append("webhook")
        if self.kafka_brokers is not None:
            enabled.append("kafka")
        return tuple(enabled)


def load_settings(env_file: Path | None = ENV_FILE) -> Settings:
    """Читает настройки из окружения и `.env`; ошибки превращает в `ConfigError`."""
    try:
        return Settings(_env_file=env_file)
    except ValidationError as error:
        raise ConfigError(_describe(error)) from None


def load_identity_settings(env_file: Path | None = ENV_FILE) -> IdentitySettings:
    try:
        return IdentitySettings(_env_file=env_file)
    except ValidationError as error:
        raise ConfigError(_describe(error)) from None


def _describe(error: ValidationError) -> str:
    # Значения переменных не выводим: среди них секреты.
    problems = []
    for item in error.errors(include_input=False, include_url=False):
        name = str(item["loc"][0]).upper() if item["loc"] else "?"
        reason = "не задана" if item["type"] == "missing" else validation_message(item)
        problems.append(f"{name}: {reason}")
    return "Неверная конфигурация. " + "; ".join(problems)


@lru_cache
def get_settings() -> Settings:
    return load_settings()


def load_seed_settings(env_file: Path | None = ENV_FILE) -> SeedSettings:
    try:
        return SeedSettings(_env_file=env_file)
    except ValidationError as error:
        raise ConfigError(_describe(error)) from None


def load_reminder_settings(env_file: Path | None = ENV_FILE) -> ReminderSettings:
    try:
        return ReminderSettings(_env_file=env_file)
    except ValidationError as error:
        raise ConfigError(_describe(error)) from None


def load_integration_settings(env_file: Path | None = ENV_FILE) -> IntegrationSettings:
    try:
        return IntegrationSettings(_env_file=env_file)
    except ValidationError as error:
        raise ConfigError(_describe(error)) from None
