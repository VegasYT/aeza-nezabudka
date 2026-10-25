"""Постановка напоминаний в очередь, их отправка (ADR-004), личные и групповые чаты (ADR-010)."""

import hashlib
import secrets
import time
from collections.abc import Awaitable, Callable, Sequence
from dataclasses import dataclass
from datetime import date, datetime, timedelta
from html import escape
from uuid import UUID

import structlog
from fastapi import Request
from sqlalchemy import (
    CompoundSelect,
    String,
    Uuid,
    cast,
    exists,
    false,
    literal,
    null,
    or_,
    select,
    text,
    true,
    union_all,
)
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncConnection, AsyncEngine, AsyncSession, async_sessionmaker

from apps.audit.service import record
from apps.payments.service import (
    OccurrenceSubject,
    occurrence_subjects,
    open_occurrence_departments,
    settled_occurrence_ids,
)
from apps.reminders import repository
from apps.reminders.domain import (
    LATER_ACTION,
    PAID_ACTION,
    Card,
    PaymentLine,
    ReminderKind,
    created_card,
    paid_card,
    reminder_card,
    still_relevant,
    stopped_card,
)
from apps.reminders.models import (
    CHAT_RECIPIENT_PREFIX,
    GROUP_PURPOSE,
    GROUP_RECIPIENT,
    PERSONAL_PURPOSE,
    Notification,
    TelegramChat,
    TelegramChatDepartment,
    TelegramLink,
    TelegramLinkCode,
    TelegramLinkDepartment,
)
from apps.reminders.telegram import (
    BotUpdates,
    ChatBlocked,
    DeliveryError,
    IncomingCallback,
    IncomingMessage,
    Notifier,
    PermanentDeliveryError,
    TemporaryDeliveryError,
)
from core.auth import Principal, Role
from core.clock import Clock
from core.config import ReminderSettings
from core.errors import AppError, invalid_field, not_found
from core.metrics import NOTIFICATIONS, TELEGRAM_ACTIONS
from core.retry import retry_delay

log = structlog.get_logger(__name__)

# Ограничения Telegram: около 20 сообщений в минуту в группу и 1 в секунду в личный чат.
GROUP_PAUSE_SECONDS = 3.0
PERSONAL_PAUSE_SECONDS = 1.0


def _is_group(recipient: str) -> bool:
    return recipient == GROUP_RECIPIENT or recipient.startswith(CHAT_RECIPIENT_PREFIX)


def _recipient_kind(recipient: str) -> str:
    return "group" if _is_group(recipient) else "personal"


def _chat_recipient(chat_id: UUID) -> str:
    return f"{CHAT_RECIPIENT_PREFIX}{chat_id}"


async def reminders_sent_at(
    session_factory: async_sessionmaker[AsyncSession], occurrence_ids: Sequence[UUID]
) -> dict[UUID, datetime]:
    """Когда ушло последнее напоминание о каждом периоде; для ответов API платежей."""
    if not occurrence_ids:
        return {}
    async with session_factory() as session:
        return await repository.last_sent(session, occurrence_ids)


async def pending_stats(session: AsyncSession) -> tuple[int, datetime | None]:
    """Сколько напоминаний ждёт отправки и когда создано старейшее."""
    return await repository.pending_stats(session)


def _recipients(
    settings: ReminderSettings, *, personal: bool = True
) -> CompoundSelect[str, bool, UUID | None]:
    """Получатели: `every` - все платежи, иначе только отдела `department_id`.

    Общий чат, если задан; кто включил личные напоминания; подключённые групповые чаты.
    Заблокировавшим бота не ставится.
    """
    no_department = cast(null(), Uuid).label("department_id")
    group = select(
        literal(GROUP_RECIPIENT).label("recipient"), true().label("every"), no_department
    ).where(literal(settings.group_chat_enabled))
    personal_recipient = cast(TelegramLink.user_id, String).label("recipient")
    personal_active = (
        TelegramLink.personal_enabled,
        ~TelegramLink.member_disabled,
        TelegramLink.blocked_at.is_(None),
    )
    # фильтр без единого отдела (все его отделы удалили) значит все платежи
    personal_every = or_(
        TelegramLink.all_departments,
        ~exists().where(TelegramLinkDepartment.user_id == TelegramLink.user_id),
    )
    personal_all = select(personal_recipient, true().label("every"), no_department).where(
        personal_every, *personal_active
    )
    personal_filtered = (
        select(personal_recipient, false().label("every"), TelegramLinkDepartment.department_id)
        .join(TelegramLinkDepartment, TelegramLinkDepartment.user_id == TelegramLink.user_id)
        .where(~TelegramLink.all_departments, *personal_active)
    )
    chat_recipient = (literal(CHAT_RECIPIENT_PREFIX) + cast(TelegramChat.id, String)).label(
        "recipient"
    )
    chat_every = or_(
        TelegramChat.all_departments,
        ~exists().where(TelegramChatDepartment.chat_id == TelegramChat.id),
    )
    chats = select(chat_recipient, true().label("every"), no_department).where(
        chat_every, TelegramChat.blocked_at.is_(None)
    )
    filtered = (
        select(chat_recipient, false().label("every"), TelegramChatDepartment.department_id)
        .join(TelegramChatDepartment, TelegramChatDepartment.chat_id == TelegramChat.id)
        .where(~TelegramChat.all_departments, TelegramChat.blocked_at.is_(None))
    )
    if not personal:
        return union_all(group, chats, filtered)
    return union_all(group, personal_all, personal_filtered, chats, filtered)


