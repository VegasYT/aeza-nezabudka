import asyncio
import io
import json
import logging
import socket

import httpx
import pytest
import structlog
from prometheus_client import REGISTRY
from pydantic import SecretStr

from app.worker import PeriodicJob, _run_once, _serve_http, http_app, run_jobs
from core.auth import identity_unavailable
from core.config import Settings
from core.logging import configure_logging
from tests.app.conftest import OFFLINE_DATABASE_URL
from tests.auth_helpers import make_token

PAYMENT_ID = "3c2b1a09-8f7e-4d6c-9b5a-4f3e2d1c0b9a"


def _value(name: str, **labels: str) -> float:
    return REGISTRY.get_sample_value(name, labels) or 0.0


async def test_api_metrics_use_route_template(offline_client: httpx.AsyncClient) -> None:
    labels = {"method": "GET", "route": "/api/v1/recurring-payments/{payment_id}"}
    before = _value("http_requests_total", **labels, status="501")

    await offline_client.get(
        f"/api/v1/recurring-payments/{PAYMENT_ID}",
        headers={"Authorization": f"Bearer {make_token()}"},
    )
    response = await offline_client.get("/metrics")

    assert response.status_code == 200
    assert _value("http_requests_total", **labels, status="501") == before + 1
    assert PAYMENT_ID not in response.text
    assert "dependency_errors_total" in response.text


async def test_worker_http_app() -> None:
    transport = httpx.ASGITransport(app=http_app())
    async with httpx.AsyncClient(transport=transport, base_url="http://worker") as client:
        health = await client.get("/healthz")
        metrics = await client.get("/metrics")

    assert health.json() == {"status": "ok"}
    assert "worker_job_runs_total" in metrics.text


async def test_worker_http_server_stops_with_worker() -> None:
    with socket.socket() as probe:
        probe.bind(("127.0.0.1", 0))
        port = probe.getsockname()[1]
    settings = Settings.model_validate(
        {
            "database_url": SecretStr(OFFLINE_DATABASE_URL),
            "tz": "Europe/Moscow",
            "http_host": "127.0.0.1",
            "worker_http_port": port,
        }
    )
    stop = asyncio.Event()
    server = asyncio.create_task(_serve_http(settings, stop))
    try:
        for _ in range(50):
            try:
                async with httpx.AsyncClient() as client:
                    response = await client.get(f"http://127.0.0.1:{port}/healthz")
                break
            except httpx.ConnectError:
                await asyncio.sleep(0.1)
        assert response.status_code == 200
    finally:
        stop.set()
        await asyncio.wait_for(server, timeout=5)


async def test_job_metrics() -> None:
    async def ok() -> None:
        return None

    async def broken() -> None:
        raise RuntimeError("сбой")

    failures = _value("worker_job_runs_total", job="metrics-test", result="failure")

    await _run_once(PeriodicJob("metrics-test", 1, ok))
    succeeded_at = _value("worker_job_last_success_timestamp_seconds", job="metrics-test")
    await _run_once(PeriodicJob("metrics-test", 1, broken))

    assert succeeded_at > 0
    assert _value("worker_job_runs_total", job="metrics-test", result="failure") == failures + 1
    assert _value("worker_job_last_success_timestamp_seconds", job="metrics-test") == succeeded_at


async def test_job_logs_share_operation_id() -> None:
    stop = asyncio.Event()
    seen: list[dict[str, object]] = []

    async def work() -> None:
        # Контекст structlog в момент записи: его получает каждая строка лога запуска.
        seen.append(structlog.contextvars.get_contextvars())
        if len(seen) == 2:
            stop.set()

    await run_jobs([PeriodicJob("logged", 0, work)], stop, 5)

    first, second = seen
    assert first["job"] == second["job"] == "logged"
    assert first["operation_id"] != second["operation_id"]


def test_aeza_errors_are_counted() -> None:
    before = _value("dependency_errors_total", dependency="aeza")

    identity_unavailable()

    assert _value("dependency_errors_total", dependency="aeza") == before + 1


@pytest.mark.parametrize(
    ("secret", "template"),
    [
        ("eyJhbGciOiJSUzI1NiJ9.eyJzdWIiOiIxIn0.c2lnbmF0dXJl", "Authorization: Bearer {}"),
        ("123456789:AAH4kfP0pQr7sTuVwXyZ0123456789abcdE", "https://api.telegram.org/bot{}/getMe"),
    ],
    ids=["bearer", "bot-token"],
)
def test_secrets_are_hidden_in_values(secret: str, template: str) -> None:
    stream = io.StringIO()
    configure_logging("test", "info")
    logging.getLogger().handlers[0].setStream(stream)  # type: ignore[attr-defined]

    structlog.get_logger().warning("request_failed", reason=template.format(secret), token=secret)

    output = stream.getvalue()
    assert secret not in output
    assert json.loads(output.splitlines()[-1])["token"] == "***"
