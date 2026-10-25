"""Оформленные сообщения: новый платёж, темы, правка после оплаты, кнопки под напоминанием."""

from dataclasses import replace
from datetime import timedelta
from uuid import UUID

import httpx
import pytest
from prometheus_client import REGISTRY
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncEngine, AsyncSession, async_sessionmaker

from apps.audit.models import AuditRecord
from apps.payments.schemas import PaymentOccurrenceUpdate
from apps.payments.service import PaymentsService
from apps.reminders.models import Notification, TelegramLink
from apps.reminders.service import (
    GROUP_LINKED_REPLY,
    LATER_ANSWER,
    NOT_LINKED_ANSWER,
    PAID_ANSWER,
    STALE_BUTTON,
    ReminderSender,
    ReminderUpdater,
    TelegramLinks,
    UpdatesPoller,
)
from apps.reminders.telegram import IncomingCallback, IncomingMessage
from apps.users.service import MemberChange, UsersService
from core.auth import Principal, Role
from tests.apps.payments.conftest import ADMIN, USER, create_payment
from tests.apps.reminders.conftest import (
    BOT_USERNAME,
    GROUP_CHAT,
    REMINDERS,
    FakeNotifier,
    ReminderClock,
    drop_created,
    notifications,
)
from tests.apps.reminders.test_group_chats import (
    BUH_CHAT,
    chat_code,
    chats,
    connect,
    department,
    group_message,
)
from tests.apps.reminders.test_links import PETROVA, link_code, links, message
from tests.auth_helpers import ADMIN_ID

pytestmark = pytest.mark.integration

PERSONAL_CHAT = 501


def _links(
    session_factory: async_sessionmaker[AsyncSession], clock: ReminderClock, bot: FakeNotifier
) -> TelegramLinks:
    payments = PaymentsService(session_factory, clock)

    async def mark_paid(actor: Principal, occurrence_id: UUID) -> None:
        await payments.update_occurrence(
            actor, occurrence_id, PaymentOccurrenceUpdate(paid=True), source="telegram"
        )

    return TelegramLinks(session_factory, clock, REMINDERS, bot, mark_paid=mark_paid)


async def _sent_reminder(
    api: httpx.AsyncClient,
    clock: ReminderClock,
    session_factory: async_sessionmaker[AsyncSession],
    bot: FakeNotifier,
) -> Notification:
    """Платёж со сроком через 2 дня и отправленное в общий чат напоминание о нём."""
    await create_payment(api, "2026-10-26")
    await drop_created(session_factory)
    await ReminderSender(session_factory, clock, bot, REMINDERS).send_due()
    [sent] = [n for n in await notifications(session_factory) if n.recipient == "group"]
    return sent


def _press(sent: Notification, action: str, from_id: int = PERSONAL_CHAT) -> IncomingCallback:
    return IncomingCallback(
        1,
        "cb-1",
        from_id,
        "Ирина",
        int(GROUP_CHAT),
        int(sent.external_id or 0),
        f"{action}:{sent.id}",
    )


async def _link_petrova(
    api: httpx.AsyncClient,
    clock: ReminderClock,
    session_factory: async_sessionmaker[AsyncSession],
    bot: FakeNotifier,
) -> None:
    code = await link_code(api, PETROVA)
    await links(session_factory, clock, bot).handle(
        message(f"/start {code}", chat_id=PERSONAL_CHAT)
    )


async def test_new_payment_goes_to_group_chats_only(
    api: httpx.AsyncClient,
    clock: ReminderClock,
    session_factory: async_sessionmaker[AsyncSession],
    bot: FakeNotifier,
) -> None:
    await _link_petrova(api, clock, session_factory, bot)
    chat = await connect(api, clock, session_factory, bot)

    await create_payment(api, "2026-11-20")
    await ReminderSender(session_factory, clock, bot, REMINDERS).send_due()

    created = [n for n in await notifications(session_factory, created=True) if n.kind == "created"]
    assert sorted(n.recipient for n in created) == sorted(["group", f"chat:{chat['id']}"])
    heads = {chat_id: text.splitlines()[0] for chat_id, _, text, _ in bot.messages}
    assert heads[GROUP_CHAT] == "🆕 <b>Новый платёж</b>"
    assert str(PERSONAL_CHAT) not in heads