async def enqueue(
    session: AsyncSession,
    today: date,
    settings: ReminderSettings,
    payment_ids: Sequence[UUID] | None = None,
    *,
    created: bool = False,
) -> int:
    """Ставит напоминания всем подходящим периодам; возвращает число новых строк.

    `created` - платёж только что создан: общий и групповые чаты получают сообщение о нём.
    """
    queued = 0
    if created and payment_ids:
        first = open_occurrence_departments(today, None, payment_ids, first_only=True)
        queued += await repository.enqueue(
            session,
            first.add_columns(literal(ReminderKind.CREATED.value).label("kind")),
            _recipients(settings, personal=False),
        )
    window_end = today + timedelta(days=settings.reminder_days_before)
    candidates = union_all(
        open_occurrence_departments(today, window_end, payment_ids).add_columns(
            literal(ReminderKind.DUE_SOON.value).label("kind")
        ),
        open_occurrence_departments(None, today - timedelta(days=1), payment_ids).add_columns(
            literal(ReminderKind.OVERDUE.value).label("kind")
        ),
    )
    return queued + await repository.enqueue(session, candidates, _recipients(settings))


@dataclass(frozen=True)
class Destination:
    chat_id: str
    thread_id: int | None
    # привязка или групповой чат: им ставится отметка блокировки
    target: TelegramLink | TelegramChat | None


async def destination(
    session: AsyncSession, settings: ReminderSettings, recipient: str
) -> Destination | None:
    """Чат получателя сейчас: личный или групповой - если привязан и не заблокирован."""
    if recipient == GROUP_RECIPIENT:
        if settings.telegram_chat_id is None:
            return None
        return Destination(settings.telegram_chat_id, settings.telegram_thread_id, None)
    if recipient.startswith(CHAT_RECIPIENT_PREFIX):
        chat = await session.get(TelegramChat, UUID(recipient.removeprefix(CHAT_RECIPIENT_PREFIX)))
        if chat is None or chat.blocked_at is not None:
            return None
        return Destination(str(chat.chat_id), chat.thread_id, chat)
    link = await session.get(TelegramLink, UUID(recipient))
    if (
        link is None
        or not link.personal_enabled
        or link.member_disabled
        or link.blocked_at is not None
    ):
        return None
    return Destination(str(link.chat_id), None, link)


def _line(subject: OccurrenceSubject) -> PaymentLine:
    return PaymentLine(
        subject.payment_id,
        subject.payment_name,
        subject.amount_minor,
        subject.currency.value,
        subject.due_date,
        subject.department_name,
    )


