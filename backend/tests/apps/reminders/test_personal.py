import httpx
import pytest
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.worker import tick
from apps.reminders.models import TelegramLink
from apps.reminders.service import ReminderSender
from apps.users.service import MemberChange, UsersService
from core.auth import Principal, Role
from tests.apps.payments.conftest import create_payment
from tests.apps.reminders.conftest import (
    GROUP_CHAT,
    REMINDERS,
    FakeNotifier,
    ReminderClock,
    drop_created,
    notifications,
)
from tests.apps.reminders.test_group_chats import department
from tests.apps.reminders.test_links import IVANOV, PETROVA, headers, link_code, links, message
from tests.auth_helpers import ADMIN_ID

pytestmark = pytest.mark.integration


async def _link(
    api: httpx.AsyncClient,
    clock: ReminderClock,
    session_factory: async_sessionmaker[AsyncSession],
    bot: FakeNotifier,
    *,
    user: Principal,
    chat_id: int,
) -> None:
    code = await link_code(api, user)
    await links(session_factory, clock, bot).handle(message(f"/start {code}", chat_id=chat_id))


async def test_group_and_personal_channels_are_independent(
    api: httpx.AsyncClient,
    clock: ReminderClock,
    session_factory: async_sessionmaker[AsyncSession],
    bot: FakeNotifier,
) -> None:
    await _link(api, clock, session_factory, bot, user=PETROVA, chat_id=501)
    await _link(api, clock, session_factory, bot, user=IVANOV, chat_id=502)
    await api.patch("/api/v1/me/telegram", json={"personalEnabled": False}, headers=headers(IVANOV))

    await create_payment(api, "2026-10-26")

    assert sorted(n.recipient for n in await notifications(session_factory)) == sorted(
        ["group", str(PETROVA.id)]
    )


async def test_linked_mid_window_gets_reminder_on_next_tick(
    api: httpx.AsyncClient,
    clock: ReminderClock,
    session_factory: async_sessionmaker[AsyncSession],
    bot: FakeNotifier,
) -> None:
    await create_payment(api, "2026-10-26")
    await drop_created(session_factory)
    await ReminderSender(session_factory, clock, bot, REMINDERS).send_due()
    await _link(api, clock, session_factory, bot, user=PETROVA, chat_id=501)

    await tick(session_factory, clock, REMINDERS)
    await ReminderSender(session_factory, clock, bot, REMINDERS).send_due()

    assert [chat for chat, _ in bot.sent] == [GROUP_CHAT, "501"]


async def test_blocked_bot_stops_personal_reminders_until_start(
    api: httpx.AsyncClient,
    clock: ReminderClock,
    session_factory: async_sessionmaker[AsyncSession],
    bot: FakeNotifier,
) -> None:
    await _link(api, clock, session_factory, bot, user=PETROVA, chat_id=501)
    await api.patch("/api/v1/me/telegram", json={"personalEnabled": True}, headers=headers(PETROVA))
    await create_payment(api, "2026-10-26", name="Первый")
    notifier = FakeNotifier()
    sender = ReminderSender(session_factory, clock, notifier, REMINDERS)
    await sender.send_due()
    personal = next(n for n in await notifications(session_factory) if n.recipient != "group")
    assert personal.state == "sent"

    notifier.blocked_chats.add("501")
    await create_payment(api, "2026-10-27", name="Второй")
    await ReminderSender(session_factory, clock, notifier, REMINDERS).send_due()

    async with session_factory() as session:
        link = await session.get(TelegramLink, PETROVA.id)
    assert link is not None
    assert link.blocked_at is not None
    await create_payment(api, "2026-10-26", name="Третий")
    recipients = [n.recipient for n in await notifications(session_factory)]
    assert recipients.count(str(PETROVA.id)) == 2

    await links(session_factory, clock, bot).handle(message("/start", chat_id=501))
    await tick(session_factory, clock, REMINDERS)
    recipients = [n.recipient for n in await notifications(session_factory)]
    assert recipients.count(str(PETROVA.id)) == 3


