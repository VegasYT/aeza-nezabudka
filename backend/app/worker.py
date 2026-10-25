"""Процесс worker: периодические фоновые задачи с корректной остановкой."""

import asyncio
import contextlib
import signal
import sys
import time
import uuid
from collections.abc import Awaitable, Callable, Mapping, Sequence
from dataclasses import dataclass
from uuid import UUID

import structlog
import uvicorn
from prometheus_client import CONTENT_TYPE_LATEST, generate_latest
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.ext.asyncio import AsyncEngine, AsyncSession, async_sessionmaker
from starlette.applications import Starlette
from starlette.requests import Request
from starlette.responses import JSONResponse, Response
from starlette.routing import Route

from apps.integrations.publishers import EventPublisher, build_publishers
from apps.integrations.service import EventDeliverer, cleanup
from apps.integrations.service import pending_stats as delivery_stats
from apps.payments.receipts import ReceiptsService
from apps.payments.schemas import PaymentOccurrenceUpdate
from apps.payments.service import PaymentsService, record_time_events
from apps.reminders.service import (
    AttachReceipt,
    MarkPaid,
    ReminderSender,
    ReminderUpdater,
    TelegramLinks,
    UpdatesPoller,
    enqueue,
    reminder_days,
)
from apps.reminders.service import pending_stats as reminder_stats
from apps.reminders.telegram import TelegramBot, TelegramNotifier
from apps.users.service import cleanup as auth_cleanup
from core.auth import Principal
from core.clock import Clock, clock_from_settings
from core.config import (
    ConfigError,
    IntegrationSettings,
    ReminderSettings,
    Settings,
    StorageSettings,
    load_integration_settings,
    load_reminder_settings,
    load_settings,
    load_storage_settings,
)
from core.db import create_engine, create_session_factory
from core.logging import configure_logging
from core.metrics import (
    DEPENDENCY_ERRORS,
    JOB_LAST_SUCCESS,
    JOB_RUNS,
    OUTBOX_OLDEST_AGE,
    OUTBOX_PENDING,
    PERIODS_CREATED,
)
from core.storage import ObjectStorage, S3Storage

log = structlog.get_logger(__name__)

TICK_INTERVAL_SECONDS = 60.0
SENDER_INTERVAL_SECONDS = 2.0
# Владелец блокировки сразу опрашивает снова; остальные пробуют взять её раз в секунду.
UPDATES_INTERVAL_SECONDS = 1.0
DELIVERY_INTERVAL_SECONDS = 2.0
CLEANUP_INTERVAL_SECONDS = 3600.0


@dataclass(frozen=True)
class PeriodicJob:
    """Единица работы `run_once` повторяется с паузой `interval` секунд до остановки."""

    name: str
    interval: float
    run_once: Callable[[], Awaitable[object]]
    # Освобождает ресурсы задачи после остановки, например соединение с блокировкой.
    close: Callable[[], Awaitable[None]] | None = None


async def run_jobs(
    jobs: Sequence[PeriodicJob], stop: asyncio.Event, shutdown_timeout: float
) -> None:
    """Крутит задачи до события `stop`, затем ждёт текущую работу не дольше `shutdown_timeout`."""

    async def loop(job: PeriodicJob) -> None:
        while not stop.is_set():
            # Все строки лога одного запуска связаны общим operation_id.
            with structlog.contextvars.bound_contextvars(
                operation_id=uuid.uuid4().hex, job=job.name
            ):
                await _run_once(job)
            with contextlib.suppress(TimeoutError):
                await asyncio.wait_for(stop.wait(), timeout=job.interval)

    tasks = [asyncio.create_task(loop(job), name=job.name) for job in jobs]
    await stop.wait()
    if tasks:
        _, pending = await asyncio.wait(tasks, timeout=shutdown_timeout)
        for task in pending:
            log.warning("job_cancelled_on_shutdown", job=task.get_name())
            task.cancel()
        await asyncio.gather(*pending, return_exceptions=True)
    for job in jobs:
        if job.close is not None:
            await job.close()


