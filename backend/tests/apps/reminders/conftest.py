"""Общий чат с фейковым Telegram и API платежей на базе с откатом."""

import asyncio
from collections.abc import AsyncIterator
from datetime import UTC, date, datetime, timedelta

import httpx
import pytest
from pydantic import SecretStr
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncEngine, AsyncSession, async_sessionmaker

from app.main import create_asgi_app
from apps.reminders.models import Notification
from apps.reminders.telegram import Buttons, ChatBlocked, IncomingCallback, IncomingMessage
from core.config import ReminderSettings, Settings
from tests.auth_helpers import FakeAuthenticator
from tests.conftest import TODAY

GROUP_CHAT = "-1001234567890"
BOT_USERNAME = "nezabudka_test_bot"
BOT_TOKEN = "123456:secret-bot-token"
REMINDERS = ReminderSettings.model_construct(
    telegram_bot_token=SecretStr(BOT_TOKEN),
    telegram_chat_id=GROUP_CHAT,
    telegram_proxy_url=None,
    reminder_days_before=3,
)


class ReminderClock:
    """Дату двигает тест; время идёт с запасом вперёд, чтобы новые строки уже созрели."""

    def __init__(self, today: date) -> None:
        self.current = today
        self.shift = timedelta(seconds=5)

    def now(self) -> datetime:
        return datetime.now(UTC) + self.shift

    def today(self) -> date:
        return self.current


class FakeNotifier:
    """Telegram в памяти: отправленное копится в `sent`, входящие задаются в `updates`."""

    def __init__(self, delay: float = 0.0) -> None:
        self.sent: list[tuple[str, str]] = []
        # полные сообщения: чат, тема, текст, кнопки
        self.messages: list[tuple[str, int | None, str, Buttons]] = []
        self.edits: list[tuple[str, str, str, Buttons]] = []
        self.answers: list[tuple[str, str]] = []
        self.errors: list[Exception] = []
        self.updates: list[IncomingMessage | IncomingCallback] = []
        self.blocked_chats: set[str] = set()
        self.polls = 0
        self._delay = delay

    async def send(
        self, chat_id: str, text: str, *, thread_id: int | None = None, buttons: Buttons = ()
    ) -> str:
        await asyncio.sleep(self._delay)
        if self.errors:
            raise self.errors.pop(0)
        if chat_id in self.blocked_chats:
            raise ChatBlocked("TelegramForbiddenError: bot was blocked by the user")
        self.sent.append((chat_id, text))
        self.messages.append((chat_id, thread_id, text, buttons))
        return str(len(self.sent))

    async def edit(self, chat_id: str, message_id: str, text: str, buttons: Buttons = ()) -> None:
        self.edits.append((chat_id, message_id, text, buttons))

    async def answer_callback(self, callback_id: str, text: str) -> None:
        self.answers.append((callback_id, text))

    async def close(self) -> None:
        return None

    async def username(self) -> str:
        return BOT_USERNAME

    async def get_updates(
        self, offset: int | None, poll_seconds: int
    ) -> list[IncomingMessage | IncomingCallback]:
        del poll_seconds
        self.polls += 1
        return [u for u in self.updates if offset is None or u.update_id >= offset]


@pytest.fixture
def bot() -> FakeNotifier:
    return FakeNotifier()


@pytest.fixture
def clock() -> ReminderClock:
    return ReminderClock(TODAY)


@pytest.fixture
async def api(
    settings: Settings,
    clock: ReminderClock,
    migrated_engine: AsyncEngine,
    session_factory: async_sessionmaker[AsyncSession],
    bot: FakeNotifier,
) -> AsyncIterator[httpx.AsyncClient]:
    app = create_asgi_app(
        settings,
        migrated_engine,
        clock,
        authenticator=FakeAuthenticator(),
        session_factory=session_factory,
        reminders=REMINDERS,
        telegram_bot=bot,
    )
    transport = httpx.ASGITransport(app=app, raise_app_exceptions=False)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        yield client


async def drop_created(session_factory: async_sessionmaker[AsyncSession]) -> None:
    """Убирает из очереди сообщения о новом платеже: тест проверяет только напоминания."""
    async with session_factory() as session, session.begin():
        await session.execute(delete(Notification).where(Notification.kind == "created"))


async def notifications(
    session_factory: async_sessionmaker[AsyncSession], *, created: bool = False
) -> list[Notification]:
    """Напоминания в очереди; сообщения о новом платеже - только с `created=True`."""
    statement = select(Notification).order_by(Notification.created_at, Notification.kind)
    if not created:
        statement = statement.where(Notification.kind != "created")
    async with session_factory() as session:
        return list(await session.scalars(statement))
