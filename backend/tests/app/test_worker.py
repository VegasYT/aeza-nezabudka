import asyncio
from datetime import date

import pytest
from sqlalchemy.ext.asyncio import AsyncEngine, create_async_engine
from structlog.testing import capture_logs

from app.worker import PeriodicJob, build_jobs, run_jobs
from core.clock import FixedClock
from core.config import ConfigError, ReminderSettings, load_reminder_settings
from tests.app.conftest import OFFLINE_DATABASE_URL
from tests.apps.reminders.conftest import REMINDERS, FakeNotifier


async def test_stops_when_idle() -> None:
    stop = asyncio.Event()
    calls = 0

    async def quick() -> None:
        nonlocal calls
        calls += 1

    runner = asyncio.create_task(run_jobs([PeriodicJob("quick", 60, quick)], stop, 5))
    await asyncio.sleep(0.05)
    stop.set()

    await asyncio.wait_for(runner, timeout=1)
    assert calls == 1


async def test_current_work_finishes_and_no_new_work_starts() -> None:
    stop = asyncio.Event()
    started = asyncio.Event()
    starts = 0
    finished = 0

    async def slow() -> None:
        nonlocal starts, finished
        starts += 1
        started.set()
        await asyncio.sleep(0.2)
        finished += 1

    runner = asyncio.create_task(run_jobs([PeriodicJob("slow", 0, slow)], stop, 5))
    await started.wait()
    stop.set()

    await asyncio.wait_for(runner, timeout=1)
    assert (starts, finished) == (1, 1)


async def test_work_is_cancelled_after_timeout() -> None:
    stop = asyncio.Event()
    started = asyncio.Event()
    cancelled = False

    async def stuck() -> None:
        nonlocal cancelled
        started.set()
        try:
            await asyncio.sleep(30)
        except asyncio.CancelledError:
            cancelled = True
            raise

    runner = asyncio.create_task(run_jobs([PeriodicJob("stuck", 60, stuck)], stop, 0.1))
    await started.wait()
    with capture_logs() as logs:
        stop.set()
        await asyncio.wait_for(runner, timeout=1)

    assert cancelled
    assert {"event": "job_cancelled_on_shutdown", "job": "stuck", "log_level": "warning"} in logs


@pytest.mark.parametrize("failures", [1, 2])
async def test_failed_unit_does_not_stop_job(failures: int) -> None:
    stop = asyncio.Event()
    calls = 0

    async def flaky() -> None:
        nonlocal calls
        calls += 1
        if calls <= failures:
            raise RuntimeError("сбой единицы работы")
        stop.set()

    with capture_logs():
        await asyncio.wait_for(run_jobs([PeriodicJob("flaky", 0, flaky)], stop, 1), timeout=1)

    assert calls == failures + 1


def _offline_engine() -> AsyncEngine:
    # Engine не подключается, пока его не попросят о соединении.
    return create_async_engine(OFFLINE_DATABASE_URL)


def test_without_bot_token_telegram_jobs_are_off() -> None:
    disabled = ReminderSettings.model_construct(telegram_bot_token=None, telegram_chat_id=None)

    with capture_logs() as logs:
        jobs = build_jobs(_offline_engine(), FixedClock(date(2026, 10, 24)), disabled, None)

    assert [job.name for job in jobs] == ["scheduler", "integrations_cleanup", "auth_cleanup"]
    assert "telegram_disabled" in [entry["event"] for entry in logs]


def test_with_notifier_sender_runs() -> None:
    jobs = build_jobs(_offline_engine(), FixedClock(date(2026, 10, 24)), REMINDERS, FakeNotifier())

    assert [job.name for job in jobs] == [
        "scheduler",
        "integrations_cleanup",
        "auth_cleanup",
        "reminder_sender",
        "reminder_updates",
        "telegram_updates",
    ]


def test_group_chat_requires_bot_token(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("TELEGRAM_CHAT_ID", "-100")
    monkeypatch.delenv("TELEGRAM_BOT_TOKEN", raising=False)

    with pytest.raises(ConfigError, match="TELEGRAM_BOT_TOKEN"):
        load_reminder_settings(env_file=None)
