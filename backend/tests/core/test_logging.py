import json
from collections.abc import AsyncIterator

import httpx
import pytest
import structlog
from fastapi import FastAPI

from core.errors import install_error_handlers
from core.logging import REQUEST_ID_HEADER, RequestContextMiddleware, configure_logging


def _app() -> RequestContextMiddleware:
    app = FastAPI()
    install_error_handlers(app)

    @app.get("/items/{item_id}")
    async def item(item_id: int) -> dict[str, int]:
        structlog.get_logger().info("item_read", password="hunter2")
        return {"id": item_id}

    @app.get("/boom")
    async def boom() -> None:
        raise RuntimeError("сбой")

    return RequestContextMiddleware(app)


@pytest.fixture
async def client() -> AsyncIterator[httpx.AsyncClient]:
    transport = httpx.ASGITransport(app=_app(), raise_app_exceptions=False)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        yield client


def _start_logging() -> None:
    # Журнал настраивается в самом тесте: поток вывода, захваченный на этапе фикстур, закрывается.
    configure_logging("api")


def _records(capsys: pytest.CaptureFixture[str]) -> list[dict[str, object]]:
    return [json.loads(line) for line in capsys.readouterr().out.splitlines() if line]


async def test_new_request_id_when_client_sent_none(client: httpx.AsyncClient) -> None:
    response = await client.get("/items/1")

    assert response.headers[REQUEST_ID_HEADER]


async def test_client_request_id_is_kept_and_logged(
    client: httpx.AsyncClient, capsys: pytest.CaptureFixture[str]
) -> None:
    _start_logging()
    response = await client.get("/items/1", headers={REQUEST_ID_HEADER: "abc-123"})

    assert response.headers[REQUEST_ID_HEADER] == "abc-123"
    request_log = next(r for r in _records(capsys) if r["message"] == "request")
    assert request_log["request_id"] == "abc-123"
    assert request_log["service"] == "api"
    assert request_log["level"] == "info"
    assert request_log["path"] == "/items/{item_id}"
    assert "timestamp" in request_log


@pytest.mark.parametrize("bad_id", ["", "with space", "x" * 129, "<script>"])
async def test_invalid_request_id_is_replaced(client: httpx.AsyncClient, bad_id: str) -> None:
    response = await client.get("/items/1", headers={REQUEST_ID_HEADER: bad_id})

    assert response.headers[REQUEST_ID_HEADER] not in ("", bad_id)


async def test_error_response_has_request_id(client: httpx.AsyncClient) -> None:
    response = await client.get("/boom", headers={REQUEST_ID_HEADER: "err-1"})

    assert response.status_code == 500
    assert response.headers[REQUEST_ID_HEADER] == "err-1"


async def test_secrets_do_not_reach_log(
    client: httpx.AsyncClient, capsys: pytest.CaptureFixture[str]
) -> None:
    _start_logging()
    await client.get("/items/1", headers={"Authorization": "Bearer topsecret-token"})

    output = capsys.readouterr().out
    assert '"message": "item_read"' in output
    assert "topsecret-token" not in output
    assert "hunter2" not in output
