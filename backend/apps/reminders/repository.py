from collections.abc import Sequence
from datetime import datetime
from uuid import UUID

from sqlalchemy import CompoundSelect, Select, case, delete, func, literal, or_, select, update
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncSession

from apps.reminders.models import (
    TELEGRAM_CHANNEL,
    Notification,
    TelegramChat,
    TelegramChatDepartment,
    TelegramLink,
    TelegramLinkCode,
    TelegramLinkDepartment,
)


async def enqueue(
    session: AsyncSession,
    candidates: CompoundSelect[UUID, UUID | None, str] | Select[UUID, UUID | None, str],
    recipients: CompoundSelect[str, bool, UUID | None],
) -> int:
    """Ставит каждую пару (период, вид) каждому подходящему получателю; стоящие пропускает.

    Получатель с `every` берёт всё, иначе - только периоды своего отдела `department_id`.
    """
    pairs = candidates.subquery("candidates")
    targets = recipients.subquery("recipients")
    rows = (
        select(pairs.c.id, pairs.c.kind, literal(TELEGRAM_CHANNEL), targets.c.recipient)
        .select_from(pairs)
        .join(
            targets,
            or_(targets.c.every, targets.c.department_id == pairs.c.department_id),
        )
    )
    result = await session.execute(
        insert(Notification)
        .from_select(["occurrence_id", "kind", "channel", "recipient"], rows)
        .on_conflict_do_nothing(index_elements=["occurrence_id", "kind", "channel", "recipient"])
        .returning(Notification.id)
    )
    return len(result.all())


async def next_pending(
    session: AsyncSession, now: datetime, skip_recipients: Sequence[str]
) -> Notification | None:
    """Ближайшее ожидающее напоминание; занятые другим отправителем строки пропускаются."""
    statement = (
        select(Notification)
        .where(Notification.state == "pending", Notification.next_attempt_at <= now)
        .order_by(Notification.next_attempt_at, Notification.id)
        .limit(1)
        .with_for_update(skip_locked=True)
    )
    if skip_recipients:
        statement = statement.where(Notification.recipient.not_in(skip_recipients))
    return await session.scalar(statement)


async def last_sent(session: AsyncSession, occurrence_ids: Sequence[UUID]) -> dict[UUID, datetime]:
    rows = await session.execute(
        select(Notification.occurrence_id, func.max(Notification.sent_at))
        .where(Notification.occurrence_id.in_(occurrence_ids), Notification.state == "sent")
        .group_by(Notification.occurrence_id)
    )
    return {occurrence_id: sent_at for occurrence_id, sent_at in rows.all() if sent_at}


async def messages_to_close(
    session: AsyncSession, settled: Select[UUID], limit: int
) -> list[Notification]:
    """Отправленные напоминания закрытых периодов, которые ещё не переписаны в итог."""
    rows = await session.scalars(
        select(Notification)
        .where(
            Notification.state == "sent",
            Notification.external_id.is_not(None),
            Notification.closed_at.is_(None),
            Notification.kind.in_(["due_soon", "overdue"]),
            Notification.occurrence_id.in_(settled),
        )
        .order_by(Notification.sent_at)
        .limit(limit)
        .with_for_update(skip_locked=True)
    )
    return list(rows)


async def sent_by_message(session: AsyncSession, message_id: str) -> list[Notification]:
    """Отправленные напоминания с этим id сообщения Telegram; id уникален только в своём чате."""
    return list(
        await session.scalars(
            select(Notification).where(
                Notification.external_id == message_id, Notification.state == "sent"
            )
        )
    )


async def pending_stats(session: AsyncSession) -> tuple[int, datetime | None]:
    # Без попыток отправки запись ждёт с назначенного времени: так отложенное кнопкой
    # "Напомнить завтра" не выглядит застрявшим. После неудачи - с создания.
    waiting_since = case(
        (Notification.attempts == 0, Notification.next_attempt_at), else_=Notification.created_at
    )
    row = (
        await session.execute(
            select(func.count(), func.min(waiting_since)).where(Notification.state == "pending")
        )
    ).one()
    return int(row[0]), row[1]


