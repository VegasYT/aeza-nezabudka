import hashlib
import uuid
from datetime import timedelta
from typing import Any

import httpx
import pytest
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from apps.reminders.models import TelegramLink, TelegramLinkCode
from apps.reminders.service import (
    HINT_REPLY,
    LINKED_REPLY,
    RESUMED_REPLY,
    STOPPED_REPLY,
    TelegramLinks,
)
from apps.reminders.telegram import IncomingMessage
from core.auth import Principal, Role
from core.errors import AppError
from tests.apps.payments.conftest import create_payment
from tests.apps.reminders.conftest import (
    BOT_USERNAME,
    REMINDERS,
    FakeNotifier,
    ReminderClock,
    notifications,
)
from tests.auth_helpers import make_token

pytestmark = pytest.mark.integration

PETROVA = Principal(uuid.UUID("5d0f7a43-9e8b-4c55-8f2c-0a1b2c3d4e5f"), "buh.petrova", Role.USER)
IVANOV = Principal(uuid.UUID("6e1a8b54-0f9c-4d66-9a3d-1b2c3d4e5f60"), "buh.ivanov", Role.USER)


def headers(user: Principal) -> dict[str, str]:
    token = make_token(roles=(user.role.value,), login=user.login, subject=user.id)
    return {"Authorization": f"Bearer {token}"}


def message(text: str, chat_id: int = 501, chat_type: str = "private") -> IncomingMessage:
    return IncomingMessage(1, chat_id, chat_type, "petrova_tg", text)


def links(
    session_factory: async_sessionmaker[AsyncSession], clock: ReminderClock, bot: FakeNotifier
) -> TelegramLinks:
    return TelegramLinks(session_factory, clock, REMINDERS, bot)


async def link_code(api: httpx.AsyncClient, user: Principal = PETROVA) -> str:
    response = await api.post("/api/v1/me/telegram/link", headers=headers(user))
    assert response.status_code == 201, response.text
    return str(response.json()["url"]).split("start=", 1)[1]


async def status(api: httpx.AsyncClient, user: Principal = PETROVA) -> dict[str, Any]:
    response = await api.get("/api/v1/me/telegram", headers=headers(user))
    assert response.status_code == 200, response.text
    return dict(response.json())


async def test_status_without_link(api: httpx.AsyncClient) -> None:
    assert await status(api) == {
        "linked": False,
        "telegramUsername": None,
        "personalEnabled": False,
        "blocked": False,
        "groupChatConfigured": True,
        "departmentIds": None,
        "telegramName": None,
        "botConfigured": True,
    }


async def test_link_stores_only_code_hash(
    api: httpx.AsyncClient,
    clock: ReminderClock,
    session_factory: async_sessionmaker[AsyncSession],
) -> None:
    response = await api.post("/api/v1/me/telegram/link", headers=headers(PETROVA))

    body = response.json()
    assert body["url"].startswith(f"https://t.me/{BOT_USERNAME}?start=")
    code = body["url"].split("start=", 1)[1]
    async with session_factory() as session:
        [stored] = await session.scalars(select(TelegramLinkCode))
    assert stored.code_hash == hashlib.sha256(code.encode()).hexdigest()
    assert abs(stored.expires_at - (clock.now() + timedelta(minutes=10))) < timedelta(seconds=10)


async def test_link_without_bot_is_conflict(
    session_factory: async_sessionmaker[AsyncSession], clock: ReminderClock
) -> None:
    service = TelegramLinks(session_factory, clock, REMINDERS, None)

    with pytest.raises(AppError) as raised:
        await service.create_link(PETROVA)

    assert (raised.value.status_code, raised.value.code) == (409, "telegram_not_configured")


async def test_start_with_valid_code_links_chat(
    api: httpx.AsyncClient,
    clock: ReminderClock,
    session_factory: async_sessionmaker[AsyncSession],
    bot: FakeNotifier,
) -> None:
    code = await link_code(api)

    reply = await links(session_factory, clock, bot).handle(message(f"/start {code}"))

    assert reply == LINKED_REPLY
    assert await status(api) == {
        "linked": True,
        "telegramUsername": "petrova_tg",
        "personalEnabled": True,
        "blocked": False,
        "groupChatConfigured": True,
        "departmentIds": None,
        "telegramName": None,
        "botConfigured": True,
    }


async def test_expired_code_is_rejected(
    api: httpx.AsyncClient,
    clock: ReminderClock,
    session_factory: async_sessionmaker[AsyncSession],
    bot: FakeNotifier,
) -> None:
    code = await link_code(api)
    clock.shift += timedelta(minutes=11)

    reply = await links(session_factory, clock, bot).handle(message(f"/start {code}"))

    assert reply == HINT_REPLY
    assert (await status(api))["linked"] is False


async def test_used_code_does_not_link_second_chat(
    api: httpx.AsyncClient,
    clock: ReminderClock,
    session_factory: async_sessionmaker[AsyncSession],
    bot: FakeNotifier,
) -> None:
    code = await link_code(api)
    service = links(session_factory, clock, bot)
    await service.handle(message(f"/start {code}", chat_id=501))

    reply = await service.handle(message(f"/start {code}", chat_id=777))

    assert reply == HINT_REPLY
    async with session_factory() as session:
        assert [link.chat_id for link in await session.scalars(select(TelegramLink))] == [501]


