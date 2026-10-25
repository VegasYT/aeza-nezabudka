"""Единый формат ошибок API как у Aéza v2 (ADR-015)."""

from collections.abc import Mapping
from datetime import UTC, datetime
from typing import Any, cast

import structlog
from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from pydantic.alias_generators import to_camel
from sqlalchemy.exc import SQLAlchemyError
from starlette.exceptions import HTTPException as StarletteHTTPException

from core.messages import validation_message
from core.metrics import DEPENDENCY_ERRORS

log = structlog.get_logger(__name__)

_HTTP_ERRORS = {
    404: ("not_found", "Не найдено"),
    405: ("method_not_allowed", "Метод не поддерживается"),
}


class AppError(Exception):
    """Ошибка, которую модули бросают вместо формирования ответа сами.

    `code` попадает в поле `error`; ошибки полей (`fields`) - в `payload` списком.
    """

    def __init__(
        self,
        code: str,
        message: str,
        status_code: int = 400,
        *,
        fields: Mapping[str, str] | None = None,
        headers: Mapping[str, str] | None = None,
        payload: Any = None,
    ) -> None:
        super().__init__(message)
        self.code = code
        self.message = message
        self.status_code = status_code
        self.fields = dict(fields) if fields else None
        self.headers = dict(headers) if headers else None
        self.payload = payload


class NotImplementedYet(AppError):
    """Операция без реализации; ей отвечает тестовый сервис без базы."""

    def __init__(self) -> None:
        super().__init__("not_implemented", "Операция ещё не реализована", status_code=501)


def not_found(entity: str, entity_id: object, message: str) -> AppError:
    """404 как у Aéza: `payload` называет сущность и идентификатор."""
    return AppError(
        "not_found", message, status_code=404, payload={"entity": entity, "id": str(entity_id)}
    )


def invalid_field(field: str, message: str) -> AppError:
    return AppError("bad_request", "Проверьте введённые данные", fields={field: message})


def _timestamp() -> str:
    return datetime.now(UTC).isoformat(timespec="milliseconds").replace("+00:00", "Z")


def error_response(
    request: Request | None,
    status_code: int,
    code: str,
    message: str,
    payload: Any = None,
) -> JSONResponse:
    request_id = structlog.contextvars.get_contextvars().get("request_id")
    body = {
        "statusCode": status_code,
        "message": message,
        "error": code,
        "timestamp": _timestamp(),
        "path": request.url.path if request is not None else "",
        "payload": message if payload is None else payload,
        "requestId": request_id,
    }
    return JSONResponse(status_code=status_code, content=body)


def _field_errors(fields: Mapping[str, str]) -> list[dict[str, str]]:
    return [{"field": to_camel(name), "message": text} for name, text in fields.items()]


async def _app_error(request: Request, exc: Exception) -> JSONResponse:
    error = cast(AppError, exc)
    payload = _field_errors(error.fields) if error.fields else error.payload
    response = error_response(request, error.status_code, error.code, error.message, payload)
    response.headers.update(error.headers or {})
    return response


async def _validation_error(request: Request, exc: Exception) -> JSONResponse:
    error = cast(RequestValidationError, exc)
    fields = []
    for item in error.errors():
        # Первый элемент пути - место параметра (body, query, path), он клиенту не нужен.
        name = ".".join(str(part) for part in item["loc"][1:]) or str(item["loc"][0])
        fields.append({"field": name, "message": validation_message(item, name)})
    return error_response(request, 400, "bad_request", "Проверьте введённые данные", fields)


async def _http_error(request: Request, exc: Exception) -> JSONResponse:
    error = cast(StarletteHTTPException, exc)
    code, message = _HTTP_ERRORS.get(error.status_code, ("http_error", "Ошибка запроса"))
    return error_response(request, error.status_code, code, message)


async def _unexpected_error(request: Request, error: Exception) -> JSONResponse:
    if isinstance(error, SQLAlchemyError | OSError):
        DEPENDENCY_ERRORS.labels("postgres").inc()
    log.exception("unexpected_error", path=request.url.path, exc_info=error)
    return error_response(request, 500, "internal_error", "Внутренняя ошибка сервера")


def install_error_handlers(app: FastAPI) -> None:
    app.add_exception_handler(AppError, _app_error)
    app.add_exception_handler(RequestValidationError, _validation_error)
    app.add_exception_handler(StarletteHTTPException, _http_error)
    app.add_exception_handler(Exception, _unexpected_error)
