"""Telegram: личные напоминания каждого пользователя и групповые чаты администратора."""

from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, Query, status

from apps.reminders.schemas import (
    GroupChat,
    GroupChatLink,
    GroupChatUpdate,
    TelegramLink,
    TelegramSettingsUpdate,
    TelegramStatus,
)
from apps.reminders.service import GroupChat as GroupChatRow
from apps.reminders.service import (
    GroupChats,
    LinkStatus,
    TelegramLinks,
    group_chats,
    telegram_links,
)
from core.auth import ADMIN, STAFF, Principal, require_roles
from core.schemas import Page, PageQuery, error_responses

router = APIRouter(prefix="/me/telegram", tags=["Уведомления"])
chats_router = APIRouter(prefix="/telegram-chats", tags=["Уведомления"])

Staff = Annotated[Principal, Depends(require_roles(STAFF))]
Service = Annotated[TelegramLinks, Depends(telegram_links)]
Admin = Annotated[Principal, Depends(require_roles(ADMIN))]
Chats = Annotated[GroupChats, Depends(group_chats)]


def _status(state: LinkStatus) -> TelegramStatus:
    return TelegramStatus(
        linked=state.linked,
        telegram_username=state.telegram_username,
        personal_enabled=state.personal_enabled,
        blocked=state.blocked,
        group_chat_configured=state.group_chat_configured,
        department_ids=None if state.department_ids is None else list(state.department_ids),
        telegram_name=state.telegram_name,
        bot_configured=state.bot_configured,
    )


@router.get(
    "",
    summary="Состояние личного Telegram",
    description="Привязка, включение, блокировка бота и фильтр отделов текущего пользователя.",
    responses=error_responses(401, 403),
)
async def get_telegram_status(user: Staff, service: Service) -> TelegramStatus:
    return _status(await service.status(user))


@router.post(
    "/link",
    status_code=status.HTTP_201_CREATED,
    summary="Ссылка для привязки Telegram",
    description=(
        "Одноразовая ссылка на бота, действует 10 минут. "
        "Прежняя неиспользованная ссылка перестаёт действовать. "
        "Если бот не настроен в системе - 409 `telegram_not_configured`, "
        "Telegram недоступен - 503 `telegram_unavailable`."
    ),
    responses=error_responses(401, 403, 409, 503),
)
async def create_telegram_link(user: Staff, service: Service) -> TelegramLink:
    url, expires_at = await service.create_link(user)
    return TelegramLink(url=url, expires_at=expires_at)


@router.patch(
    "",
    summary="Настройки личных напоминаний",
    description=(
        "Меняются только переданные поля: `personalEnabled` включает или выключает напоминания, "
        "`departmentIds` оставляет только платежи этих отделов (`null` - все платежи, "
        "платежи без отдела при фильтре не приходят). Telegram остаётся привязан. "
        "Без привязки - 409 `telegram_not_linked`, несуществующий отдел или пустой список - 400."
    ),
    responses=error_responses(400, 401, 403, 409),
)
async def update_telegram_settings(
    body: TelegramSettingsUpdate, user: Staff, service: Service
) -> TelegramStatus:
    return _status(
        await service.update_settings(
            user,
            enabled=body.personal_enabled,
            department_ids=body.department_ids,
            change_departments="department_ids" in body.model_fields_set,
        )
    )


@router.delete(
    "",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Отвязать Telegram",
    description="Привязка и фильтр удаляются, ожидающие личные напоминания отменяются.",
    responses=error_responses(401, 403),
)
async def unlink_telegram(user: Staff, service: Service) -> None:
    await service.unlink(user)


def _chat(row: GroupChatRow) -> GroupChat:
    return GroupChat(
        id=row.id,
        title=row.title,
        thread_id=row.thread_id,
        topic_name=row.topic_name,
        department_ids=None if row.department_ids is None else list(row.department_ids),
        blocked=row.blocked,
        linked_at=row.linked_at,
    )


@chats_router.get(
    "",
    summary="Групповые чаты",
    description="Чаты, подключённые к напоминаниям, кроме общего чата из настроек. "
    "Только администратор.",
    responses=error_responses(400, 401, 403),
)
async def list_group_chats(
    page: Annotated[PageQuery, Query()], actor: Admin, service: Chats
) -> Page[GroupChat]:
    rows, total = await service.list_chats(page.limit, page.offset)
    return Page(items=[_chat(row) for row in rows], total=total)


@chats_router.post(
    "/link",
    status_code=status.HTTP_201_CREATED,
    summary="Ссылка для подключения группы",
    description=(
        "Одноразовый код, действует 10 минут. `url` - Telegram предложит выбрать группу и "
        "добавит в неё бота, сообщения пойдут без темы. `command` - отправить в нужной теме "
        "супергруппы, где бот уже есть: подключится эта тема. Одну группу можно подключить "
        "к нескольким темам, у каждой свой фильтр отделов. "
        "Прежний неиспользованный код этого администратора перестаёт действовать. "
        "Если бот не настроен в системе - 409 `telegram_not_configured`, "
        "Telegram недоступен - 503 `telegram_unavailable`. Только администратор."
    ),
    responses=error_responses(401, 403, 409, 503),
)
async def create_group_chat_link(actor: Admin, service: Chats) -> GroupChatLink:
    url, command, expires_at = await service.create_link(actor)
    return GroupChatLink(url=url, command=command, expires_at=expires_at)


@chats_router.patch(
    "/{chat_id}",
    summary="Отделы группового чата",
    description="`departmentIds: null` - все платежи, список - только платежи этих отделов "
    "(платежи без отдела в такой чат не приходят). Только администратор.",
    responses=error_responses(400, 401, 403, 404),
)
async def update_group_chat(
    chat_id: UUID, body: GroupChatUpdate, actor: Admin, service: Chats
) -> GroupChat:
    return _chat(await service.set_departments(actor, chat_id, body.department_ids))


@chats_router.delete(
    "/{chat_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Отключить групповой чат",
    description="Ожидающие напоминания чата отменяются; бот остаётся в группе, "
    "но больше ей не пишет. Только администратор.",
    responses=error_responses(400, 401, 403, 404),
)
async def delete_group_chat(chat_id: UUID, actor: Admin, service: Chats) -> None:
    await service.delete(actor, chat_id)
