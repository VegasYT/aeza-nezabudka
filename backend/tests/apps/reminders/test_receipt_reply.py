"""Чек ответом боту: файл или фото в ответ на напоминание отмечают оплату и прикладывают чек."""

import httpx
import pytest
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.worker import telegram_actions
from apps.payments.receipts import ReceiptsService
from apps.payments.service import PaymentsService
from apps.reminders.models import Notification
from apps.reminders.service import (
    NOT_LINKED_ANSWER,
    RECEIPT_REPLY,
    RECEIPT_TOO_BIG_REPLY,
    RECEIPTS_OFF_REPLY,
    TelegramLinks,
)
from apps.reminders.telegram import IncomingFile, IncomingMessage
from tests.apps.payments.conftest import ADMIN, USER
from tests.apps.reminders.conftest import GROUP_CHAT, REMINDERS, FakeNotifier, ReminderClock
from tests.apps.reminders.test_rich import PERSONAL_CHAT, _link_petrova, _sent_reminder
from tests.storage_helpers import PDF, MemoryStorage

pytestmark = pytest.mark.integration

RECEIPT = IncomingFile("file-1", "чек сбер.pdf", len(PDF))


def _links(
    session_factory: async_sessionmaker[AsyncSession],
    clock: ReminderClock,
    bot: FakeNotifier,
    storage: MemoryStorage | None,
) -> TelegramLinks:
    mark_paid, attach = telegram_actions(
        PaymentsService(session_factory, clock), ReceiptsService(session_factory, clock, storage)
    )
    return TelegramLinks(
        session_factory,
        clock,
        REMINDERS,
        bot,
        mark_paid=mark_paid,
        attach_receipt=None if storage is None else attach,
    )


def _reply(
    sent: Notification,
    file: IncomingFile = RECEIPT,
    from_id: int = PERSONAL_CHAT,
    reply_to: int | None = None,
) -> IncomingMessage:
    return IncomingMessage(
        7,
        int(GROUP_CHAT),
        "supergroup",
        "petrova_tg",
        None,
        from_id=from_id,
        reply_to=int(sent.external_id or 0) if reply_to is None else reply_to,
        file=file,
    )


async def test_reply_with_file_marks_paid_and_attaches(
    api: httpx.AsyncClient,
    clock: ReminderClock,
    session_factory: async_sessionmaker[AsyncSession],
    bot: FakeNotifier,
) -> None:
    sent = await _sent_reminder(api, clock, session_factory, bot)
    await _link_petrova(api, clock, session_factory, bot)
    storage = MemoryStorage()
    bot.files[RECEIPT.file_id] = PDF

    answer = await _links(session_factory, clock, bot, storage).handle(_reply(sent))
    occurrence = await api.get(f"/api/v1/payment-occurrences/{sent.occurrence_id}", headers=USER)
    log = (await api.get("/api/v1/audit-log", headers=ADMIN)).json()["items"]

    assert answer == RECEIPT_REPLY
    body = occurrence.json()
    assert (body["paid"], body["paidByLogin"]) == (True, "buh.petrova")
    assert body["receipt"]["fileName"] == "чек сбер.pdf"
    assert [data for data, _, _ in storage.objects.values()] == [PDF]
    assert [(e["action"], e["details"].get("source")) for e in log[:2]] == [
        ("receipt.attached", "telegram"),
        ("occurrence.paid", "telegram"),
    ]


async def test_reply_needs_link_and_reminder(
    api: httpx.AsyncClient,
    clock: ReminderClock,
    session_factory: async_sessionmaker[AsyncSession],
    bot: FakeNotifier,
) -> None:
    sent = await _sent_reminder(api, clock, session_factory, bot)
    await _link_petrova(api, clock, session_factory, bot)
    storage = MemoryStorage()
    links = _links(session_factory, clock, bot, storage)

    stranger = await links.handle(_reply(sent, from_id=999))
    other_message = await links.handle(_reply(sent, reply_to=12345))
    too_big = await links.handle(_reply(sent, IncomingFile("file-2", "scan.pdf", 30_000_000)))
    disabled = await _links(session_factory, clock, bot, None).handle(_reply(sent))

    assert stranger == NOT_LINKED_ANSWER
    assert other_message is None
    assert too_big == RECEIPT_TOO_BIG_REPLY
    assert disabled == RECEIPTS_OFF_REPLY
    assert storage.objects == {}


async def test_reply_with_wrong_file_explains(
    api: httpx.AsyncClient,
    clock: ReminderClock,
    session_factory: async_sessionmaker[AsyncSession],
    bot: FakeNotifier,
) -> None:
    sent = await _sent_reminder(api, clock, session_factory, bot)
    await _link_petrova(api, clock, session_factory, bot)
    bot.files["file-3"] = b"<html>not a receipt</html>"

    answer = await _links(session_factory, clock, bot, MemoryStorage()).handle(
        _reply(sent, IncomingFile("file-3", "чек.pdf", 26))
    )

    assert answer == "Чек - PDF, JPEG, PNG или WebP"