async def test_group_connected_from_topic_gets_messages_there(
    api: httpx.AsyncClient,
    clock: ReminderClock,
    session_factory: async_sessionmaker[AsyncSession],
    bot: FakeNotifier,
) -> None:
    code = await chat_code(api)
    topic_start = replace(group_message(f"/start {code}"), thread_id=7)
    await links(session_factory, clock, bot).handle(topic_start)

    await create_payment(api, "2026-10-26")
    await ReminderSender(session_factory, clock, bot, REMINDERS).send_due()

    threads = {thread for chat_id, thread, _, _ in bot.messages if chat_id == str(BUH_CHAT)}
    assert threads == {7}


async def test_paid_in_panel_rewrites_sent_reminder(
    api: httpx.AsyncClient,
    clock: ReminderClock,
    session_factory: async_sessionmaker[AsyncSession],
    bot: FakeNotifier,
) -> None:
    sent = await _sent_reminder(api, clock, session_factory, bot)
    payment_periods = await api.get("/api/v1/payment-occurrences", headers=USER)
    occurrence_id = payment_periods.json()["items"][0]["id"]
    await api.patch(
        f"/api/v1/payment-occurrences/{occurrence_id}", json={"paid": True}, headers=USER
    )
    updater = ReminderUpdater(session_factory, clock, bot, REMINDERS)

    first = await updater.run_once()
    second = await updater.run_once()

    assert (first, second) == (1, 0)
    [(chat_id, message_id, text, buttons)] = bot.edits
    assert (chat_id, message_id) == (GROUP_CHAT, sent.external_id)
    assert text.splitlines()[0].startswith("✅ <b>Оплачено</b>")
    assert all(button.callback is None for row in buttons for button in row)


async def test_paid_button_marks_period_for_linked_member(
    api: httpx.AsyncClient,
    clock: ReminderClock,
    session_factory: async_sessionmaker[AsyncSession],
    bot: FakeNotifier,
) -> None:
    await _link_petrova(api, clock, session_factory, bot)
    sent = await _sent_reminder(api, clock, session_factory, bot)
    service = _links(session_factory, clock, bot)

    result = await service.handle_callback(_press(sent, "paid"))
    again = await service.handle_callback(_press(sent, "paid"))

    assert result.answer == PAID_ANSWER
    assert result.card is not None
    assert result.card.text.startswith("✅ <b>Оплачено</b>")
    assert again.answer == "Уже оплачено"
    async with session_factory() as session:
        paid = (
            await session.scalars(
                select(AuditRecord).where(AuditRecord.action == "occurrence.paid")
            )
        ).one()
    assert (paid.actor_login, paid.details["source"]) == (PETROVA.login, "telegram")


async def test_buttons_need_link_and_own_message(
    api: httpx.AsyncClient,
    clock: ReminderClock,
    session_factory: async_sessionmaker[AsyncSession],
    bot: FakeNotifier,
) -> None:
    await _link_petrova(api, clock, session_factory, bot)
    sent = await _sent_reminder(api, clock, session_factory, bot)
    service = _links(session_factory, clock, bot)
    foreign = IncomingCallback(
        1, "cb", PERSONAL_CHAT, "Ирина", int(GROUP_CHAT), 999, f"paid:{sent.id}"
    )

    stranger = await service.handle_callback(_press(sent, "paid", from_id=777))
    forged = await service.handle_callback(foreign)
    garbage = await service.handle_callback(_press(sent, "drop"))

    assert stranger.answer == NOT_LINKED_ANSWER
    assert forged.answer == STALE_BUTTON
    assert garbage.answer == STALE_BUTTON
    assert all(
        not o["paid"]
        for o in (await api.get("/api/v1/payment-occurrences", headers=USER)).json()["items"]
    )


