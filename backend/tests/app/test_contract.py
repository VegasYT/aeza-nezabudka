from typing import Any

import httpx
import pytest
from fastapi import FastAPI

from tests.auth_helpers import make_token

ID = "3c2b1a09-8f7e-4d6c-9b5a-4f3e2d1c0b9a"
ERROR_REF = "#/components/schemas/ErrorResponse"

# Операция: (метод, путь, тело корректного запроса).
OPERATIONS: dict[str, tuple[str, str, dict[str, Any] | None]] = {
    "login": (
        "post",
        "/api/v1/auth/login",
        {"email": "buh.petrova@company.ru", "password": "s3cret-pass"},
    ),
    "use_challenge": ("post", "/api/v1/auth/use-challenge", {"challenge": "abc"}),
    "submit_totp": ("post", "/api/v1/auth/tfa/totp", {"challenge": "abc", "code": "123456"}),
    "logout": ("post", "/api/v1/auth/logout", None),
    "get_current_user": ("get", "/api/v1/auth/me", None),
    "list_users": ("get", "/api/v1/users", None),
    "create_user": ("post", "/api/v1/users", {"email": "buh.petrova@company.ru", "role": "user"}),
    "update_user": ("patch", f"/api/v1/users/{ID}", {"enabled": False}),
    "delete_user": ("delete", f"/api/v1/users/{ID}", None),
    "list_recurring_payments": ("get", "/api/v1/recurring-payments", None),
    "create_recurring_payment": (
        "post",
        "/api/v1/recurring-payments",
        {"name": "Аренда", "amountMinor": 100, "currency": "RUB", "nextDueDate": "2026-11-05"},
    ),
    "get_recurring_payment": ("get", f"/api/v1/recurring-payments/{ID}", None),
    "update_recurring_payment": ("patch", f"/api/v1/recurring-payments/{ID}", {"name": "Офис"}),
    "stop_recurring_payment": ("delete", f"/api/v1/recurring-payments/{ID}", None),
    "list_payment_occurrences": ("get", "/api/v1/payment-occurrences", None),
    "get_payment_occurrence": ("get", f"/api/v1/payment-occurrences/{ID}", None),
    "update_payment_occurrence": ("patch", f"/api/v1/payment-occurrences/{ID}", {"paid": True}),
    "attach_receipt": ("put", f"/api/v1/payment-occurrences/{ID}/receipt", None),
    "get_receipt": ("get", f"/api/v1/payment-occurrences/{ID}/receipt", None),
    "delete_receipt": ("delete", f"/api/v1/payment-occurrences/{ID}/receipt", None),
    "get_payments_summary": ("get", "/api/v1/payments/summary", None),
    "list_departments": ("get", "/api/v1/departments", None),
    "create_department": ("post", "/api/v1/departments", {"name": "Офис"}),
    "update_department": ("patch", f"/api/v1/departments/{ID}", {"name": "Склад"}),
    "delete_department": ("delete", f"/api/v1/departments/{ID}", None),
    "get_telegram_status": ("get", "/api/v1/me/telegram", None),
    "create_telegram_link": ("post", "/api/v1/me/telegram/link", None),
    "update_telegram_settings": ("patch", "/api/v1/me/telegram", {"personalEnabled": False}),
    "unlink_telegram": ("delete", "/api/v1/me/telegram", None),
    "get_settings": ("get", "/api/v1/settings", None),
    "update_settings": ("patch", "/api/v1/settings", {"reminderDaysBefore": 5}),
    "resume_recurring_payment": ("post", f"/api/v1/recurring-payments/{ID}/resume", None),
    "list_audit_log": ("get", "/api/v1/audit-log", None),
    "get_payments_forecast": ("get", "/api/v1/payments/forecast?to=2026-12-31", None),
    "list_group_chats": ("get", "/api/v1/telegram-chats", None),
    "create_group_chat_link": ("post", "/api/v1/telegram-chats/link", None),
    "update_group_chat": ("patch", f"/api/v1/telegram-chats/{ID}", {"departmentIds": None}),
    "delete_group_chat": ("delete", f"/api/v1/telegram-chats/{ID}", None),
    "stream_events": ("get", "/api/v1/events", None),
}
ROLE_RESTRICTED = {
    "update_settings",
    "get_telegram_status",
    "create_telegram_link",
    "update_telegram_settings",
    "unlink_telegram",
    "list_users",
    "create_user",
    "update_user",
    "delete_user",
    "create_recurring_payment",
    "update_recurring_payment",
    "stop_recurring_payment",
    "resume_recurring_payment",
    "create_department",
    "update_department",
    "delete_department",
    "list_group_chats",
    "create_group_chat_link",
    "update_group_chat",
    "delete_group_chat",
    "list_audit_log",
}
CONFLICTS = {
    "attach_receipt",
    "get_receipt",
    "delete_receipt",
    "resume_recurring_payment",
    "create_user",
    "update_user",
    "delete_user",
    "update_recurring_payment",
    "stop_recurring_payment",
    "create_department",
    "update_department",
    "update_telegram_settings",
    "create_telegram_link",
    "create_group_chat_link",
}
# Telegram может быть недоступен: 503 `telegram_unavailable`.
UNAVAILABLE = {"create_telegram_link", "create_group_chat_link", "attach_receipt", "get_receipt"}
# Тело - файл (multipart), а не JSON.
UPLOADS = {"attach_receipt"}
# Поток не заканчивается, клиент тестов ждал бы его вечно: проверка - tests/app/test_events.py.
STREAMS = {"stream_events"}
# Вход без токена: схемы безопасности у этих операций нет.
PUBLIC = {"login", "use_challenge", "submit_totp"}
LISTS = {
    "list_users",
    "list_recurring_payments",
    "list_payment_occurrences",
    "list_departments",
    "list_group_chats",
    "list_audit_log",
    "get_payments_forecast",
}


