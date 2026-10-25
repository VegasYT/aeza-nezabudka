"""Общие схемы контракта в стиле Aéza v2 (ADR-015): camelCase, страница списка, ошибка."""

from typing import Any

from pydantic import BaseModel, ConfigDict, Field
from pydantic.alias_generators import to_camel

_ERROR_DESCRIPTIONS = {
    400: "Ошибка проверки данных: список полей в `payload`",
    401: "Нет действующего токена (`not_auth`)",
    403: "Недостаточно прав",
    404: "Объект не найден (`not_found`, в `payload` - `entity` и `id`)",
    409: "Операция невозможна в текущем состоянии",
    429: "Слишком много попыток, повторите позже (заголовок Retry-After)",
    503: "Сервис входа Aéza временно недоступен",
}


class ApiModel(BaseModel):
    """Схема контракта: в коде snake_case, в JSON и OpenAPI - camelCase, как у Aéza."""

    # validate_by_name: код и тесты создают схемы по именам полей Python.
    model_config = ConfigDict(
        alias_generator=to_camel, validate_by_name=True, serialize_by_alias=True
    )


class InputModel(ApiModel):
    """Тело запроса: неизвестное поле - ошибка, а не тихий пропуск."""

    model_config = ConfigDict(extra="forbid")


class PageQuery(ApiModel):
    """Параметры пагинации списка; незнакомые параметры строки запроса не мешают."""

    limit: int = Field(default=50, ge=1, le=100, description="Сколько элементов вернуть")
    offset: int = Field(default=0, ge=0, description="Сколько элементов пропустить")


class FieldError(ApiModel):
    field: str = Field(examples=["nextDueDate"])
    message: str = Field(examples=["Дата ближайшей оплаты не может быть раньше сегодняшней"])


class ErrorResponse(ApiModel):
    """Ответ с ошибкой как у Aéza v2: `error` для программы, `message` для человека."""

    status_code: int = Field(examples=[400])
    message: str = Field(examples=["Проверьте введённые данные"])
    error: str = Field(examples=["bad_request"])
    timestamp: str = Field(examples=["2026-10-24T14:09:29.458Z"])
    path: str = Field(examples=["/api/v1/recurring-payments"])
    payload: list[FieldError] | dict[str, Any] | str = Field(
        description="Список полей для 400, `{entity, id}` для 404, иначе текст ошибки"
    )
    request_id: str | None = Field(default=None, description="Совпадает с заголовком X-Request-ID")


class Page[T](ApiModel):
    """Страница списка."""

    items: list[T]
    total: int = Field(ge=0, examples=[1])


def error_responses(*codes: int) -> dict[int | str, dict[str, Any]]:
    """Описания ответов с ошибками для параметра `responses` декоратора операции."""
    return {
        code: {"model": ErrorResponse, "description": _ERROR_DESCRIPTIONS[code]}
        for code in sorted(codes)
    }
