from collections import Counter
from typing import Any

import httpx
import pytest
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from apps.reminders.service import GROUP_LINKED_REPLY, HINT_REPLY, ReminderSender
from apps.reminders.telegram import IncomingMessage
from tests.apps.payments.conftest import ADMIN, USER, create_payment
from tests.apps.reminders.conftest import (
    BOT_USERNAME,
    REMINDERS,
    FakeNotifier,
    ReminderClock,
    drop_created,
    notifications,
)
from tests.apps.reminders.test_links import link_code, links, message

pytestmark = pytest.mark.integration

BUH_CHAT = -100_501
IT_CHAT = -100_502


def group_message(
    text: str, chat_id: int = BUH_CHAT, title: str = "Бухгалтерия"
) -> IncomingMessage:
    return IncomingMessage(1, chat_id, "supergroup", "glavbuh", text, title)


async def chat_code(api: httpx.AsyncClient) -> str:
    response = await api.post("/api/v1/telegram-chats/link", headers=ADMIN)
    assert response.status_code == 201, response.text
    return str(response.json()["url"]).split("startgroup=", 1)[1]


async def chats(api: httpx.AsyncClient) -> list[dict[str, Any]]:
    response = await api.get("/api/v1/telegram-chats", headers=ADMIN)
    assert response.status_code == 200, response.text
    return list(response.json()["items"])


async def connect(
    api: httpx.AsyncClient,
    clock: ReminderClock,
    session_factory: async_sessionmaker[AsyncSession],
    bot: FakeNotifier,
    *,
    chat_id: int = BUH_CHAT,
    title: str = "Бухгалтерия",
) -> dict[str, Any]:
    """Как ссылка `startgroup`: Telegram присылает в группу `/start@бот <код>`."""
    code = await chat_code(api)
    reply = await links(session_factory, clock, bot).handle(
        group_message(f"/start@{BOT_USERNAME} {code}", chat_id, title)
    )
    assert reply == GROUP_LINKED_REPLY
    return next(chat for chat in await chats(api) if chat["title"] == title)


async def department(api: httpx.AsyncClient, name: str) -> str:
    response = await api.post("/api/v1/departments", json={"name": name}, headers=ADMIN)
    assert response.status_code == 201, response.text
    return str(response.json()["id"])


async def test_only_admin_manages_chats(api: httpx.AsyncClient) -> None:
    chat_id = "00000000-0000-0000-0000-000000000001"
    responses = [
        await api.get("/api/v1/telegram-chats", headers=USER),
        await api.post("/api/v1/telegram-chats/link", headers=USER),
        await api.patch(
            f"/api/v1/telegram-chats/{chat_id}", json={"departmentIds": None}, headers=USER
        ),
        await api.delete(f"/api/v1/telegram-chats/{chat_id}", headers=USER),
    ]

    assert [r.status_code for r in responses] == [403] * 4


async def test_start_in_group_connects_chat(
    api: httpx.AsyncClient,
    clock: ReminderClock,
    session_factory: async_sessionmaker[AsyncSession],
    bot: FakeNotifier,
) -> None:
    chat = await connect(api, clock, session_factory, bot)

    assert chat["title"] == "Бухгалтерия"
    assert chat["departmentIds"] is None
    assert chat["blocked"] is False


async def test_codes_do_not_mix(
    api: httpx.AsyncClient,
    clock: ReminderClock,
    session_factory: async_sessionmaker[AsyncSession],
    bot: FakeNotifier,
) -> None:
    service = links(session_factory, clock, bot)
    personal = await link_code(api)
    group = await chat_code(api)

    in_group = await service.handle(group_message(f"/start {personal}"))
    in_private = await service.handle(message(f"/start {group}"))

    assert in_group is None
    assert in_private == HINT_REPLY
    assert await chats(api) == []


async def test_department_filter(
    api: httpx.AsyncClient,
    clock: ReminderClock,
    session_factory: async_sessionmaker[AsyncSession],
    bot: FakeNotifier,
) -> None:
    it = await department(api, "ИТ")
    office = await department(api, "Офис")
    buh = await connect(api, clock, session_factory, bot)
    it_chat = await connect(api, clock, session_factory, bot, chat_id=IT_CHAT, title="ИТ")
    patched = await api.patch(
        f"/api/v1/telegram-chats/{it_chat['id']}", json={"departmentIds": [it]}, headers=ADMIN
    )

    await create_payment(api, "2026-10-26", department_id=it)
    await create_payment(api, "2026-10-26", department_id=office)
    await create_payment(api, "2026-10-26")

    assert patched.json()["departmentIds"] == [it]
    counts = Counter(n.recipient for n in await notifications(session_factory))
    assert counts == {"group": 3, f"chat:{buh['id']}": 3, f"chat:{it_chat['id']}": 1}