class ReminderSender:
    """Отправляет ожидающие напоминания по одному, каждое в своей транзакции."""

    def __init__(
        self,
        session_factory: async_sessionmaker[AsyncSession],
        clock: Clock,
        notifier: Notifier,
        settings: ReminderSettings,
        *,
        monotonic: Callable[[], float] = time.monotonic,
    ) -> None:
        self._session_factory = session_factory
        self._clock = clock
        self._notifier = notifier
        self._settings = settings
        self._monotonic = monotonic
        # Паузы по получателям ведёт каждый экземпляр сам; лимит между экземплярами даст 429.
        self._free_at: dict[str, float] = {}

    async def send_due(self) -> int:
        """Обрабатывает всё, что можно отправить сейчас; возвращает число обработанных строк."""
        handled = 0
        while await self.send_one():
            handled += 1
        return handled

    async def send_one(self) -> bool:
        now = self._clock.now()
        moment = self._monotonic()
        paused = [recipient for recipient, free in self._free_at.items() if free > moment]
        async with self._session_factory() as session, session.begin():
            notification = await repository.next_pending(session, now, paused)
            if notification is None:
                return False
            card = await self._card(session, notification)
            target_chat = await destination(session, self._settings, notification.recipient)
            if card is None or target_chat is None:
                notification.state = "cancelled"
                NOTIFICATIONS.labels(_recipient_kind(notification.recipient), "cancelled").inc()
                log.info("reminder_cancelled", notification_id=str(notification.id))
                return True
            pause = self._pause(notification.recipient)
            notification.attempts += 1
            try:
                notification.external_id = await self._notifier.send(
                    target_chat.chat_id,
                    card.text,
                    thread_id=target_chat.thread_id,
                    buttons=card.buttons,
                )
            except TemporaryDeliveryError as error:
                delay = error.retry_after or retry_delay(notification.attempts)
                notification.next_attempt_at = now + timedelta(seconds=delay)
                notification.last_error = error.reason
                pause = max(pause, error.retry_after or 0.0)
                result = "retry"
                log.warning("reminder_retry", notification_id=str(notification.id), delay=delay)
            except PermanentDeliveryError as error:
                notification.state = "failed"
                notification.last_error = error.reason
                if isinstance(error, ChatBlocked) and target_chat.target is not None:
                    # Бота заблокировали или удалили из группы: молчим до повторной привязки.
                    target_chat.target.blocked_at = now
                result = "failed"
                log.error("reminder_failed", notification_id=str(notification.id))
            else:
                notification.state = "sent"
                notification.sent_at = now
                notification.last_error = None
                result = "sent"
                log.info("reminder_sent", notification_id=str(notification.id))
            NOTIFICATIONS.labels(_recipient_kind(notification.recipient), result).inc()
            self._free_at[notification.recipient] = self._monotonic() + pause
            return True

    async def _card(self, session: AsyncSession, notification: Notification) -> Card | None:
        """Сообщение, если напоминание всё ещё нужно отправить."""
        subjects = await occurrence_subjects(session, [notification.occurrence_id])
        subject = subjects.get(notification.occurrence_id)
        today = self._clock.today()
        kind = ReminderKind(notification.kind)
        if subject is None or not still_relevant(
            kind,
            subject.due_date,
            subject.paid,
            subject.active,
            today=today,
            days_before=self._settings.reminder_days_before,
        ):
            return None
        panel = self._settings.public_url
        if kind is ReminderKind.CREATED:
            return created_card(_line(subject), panel_url=panel)
        return reminder_card(
            kind, _line(subject), today=today, panel_url=panel, notification_id=notification.id
        )

    @staticmethod
    def _pause(recipient: str) -> float:
        return GROUP_PAUSE_SECONDS if _is_group(recipient) else PERSONAL_PAUSE_SECONDS


CLOSE_BATCH = 20


class ReminderUpdater:
    """Переписывает отправленные напоминания в итог, когда период оплатили или платёж прекратили:
    в чате сразу видно, что закрыто, и кнопки действий пропадают."""

    def __init__(
        self,
        session_factory: async_sessionmaker[AsyncSession],
        clock: Clock,
        notifier: Notifier,
        settings: ReminderSettings,
    ) -> None:
        self._session_factory = session_factory
        self._clock = clock
        self._notifier = notifier
        self._settings = settings

    async def run_once(self) -> int:
        now = self._clock.now()
        async with self._session_factory() as session, session.begin():
            rows = await repository.messages_to_close(
                session, settled_occurrence_ids(), CLOSE_BATCH
            )
            subjects = await occurrence_subjects(session, [row.occurrence_id for row in rows])
            closed = 0
            for row in rows:
                subject = subjects.get(row.occurrence_id)
                target = await destination(session, self._settings, row.recipient)
                if subject is not None and target is not None and row.external_id is not None:
                    try:
                        card = self._final(subject)
                        await self._notifier.edit(
                            target.chat_id, row.external_id, card.text, card.buttons
                        )
                    except TemporaryDeliveryError:
                        continue
                    except PermanentDeliveryError as error:
                        # сообщение удалили или бот больше не в чате - править нечего
                        log.info("reminder_edit_skipped", reason=error.reason)
                row.closed_at = now
                closed += 1
            return closed

    def _final(self, subject: OccurrenceSubject) -> Card:
        panel = self._settings.public_url
        if subject.paid and subject.paid_on is not None:
            return paid_card(
                _line(subject), subject.paid_on, subject.paid_by_login, panel_url=panel
            )
        return stopped_card(_line(subject), panel_url=panel)