@pytest.fixture(scope="module")
def operations(offline_app: FastAPI) -> dict[str, dict[str, Any]]:
    schema = offline_app.openapi()
    return {
        operation["operationId"]: operation | {"_method": method, "_path": path}
        for path, methods in schema["paths"].items()
        for method, operation in methods.items()
    }


def _error_codes(operation: dict[str, Any]) -> set[int]:
    return {
        int(code)
        for code, response in operation["responses"].items()
        if response.get("content", {}).get("application/json", {}).get("schema", {}).get("$ref")
        == ERROR_REF
    }


def test_contract_lists_every_operation(operations: dict[str, dict[str, Any]]) -> None:
    assert {name: (op["_method"], op["_path"]) for name, op in operations.items()} == {
        name: (method, _template(path)) for name, (method, path, _) in OPERATIONS.items()
    }
    assert all(op.get("summary") for op in operations.values())


def _template(path: str) -> str:
    path = path.split("?", 1)[0]
    if ID not in path:
        return path
    id_name = {
        "users": "user_id",
        "recurring-payments": "payment_id",
        "payment-occurrences": "occurrence_id",
        "departments": "department_id",
        "telegram-chats": "chat_id",
    }[path.split("/")[3]]
    return path.replace(ID, "{" + id_name + "}")


@pytest.mark.parametrize("name", sorted(OPERATIONS))
def test_operation_documents_security_and_errors(
    operations: dict[str, dict[str, Any]], name: str
) -> None:
    operation = operations[name]
    if name in PUBLIC:
        assert "security" not in operation
        assert _error_codes(operation) <= {400, 403, 429, 503}
        return
    expected = {401}
    if name in ROLE_RESTRICTED:
        expected.add(403)
    if "{" in operation["_path"]:
        expected.add(404)
    if name in CONFLICTS:
        expected.add(409)
    if name in UNAVAILABLE:
        expected.add(503)
    if operation.get("parameters") or operation.get("requestBody"):
        expected.add(400)

    assert operation["security"] == [{"bearer": []}, {"X-API-KEY": []}]
    assert _error_codes(operation) == expected


def test_lists_answer_with_pages(operations: dict[str, dict[str, Any]]) -> None:
    for name in LISTS:
        content = operations[name]["responses"]["200"]["content"]["application/json"]
        assert content["schema"]["$ref"].startswith("#/components/schemas/Page_")
        assert {"limit", "offset"} <= {p["name"] for p in operations[name]["parameters"]}


def test_payment_creation_accepts_idempotency_key(operations: dict[str, dict[str, Any]]) -> None:
    headers = [
        p for p in operations["create_recurring_payment"]["parameters"] if p["in"] == "header"
    ]

    assert [(p["name"], p.get("required", False)) for p in headers] == [("Idempotency-Key", False)]


def test_security_schemes_are_session_and_aeza_key(offline_app: FastAPI) -> None:
    schemes = offline_app.openapi()["components"]["securitySchemes"]

    assert schemes == {
        "bearer": {
            "type": "http",
            "scheme": "bearer",
            "description": (
                "`session` из `POST /auth/use-challenge` или `tfa/totp`, без слова Bearer."
            ),
        },
        "X-API-KEY": {
            "type": "apiKey",
            "in": "header",
            "name": "X-API-KEY",
            "description": 'Ключ аккаунта Aéza из кабинета ("API ключи") для других систем.',
        },
    }


def test_sign_in_steps_answer_like_aeza(offline_app: FastAPI) -> None:
    schemas = offline_app.openapi()["components"]["schemas"]

    assert set(schemas["LoginChallengeResponse"]["properties"]) == {"challenge", "requirements"}
    assert set(schemas["SessionResponse"]["properties"]) == {"session", "expiresAt"}
    assert set(schemas["Page_User_"]["properties"]) == {"items", "total"}


async def test_page_size_is_limited(offline_client: httpx.AsyncClient) -> None:
    response = await offline_client.get(
        "/api/v1/payment-occurrences",
        params={"limit": 500},
        headers={"Authorization": f"Bearer {make_token()}"},
    )

    assert response.status_code == 400
    assert {f["field"] for f in response.json()["payload"]} == {"limit"}
