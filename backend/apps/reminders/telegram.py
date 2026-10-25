"""Доставка сообщений в Telegram (ADR-010): протокол для отправителя и реализация на aiogram."""

from dataclasses import dataclass
from typing import Protocol

from aiogram import Bot
from aiogram.client.session.aiohttp import AiohttpSession
from aiogram.enums import ParseMode
from aiogram.exceptions import (
    TelegramBadRequest,
    TelegramForbiddenError,
    TelegramMigrateToChat,
    TelegramNotFound,
    TelegramRetryAfter,
)
from aiogram.types import (
    InlineKeyboardButton,
    InlineKeyboardMarkup,
    LinkPreviewOptions,
    Message,
    Update,
)

from apps.reminders.domain import Button
from core.config import ReminderSettings
from core.metrics import DEPENDENCY_ERRORS

REQUEST_TIMEOUT_SECONDS = 10.0
_NO_PREVIEW = LinkPreviewOptions(is_disabled=True)
ERROR_LIMIT = 500


class DeliveryError(Exception):
    """Причина в `reason` уже без токена бота и не длиннее `ERROR_LIMIT`."""

    def __init__(self, reason: str) -> None:
        super().__init__(reason)
        self.reason = reason


class TemporaryDeliveryError(DeliveryError):
    def __init__(self, reason: str, retry_after: float | None = None) -> None:
        super().__init__(reason)
        self.retry_after = retry_after


class PermanentDeliveryError(DeliveryError):
    pass


class ChatBlocked(PermanentDeliveryError):
    """Бот не может писать в чат: удалён из группы или заблокирован пользователем."""


Buttons = tuple[tuple[Button, ...], ...]


class Notifier(Protocol):
    async def send(
        self, chat_id: str, text: str, *, thread_id: int | None = None, buttons: Buttons = ()
    ) -> str:
        """Отправляет HTML-текст в чат или тему и возвращает идентификатор сообщения."""
        ...

    async def edit(self, chat_id: str, message_id: str, text: str, buttons: Buttons = ()) -> None:
        """Меняет текст и кнопки уже отправленного сообщения."""
        ...

    async def close(self) -> None: ...


@dataclass(frozen=True)
class IncomingFile:
    """Документ или фото в сообщении; фото - в самом большом размере."""

    file_id: str
    name: str | None
    size: int | None


@dataclass(frozen=True)
class IncomingMessage:
    update_id: int
    chat_id: int
    chat_type: str
    username: str | None
    text: str | None
    chat_title: str | None = None
    first_name: str | None = None
    # обновление my_chat_member: новое положение бота в чате (member, kicked, left...)
    member_status: str | None = None
    # служебное сообщение о смене названия группы
    new_title: str | None = None
    # тема супергруппы, если сообщение пришло в тему, и её название
    thread_id: int | None = None
    topic_name: str | None = None
    # служебное сообщение о переименовании темы
    new_topic_name: str | None = None
    # супергруппа с темами
    forum: bool = False
    # Telegram id отправителя; в личном чате совпадает с chat_id
    from_id: int | None = None
    # сообщение, на которое ответили, и приложенный файл: так прикладывают чек
    reply_to: int | None = None
    file: IncomingFile | None = None


@dataclass(frozen=True)
class IncomingCallback:
    """Нажатие кнопки под сообщением бота."""

    update_id: int
    callback_id: str
    # Telegram id нажавшего; совпадает с id его личного чата с ботом
    from_id: int
    from_name: str
    chat_id: int
    message_id: int
    data: str


class BotUpdates(Protocol):
    async def username(self) -> str:
        """Имя бота для ссылки t.me."""
        ...

    async def get_updates(
        self, offset: int | None, poll_seconds: int
    ) -> list[IncomingMessage | IncomingCallback]: ...

    async def answer_callback(self, callback_id: str, text: str) -> None:
        """Всплывающий ответ на нажатие кнопки."""
        ...

    async def download(self, file_id: str) -> bytes: ...


class TelegramBot(Notifier, BotUpdates, Protocol):
    """Бот целиком: отправка и чтение обновлений."""


def redact(text: str, secret: str) -> str:
    return text.replace(secret, "***")[:ERROR_LIMIT] if secret else text[:ERROR_LIMIT]


def _incoming(update: Update) -> IncomingMessage | IncomingCallback:
    callback = update.callback_query
    if callback is not None and callback.message is not None:
        return IncomingCallback(
            update.update_id,
            callback.id,
            callback.from_user.id,
            callback.from_user.full_name,
            callback.message.chat.id,
            callback.message.message_id,
            callback.data or "",
        )
    if update.my_chat_member is not None:
        member = update.my_chat_member
        return IncomingMessage(
            update.update_id,
            member.chat.id,
            member.chat.type,
            member.from_user.username,
            None,
            member.chat.title,
            member.from_user.first_name,
            member.new_chat_member.status,
        )
    message = update.message
    if message is None:
        return IncomingMessage(update.update_id, 0, "", None, None)
    sender = message.from_user
    return IncomingMessage(
        update.update_id,
        message.chat.id,
        message.chat.type,
        None if sender is None else sender.username,
        message.text,
        message.chat.title,
        None if sender is None else sender.first_name,
        new_title=message.new_chat_title,
        thread_id=message.message_thread_id if message.is_topic_message else None,
        topic_name=_topic_name(message),
        new_topic_name=message.forum_topic_edited.name if message.forum_topic_edited else None,
        forum=bool(message.chat.is_forum),
        from_id=None if sender is None else sender.id,
        reply_to=None if message.reply_to_message is None else message.reply_to_message.message_id,
        file=_file(message),
    )


