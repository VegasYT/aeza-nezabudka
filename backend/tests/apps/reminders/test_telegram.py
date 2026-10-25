from typing import Any

import pytest
from aiogram.exceptions import (
    TelegramBadRequest,
    TelegramForbiddenError,
    TelegramNetworkError,
    TelegramRetryAfter,
    TelegramServerError,
)
from aiogram.methods import SendMessage
from aiogram.types import Update

from apps.reminders.telegram import (
    ERROR_LIMIT,
    ChatBlocked,
    IncomingFile,
    IncomingMessage,
    PermanentDeliveryError,
    TelegramNotifier,
    TemporaryDeliveryError,
    _incoming,
)

TOKEN = "123456:AAH-secret-token"
METHOD = SendMessage(chat_id=1, text="x")


async def _send_raising(error: Exception) -> Exception:
    notifier = TelegramNotifier(TOKEN)

    async def fail(*_: Any, **__: Any) -> None:
        raise error

    notifier._bot.send_message = fail  # type: ignore[method-assign,assignment]
    try:
        await notifier.send("1", "текст")
    except Exception as raised:
        return raised
    finally:
        await notifier.close()
    raise AssertionError("ошибка не поднялась")


@pytest.mark.parametrize(
    ("error", "expected"),
    [
        (TelegramNetworkError(METHOD, "timeout"), TemporaryDeliveryError),
        (TelegramServerError(METHOD, "Bad Gateway"), TemporaryDeliveryError),
        (TelegramBadRequest(METHOD, "chat not found"), PermanentDeliveryError),
        (TelegramForbiddenError(METHOD, "bot was kicked from the group chat"), ChatBlocked),
    ],
    ids=["network", "server", "chat-not-found", "kicked"],
)
async def test_errors_are_classified(error: Exception, expected: type[Exception]) -> None:
    assert type(await _send_raising(error)) is expected


async def test_rate_limit_keeps_telegram_delay() -> None:
    raised = await _send_raising(TelegramRetryAfter(METHOD, "Too Many Requests", 17))

    assert isinstance(raised, TemporaryDeliveryError)
    assert raised.retry_after == 17


async def test_reason_hides_token_and_is_short() -> None:
    raised = await _send_raising(TelegramNetworkError(METHOD, f"https://x/bot{TOKEN}/ " * 100))

    assert isinstance(raised, TemporaryDeliveryError)
    assert TOKEN not in raised.reason
    assert "***" in raised.reason
    assert len(raised.reason) <= ERROR_LIMIT


def test_incoming_reads_message_and_bot_membership() -> None:
    message = Update.model_validate(
        {
            "update_id": 1,
            "message": {
                "message_id": 7,
                "date": 0,
                "chat": {"id": -100501, "type": "supergroup", "title": "Бухгалтерия"},
                "from": {"id": 5, "is_bot": False, "first_name": "Ирина", "username": "buh"},
                "text": "/start@bot code",
            },
        }
    )
    removed = Update.model_validate(
        {
            "update_id": 2,
            "my_chat_member": {
                "chat": {"id": 501, "type": "private", "first_name": "Ирина"},
                "from": {"id": 5, "is_bot": False, "first_name": "Ирина"},
                "date": 0,
                "old_chat_member": {
                    "status": "member",
                    "user": {"id": 9, "is_bot": True, "first_name": "bot"},
                },
                "new_chat_member": {
                    "status": "kicked",
                    "until_date": 0,
                    "user": {"id": 9, "is_bot": True, "first_name": "bot"},
                },
            },
        }
    )

    assert _incoming(message) == IncomingMessage(
        1, -100501, "supergroup", "buh", "/start@bot code", "Бухгалтерия", "Ирина", from_id=5
    )
    renamed = Update.model_validate(
        {
            "update_id": 3,
            "message": {
                "message_id": 8,
                "date": 0,
                "chat": {"id": -100501, "type": "supergroup", "title": "Бухгалтерия 2026"},
                "new_chat_title": "Бухгалтерия 2026",
            },
        }
    )
    in_topic = Update.model_validate(
        {
            "update_id": 4,
            "message": {
                "message_id": 9,
                "date": 0,
                "message_thread_id": 7,
                "is_topic_message": True,
                "chat": {
                    "id": -100501,
                    "type": "supergroup",
                    "title": "Бухгалтерия",
                    "is_forum": True,
                },
                "text": "/start@bot code",
                "reply_to_message": {
                    "message_id": 7,
                    "date": 0,
                    "chat": {"id": -100501, "type": "supergroup", "title": "Бухгалтерия"},
                    "forum_topic_created": {"name": "Аренда", "icon_color": 7322096},
                },
            },
        }
    )
    topic_message = _incoming(in_topic)
    assert isinstance(topic_message, IncomingMessage)
    assert (topic_message.thread_id, topic_message.topic_name) == (7, "Аренда")
    renamed_message = _incoming(renamed)
    removed_message = _incoming(removed)
    assert isinstance(renamed_message, IncomingMessage)
    assert isinstance(removed_message, IncomingMessage)
    assert renamed_message.new_title == "Бухгалтерия 2026"
    assert removed_message.member_status == "kicked"
    assert removed_message.text is None


def test_incoming_reads_reply_with_file() -> None:
    def reply(attachment: dict[str, object]) -> Update:
        return Update.model_validate(
            {
                "update_id": 4,
                "message": {
                    "message_id": 9,
                    "date": 0,
                    "chat": {"id": -100501, "type": "supergroup", "title": "Бухгалтерия"},
                    "from": {"id": 5, "is_bot": False, "first_name": "Ирина"},
                    "reply_to_message": {
                        "message_id": 3,
                        "date": 0,
                        "chat": {"id": -100501, "type": "supergroup"},
                        "text": "Напоминание",
                    },
                    **attachment,
                },
            }
        )

    document = _incoming(
        reply(
            {
                "document": {
                    "file_id": "d1",
                    "file_unique_id": "u1",
                    "file_name": "чек.pdf",
                    "file_size": 2048,
                }
            }
        )
    )
    photo = _incoming(
        reply(
            {
                "photo": [
                    {"file_id": "small", "file_unique_id": "s", "width": 90, "height": 90},
                    {
                        "file_id": "big",
                        "file_unique_id": "b",
                        "width": 1280,
                        "height": 1280,
                        "file_size": 90000,
                    },
                ]
            }
        )
    )

    assert isinstance(document, IncomingMessage)
    assert isinstance(photo, IncomingMessage)
    assert (document.reply_to, document.from_id) == (3, 5)
    assert document.file == IncomingFile("d1", "чек.pdf", 2048)
    assert photo.file == IncomingFile("big", None, 90000)