LINK_TTL = timedelta(minutes=10)
LINKED_REPLY = "Готово, напоминания о платежах будут приходить сюда. Отключить: /stop"
RESUMED_REPLY = "Напоминания о платежах снова будут приходить сюда."
ALREADY_LINKED_REPLY = "Напоминания о платежах уже приходят сюда. Отключить: /stop"
STOPPED_REPLY = (
    "Личные напоминания отключены, Telegram отвязан. Подключить снова можно в веб-панели."
)
HINT_REPLY = (
    "Этот бот присылает напоминания о платежах. Чтобы получать их здесь, "
    "откройте ссылку подключения Telegram в веб-панели."
)
GROUP_LINKED_REPLY = "Готово, напоминания о платежах будут приходить в этот чат."
STALE_BUTTON = "Кнопка устарела: откройте платёж в панели"
NOT_LINKED_ANSWER = (
    "Сначала привяжите свой Telegram в панели: раздел Уведомления. "
    "Без привязки бот не знает, кто нажал кнопку."
)
PAID_ANSWER = "✅ Отмечено: оплачено сегодня"
LATER_ANSWER = "⏰ Напомню завтра"
LATER_DELAY = timedelta(days=1)


@dataclass(frozen=True)
class CallbackResult:
    """Ответ на нажатие кнопки и, если нужно, новый вид сообщения."""

    answer: str
    card: Card | None = None


MarkPaid = Callable[[Principal, UUID], Awaitable[object]]
# короткие метки итога нажатия для метрики вместо текстов ответа
_ACTION_RESULTS = {
    PAID_ANSWER: "done",
    LATER_ANSWER: "done",
    NOT_LINKED_ANSWER: "not_linked",
    STALE_BUTTON: "stale",
}


@dataclass(frozen=True)
class _Press:
    """Проверенное нажатие: кнопка этого сообщения, нажал привязанный участник."""

    action: str
    notification: Notification
    actor: Principal
    subject: OccurrenceSubject


def _uuid(raw: str) -> UUID | None:
    try:
        return UUID(raw)
    except ValueError:
        return None


GROUP_CHAT_TYPES = frozenset({"group", "supergroup"})
FORUM_HINT = (
    "Бот добавлен. Чтобы напоминания приходили в тему, отправьте в ней команду:\n"
    "<code>{command}</code>\n\n"
    'Чтобы они приходили сюда, в "Общее", отправьте эту же команду здесь ещё раз. '
    "Код действует 10 минут."
)


def _code_hash(code: str) -> str:
    return hashlib.sha256(code.encode()).hexdigest()


async def _issue_code(
    session_factory: async_sessionmaker[AsyncSession],
    clock: Clock,
    bot: BotUpdates | None,
    user: Principal,
    purpose: str,
) -> tuple[str, str, datetime]:
    """Одноразовый код привязки; прежний неиспользованный код того же назначения пропадает.

    Возвращает имя бота, код и срок действия.
    """
    if bot is None:
        raise AppError(
            "telegram_not_configured", "Telegram-бот не настроен в системе", status_code=409
        )
    try:
        bot_name = await bot.username()
    except DeliveryError:
        raise AppError(
            "telegram_unavailable", "Telegram временно недоступен", status_code=503
        ) from None
    code = secrets.token_urlsafe(24)
    expires_at = clock.now() + LINK_TTL
    async with session_factory() as session, session.begin():
        await repository.delete_unused_codes(session, user.id, purpose)
        session.add(
            TelegramLinkCode(
                code_hash=_code_hash(code),
                user_id=user.id,
                login=user.login,
                purpose=purpose,
                expires_at=expires_at,
            )
        )
    return bot_name, code, expires_at


async def _usable_code(
    session: AsyncSession, code: str, purpose: str, now: datetime
) -> TelegramLinkCode | None:
    found = await session.get(TelegramLinkCode, _code_hash(code), with_for_update=True)
    if found is None or found.purpose != purpose or found.used_at is not None:
        return None
    return found if found.expires_at > now else None


async def set_member_enabled(session: AsyncSession, user_id: UUID, enabled: bool) -> None:
    """Участника отключили или включили: личные напоминания останавливаются или идут снова."""
    link = await session.get(TelegramLink, user_id, with_for_update=True)
    if link is None:
        return
    link.member_disabled = not enabled
    if not enabled:
        await repository.cancel_pending(session, str(user_id))


async def forget_user(session: AsyncSession, user_id: UUID) -> None:
    """Удаляет привязку и отменяет ожидающие личные напоминания пользователя."""
    await repository.cancel_pending(session, str(user_id))
    await repository.delete_link(session, user_id)


@dataclass(frozen=True)
class LinkStatus:
    linked: bool
    telegram_username: str | None
    personal_enabled: bool
    blocked: bool
    group_chat_configured: bool
    # None - все отделы
    department_ids: tuple[UUID, ...] | None
    telegram_name: str | None
    bot_configured: bool