async def cancel_pending(session: AsyncSession, recipient: str) -> None:
    await session.execute(
        update(Notification)
        .where(Notification.recipient == recipient, Notification.state == "pending")
        .values(state="cancelled")
    )


async def delete_link(session: AsyncSession, user_id: UUID) -> None:
    await session.execute(delete(TelegramLink).where(TelegramLink.user_id == user_id))


async def link_by_chat(session: AsyncSession, chat_id: int) -> TelegramLink | None:
    return await session.scalar(
        select(TelegramLink).where(TelegramLink.chat_id == chat_id).with_for_update()
    )


async def delete_unused_codes(session: AsyncSession, user_id: UUID, purpose: str) -> None:
    await session.execute(
        delete(TelegramLinkCode).where(
            TelegramLinkCode.user_id == user_id,
            TelegramLinkCode.purpose == purpose,
            TelegramLinkCode.used_at.is_(None),
        )
    )


async def chat_connection(
    session: AsyncSession, chat_id: int, thread_id: int | None
) -> TelegramChat | None:
    """Подключение группы к теме `thread_id` (None - без темы)."""
    thread = (
        TelegramChat.thread_id.is_(None)
        if thread_id is None
        else TelegramChat.thread_id == thread_id
    )
    return await session.scalar(
        select(TelegramChat).where(TelegramChat.chat_id == chat_id, thread).with_for_update()
    )


async def chat_connections(session: AsyncSession, chat_id: int) -> list[TelegramChat]:
    """Все подключения группы: по одному на тему."""
    rows = await session.scalars(
        select(TelegramChat).where(TelegramChat.chat_id == chat_id).with_for_update()
    )
    return list(rows)


async def list_chats(
    session: AsyncSession, limit: int, offset: int
) -> tuple[list[TelegramChat], int]:
    total = await session.scalar(select(func.count()).select_from(TelegramChat))
    rows = await session.scalars(
        select(TelegramChat)
        .order_by(TelegramChat.linked_at, TelegramChat.id)
        .limit(limit)
        .offset(offset)
    )
    return list(rows), total or 0


async def chat_departments(
    session: AsyncSession, chat_ids: Sequence[UUID]
) -> dict[UUID, list[UUID]]:
    result: dict[UUID, list[UUID]] = {}
    rows = await session.execute(
        select(TelegramChatDepartment.chat_id, TelegramChatDepartment.department_id)
        .where(TelegramChatDepartment.chat_id.in_(chat_ids))
        .order_by(TelegramChatDepartment.department_id)
    )
    for chat_id, department_id in rows:
        result.setdefault(chat_id, []).append(department_id)
    return result


async def replace_chat_departments(
    session: AsyncSession, chat_id: UUID, department_ids: Sequence[UUID]
) -> None:
    await session.execute(
        delete(TelegramChatDepartment).where(TelegramChatDepartment.chat_id == chat_id)
    )
    if department_ids:
        await session.execute(
            insert(TelegramChatDepartment),
            [{"chat_id": chat_id, "department_id": d} for d in department_ids],
        )


async def has_active_chats(session: AsyncSession) -> bool:
    return bool(
        await session.scalar(
            select(func.count()).select_from(TelegramChat).where(TelegramChat.blocked_at.is_(None))
        )
    )


async def link_departments(session: AsyncSession, user_id: UUID) -> list[UUID]:
    rows = await session.scalars(
        select(TelegramLinkDepartment.department_id)
        .where(TelegramLinkDepartment.user_id == user_id)
        .order_by(TelegramLinkDepartment.department_id)
    )
    return list(rows)


async def replace_link_departments(
    session: AsyncSession, user_id: UUID, department_ids: Sequence[UUID]
) -> None:
    await session.execute(
        delete(TelegramLinkDepartment).where(TelegramLinkDepartment.user_id == user_id)
    )
    if department_ids:
        await session.execute(
            insert(TelegramLinkDepartment),
            [{"user_id": user_id, "department_id": d} for d in department_ids],
        )
