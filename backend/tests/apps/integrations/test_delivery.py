"""Доставка событий: webhook на локальный HTTP-приёмник, очистка старых событий."""

import hashlib
import hmac
import json
import uuid
from collections.abc import AsyncIterator
from dataclasses import dataclass, field
from datetime import UTC, date, datetime, timedelta

import pytest
from aiohttp import web
from sqlalchemy import update
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from apps.integrations.models import IntegrationDelivery, IntegrationEvent
from apps.integrations.publishers import WebhookPublisher
from apps.integrations.service import EventDeliverer, EventType, cleanup, record_event
from tests.apps.integrations.conftest import WEBHOOK_SECRET, deliveries, events

pytestmark = pytest.mark.integration


@dataclass
class Receiver:
    url: str
    statuses: list[int] = field(default_factory=list)
    received: list[tuple[bytes, dict[str, str]]] = field(default_factory=list)


@pytest.fixture
async def receiver() -> AsyncIterator[Receiver]:
    state = Receiver("")

    async def hook(request: web.Request) -> web.Response:
        state.received.append((await request.read(), dict(request.headers)))
        return web.Response(status=state.statuses.pop(0) if state.statuses else 200)

    app = web.Application()
    app.router.add_post("/hook", hook)
    runner = web.AppRunner(app)
    await runner.setup()
    site = web.TCPSite(runner, "127.0.0.1", 0)
    await site.start()
    port = site._server.sockets[0].getsockname()[1]  # type: ignore[union-attr]
    state.url = f"http://127.0.0.1:{port}/hook"
    yield state
    await runner.cleanup()


class StepClock:
    """Время двигает тест: так наступает срок повторной попытки."""

    def __init__(self) -> None:
        self.moment = datetime.now(UTC) + timedelta(seconds=5)

    def now(self) -> datetime:
        return self.moment

    def today(self) -> date:
        raise NotImplementedError


async def _record(session_factory: async_sessionmaker[AsyncSession]) -> None:
    async with session_factory() as session, session.begin():
        await record_event(
            session,
            ["webhook"],
            EventType.PAYMENT_CREATED,
            {"payment": {"name": "Аренда офиса"}, "actorLogin": "admin"},
            partition_key=uuid.uuid4(),
            occurred_at=datetime.now(UTC),
        )


def _deliverer(
    session_factory: async_sessionmaker[AsyncSession], clock: StepClock, receiver: Receiver
) -> EventDeliverer:
    publisher = WebhookPublisher(receiver.url, WEBHOOK_SECRET)
    return EventDeliverer(session_factory, clock, {"webhook": publisher})


async def test_webhook_is_signed(
    session_factory: async_sessionmaker[AsyncSession], receiver: Receiver
) -> None:
    await _record(session_factory)
    deliverer = _deliverer(session_factory, StepClock(), receiver)

    await deliverer.send_due()
    await deliverer.close()

    [(body, headers)] = receiver.received
    expected = hmac.new(WEBHOOK_SECRET.encode(), body, hashlib.sha256).hexdigest()
    assert headers["X-Signature"] == f"sha256={expected}"
    payload = json.loads(body)
    assert payload == (await events(session_factory))[0]
    assert headers["X-Event-Id"] == payload["id"]
    assert [d.state for d in await deliveries(session_factory)] == ["sent"]


async def test_webhook_retries_same_event_after_500(
    session_factory: async_sessionmaker[AsyncSession], receiver: Receiver
) -> None:
    await _record(session_factory)
    receiver.statuses.append(500)
    clock = StepClock()
    deliverer = _deliverer(session_factory, clock, receiver)

    await deliverer.send_due()
    [pending] = await deliveries(session_factory)
    assert (pending.state, pending.attempts) == ("pending", 1)
    clock.moment += timedelta(seconds=61)
    await deliverer.send_due()
    await deliverer.close()

    first, second = (json.loads(body)["id"] for body, _ in receiver.received)
    assert first == second
    assert [d.state for d in await deliveries(session_factory)] == ["sent"]


async def test_webhook_client_error_fails(
    session_factory: async_sessionmaker[AsyncSession], receiver: Receiver
) -> None:
    await _record(session_factory)
    receiver.statuses.append(400)
    deliverer = _deliverer(session_factory, StepClock(), receiver)

    await deliverer.send_due()
    await deliverer.close()

    [failed] = await deliveries(session_factory)
    assert failed.state == "failed"
    assert failed.last_error is not None
    assert failed.last_error.startswith("HTTP 400")


async def test_cleanup_removes_old_delivered_events(
    session_factory: async_sessionmaker[AsyncSession],
) -> None:
    await _record(session_factory)
    await _record(session_factory)
    async with session_factory() as session, session.begin():
        old = datetime.now(UTC) - timedelta(days=31)
        await session.execute(update(IntegrationEvent).values(created_at=old))
        first = (await deliveries(session_factory))[0]
        await session.execute(
            update(IntegrationDelivery)
            .where(IntegrationDelivery.id == first.id)
            .values(state="sent")
        )

    await cleanup(session_factory, StepClock())

    assert len(await events(session_factory)) == 1
