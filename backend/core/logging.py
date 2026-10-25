"""JSON-журнал процессов backend и идентификатор запроса."""

import logging
import re
import sys
import time
import uuid
from collections.abc import MutableMapping
from typing import Any

import structlog
from starlette.datastructures import Headers, MutableHeaders
from starlette.types import ASGIApp, Message, Receive, Scope, Send

from core.metrics import HTTP_DURATION, HTTP_REQUESTS

REQUEST_ID_HEADER = "X-Request-ID"
_REQUEST_ID = re.compile(r"[A-Za-z0-9._-]{1,128}")
_SECRET_KEY = re.compile(r"password|token|secret|authorization", re.IGNORECASE)
# Токены Telegram-бота и Bearer-токены прячутся в любом тексте, не только в полях-секретах.
# Сначала токен бота: иначе Bearer-шаблон съест его начало до двоеточия.
_SECRET_VALUES = (
    re.compile(r"(?<!\d)\d{6,12}:[A-Za-z0-9_-]{30,}"),
    re.compile(r"(?i:bearer)\s+[A-Za-z0-9._~+/=-]+"),
)

log = structlog.get_logger(__name__)


def _redact_secrets(_: Any, __: str, event: MutableMapping[str, Any]) -> MutableMapping[str, Any]:
    for key, value in event.items():
        if _SECRET_KEY.search(key):
            event[key] = "***"
        elif isinstance(value, str):
            event[key] = _hide_tokens(value)
    return event


def _hide_tokens(text: str) -> str:
    for pattern in _SECRET_VALUES:
        text = pattern.sub("***", text)
    return text


def configure_logging(service: str, level: str = "info") -> None:
    """Направляет и structlog, и стандартный `logging` в JSON на stdout."""
    shared: list[Any] = [
        structlog.contextvars.merge_contextvars,
        structlog.stdlib.add_log_level,
        structlog.processors.TimeStamper(fmt="iso", utc=True, key="timestamp"),
        _redact_secrets,
    ]
    structlog.configure(
        processors=[*shared, structlog.stdlib.ProcessorFormatter.wrap_for_formatter],
        logger_factory=structlog.stdlib.LoggerFactory(),
        wrapper_class=structlog.stdlib.BoundLogger,
        cache_logger_on_first_use=False,
    )
    formatter = structlog.stdlib.ProcessorFormatter(
        foreign_pre_chain=shared,
        processors=[
            structlog.stdlib.ProcessorFormatter.remove_processors_meta,
            lambda _, __, event: {"service": service, **event},
            structlog.processors.format_exc_info,
            structlog.processors.EventRenamer("message"),
            structlog.processors.JSONRenderer(ensure_ascii=False),
        ],
    )
    handler = logging.StreamHandler(sys.stdout)
    handler.setFormatter(formatter)
    root = logging.getLogger()
    root.handlers = [handler]
    root.setLevel(level.upper())
    for name in ("uvicorn", "uvicorn.error", "uvicorn.access"):
        logging.getLogger(name).handlers = []
        logging.getLogger(name).propagate = True
    # Запросы пишет RequestContextMiddleware, журнал доступа uvicorn их дублировал бы.
    logging.getLogger("uvicorn.access").setLevel(logging.WARNING)


def _route_template(scope: Scope) -> str:
    """Путь с именами параметров вместо значений: в метках и логах нет идентификаторов."""
    if scope.get("route") is None:
        return "unmatched"
    path = str(scope["path"])
    for name, value in scope.get("path_params", {}).items():
        path = path.replace(f"/{value}", f"/{{{name}}}")
    return path


class RequestContextMiddleware:
    """Ставит `X-Request-ID` в ответ и журнал, пишет итог запроса без заголовков и тела."""

    def __init__(self, app: ASGIApp) -> None:
        self.app = app

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        incoming = Headers(scope=scope).get(REQUEST_ID_HEADER, "")
        request_id = incoming if _REQUEST_ID.fullmatch(incoming) else uuid.uuid4().hex
        structlog.contextvars.clear_contextvars()
        structlog.contextvars.bind_contextvars(request_id=request_id)
        started = time.perf_counter()
        status = 500
        response_started = False
        streaming = False

        async def send_with_id(message: Message) -> None:
            nonlocal status, response_started, streaming
            if message["type"] == "http.response.start":
                status = message["status"]
                response_started = True
                headers = MutableHeaders(scope=message)
                headers[REQUEST_ID_HEADER] = request_id
                streaming = headers.get("content-type", "").startswith("text/event-stream")
            await send(message)

        try:
            await self.app(scope, receive, send_with_id)
        except Exception:
            # Ответ 500 уже отправлен обработчиком ошибок, повтор трассировки от uvicorn не нужен.
            if not response_started:
                raise
        finally:
            path = _route_template(scope)
            duration = time.perf_counter() - started
            HTTP_REQUESTS.labels(scope["method"], path, str(status)).inc()
            # поток SSE открыт часами: его длительность испортила бы p95 маршрутов
            if not streaming:
                HTTP_DURATION.labels(scope["method"], path).observe(duration)
            log.info(
                "request",
                method=scope["method"],
                path=path,
                status=status,
                duration_ms=round(duration * 1000, 1),
            )
            structlog.contextvars.clear_contextvars()