async def _run_once(job: PeriodicJob) -> None:
    try:
        await job.run_once()
    except Exception as error:
        JOB_RUNS.labels(job.name, "failure").inc()
        if isinstance(error, SQLAlchemyError | OSError):
            DEPENDENCY_ERRORS.labels("postgres").inc()
        log.exception("job_failed")
    else:
        JOB_RUNS.labels(job.name, "success").inc()
        JOB_LAST_SUCCESS.labels(job.name).set(time.time())


def _install_stop_signals(stop: asyncio.Event) -> None:
    loop = asyncio.get_running_loop()
    for sig in (signal.SIGTERM, signal.SIGINT):
        try:
            loop.add_signal_handler(sig, stop.set)
        except NotImplementedError:
            # На Windows цикл событий не принимает обработчики сигналов.
            signal.signal(sig, lambda *_: loop.call_soon_threadsafe(stop.set))


async def tick(
    session_factory: async_sessionmaker[AsyncSession],
    clock: Clock,
    reminders: ReminderSettings,
    event_targets: Sequence[str] = (),
) -> None:
    """Досоздаёт периоды, ставит напоминания и события по времени; повтор ничего не добавляет."""
    payments = PaymentsService(session_factory, clock)
    periods = await payments.ensure_periods()
    PERIODS_CREATED.inc(periods)
    today = clock.today()
    now = clock.now()
    async with session_factory() as session, session.begin():
        days_before = await reminder_days(session, reminders)
        queued = await enqueue(session, today, reminders)
        events = await record_time_events(session, today, days_before, event_targets, now)
        stats = {
            "notifications": await reminder_stats(session),
            "integration_deliveries": await delivery_stats(session),
        }
    await payments.report_open(days_before)
    for queue, (pending, oldest) in stats.items():
        OUTBOX_PENDING.labels(queue).set(pending)
        OUTBOX_OLDEST_AGE.labels(queue).set(
            0 if oldest is None else max((now - oldest).total_seconds(), 0)
        )
    log.info("tick_done", periods_created=periods, reminders_queued=queued, events=events)


def telegram_actions(
    payments: PaymentsService, receipts: ReceiptsService
) -> tuple[MarkPaid, AttachReceipt]:
    """Отметка кнопкой "Оплачено" и чек ответом боту идут тем же путём, что из панели:
    журнал, напоминания и события."""

    async def mark_paid(actor: Principal, occurrence_id: UUID) -> None:
        await payments.update_occurrence(
            actor, occurrence_id, PaymentOccurrenceUpdate(paid=True), source="telegram"
        )

    async def attach_receipt(
        actor: Principal, occurrence_id: UUID, file_name: str | None, data: bytes
    ) -> None:
        # чек ответом на напоминание заодно отмечает оплату, как кнопка "Оплачено"
        row = await payments.get_occurrence(occurrence_id)
        if row.occurrence.paid_on is None:
            await mark_paid(actor, occurrence_id)
        await receipts.attach(actor, occurrence_id, file_name, data, source="telegram")

    return mark_paid, attach_receipt


