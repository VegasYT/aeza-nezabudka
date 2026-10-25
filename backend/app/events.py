"""Поток событий для панели (ADR-016): что изменилось, без самих данных."""

import asyncio
import time
from collections.abc import AsyncGenerator, AsyncIterable
from typing import Annotated

from fastapi import APIRouter, Depends, Request
from fastapi.sse import EventSourceResponse, ServerSentEvent

from core.auth import Principal, Role, current_principal
from core.live import LiveBroker, LiveEvent
from core.schemas import error_responses

# через сколько браузер переподключается после обрыва
RETRY_MS = 3000
# Доступ проверяется при открытии потока: закрытый поток переподключается и проходит проверку
# заново. Так истёкшая сессия или отозванный ключ Aéza не держат поток часами.
MAX_STREAM_SECONDS = 600

router = APIRouter(tags=["События"])


def visible(event: LiveEvent, principal: Principal) -> bool:
    if event.audience == "all" or event.member_id == str(principal.id):
        return True
    return event.audience == "admins" and principal.role == Role.ADMIN


def _change(event: LiveEvent) -> ServerSentEvent:
    return ServerSentEvent(
        event="change",
        data={
            "type": event.type,
            "entityType": event.entity_type,
            "entityId": event.entity_id,
            "entityName": event.entity_name,
            "actorLogin": event.actor_login,
        },
    )


def _about_access(event: LiveEvent, principal: Principal) -> bool:
    """Роль, доступ или сессия участника могли измениться; вход с другого устройства - нет."""
    return (
        event.entity_type == "member"
        and event.member_id == str(principal.id)
        and event.type != "auth.login"
    )


async def stream(
    broker: LiveBroker, principal: Principal, lifetime: float = MAX_STREAM_SECONDS
) -> AsyncGenerator[ServerSentEvent]:
    deadline = time.monotonic() + lifetime
    with broker.subscribe() as queue:
        yield ServerSentEvent(event="ready", data={}, retry=RETRY_MS)
        while (left := deadline - time.monotonic()) > 0:
            try:
                event = await asyncio.wait_for(queue.get(), left)
            except TimeoutError:
                return
            if event.type == "resync":
                yield ServerSentEvent(event="resync", data={})
            elif visible(event, principal):
                yield _change(event)
                if _about_access(event, principal):
                    return


@router.get(
    "/events",
    response_class=EventSourceResponse,
    summary="Поток событий",
    description=(
        "Server-Sent Events: панель узнаёт об изменениях сразу, данные перечитывает обычными "
        "запросами.\n\n"
        "- `ready` - поток открыт: перечитать данные, если это переподключение;\n"
        "- `change` - что-то изменилось, `data`: `type` (действие журнала, например "
        "`occurrence.paid`, или `telegram.changed` - своя привязка Telegram), `entityType`, "
        "`entityId`, `entityName`, `actorLogin`;\n"
        "- `resync` - события могли потеряться: перечитать всё.\n\n"
        "Платежи, периоды и отделы видят все роли; участников, входы и групповые чаты - "
        "администратор и сам участник. Пинг-комментарий раз в 15 секунд. "
        "Авторизация обычная: `Authorization` или `X-API-KEY`. Сервер закрывает поток раз в "
        "10 минут и после события о самом участнике (роль, отключение, выход): клиент "
        "переподключается, и доступ проверяется заново."
    ),
    # ошибка - обычный JSON, а не поток: без явного типа FastAPI описал бы её как text/event-stream
    responses={
        401: {
            "description": error_responses(401)[401]["description"],
            "content": {
                "application/json": {"schema": {"$ref": "#/components/schemas/ErrorResponse"}}
            },
        }
    },
)
async def stream_events(
    request: Request, principal: Annotated[Principal, Depends(current_principal)]
) -> AsyncIterable[ServerSentEvent]:
    async for item in stream(request.app.state.live, principal):
        yield item