class TelegramLinks:
    """Привязка личного чата: из веб-панели и командами бота."""

    def __init__(
        self,
        session_factory: async_sessionmaker[AsyncSession],
        clock: Clock,
        settings: ReminderSettings,
        bot: BotUpdates | None,
        *,
        mark_paid: MarkPaid | None = None,
    ) -> None:
        self._session_factory = session_factory
        self._clock = clock
        self._settings = settings
        self._bot = bot
        # отметка оплаты через модуль платежей; в api не нужна, кнопки читает worker
        self._mark_paid = mark_paid

    async def status(self, user: Principal) -> LinkStatus:
        async with self._session_factory() as session:
            return await self._status(session, await session.get(TelegramLink, user.id))

    async def create_link(self, user: Principal) -> tuple[str, datetime]:
        bot_name, code, expires_at = await _issue_code(
            self._session_factory, self._clock, self._bot, user, PERSONAL_PURPOSE
        )
        return f"https://t.me/{bot_name}?start={code}", expires_at

    async def update_settings(
        self,
        user: Principal,
        *,
        enabled: bool | None = None,
        department_ids: Sequence[UUID] | None = None,
        change_departments: bool = False,
    ) -> LinkStatus:
        """`change_departments` с `department_ids=None` - все отделы.

        Уже стоящие в очереди напоминания фильтр не трогает.
        """
        try:
            async with self._session_factory() as session, session.begin():
                link = await session.get(TelegramLink, user.id, with_for_update=True)
                if link is None:
                    raise AppError("telegram_not_linked", "Telegram не привязан", status_code=409)
                if enabled is not None:
                    link.personal_enabled = enabled
                    if not enabled:
                        await repository.cancel_pending(session, str(user.id))
                if change_departments:
                    wanted = (
                        None if department_ids is None else tuple(dict.fromkeys(department_ids))
                    )
                    link.all_departments = wanted is None
                    await repository.replace_link_departments(session, user.id, wanted or ())
                return await self._status(session, link)
        except IntegrityError:
            raise invalid_field("departmentIds", "Отдел не найден") from None

    async def unlink(self, user: Principal) -> None:
        async with self._session_factory() as session, session.begin():
            await forget_user(session, user.id)

    async def handle(self, message: IncomingMessage) -> str | None:
        """Команда боту; возвращает ответ. В группе понимает только `/start` с кодом группы."""
        if (
            message.member_status is not None
            or message.new_title is not None
            or message.new_topic_name is not None
        ):
            async with self._session_factory() as session, session.begin():
                await self._chat_changed(session, message)
            return None
        if message.text is None:
            return None
        command, _, argument = message.text.strip().partition(" ")
        command = command.split("@", 1)[0]
        argument = argument.strip()
        if message.chat_type in GROUP_CHAT_TYPES:
            if command != "/start" or not argument:
                return None
            async with self._session_factory() as session, session.begin():
                return await self._link_group(session, message, argument)
        if message.chat_type != "private":
            return None
        async with self._session_factory() as session, session.begin():
            return await self._private(session, message, command, argument)

    async def handle_callback(self, callback: IncomingCallback) -> CallbackResult:
        """Кнопка под напоминанием. Нажавший определяется по личной привязке: его Telegram id
        - id личного чата. Кнопка должна принадлежать именно этому сообщению."""
        async with self._session_factory() as session, session.begin():
            press = await self._press(session, callback)
            if isinstance(press, CallbackResult):
                return press
            if press.action == LATER_ACTION:
                return await self._postpone(session, press, callback.from_name)
        return await self._pay(press)

    async def _press(
        self, session: AsyncSession, callback: IncomingCallback
    ) -> "_Press | CallbackResult":
        action, _, raw_id = callback.data.partition(":")
        notification_id = _uuid(raw_id)
        notification = None
        if notification_id is not None and action in (PAID_ACTION, LATER_ACTION):
            notification = await session.get(Notification, notification_id, with_for_update=True)
        target = (
            None
            if notification is None or notification.external_id != str(callback.message_id)
            else await destination(session, self._settings, notification.recipient)
        )
        if notification is None or target is None or target.chat_id != str(callback.chat_id):
            return CallbackResult(STALE_BUTTON)
        link = await repository.link_by_chat(session, callback.from_id)
        if link is None or link.member_disabled:
            return CallbackResult(NOT_LINKED_ANSWER)
        subject = (await occurrence_subjects(session, [notification.occurrence_id])).get(
            notification.occurrence_id
        )
        if subject is None or subject.paid:
            return CallbackResult("Уже оплачено")
        if not subject.active:
            return CallbackResult("Платёж прекращён")
        return _Press(action, notification, Principal(link.user_id, link.login, Role.USER), subject)

    async def _postpone(self, session: AsyncSession, press: "_Press", who: str) -> CallbackResult:
        """То же напоминание уйдёт снова через сутки, если период ещё не оплатят."""
        until = self._clock.now() + LATER_DELAY
        press.notification.state = "pending"
        press.notification.attempts = 0
        press.notification.next_attempt_at = until
        await record(
            session,
            press.actor,
            "reminder.postponed",
            "occurrence",
            entity_id=press.notification.occurrence_id,
            entity_name=press.subject.payment_name,
            details={"source": "telegram", "until": until.isoformat()},
        )
        card = reminder_card(
            ReminderKind(press.notification.kind),
            _line(press.subject),
            today=self._clock.today(),
            panel_url=self._settings.public_url,
            footer=f"⏰ Напомню завтра · {escape(who)}",
        )
        return CallbackResult(LATER_ANSWER, card)

    async def _pay(self, press: "_Press") -> CallbackResult:
        """Отметка отдельной транзакцией модуля платежей: как из панели, с журналом и событиями."""
        if self._mark_paid is None:
            return CallbackResult(STALE_BUTTON)
        try:
            await self._mark_paid(press.actor, press.notification.occurrence_id)
        except AppError as error:
            return CallbackResult(error.message)
        card = paid_card(
            _line(press.subject),
            self._clock.today(),
            press.actor.login,
            panel_url=self._settings.public_url,
        )
        return CallbackResult(PAID_ANSWER, card)

    async def _private(
        self, session: AsyncSession, message: IncomingMessage, command: str, argument: str
    ) -> str:
        if command == "/start" and argument:
            return await self._link(session, message, argument)
        if command == "/start":
            return await self._resume(session, message.chat_id)
        if command == "/stop":
            link = await repository.link_by_chat(session, message.chat_id)
            if link is None:
                return HINT_REPLY
            await forget_user(session, link.user_id)
            return STOPPED_REPLY
        return HINT_REPLY

    async def _link(self, session: AsyncSession, message: IncomingMessage, code: str) -> str:
        now = self._clock.now()
        found = await _usable_code(session, code, PERSONAL_PURPOSE, now)
        if found is None:
            return HINT_REPLY
        found.used_at = now
        previous = await repository.link_by_chat(session, message.chat_id)
        if previous is not None and previous.user_id != found.user_id:
            # Один чат - один пользователь: прежний владелец чата теряет привязку.
            await forget_user(session, previous.user_id)
            session.expunge(previous)
        link = await session.get(TelegramLink, found.user_id, with_for_update=True)
        if link is None:
            link = TelegramLink(user_id=found.user_id)
            session.add(link)
        link.login = found.login
        link.chat_id = message.chat_id
        link.telegram_username = message.username
        link.telegram_name = message.first_name
        link.personal_enabled = True
        link.linked_at = now
        link.blocked_at = None
        log.info("telegram_linked", user_id=str(found.user_id))
        return LINKED_REPLY

    async def _start_command(self, code: str) -> str:
        try:
            bot_name = await self._bot.username() if self._bot is not None else ""
        except DeliveryError:
            bot_name = ""
        return f"/start@{bot_name} {code}" if bot_name else f"/start {code}"

    async def _chat_changed(self, session: AsyncSession, message: IncomingMessage) -> None:
        """Служебные события чата: бота удалили или вернули, группу или тему переименовали."""
        if message.member_status is not None:
            await self._membership(session, message)
            return
        if message.chat_type not in GROUP_CHAT_TYPES:
            return
        if message.new_title is not None:
            for chat in await repository.chat_connections(session, message.chat_id):
                chat.title = message.new_title[:255]
        if message.new_topic_name is not None and message.thread_id is not None:
            topic = await repository.chat_connection(session, message.chat_id, message.thread_id)
            if topic is not None:
                topic.topic_name = message.new_topic_name[:128]

    async def _membership(self, session: AsyncSession, message: IncomingMessage) -> None:
        """Бота заблокировали, удалили из группы или вернули: отметка ставится сразу,
        не дожидаясь ошибки при следующей отправке."""
        removed = message.member_status in {"kicked", "left"}
        targets: list[TelegramLink | TelegramChat] = []
        if message.chat_type in GROUP_CHAT_TYPES:
            # бот один на группу: его удаление касается всех тем
            targets.extend(await repository.chat_connections(session, message.chat_id))
        elif (link := await repository.link_by_chat(session, message.chat_id)) is not None:
            targets.append(link)
        for target in targets:
            if isinstance(target, TelegramChat) and message.chat_title:
                target.title = message.chat_title[:255]
            if removed and target.blocked_at is None:
                target.blocked_at = self._clock.now()
            elif not removed:
                target.blocked_at = None

    async def _link_group(
        self, session: AsyncSession, message: IncomingMessage, code: str
    ) -> str | None:
        """Бота добавили в группу по ссылке `startgroup`: группа становится получателем.

        Чужие коды в группе остаются без ответа, чтобы бот не шумел в чате.
        """
        now = self._clock.now()
        found = await _usable_code(session, code, GROUP_PURPOSE, now)
        if found is None:
            return None
        if message.forum and message.thread_id is None and found.general_asked_at is None:
            # Ссылка startgroup всегда шлёт код в "Общее". В группе с темами сразу подключать
            # его нельзя: после подключения темы напоминания шли бы дважды.
            found.general_asked_at = now
            return FORUM_HINT.format(command=await self._start_command(code))
        found.used_at = now
        # из темы супергруппы - писать в эту тему; у каждой темы своё подключение
        chat = await repository.chat_connection(session, message.chat_id, message.thread_id)
        if chat is None:
            # новое подключение получает платежи всех отделов
            chat = TelegramChat(chat_id=message.chat_id, thread_id=message.thread_id)
            session.add(chat)
        chat.title = (message.chat_title or str(message.chat_id))[:255]
        if message.topic_name is not None:
            chat.topic_name = message.topic_name[:128]
        chat.linked_at = now
        chat.blocked_at = None
        await session.flush()
        await record(
            session,
            Principal(found.user_id, found.login, Role.ADMIN),
            "telegram_chat.linked",
            "telegram_chat",
            entity_id=chat.id,
            entity_name=chat.title,
            details={"title": chat.title},
        )
        log.info("telegram_chat_linked", chat_id=str(chat.id))
        return GROUP_LINKED_REPLY

    @staticmethod
    async def _resume(session: AsyncSession, chat_id: int) -> str:
        link = await repository.link_by_chat(session, chat_id)
        if link is None:
            return HINT_REPLY
        if link.blocked_at is None:
            return ALREADY_LINKED_REPLY
        link.blocked_at = None
        return RESUMED_REPLY

    async def _status(self, session: AsyncSession, link: TelegramLink | None) -> LinkStatus:
        department_ids = None
        if link is not None and not link.all_departments:
            # пустой фильтр (отделы удалили) - все платежи
            department_ids = tuple(await repository.link_departments(session, link.user_id))
        return LinkStatus(
            linked=link is not None,
            telegram_username=None if link is None else link.telegram_username,
            personal_enabled=link is not None and link.personal_enabled,
            blocked=link is not None and link.blocked_at is not None,
            group_chat_configured=self._settings.group_chat_enabled
            or await repository.has_active_chats(session),
            department_ids=department_ids or None,
            telegram_name=None if link is None else link.telegram_name,
            bot_configured=self._bot is not None,
        )