def build_jobs(
    engine: AsyncEngine,
    clock: Clock,
    reminders: ReminderSettings,
    bot: TelegramBot | None,
    publishers: Mapping[str, EventPublisher] | None = None,
    *,
    storage: ObjectStorage | None = None,
) -> list[PeriodicJob]:
    session_factory = create_session_factory(engine)
    targets = tuple(publishers or {})
    receipts = ReceiptsService(session_factory, clock, storage)
    jobs = [
        PeriodicJob(
            "scheduler",
            TICK_INTERVAL_SECONDS,
            lambda: tick(session_factory, clock, reminders, targets),
        ),
        PeriodicJob(
            "integrations_cleanup",
            CLEANUP_INTERVAL_SECONDS,
            lambda: cleanup(session_factory, clock),
        ),
        PeriodicJob(
            "auth_cleanup", CLEANUP_INTERVAL_SECONDS, lambda: auth_cleanup(session_factory, clock)
        ),
    ]
    if storage is not None:
        jobs.append(PeriodicJob("receipts_cleanup", CLEANUP_INTERVAL_SECONDS, receipts.cleanup))
    if publishers:
        deliverer = EventDeliverer(session_factory, clock, publishers)
        jobs.append(
            PeriodicJob(
                "event_delivery", DELIVERY_INTERVAL_SECONDS, deliverer.send_due, deliverer.close
            )
        )
    if bot is None:
        log.warning("telegram_disabled", reason="TELEGRAM_BOT_TOKEN не задан")
        return jobs
    sender = ReminderSender(session_factory, clock, bot, reminders)
    updater = ReminderUpdater(session_factory, clock, bot, reminders)
    payments = PaymentsService(
        session_factory,
        clock,
        after_change=lambda session, today, payment_ids, created: enqueue(
            session, today, reminders, payment_ids, created=created
        ),
        event_targets=targets,
    )

    mark_paid, attach_receipt = telegram_actions(payments, receipts)
    links = TelegramLinks(
        session_factory,
        clock,
        reminders,
        bot,
        mark_paid=mark_paid,
        attach_receipt=None if storage is None else attach_receipt,
    )
    poller = UpdatesPoller(engine, links, bot, bot)
    jobs.append(PeriodicJob("reminder_sender", SENDER_INTERVAL_SECONDS, sender.send_due))
    jobs.append(PeriodicJob("reminder_updates", SENDER_INTERVAL_SECONDS, updater.run_once))
    jobs.append(
        PeriodicJob("telegram_updates", UPDATES_INTERVAL_SECONDS, poller.run_once, poller.close)
    )
    return jobs


def http_app() -> Starlette:
    """`/healthz` и `/metrics` процесса worker для Docker и Prometheus."""

    async def healthz(_: Request) -> JSONResponse:
        return JSONResponse({"status": "ok"})

    async def metrics(_: Request) -> Response:
        return Response(generate_latest(), media_type=CONTENT_TYPE_LATEST)

    return Starlette(routes=[Route("/healthz", healthz), Route("/metrics", metrics)])


async def _serve_http(settings: Settings, stop: asyncio.Event) -> None:
    server = uvicorn.Server(
        uvicorn.Config(
            http_app(),
            host=settings.http_host,
            port=settings.worker_http_port,
            log_config=None,
            access_log=False,
        )
    )
    # Сигналы ловит worker сам; uvicorn ставил бы свои обработчики поверх.
    server.capture_signals = contextlib.nullcontext  # type: ignore[method-assign,assignment]
    serving = asyncio.create_task(server.serve())
    await stop.wait()
    server.should_exit = True
    await serving


async def _run(
    settings: Settings,
    reminders: ReminderSettings,
    integrations: IntegrationSettings,
    storage_settings: StorageSettings,
) -> None:
    stop = asyncio.Event()
    _install_stop_signals(stop)
    http = asyncio.create_task(_serve_http(settings, stop))
    engine = create_engine(settings)
    notifier = TelegramNotifier.from_settings(reminders)
    storage = S3Storage.from_settings(storage_settings)
    jobs = build_jobs(
        engine,
        clock_from_settings(settings),
        reminders,
        notifier,
        build_publishers(integrations),
        storage=storage,
    )
    log.info("worker_started", jobs=[job.name for job in jobs])
    try:
        await run_jobs(jobs, stop, settings.shutdown_timeout)
    finally:
        stop.set()
        await http
        if notifier is not None:
            await notifier.close()
        if storage is not None:
            await storage.close()
        await engine.dispose()
    log.info("worker_stopped")


def main() -> None:
    try:
        settings = load_settings()
        reminders = load_reminder_settings()
        integrations = load_integration_settings()
        storage = load_storage_settings()
    except ConfigError as error:
        print(error, file=sys.stderr)
        raise SystemExit(1) from None
    configure_logging("worker", settings.log_level)
    asyncio.run(_run(settings, reminders, integrations, storage))


if __name__ == "__main__":
    main()
