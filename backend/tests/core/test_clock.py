from datetime import UTC, date, datetime
from zoneinfo import ZoneInfo

import pytest
from pydantic import SecretStr

from core.clock import SystemClock, clock_from_settings
from core.config import Settings


class _FrozenSystemClock(SystemClock):
    def __init__(self, time_zone: ZoneInfo, moment: datetime) -> None:
        super().__init__(time_zone)
        self._moment = moment

    def now(self) -> datetime:
        return self._moment


def _settings(**overrides: object) -> Settings:
    values: dict[str, object] = {
        "database_url": SecretStr("postgresql+asyncpg://app:pw@localhost/app"),
        "tz": "Europe/Moscow",
    }
    values.update(overrides)
    return Settings.model_validate(values)


@pytest.mark.parametrize(
    ("moment_utc", "expected"),
    [
        (datetime(2026, 10, 23, 20, 59, tzinfo=UTC), date(2026, 10, 23)),
        (datetime(2026, 10, 23, 22, 30, tzinfo=UTC), date(2026, 10, 24)),
    ],
)
def test_today_follows_system_time_zone(moment_utc: datetime, expected: date) -> None:
    clock = _FrozenSystemClock(ZoneInfo("Europe/Moscow"), moment_utc)

    assert clock.today() == expected


def test_fake_today_replaces_system_date() -> None:
    clock = clock_from_settings(_settings(clock_today=date(2026, 11, 30)))

    assert clock.today() == date(2026, 11, 30)