@dataclass(frozen=True)
class GroupChat:
    id: UUID
    title: str
    thread_id: int | None
    topic_name: str | None
    # None - все отделы
    department_ids: tuple[UUID, ...] | None
    blocked: bool
    linked_at: datetime


def _chat_not_found(chat_id: UUID) -> AppError:
    return not_found("telegram_chat", chat_id, "Чат не найден")


class GroupChats:
    """Групповые чаты, подключённые администратором (ADR-010)."""

    def __init__(
        self,
        session_factory: async_sessionmaker[AsyncSession],
        clock: Clock,
        bot: BotUpdates | None,
    ) -> None:
        self._session_factory = session_factory
        self._clock = clock
        self._bot = bot

    async def list_chats(self, limit: int, offset: int) -> tuple[list[GroupChat], int]:
        async with self._session_factory() as session:
            chats, total = await repository.list_chats(session, limit, offset)
            departments = await repository.chat_departments(session, [chat.id for chat in chats])
        return [_group_chat(chat, departments.get(chat.id, ())) for chat in chats], total

    async def create_link(self, actor: Principal) -> tuple[str, str, datetime]:
        """Ссылка добавляет бота в группу (сообщения пойдут без темы); команда, отправленная
        в теме группы, где бот уже есть, подключает эту тему. Код одноразовый."""
        bot_name, code, expires_at = await _issue_code(
            self._session_factory, self._clock, self._bot, actor, GROUP_PURPOSE
        )
        return (
            f"https://t.me/{bot_name}?startgroup={code}",
            f"/start@{bot_name} {code}",
            expires_at,
        )

    async def set_departments(
        self, actor: Principal, chat_id: UUID, department_ids: Sequence[UUID] | None
    ) -> GroupChat:
        """None - все отделы. Уже стоящие в очереди напоминания чата фильтр не трогает."""
        wanted = None if department_ids is None else tuple(dict.fromkeys(department_ids))
        try:
            async with self._session_factory() as session, session.begin():
                chat = await session.get(TelegramChat, chat_id, with_for_update=True)
                if chat is None:
                    raise _chat_not_found(chat_id)
                chat.all_departments = wanted is None
                await repository.replace_chat_departments(session, chat_id, wanted or ())
                await record(
                    session,
                    actor,
                    "telegram_chat.updated",
                    "telegram_chat",
                    entity_id=chat_id,
                    entity_name=chat.title,
                    details={"departmentIds": None if wanted is None else [str(i) for i in wanted]},
                )
                return _group_chat(chat, wanted or ())
        except IntegrityError:
            raise invalid_field("departmentIds", "Отдел не найден") from None

    async def delete(self, actor: Principal, chat_id: UUID) -> None:
        async with self._session_factory() as session, session.begin():
            chat = await session.get(TelegramChat, chat_id, with_for_update=True)
            if chat is None:
                raise _chat_not_found(chat_id)
            await repository.cancel_pending(session, _chat_recipient(chat_id))
            await record(
                session,
                actor,
                "telegram_chat.deleted",
                "telegram_chat",
                entity_id=chat_id,
                entity_name=chat.title,
                details={"title": chat.title},
            )
            await session.delete(chat)


