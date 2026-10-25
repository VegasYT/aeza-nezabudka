"""Русские тексты ошибок проверки данных Pydantic."""

from collections.abc import Mapping
from typing import Any

_NUMBER = "Должно быть числом"
_INTEGER = "Должно быть целым числом"
_DATE = "Дата в формате ГГГГ-ММ-ДД"
_DATETIME = "Дата и время в формате ISO 8601"

# Шаблоны подставляют ограничения из ctx ошибки Pydantic.
_TEMPLATES: dict[str, str] = {
    "missing": "Обязательное поле",
    "int_parsing": _INTEGER,
    "int_type": _INTEGER,
    "int_from_float": _INTEGER,
    "float_parsing": _NUMBER,
    "float_type": _NUMBER,
    "decimal_parsing": _NUMBER,
    "decimal_type": _NUMBER,
    "bool_parsing": "Должно быть true или false",
    "bool_type": "Должно быть true или false",
    "string_type": "Должно быть строкой",
    "string_too_short": "Не короче {min_length} символов",
    "string_too_long": "Не длиннее {max_length} символов",
    "string_pattern_mismatch": "Неверный формат",
    "too_short": "Не меньше {min_length} элементов",
    "too_long": "Не больше {max_length} элементов",
    "greater_than": "Больше {gt}",
    "greater_than_equal": "Не меньше {ge}",
    "less_than": "Меньше {lt}",
    "less_than_equal": "Не больше {le}",
    "date_parsing": _DATE,
    "date_from_datetime_parsing": _DATE,
    "date_type": _DATE,
    "datetime_parsing": _DATETIME,
    "datetime_from_date_parsing": _DATETIME,
    "datetime_type": _DATETIME,
    "uuid_parsing": "Должно быть UUID",
    "uuid_type": "Должно быть UUID",
    "literal_error": "Допустимые значения: {expected}",
    "enum": "Допустимые значения: {expected}",
    "extra_forbidden": "Лишнее поле",
    "json_invalid": "Некорректный JSON",
    "list_type": "Должно быть списком",
    "dict_type": "Должно быть объектом",
    "model_type": "Должно быть объектом",
    "model_attributes_type": "Должно быть объектом",
}
_FALLBACK = "Неверное значение"


# Поля форм панели: общий шаблон вроде "Больше 0" звучит для них технически.
_FIELD_MESSAGES: dict[tuple[str, str], str] = {
    ("name", "missing"): "Введите название",
    ("name", "string_too_short"): "Введите название",
    ("amountMinor", "missing"): "Введите сумму",
    ("amountMinor", "greater_than"): "Сумма должна быть больше нуля",
    ("departmentIds", "too_short"): "Выберите хотя бы один отдел или передайте null - все отделы",
}


def validation_message(error: Mapping[str, Any], field: str = "") -> str:
    """Текст для одной ошибки из `ValidationError.errors()`; `field` - имя поля в запросе."""
    error_type = str(error.get("type", ""))
    if (special := _FIELD_MESSAGES.get((field, error_type))) is not None:
        return special
    if error_type in ("value_error", "assertion_error"):
        # Собственные сообщения валидаторов уже на русском, убираем служебный префикс.
        message = str(error.get("msg", ""))
        return message.removeprefix("Value error, ").removeprefix("Assertion failed, ")
    template = _TEMPLATES.get(error_type)
    if template is None:
        return _FALLBACK
    ctx = {key: str(value).replace(" or ", " или ") for key, value in error.get("ctx", {}).items()}
    try:
        return template.format_map(ctx)
    except KeyError:
        return _FALLBACK
