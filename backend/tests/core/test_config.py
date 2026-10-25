from datetime import date

import pytest

from core.config import (
    ConfigError,
    load_identity_settings,
    load_reminder_settings,
    load_settings,
)

VALID_URL = "postgresql+asyncpg://app:supersecret@localhost:5432/app"


@pytest.fixture(autouse=True)
def clean_env(monkeypatch: pytest.MonkeyPatch) -> None:
    for name in ("DATABASE_URL", "TZ", "APP_ENV", "CLOCK_TODAY", "LOG_LEVEL", "DEV_LOGIN_PASSWORD"):
        monkeypatch.delenv(name, raising=False)


def test_missing_database_url_is_named(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("TZ", "Europe/Moscow")

    with pytest.raises(ConfigError, match="DATABASE_URL: не задана"):
        load_settings(env_file=None)


def test_unknown_time_zone_is_named(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("DATABASE_URL", VALID_URL)
    monkeypatch.setenv("TZ", "Mars/Olympus")

    with pytest.raises(ConfigError, match="TZ: неизвестный часовой пояс"):
        load_settings(env_file=None)


def test_fake_today_forbidden_in_production(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("DATABASE_URL", VALID_URL)
    monkeypatch.setenv("TZ", "Europe/Moscow")
    monkeypatch.setenv("APP_ENV", "production")
    monkeypatch.setenv("CLOCK_TODAY", "2026-11-30")

    with pytest.raises(ConfigError, match="CLOCK_TODAY"):
        load_settings(env_file=None)


def test_fake_today_allowed_outside_production(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("DATABASE_URL", VALID_URL)
    monkeypatch.setenv("TZ", "Europe/Moscow")
    monkeypatch.setenv("CLOCK_TODAY", "2026-11-30")

    assert load_settings(env_file=None).clock_today == date(2026, 11, 30)


def test_dev_login_forbidden_in_production(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("DATABASE_URL", VALID_URL)
    monkeypatch.setenv("TZ", "Europe/Moscow")
    monkeypatch.setenv("APP_ENV", "production")
    monkeypatch.setenv("DEV_LOGIN_PASSWORD", "dev-pass")

    with pytest.raises(ConfigError, match="DEV_LOGIN_PASSWORD"):
        load_settings(env_file=None)


def test_empty_dev_login_is_unset(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("DATABASE_URL", VALID_URL)
    monkeypatch.setenv("TZ", "Europe/Moscow")
    monkeypatch.setenv("APP_ENV", "production")
    monkeypatch.setenv("DEV_LOGIN_PASSWORD", "")

    assert load_settings(env_file=None).dev_login_password is None


def test_error_does_not_reveal_secrets(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("DATABASE_URL", VALID_URL)
    monkeypatch.setenv("TZ", "Mars/Olympus")

    with pytest.raises(ConfigError) as error:
        load_settings(env_file=None)

    assert "supersecret" not in str(error.value)


IDENTITY_ENV = {"ADMIN_EMAILS": " Glavbuh@Company.ru, ,chief@company.ru "}


def test_identity_settings_name_missing_admins(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv("ADMIN_EMAILS", raising=False)

    with pytest.raises(ConfigError, match="ADMIN_EMAILS: не задана"):
        load_identity_settings(env_file=None)


def test_identity_settings_normalize_admin_emails(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("ADMIN_EMAILS", IDENTITY_ENV["ADMIN_EMAILS"])
    monkeypatch.delenv("AEZA_API_URL", raising=False)

    settings = load_identity_settings(env_file=None)

    assert settings.admin_email_list == ("glavbuh@company.ru", "chief@company.ru")
    assert settings.aeza_api_url == "https://my.aeza.ru/api"
    assert settings.session_ttl_hours == 12


def test_identity_settings_reject_bad_email(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("ADMIN_EMAILS", "glavbuh")

    with pytest.raises(ConfigError, match="ADMIN_EMAILS"):
        load_identity_settings(env_file=None)


def test_process_settings_do_not_need_identity(monkeypatch: pytest.MonkeyPatch) -> None:
    for name in IDENTITY_ENV:
        monkeypatch.delenv(name, raising=False)
    monkeypatch.setenv("DATABASE_URL", VALID_URL)
    monkeypatch.setenv("TZ", "Europe/Moscow")

    assert load_settings(env_file=None).tz == "Europe/Moscow"


def test_public_url_needs_scheme(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("PUBLIC_URL", "nezabudka.space")

    with pytest.raises(ConfigError, match="PUBLIC_URL"):
        load_reminder_settings(env_file=None)


def test_public_url_and_thread(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("PUBLIC_URL", "https://nezabudka.space/")
    monkeypatch.setenv("TELEGRAM_THREAD_ID", "7")

    settings = load_reminder_settings(env_file=None)

    assert (settings.public_url, settings.telegram_thread_id) == ("https://nezabudka.space", 7)