async def test_later_button_resends_tomorrow(
    api: httpx.AsyncClient,
    clock: ReminderClock,
    session_factory: async_sessionmaker[AsyncSession],
    bot: FakeNotifier,
) -> None:
    await _link_petrova(api, clock, session_factory, bot)
    sent = await _sent_reminder(api, clock, session_factory, bot)

    result = await _links(session_factory, clock, bot).handle_callback(_press(sent, "later"))

    assert result.answer == LATER_ANSWER
    assert result.card is not None
    assert "⏰ Напомню завтра · Ирина" in result.card.text
    [queued] = [n for n in await notifications(session_factory) if n.recipient == "group"]
    assert queued.state == "pending"
    assert queued.next_attempt_at - clock.now() > timedelta(hours=23)


async def test_poller_answers_button_and_edits_message(
    api: httpx.AsyncClient,
    clock: ReminderClock,
    session_factory: async_sessionmaker[AsyncSession],
    bot: FakeNotifier,
    migrated_engine: object,
) -> None:
    await _link_petrova(api, clock, session_factory, bot)
    sent = await _sent_reminder(api, clock, session_factory, bot)
    bot.updates = [_press(sent, "paid")]
    poller = UpdatesPoller(migrated_engine, _links(session_factory, clock, bot), bot, bot)  # type: ignore[arg-type]

    try:
        await poller.run_once()
    finally:
        await poller.close()

    assert bot.answers == [("cb-1", PAID_ANSWER)]
    assert bot.edits[-1][0:2] == (GROUP_CHAT, sent.external_id)


async def test_main_chat_thread_from_settings(
    api: httpx.AsyncClient,
    clock: ReminderClock,
    session_factory: async_sessionmaker[AsyncSession],
    bot: FakeNotifier,
) -> None:
    await create_payment(api, "2026-10-26")
    settings = REMINDERS.model_copy(update={"telegram_thread_id": 42})

    await ReminderSender(session_factory, clock, bot, settings).send_due()

    assert {thread for chat_id, thread, _, _ in bot.messages if chat_id == GROUP_CHAT} == {42}


async def test_integration_role_loses_telegram_link(
    api: httpx.AsyncClient,
    clock: ReminderClock,
    session_factory: async_sessionmaker[AsyncSession],
    bot: FakeNotifier,
) -> None:
    admin = Principal(ADMIN_ID, "admin", Role.ADMIN)
    users = UsersService(session_factory)
    member = await users.create(admin, "petrova@company.ru", Role.USER)
    user = Principal(member.id, member.email, Role.USER)
    code = await link_code(api, user)
    await links(session_factory, clock, bot).handle(
        message(f"/start {code}", chat_id=PERSONAL_CHAT)
    )

    await users.update(admin, member.id, MemberChange(role=Role.INTEGRATION))

    async with session_factory() as session:
        assert await session.get(TelegramLink, member.id) is None


def _topic_start(code: str, thread_id: int, topic: str) -> IncomingMessage:
    return replace(
        group_message(f"/start@{BOT_USERNAME} {code}"), thread_id=thread_id, topic_name=topic
    )


async def test_one_group_many_topics_with_own_departments(
    api: httpx.AsyncClient,
    clock: ReminderClock,
    session_factory: async_sessionmaker[AsyncSession],
    bot: FakeNotifier,
) -> None:
    it = await department(api, "ИТ")
    office = await department(api, "Офис")
    service = links(session_factory, clock, bot)
    for thread, topic, dep in ((7, "Аренда", office), (8, "Серверы", it)):
        link = (await api.post("/api/v1/telegram-chats/link", headers=ADMIN)).json()
        command = link["command"]
        assert command.startswith(f"/start@{BOT_USERNAME} ")
        await service.handle(_topic_start(command.split(" ", 1)[1], thread, topic))
        [chat] = [c for c in await chats(api) if c["threadId"] == thread]
        await api.patch(
            f"/api/v1/telegram-chats/{chat['id']}", json={"departmentIds": [dep]}, headers=ADMIN
        )

    await create_payment(api, "2026-10-26", name="Сервер", department_id=it)
    await create_payment(api, "2026-10-26", name="Аренда офиса", department_id=office)
    await drop_created(session_factory)
    await ReminderSender(session_factory, clock, bot, REMINDERS).send_due()

    listed = sorted((c["threadId"], c["topicName"]) for c in await chats(api))
    assert listed == [(7, "Аренда"), (8, "Серверы")]
    by_thread = {
        thread: [line for line in text.splitlines() if line.startswith("📄")]
        for chat_id, thread, text, _ in bot.messages
        if chat_id == str(BUH_CHAT) and "Скоро оплата" in text
    }
    assert by_thread == {7: ["📄 <b>Аренда офиса</b>"], 8: ["📄 <b>Сервер</b>"]}


