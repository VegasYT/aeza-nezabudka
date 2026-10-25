"""События для панели в реальном времени (ADR-016): `pg_notify` в транзакции изменения,
процесс api слушает канал и раздаёт события открытым потокам SSE."""

import asyncio
import json
from collections.abc import Iterator
from contextlib import contextmanager
from dataclasses import asdict, dataclass
from typing import Any, Literal

import asyncpg
import structlog
from sqlalchemy import func, select
from sqlalchemy.engine import make_url
from sqlalchemy.ext.asyncio import AsyncSession

from core.metrics import LIVE_CLIENTS

log = structlog.get_logger(__name__)

CHANNEL = "live_events"
QUEUE_SIZE = 256
RECONNECT_MAX_SECONDS = 30.0
# запас до предела pg_notify в 8000 байт
NAME_LIMIT = 200

Audience = Literal["all", "admins", "member"]


@dataclass(frozen=True)
class LiveEvent:
    type: str
    audience: Audience
    entity_type: str | None = None
    entity_id: str | None = None
    entity_name: str | None = None
    actor_login: str | None = None
    # адресат видит событие при любой аудитории
    member_id: str | None = None


RESYNC = LiveEvent("resync", "all")


async def publish(session: AsyncSession, event: LiveEvent) -> None:
    """Подписчики получат событие после коммита транзакции сессии; откат его отменяет."""
    if event.entity_name is not None:
        event = LiveEvent(**{**asdict(event), "entity_name": event.entity_name[:NAME_LIMIT]})
    payload = json.dumps(asdict(event), ensure_ascii=False)
    with session.no_autoflush:
        await session.execute(select(func.pg_notify(CHANNEL, payload)))


class LiveBroker:
    """Держит LISTEN в отдельном соединении и раздаёт события очередям открытых потоков."""

    def __init__(self, database_url: str) -> None:
        url = make_url(database_url).set(drivername="postgresql")
        self._dsn = url.render_as_string(hide_password=False)
        self._queues: set[asyncio.Queue[LiveEvent]] = set()

    @contextmanager
    def subscribe(self) -> Iterator[asyncio.Queue[LiveEvent]]:
        queue: asyncio.Queue[LiveEvent] = asyncio.Queue(QUEUE_SIZE)
        self._queues.add(queue)
        LIVE_CLIENTS.inc()
        try:
            yield queue
        finally:
            self._queues.discard(queue)
            LIVE_CLIENTS.dec()

    def dispatch(self, event: LiveEvent) -> None:
        for queue in self._queues:
            try:
                queue.put_nowait(event)
            except asyncio.QueueFull:
                # поток не успевает читать: вместо пропущенных событий клиент перечитает данные
                while not queue.empty():
                    queue.get_nowait()
                queue.put_nowait(RESYNC)

    async def run(self) -> None:
        """Слушает канал до отмены задачи; после обрыва переподключается."""
        delay = 1.0
        while True:
            try:
                connection = await asyncpg.connect(self._dsn)
            except Exception as error:
                log.warning("live_connect_failed", error=type(error).__name__, retry_in=delay)
                await asyncio.sleep(delay)
                delay = min(delay * 2, RECONNECT_MAX_SECONDS)
                continue
            delay = 1.0
            try:
                await self._listen(connection)
            finally:
                connection.terminate()

    async def _listen(self, connection: Any) -> None:
        closed = asyncio.Event()
        connection.add_termination_listener(lambda _: closed.set())
        await connection.add_listener(CHANNEL, self._on_notify)
        # события, пока соединения не было, потеряны: открытые потоки перечитают данные
        self.dispatch(RESYNC)
        log.info("live_listening")
        await closed.wait()
        log.warning("live_connection_lost")

    def _on_notify(self, _connection: Any, _pid: int, _channel: str, payload: str) -> None:
        try:
            event = LiveEvent(**json.loads(payload))
        except (ValueError, TypeError):
            log.warning("live_bad_payload")
            return
        self.dispatch(event)