def _file(message: Message) -> IncomingFile | None:
    if message.document is not None:
        document = message.document
        return IncomingFile(document.file_id, document.file_name, document.file_size)
    if message.photo:
        photo = message.photo[-1]
        return IncomingFile(photo.file_id, None, photo.file_size)
    return None


def _topic_name(message: Message) -> str | None:
    """Название темы: сообщение в теме - ответ на служебное сообщение о её создании."""
    created = message.reply_to_message and message.reply_to_message.forum_topic_created
    if not message.is_topic_message or not created:
        return None
    return created.name


def _markup(buttons: Buttons) -> InlineKeyboardMarkup | None:
    if not buttons:
        return None
    return InlineKeyboardMarkup(
        inline_keyboard=[
            [InlineKeyboardButton(text=b.text, url=b.url, callback_data=b.callback) for b in row]
            for row in buttons
        ]
    )


class TelegramNotifier:
    def __init__(self, token: str, proxy_url: str | None = None) -> None:
        self._token = token
        session = AiohttpSession(proxy=proxy_url, timeout=REQUEST_TIMEOUT_SECONDS)
        self._bot = Bot(token, session=session)
        self._username: str | None = None

    @classmethod
    def from_settings(cls, settings: ReminderSettings) -> "TelegramNotifier | None":
        if settings.telegram_bot_token is None:
            return None
        proxy = settings.telegram_proxy_url
        return cls(
            settings.telegram_bot_token.get_secret_value(),
            None if proxy is None else proxy.get_secret_value(),
        )

    async def send(
        self, chat_id: str, text: str, *, thread_id: int | None = None, buttons: Buttons = ()
    ) -> str:
        try:
            message = await self._bot.send_message(
                chat_id,
                text,
                message_thread_id=thread_id,
                parse_mode=ParseMode.HTML,
                reply_markup=_markup(buttons),
                link_preview_options=_NO_PREVIEW,
            )
        except Exception as error:
            raise self._classify(error) from None
        return str(message.message_id)

    async def edit(self, chat_id: str, message_id: str, text: str, buttons: Buttons = ()) -> None:
        try:
            await self._bot.edit_message_text(
                text,
                chat_id=chat_id,
                message_id=int(message_id),
                parse_mode=ParseMode.HTML,
                reply_markup=_markup(buttons),
                link_preview_options=_NO_PREVIEW,
            )
        except TelegramBadRequest as error:
            # повторная правка тем же текстом - не ошибка
            if "message is not modified" not in str(error):
                raise self._classify(error) from None
        except Exception as error:
            raise self._classify(error) from None

    async def answer_callback(self, callback_id: str, text: str) -> None:
        try:
            await self._bot.answer_callback_query(callback_id, text=text)
        except Exception as error:
            raise self._classify(error) from None

    async def download(self, file_id: str) -> bytes:
        try:
            content = await self._bot.download(file_id)
        except Exception as error:
            raise self._classify(error) from None
        return b"" if content is None else content.read()

    async def close(self) -> None:
        await self._bot.session.close()

    async def username(self) -> str:
        if self._username is None:
            try:
                me = await self._bot.get_me()
            except Exception as error:
                raise self._classify(error) from None
            self._username = me.username or ""
        return self._username

    async def get_updates(
        self, offset: int | None, poll_seconds: int
    ) -> list[IncomingMessage | IncomingCallback]:
        """Long polling; ожидание ответа дольше опроса, иначе сессия оборвёт его раньше."""
        try:
            updates = await self._bot.get_updates(
                offset=offset,
                timeout=poll_seconds,
                allowed_updates=["message", "my_chat_member", "callback_query"],
                request_timeout=poll_seconds + int(REQUEST_TIMEOUT_SECONDS),
            )
        except Exception as error:
            raise self._classify(error) from None
        return [_incoming(update) for update in updates]

    def _classify(self, error: Exception) -> DeliveryError:
        DEPENDENCY_ERRORS.labels("telegram").inc()
        reason = redact(f"{type(error).__name__}: {error}", self._token)
        if isinstance(error, TelegramRetryAfter):
            return TemporaryDeliveryError(reason, float(error.retry_after))
        if isinstance(error, TelegramForbiddenError):
            return ChatBlocked(reason)
        if isinstance(error, TelegramBadRequest | TelegramNotFound | TelegramMigrateToChat):
            return PermanentDeliveryError(reason)
        # Сеть, ответы 5xx, неверный токен, таймаут: повторим позже.
        return TemporaryDeliveryError(reason)
