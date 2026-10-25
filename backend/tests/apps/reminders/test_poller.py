"""Опрос обновлений бота под advisory-блокировкой: соединения настоящие, данные не пишутся."""

import pytest
from sqlalchemy.ext.asyncio import AsyncEngine, async_sessionmaker

from apps.reminders.service import HINT_REPLY, TelegramLinks, UpdatesPoller
from apps.reminders.telegram import IncomingMessage
from tests.apps.reminders.conftest import REMINDERS, FakeNotifier, ReminderClock
from tests.conftest import TODAY

pytestmark = pytest.mark.integration


def _poller(engine: AsyncEngine, bot: FakeNotifier) -> UpdatesPoller:
    links = TelegramLinks(async_sessionmaker(engine), ReminderClock(TODAY), REMINDERS, bot)
    return UpdatesPoller(engine, links, bot, bot, poll_timeout=0)


async def test_only_lock_holder_polls(migrated_engine: AsyncEngine) -> None:
    first_bot, second_bot = FakeNotifier(), FakeNotifier()
    first, second = _poller(migrated_engine, first_bot), _poller(migrated_engine, second_bot)
    try:
        await first.run_once()
        await second.run_once()
        await second.run_once()

        assert (first_bot.polls, second_bot.polls) == (1, 0)
        await first.close()
        await second.run_once()
        assert second_bot.polls == 1
    finally:
        await first.close()
        await second.close()


async def test_replies_once_per_update(migrated_engine: AsyncEngine) -> None:
    bot = FakeNotifier()
    bot.updates.append(IncomingMessage(41, 501, "private", "petrova_tg", "привет"))
    bot.updates.append(IncomingMessage(42, -100, "group", None, "/start abc"))
    poller = _poller(migrated_engine, bot)
    try:
        await poller.run_once()
        await poller.run_once()
    finally:
        await poller.close()

    assert bot.sent == [("501", HINT_REPLY)]
