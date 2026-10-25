"""Источник "сегодня" для правил сроков: только через `Clock`, не через `datetime.now()`."""

from datetime import UTC, date, datetime
from typing import Protocol
from zoneinfo import ZoneInfo

from core.config import Settings


class Clock(Protocol):
    def now(self) -> datetime: ...

    def today(self) -> date: ...


class SystemClock:
    """Текущее время; "сегодня" - дата в часовом поясе системы."""

    def __init__(self, time_zone: ZoneInfo) -> None:
        self._time_zone = time_zone

    def now(self) -> datetime:
        return datetime.now(UTC)

    def today(self) -> date:
        return self.now().astimezone(self._time_zone).date()


class FixedClock:
    """Подменённое "сегодня" для демо и тестов; время идёт как обычно."""

    def __init__(self, today: date) -> None:
        self._today = today

    def now(self) -> datetime:
        return datetime.now(UTC)

    def today(self) -> date:
        return self._today


def clock_from_settings(settings: Settings) -> Clock:
    if settings.clock_today is not None:
        return FixedClock(settings.clock_today)
    return SystemClock(settings.time_zone)
