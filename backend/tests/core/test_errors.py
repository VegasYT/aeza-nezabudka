from collections.abc import AsyncIterator
from datetime import date
from typing import Literal

import httpx
import pytest
from fastapi import FastAPI, Query

from core.errors import (
    AppError,
    NotImplementedYet,
    install_error_handlers,
    invalid_field,
    not_found,
)


def _app() -> FastAPI:
    app = FastAPI()
    install_error_handlers(app)

    @app.get("/conflict")
    async def conflict() -> None:
        raise AppError("payment_stopped", "Платёж прекращён", status_code=409)

    @app.get("/boom")
    async def boom() -> None:
        raise RuntimeError("password=hunter2 в тексте исключения")

    @app.get("/items")
    async def items(limit: int) -> dict[str, int]:
        return {"limit": limit}

    @app.get("/search")
    async def search(
        page: int = Query(ge=1),
        text: str = Query(min_length=2),
        day: date | None = None,
        kind: Literal["paid", "unpaid"] = "paid",
    ) -> dict[str, str]:
        return {"kind": kind}

    @app.get("/payment")
    async def payment() -> None:
        raise not_found("RecurringPayment", 42, "Регулярный платёж не найден")

    @app.get("/past")
    async def past() -> None:
        raise invalid_field("next_due_date", "Не раньше сегодня")

    @app.get("/later")
    async def later(limit: int) -> dict[str, int]:
        raise NotImplementedYet

    return app


@pytest.fixture
async def client() -> AsyncIterator[httpx.AsyncClient]:
    transport = httpx.ASGITransport(app=_app(), raise_app_exceptions=False)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        yield client


def _fields(response: httpx.Response) -> dict[str, str]:
    return {item["field"]: item["message"] for item in response.json()["payload"]}


async def test_error_body_like_aeza(client: httpx.AsyncClient) -> None:
    response = await client.get("/conflict", headers={"X-Request-ID": "req-42"})

    body = response.json()
    assert response.status_code == 409
    assert set(body) == {
        "statusCode",
        "message",
        "error",
        "timestamp",
        "path",
        "payload",
        "requestId",
    }
    assert (body["statusCode"], body["error"], body["message"]) == (
        409,
        "payment_stopped",
        "Платёж прекращён",
    )
    assert body["path"] == "/conflict"
    assert body["payload"] == "Платёж прекращён"
    assert body["timestamp"].endswith("Z")


async def test_validation_error_names_fields(client: httpx.AsyncClient) -> None:
    missing = await client.get("/items")

    assert missing.status_code == 400
    assert missing.json()["error"] == "bad_request"
    assert _fields(missing) == {"limit": "Обязательное поле"}


async def test_unknown_path_uses_common_format(client: httpx.AsyncClient) -> None:
    response = await client.get("/nowhere")

    assert response.status_code == 404
    assert (response.json()["error"], response.json()["message"]) == ("not_found", "Не найдено")


async def test_not_found_names_entity(client: httpx.AsyncClient) -> None:
    response = await client.get("/payment")

    assert response.json()["payload"] == {"entity": "RecurringPayment", "id": "42"}


async def test_unexpected_error_hides_details(client: httpx.AsyncClient) -> None:
    response = await client.get("/boom")

    assert response.status_code == 500
    assert response.json()["error"] == "internal_error"
    assert "hunter2" not in response.text


async def test_field_errors_are_in_russian(client: httpx.AsyncClient) -> None:
    response = await client.get(
        "/search", params={"page": "0", "text": "a", "day": "24.10.2026", "kind": "other"}
    )

    assert response.status_code == 400
    assert _fields(response) == {
        "page": "Не меньше 1",
        "text": "Не короче 2 символов",
        "day": "Дата в формате ГГГГ-ММ-ДД",
        "kind": "Допустимые значения: 'paid' или 'unpaid'",
    }
    wrong_type = await client.get("/items", params={"limit": "many"})
    assert _fields(wrong_type) == {"limit": "Должно быть целым числом"}


async def test_domain_field_error_is_camel_case(client: httpx.AsyncClient) -> None:
    response = await client.get("/past")

    assert _fields(response) == {"nextDueDate": "Не раньше сегодня"}


async def test_stub_answers_501_after_validation(client: httpx.AsyncClient) -> None:
    stub = await client.get("/later", params={"limit": 5})
    invalid = await client.get("/later", params={"limit": "many"})

    assert stub.status_code == 501
    assert (stub.json()["error"], stub.json()["message"]) == (
        "not_implemented",
        "Операция ещё не реализована",
    )
    assert invalid.status_code == 400
