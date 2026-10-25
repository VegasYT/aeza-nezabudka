"""Поток событий без базы: видимость по роли, закрытие потока, переполнение очереди."""

import uuid

import pytest
from fastapi.sse import ServerSentEvent

from app.events import stream, visible
from core.auth import Principal, Role
from core.live import QUEUE_SIZE, RESYNC, LiveBroker, LiveEvent

USER = Principal(uuid.uuid4(), "buh.petrova", Role.USER)
ADMIN = Principal(uuid.uuid4(), "admin", Role.ADMIN)
PAID = LiveEvent("occurrence.paid", "all", "occurrence", "1", "Аренда", "buh.petrova")


def _broker() -> LiveBroker:
    return LiveBroker("postgresql+asyncpg://app:app@localhost:5432/app")


@pytest.mark.parametrize(
    ("event", "principal", "seen"),
    [
        (PAID, USER, True),
        (LiveEvent("member.created", "admins", "member", "9"), USER, False),
        (LiveEvent("member.created", "admins", "member", "9"), ADMIN, True),
        (LiveEvent("member.updated", "admins", "member", member_id=str(USER.id)), USER, True),
        (LiveEvent("telegram.changed", "member", member_id=str(USER.id)), USER, True),
        (LiveEvent("telegram.changed", "member", member_id=str(USER.id)), ADMIN, False),
    ],
)
def test_visibility(event: LiveEvent, principal: Principal, seen: bool) -> None:
    assert visible(event, principal) is seen


async def test_stream_sends_ready_visible_changes_and_resync() -> None:
    broker = _broker()
    events = stream(broker, USER)

    ready = await anext(events)
    broker.dispatch(LiveEvent("member.created", "admins", "member", "9"))
    broker.dispatch(PAID)
    change = await anext(events)
    broker.dispatch(RESYNC)
    resync = await anext(events)
    await events.aclose()

    assert (ready.event, ready.retry) == ("ready", 3000)
    assert change == ServerSentEvent(
        event="change",
        data={
            "type": "occurrence.paid",
            "entityType": "occurrence",
            "entityId": "1",
            "entityName": "Аренда",
            "actorLogin": "buh.petrova",
        },
    )
    assert resync.event == "resync"


async def test_stream_closes_after_own_access_change() -> None:
    broker = _broker()
    events = stream(broker, USER)
    await anext(events)

    broker.dispatch(LiveEvent("auth.login", "admins", "member", member_id=str(USER.id)))
    broker.dispatch(LiveEvent("member.updated", "admins", "member", member_id=str(USER.id)))
    login = await anext(events)
    updated = await anext(events)

    assert [login.data["type"], updated.data["type"]] == ["auth.login", "member.updated"]
    with pytest.raises(StopAsyncIteration):
        await anext(events)


async def test_stream_ends_by_lifetime() -> None:
    events = stream(_broker(), USER, lifetime=0.05)
    await anext(events)

    with pytest.raises(StopAsyncIteration):
        await anext(events)


async def test_slow_stream_gets_resync_instead_of_lost_events() -> None:
    broker = _broker()
    with broker.subscribe() as queue:
        for _ in range(QUEUE_SIZE + 1):
            broker.dispatch(PAID)

        assert queue.get_nowait() == RESYNC