async def test_unknown_department_and_chat(
    api: httpx.AsyncClient,
    clock: ReminderClock,
    session_factory: async_sessionmaker[AsyncSession],
    bot: FakeNotifier,
) -> None:
    chat = await connect(api, clock, session_factory, bot)
    missing = "00000000-0000-0000-0000-000000000001"

    bad_department = await api.patch(
        f"/api/v1/telegram-chats/{chat['id']}", json={"departmentIds": [missing]}, headers=ADMIN
    )
    bad_chat = await api.delete(f"/api/v1/telegram-chats/{missing}", headers=ADMIN)

    assert bad_department.status_code == 400
    assert bad_chat.status_code == 404


async def test_sends_and_blocks_removed_bot(
    api: httpx.AsyncClient,
    clock: ReminderClock,
    session_factory: async_sessionmaker[AsyncSession],
    bot: FakeNotifier,
) -> None:
    chat = await connect(api, clock, session_factory, bot)
    await create_payment(api, "2026-10-26")
    await drop_created(session_factory)
    sender = ReminderSender(session_factory, clock, bot, REMINDERS)
    await sender.send_due()
    assert str(BUH_CHAT) in {chat_id for chat_id, _ in bot.sent}

    bot.blocked_chats.add(str(BUH_CHAT))
    await create_payment(api, "2026-10-25", name="Сервер")
    await drop_created(session_factory)
    await ReminderSender(session_factory, clock, bot, REMINDERS).send_due()
    await create_payment(api, "2026-10-27", name="Подписка")

    assert (await chats(api))[0]["blocked"] is True
    pending = [n for n in await notifications(session_factory) if n.state == "pending"]
    assert all(n.recipient != f"chat:{chat['id']}" for n in pending)

    again = await connect(api, clock, session_factory, bot)
    assert again["blocked"] is False


async def test_delete_cancels_pending(
    api: httpx.AsyncClient,
    clock: ReminderClock,
    session_factory: async_sessionmaker[AsyncSession],
    bot: FakeNotifier,
) -> None:
    chat = await connect(api, clock, session_factory, bot)
    await create_payment(api, "2026-10-26")

    response = await api.delete(f"/api/v1/telegram-chats/{chat['id']}", headers=ADMIN)

    assert response.status_code == 204
    assert await chats(api) == []
    states = {
        n.state for n in await notifications(session_factory) if n.recipient.startswith("chat:")
    }
    assert states == {"cancelled"}


def member_update(
    status: str, chat_id: int = BUH_CHAT, chat_type: str = "supergroup"
) -> IncomingMessage:
    return IncomingMessage(2, chat_id, chat_type, "glavbuh", None, "Бухгалтерия", "Ирина", status)


async def test_bot_removed_and_returned_to_group(
    api: httpx.AsyncClient,
    clock: ReminderClock,
    session_factory: async_sessionmaker[AsyncSession],
    bot: FakeNotifier,
) -> None:
    await connect(api, clock, session_factory, bot)
    service = links(session_factory, clock, bot)

    assert await service.handle(member_update("kicked")) is None
    removed = (await chats(api))[0]["blocked"]
    await service.handle(member_update("member"))

    assert removed is True
    assert (await chats(api))[0]["blocked"] is False


async def test_deleted_department_leaves_all_payments(
    api: httpx.AsyncClient,
    clock: ReminderClock,
    session_factory: async_sessionmaker[AsyncSession],
    bot: FakeNotifier,
) -> None:
    it = await department(api, "ИТ")
    chat = await connect(api, clock, session_factory, bot)
    path = f"/api/v1/telegram-chats/{chat['id']}"
    await api.patch(path, json={"departmentIds": [it]}, headers=ADMIN)
    empty = await api.patch(path, json={"departmentIds": []}, headers=ADMIN)

    await api.delete(f"/api/v1/departments/{it}", headers=ADMIN)
    await create_payment(api, "2026-10-26")

    assert empty.status_code == 400
    assert empty.json()["payload"][0]["message"].startswith("Выберите хотя бы один отдел")
    assert (await chats(api))[0]["departmentIds"] is None
    assert f"chat:{chat['id']}" in {n.recipient for n in await notifications(session_factory)}


async def test_group_rename_updates_title(
    api: httpx.AsyncClient,
    clock: ReminderClock,
    session_factory: async_sessionmaker[AsyncSession],
    bot: FakeNotifier,
) -> None:
    await connect(api, clock, session_factory, bot)

    renamed = IncomingMessage(
        3, BUH_CHAT, "supergroup", "glavbuh", None, new_title="Бухгалтерия 2026"
    )
    reply = await links(session_factory, clock, bot).handle(renamed)

    assert reply is None
    assert (await chats(api))[0]["title"] == "Бухгалтерия 2026"