async def test_group_events_touch_all_topics(
    api: httpx.AsyncClient,
    clock: ReminderClock,
    session_factory: async_sessionmaker[AsyncSession],
    bot: FakeNotifier,
) -> None:
    service = links(session_factory, clock, bot)
    for thread in (7, 8):
        code = (await api.post("/api/v1/telegram-chats/link", headers=ADMIN)).json()["command"]
        await service.handle(_topic_start(code.split(" ", 1)[1], thread, f"Тема {thread}"))

    await service.handle(replace(group_message("x"), text=None, new_title="Бухгалтерия 2026"))
    await service.handle(
        replace(group_message("x"), text=None, thread_id=8, new_topic_name="Серверы")
    )
    await service.handle(
        replace(
            group_message("x"), text=None, member_status="kicked", chat_title="Бухгалтерия 2026"
        )
    )

    listed = sorted(
        (c["threadId"], c["title"], c["topicName"], c["blocked"]) for c in await chats(api)
    )
    assert listed == [
        (7, "Бухгалтерия 2026", "Тема 7", True),
        (8, "Бухгалтерия 2026", "Серверы", True),
    ]


async def test_forum_link_asks_where_to_write(
    api: httpx.AsyncClient,
    clock: ReminderClock,
    session_factory: async_sessionmaker[AsyncSession],
    bot: FakeNotifier,
) -> None:
    service = links(session_factory, clock, bot)
    code = await chat_code(api)
    general = replace(group_message(f"/start@{BOT_USERNAME} {code}"), forum=True)

    hint = await service.handle(general)
    no_chats_yet = await chats(api)
    connected = await service.handle(_topic_start(code, 7, "Аренда"))

    assert hint is not None
    assert f"<code>/start@{BOT_USERNAME} {code}</code>" in hint
    assert no_chats_yet == []
    assert connected == GROUP_LINKED_REPLY
    assert [(c["threadId"], c["topicName"]) for c in await chats(api)] == [(7, "Аренда")]


async def test_forum_general_on_second_command(
    api: httpx.AsyncClient,
    clock: ReminderClock,
    session_factory: async_sessionmaker[AsyncSession],
    bot: FakeNotifier,
) -> None:
    service = links(session_factory, clock, bot)
    code = await chat_code(api)
    general = replace(group_message(f"/start@{BOT_USERNAME} {code}"), forum=True)

    await service.handle(general)
    second = await service.handle(general)

    assert second == GROUP_LINKED_REPLY
    assert [c["threadId"] for c in await chats(api)] == [None]


async def test_button_presses_are_counted(
    api: httpx.AsyncClient,
    clock: ReminderClock,
    session_factory: async_sessionmaker[AsyncSession],
    bot: FakeNotifier,
    migrated_engine: AsyncEngine,
) -> None:
    sent = await _sent_reminder(api, clock, session_factory, bot)
    before = (
        REGISTRY.get_sample_value(
            "telegram_actions_total", {"action": "paid", "result": "not_linked"}
        )
        or 0.0
    )
    bot.updates = [_press(sent, "paid", from_id=777)]
    poller = UpdatesPoller(migrated_engine, _links(session_factory, clock, bot), bot, bot)

    try:
        await poller.run_once()
    finally:
        await poller.close()

    after = REGISTRY.get_sample_value(
        "telegram_actions_total", {"action": "paid", "result": "not_linked"}
    )
    assert after == before + 1