@pytest.mark.parametrize("text", ["/start unknown-code", "привет", "/help"])
async def test_unknown_code_or_text_gets_hint(
    clock: ReminderClock,
    session_factory: async_sessionmaker[AsyncSession],
    bot: FakeNotifier,
    text: str,
) -> None:
    assert await links(session_factory, clock, bot).handle(message(text)) == HINT_REPLY


async def test_group_messages_are_ignored(
    api: httpx.AsyncClient,
    clock: ReminderClock,
    session_factory: async_sessionmaker[AsyncSession],
    bot: FakeNotifier,
) -> None:
    code = await link_code(api)

    reply = await links(session_factory, clock, bot).handle(
        message(f"/start {code}", chat_type="supergroup")
    )

    assert reply is None
    assert (await status(api))["linked"] is False


async def test_new_link_invalidates_previous_code(
    api: httpx.AsyncClient,
    clock: ReminderClock,
    session_factory: async_sessionmaker[AsyncSession],
    bot: FakeNotifier,
) -> None:
    first = await link_code(api)
    await link_code(api)

    assert await links(session_factory, clock, bot).handle(message(f"/start {first}")) == (
        HINT_REPLY
    )


async def test_chat_moves_to_new_owner(
    api: httpx.AsyncClient,
    clock: ReminderClock,
    session_factory: async_sessionmaker[AsyncSession],
    bot: FakeNotifier,
) -> None:
    service = links(session_factory, clock, bot)
    await service.handle(message(f"/start {await link_code(api, PETROVA)}"))

    await service.handle(message(f"/start {await link_code(api, IVANOV)}"))

    assert (await status(api, PETROVA))["linked"] is False
    assert (await status(api, IVANOV))["linked"] is True


async def test_stop_unlinks_and_cancels_pending(
    api: httpx.AsyncClient,
    clock: ReminderClock,
    session_factory: async_sessionmaker[AsyncSession],
    bot: FakeNotifier,
) -> None:
    service = links(session_factory, clock, bot)
    await service.handle(message(f"/start {await link_code(api)}"))
    await create_payment(api, "2026-10-26")

    reply = await service.handle(message("/stop"))

    assert reply == STOPPED_REPLY
    assert (await status(api))["linked"] is False
    assert {n.recipient: n.state for n in await notifications(session_factory)} == {
        "group": "pending",
        str(PETROVA.id): "cancelled",
    }


async def test_disable_keeps_link_and_cancels_pending(
    api: httpx.AsyncClient,
    clock: ReminderClock,
    session_factory: async_sessionmaker[AsyncSession],
    bot: FakeNotifier,
) -> None:
    await links(session_factory, clock, bot).handle(message(f"/start {await link_code(api)}"))
    await create_payment(api, "2026-10-26")

    response = await api.patch(
        "/api/v1/me/telegram", json={"personalEnabled": False}, headers=headers(PETROVA)
    )

    assert response.status_code == 200, response.text
    assert (response.json()["linked"], response.json()["personalEnabled"]) == (True, False)
    personal = [n for n in await notifications(session_factory) if n.recipient != "group"]
    assert [n.state for n in personal] == ["cancelled"]


async def test_disable_without_link_is_conflict(api: httpx.AsyncClient) -> None:
    response = await api.patch(
        "/api/v1/me/telegram", json={"personalEnabled": False}, headers=headers(PETROVA)
    )

    assert response.status_code == 409


async def test_unlink(
    api: httpx.AsyncClient,
    clock: ReminderClock,
    session_factory: async_sessionmaker[AsyncSession],
    bot: FakeNotifier,
) -> None:
    await links(session_factory, clock, bot).handle(message(f"/start {await link_code(api)}"))

    response = await api.delete("/api/v1/me/telegram", headers=headers(PETROVA))

    assert response.status_code == 204
    assert (await status(api))["linked"] is False


async def test_start_without_code_resumes_blocked_chat(
    api: httpx.AsyncClient,
    clock: ReminderClock,
    session_factory: async_sessionmaker[AsyncSession],
    bot: FakeNotifier,
) -> None:
    service = links(session_factory, clock, bot)
    await service.handle(message(f"/start {await link_code(api)}"))
    async with session_factory() as session, session.begin():
        link = await session.get(TelegramLink, PETROVA.id)
        assert link is not None
        link.blocked_at = clock.now()

    assert await service.handle(message("/start")) == RESUMED_REPLY
    assert (await status(api))["blocked"] is False


async def test_name_and_bot_blocking_from_telegram(
    api: httpx.AsyncClient,
    clock: ReminderClock,
    session_factory: async_sessionmaker[AsyncSession],
    bot: FakeNotifier,
) -> None:
    code = await link_code(api)
    service = links(session_factory, clock, bot)
    await service.handle(
        IncomingMessage(1, 501, "private", "petrova_tg", f"/start {code}", None, "Ирина")
    )

    await service.handle(IncomingMessage(2, 501, "private", None, None, None, None, "kicked"))
    blocked = await status(api)
    await service.handle(IncomingMessage(3, 501, "private", None, None, None, None, "member"))

    assert (blocked["telegramName"], blocked["blocked"]) == ("Ирина", True)
    assert (await status(api))["blocked"] is False