def _group_chat(chat: TelegramChat, department_ids: Sequence[UUID]) -> GroupChat:
    return GroupChat(
        id=chat.id,
        title=chat.title,
        thread_id=chat.thread_id,
        topic_name=chat.topic_name,
        # пустой фильтр (отделы удалили) - все платежи
        department_ids=None
        if chat.all_departments or not department_ids
        else tuple(department_ids),
        blocked=chat.blocked_at is not None,
        linked_at=chat.linked_at,
    )


def group_chats(request: Request) -> GroupChats:
    return GroupChats(
        request.app.state.session_factory,
        request.app.state.clock,
        request.app.state.telegram_bot,
    )


def telegram_links(request: Request) -> TelegramLinks:
    return TelegramLinks(
        request.app.state.session_factory,
        request.app.state.clock,
        request.app.state.reminder_settings,
        request.app.state.telegram_bot,
    )


# Ключ advisory-блокировки: getUpdates на один токен допускает только одного читателя.
UPDATES_LOCK_KEY = 7_301_001
POLL_TIMEOUT_SECONDS = 10


class UpdatesPoller:
    """Читает обновления бота, пока этот экземпляр держит advisory-блокировку."""

    def __init__(
        self,
        engine: AsyncEngine,
        links: TelegramLinks,
        bot: BotUpdates,
        notifier: Notifier,
        *,
        poll_timeout: int = POLL_TIMEOUT_SECONDS,
    ) -> None:
        self._engine = engine
        self._links = links
        self._bot = bot
        self._notifier = notifier
        self._poll_timeout = poll_timeout
        self._lock: AsyncConnection | None = None
        self._offset: int | None = None

    @property
    def holds_lock(self) -> bool:
        return self._lock is not None

    async def run_once(self) -> None:
        if not await self._ensure_lock():
            return
        try:
            messages = await self._bot.get_updates(self._offset, self._poll_timeout)
        except DeliveryError as error:
            log.warning("telegram_updates_failed", reason=error.reason)
            return
        for message in messages:
            self._offset = message.update_id + 1
            if isinstance(message, IncomingCallback):
                await self._answer(message)
                continue
            reply = await self._links.handle(message)
            if reply is None:
                continue
            try:
                await self._notifier.send(str(message.chat_id), reply, thread_id=message.thread_id)
            except DeliveryError as error:
                log.warning("telegram_reply_failed", reason=error.reason)

    async def _answer(self, callback: IncomingCallback) -> None:
        result = await self._links.handle_callback(callback)
        action = callback.data.partition(":")[0]
        TELEGRAM_ACTIONS.labels(
            action if action in (PAID_ACTION, LATER_ACTION) else "other",
            _ACTION_RESULTS.get(result.answer, "refused"),
        ).inc()
        try:
            await self._bot.answer_callback(callback.callback_id, result.answer)
            if result.card is not None:
                await self._notifier.edit(
                    str(callback.chat_id),
                    str(callback.message_id),
                    result.card.text,
                    result.card.buttons,
                )
        except DeliveryError as error:
            log.warning("telegram_callback_reply_failed", reason=error.reason)

    async def close(self) -> None:
        if self._lock is not None:
            # Возврат в пул сохранил бы сессию PostgreSQL, а с ней и блокировку.
            await self._lock.invalidate()
            await self._lock.close()
            self._lock = None

    async def _ensure_lock(self) -> bool:
        if self._lock is not None:
            try:
                await self._lock.execute(text("select 1"))
                await self._lock.commit()
            except Exception:
                # Соединение оборвалось - вместе с ним пропала и блокировка.
                log.warning("telegram_updates_lock_lost")
                await self.close()
            else:
                return True
        connection = await self._engine.connect()
        try:
            locked = await connection.scalar(
                text("select pg_try_advisory_lock(:key)"), {"key": UPDATES_LOCK_KEY}
            )
            await connection.commit()
        except Exception:
            await connection.close()
            raise
        if not locked:
            await connection.close()
            return False
        self._lock = connection
        log.info("telegram_updates_lock_acquired")
        return True