async def test_deleted_user_loses_link(
    api: httpx.AsyncClient,
    clock: ReminderClock,
    session_factory: async_sessionmaker[AsyncSession],
    bot: FakeNotifier,
) -> None:
    admin = Principal(ADMIN_ID, "admin", Role.ADMIN)
    member = await UsersService(session_factory).create(admin, "petrova@company.ru", Role.USER)
    user = Principal(member.id, member.email, Role.USER)
    await _link(api, clock, session_factory, bot, user=user, chat_id=501)

    await UsersService(session_factory).delete(admin, member.id)

    async with session_factory() as session:
        assert await session.get(TelegramLink, member.id) is None


async def test_personal_department_filter(
    api: httpx.AsyncClient,
    clock: ReminderClock,
    session_factory: async_sessionmaker[AsyncSession],
    bot: FakeNotifier,
) -> None:
    it = await department(api, "ИТ")
    office = await department(api, "Офис")
    await _link(api, clock, session_factory, bot, user=PETROVA, chat_id=501)
    response = await api.patch(
        "/api/v1/me/telegram", json={"departmentIds": [it]}, headers=headers(PETROVA)
    )

    await create_payment(api, "2026-10-26", department_id=it)
    await create_payment(api, "2026-10-26", department_id=office)
    await create_payment(api, "2026-10-26")

    assert response.json()["departmentIds"] == [it]
    assert response.json()["personalEnabled"] is True
    personal = [n for n in await notifications(session_factory) if n.recipient == str(PETROVA.id)]
    assert len(personal) == 1


async def test_settings_change_only_given_fields(
    api: httpx.AsyncClient,
    clock: ReminderClock,
    session_factory: async_sessionmaker[AsyncSession],
    bot: FakeNotifier,
) -> None:
    it = await department(api, "ИТ")
    await _link(api, clock, session_factory, bot, user=PETROVA, chat_id=501)
    user = headers(PETROVA)
    await api.patch("/api/v1/me/telegram", json={"departmentIds": [it]}, headers=user)

    disabled = await api.patch("/api/v1/me/telegram", json={"personalEnabled": False}, headers=user)
    everything = await api.patch("/api/v1/me/telegram", json={"departmentIds": None}, headers=user)
    empty = await api.patch("/api/v1/me/telegram", json={}, headers=user)
    unknown = await api.patch(
        "/api/v1/me/telegram",
        json={"departmentIds": ["00000000-0000-0000-0000-000000000001"]},
        headers=user,
    )

    assert disabled.json()["departmentIds"] == [it]
    assert everything.json()["departmentIds"] is None
    assert everything.json()["personalEnabled"] is False
    assert (empty.status_code, unknown.status_code) == (400, 400)


async def test_disabled_member_gets_no_personal_reminders(
    api: httpx.AsyncClient,
    clock: ReminderClock,
    session_factory: async_sessionmaker[AsyncSession],
    bot: FakeNotifier,
) -> None:
    admin = Principal(ADMIN_ID, "admin", Role.ADMIN)
    users = UsersService(session_factory)
    member = await users.create(admin, "petrova@company.ru", Role.USER)
    user = Principal(member.id, member.email, Role.USER)
    await _link(api, clock, session_factory, bot, user=user, chat_id=501)
    await create_payment(api, "2026-10-26")

    await users.update(admin, member.id, MemberChange(enabled=False))
    await create_payment(api, "2026-10-27", name="Сервер")
    await ReminderSender(session_factory, clock, bot, REMINDERS).send_due()

    assert "501" not in {chat_id for chat_id, _ in bot.sent}
    personal = [n for n in await notifications(session_factory) if n.recipient == str(member.id)]
    assert [n.state for n in personal] == ["cancelled"]

    await users.update(admin, member.id, MemberChange(enabled=True))
    await tick(session_factory, clock, REMINDERS)
    personal = [n for n in await notifications(session_factory) if n.recipient == str(member.id)]
    assert sorted(n.state for n in personal) == ["cancelled", "pending"]
