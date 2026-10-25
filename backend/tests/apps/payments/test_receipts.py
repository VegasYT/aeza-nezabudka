"""Чек оплаты периода: загрузка, замена, скачивание, удаление и очистка хранилища."""

import uuid
from collections.abc import AsyncIterator
from datetime import UTC, datetime, timedelta
from typing import Any

import httpx
import pytest
from sqlalchemy.ext.asyncio import AsyncEngine, AsyncSession, async_sessionmaker

from app.main import create_asgi_app
from apps.payments.domain import RECEIPT_MAX_BYTES, receipt_name, receipt_type
from apps.payments.receipts import ReceiptsService
from core.config import Settings
from core.errors import AppError
from tests.apps.payments.conftest import ADMIN, USER, MovableClock, create_payment, occurrences
from tests.apps.reminders.test_links import PETROVA
from tests.auth_helpers import FakeAuthenticator
from tests.storage_helpers import PDF, PNG, MemoryStorage

pytestmark = pytest.mark.integration


@pytest.fixture
def storage() -> MemoryStorage:
    return MemoryStorage()


@pytest.fixture
async def api(
    settings: Settings,
    clock: MovableClock,
    migrated_engine: AsyncEngine,
    session_factory: async_sessionmaker[AsyncSession],
    storage: MemoryStorage,
) -> AsyncIterator[httpx.AsyncClient]:
    app = create_asgi_app(
        settings,
        migrated_engine,
        clock,
        authenticator=FakeAuthenticator(),
        session_factory=session_factory,
        storage=storage,
    )
    transport = httpx.ASGITransport(app=app, raise_app_exceptions=False)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        yield client


async def _paid_occurrence(api: httpx.AsyncClient) -> str:
    payment = await create_payment(api, "2026-10-30")
    occurrence_id = str((await occurrences(api, payment["id"]))[0]["id"])
    paid = await api.patch(
        f"/api/v1/payment-occurrences/{occurrence_id}", json={"paid": True}, headers=USER
    )
    assert paid.status_code == 200, paid.text
    return occurrence_id


async def _upload(
    api: httpx.AsyncClient, occurrence_id: str, name: str, data: bytes
) -> httpx.Response:
    return await api.put(
        f"/api/v1/payment-occurrences/{occurrence_id}/receipt",
        files={"file": (name, data, "application/octet-stream")},
        headers=USER,
    )


@pytest.mark.parametrize(
    ("data", "expected"),
    [
        (PDF, "application/pdf"),
        (PNG, "image/png"),
        (b"\xff\xd8\xff\xe0" + b"\x00" * 8, "image/jpeg"),
        (b"RIFF\x00\x00\x00\x00WEBPVP8 ", "image/webp"),
        (b"<html><script>alert(1)</script>", None),
        (b"<svg xmlns='http://www.w3.org/2000/svg'/>", None),
    ],
)
def test_receipt_type_by_content(data: bytes, expected: str | None) -> None:
    assert receipt_type(data) == expected


def test_receipt_name_is_safe() -> None:
    assert receipt_name("../../etc/чек\x00.pdf", "application/pdf") == "чек.pdf"
    assert receipt_name("scan.jpeg", "image/jpeg") == "scan.jpeg"
    assert receipt_name(None, "image/png") == "receipt.png"
    assert receipt_name("чек", "application/pdf") == "чек.pdf"


async def test_attach_download_and_replace(api: httpx.AsyncClient, storage: MemoryStorage) -> None:
    occurrence_id = await _paid_occurrence(api)

    first = await _upload(api, occurrence_id, "чек сбер.pdf", PDF)
    second = await _upload(api, occurrence_id, "photo.png", PNG)
    file = await api.get(f"/api/v1/payment-occurrences/{occurrence_id}/receipt", headers=ADMIN)

    assert first.status_code == 200, first.text
    receipt: dict[str, Any] = second.json()["receipt"]
    assert (receipt["fileName"], receipt["contentType"], receipt["size"]) == (
        "photo.png",
        "image/png",
        len(PNG),
    )
    assert receipt["uploadedByLogin"] == "buh.petrova"
    assert file.content == PNG
    assert file.headers["content-type"] == "image/png"
    assert file.headers["x-content-type-options"] == "nosniff"
    assert "filename*=UTF-8''photo.png" in file.headers["content-disposition"]
    # старый файл удалён после замены
    assert [data for data, _, _ in storage.objects.values()] == [PNG]


async def test_receipt_rules(api: httpx.AsyncClient, storage: MemoryStorage) -> None:
    payment = await create_payment(api, "2026-10-30")
    unpaid_id = str((await occurrences(api, payment["id"]))[0]["id"])
    paid_id = await _paid_occurrence(api)

    unpaid = await _upload(api, unpaid_id, "чек.pdf", PDF)
    html = await _upload(api, paid_id, "чек.pdf", b"<html><body>hi</body></html>")
    big = await _upload(api, paid_id, "big.pdf", PDF + b"0" * RECEIPT_MAX_BYTES)
    missing = await api.get(f"/api/v1/payment-occurrences/{paid_id}/receipt", headers=USER)

    assert (unpaid.status_code, unpaid.json()["error"]) == (409, "occurrence_not_paid")
    assert (html.status_code, big.status_code, missing.status_code) == (400, 400, 404)
    assert storage.objects == {}


async def test_unpaid_and_delete_remove_receipt(
    api: httpx.AsyncClient,
    storage: MemoryStorage,
    session_factory: async_sessionmaker[AsyncSession],
    clock: MovableClock,
) -> None:
    first = await _paid_occurrence(api)
    second = await _paid_occurrence(api)
    await _upload(api, first, "a.pdf", PDF)
    await _upload(api, second, "b.pdf", PDF)

    unpaid = await api.patch(
        f"/api/v1/payment-occurrences/{first}", json={"paid": False}, headers=USER
    )
    deleted = await api.delete(f"/api/v1/payment-occurrences/{second}/receipt", headers=USER)
    log = (await api.get("/api/v1/audit-log", headers=ADMIN)).json()["items"]

    assert unpaid.json()["receipt"] is None
    assert deleted.status_code == 204
    assert log[0]["action"] == "receipt.deleted"
    # объект отменённой оплаты остался без записи: его удалит очистка, когда он состарится
    assert len(storage.objects) == 1
    [(key, (data, kind, _))] = storage.objects.items()
    storage.objects[key] = (data, kind, datetime.now(UTC) - timedelta(days=2))
    removed = await ReceiptsService(session_factory, clock, storage).cleanup()
    assert (removed, storage.objects) == (1, {})


async def test_storage_failure_keeps_no_record(
    api: httpx.AsyncClient, storage: MemoryStorage
) -> None:
    occurrence_id = await _paid_occurrence(api)
    storage.broken = True

    response = await _upload(api, occurrence_id, "чек.pdf", PDF)
    storage.broken = False
    occurrence = await api.get(f"/api/v1/payment-occurrences/{occurrence_id}", headers=USER)

    assert (response.status_code, response.json()["error"]) == (503, "storage_unavailable")
    assert occurrence.json()["receipt"] is None


async def test_settings_tell_receipts_enabled(api: httpx.AsyncClient) -> None:
    settings = await api.get("/api/v1/settings", headers=USER)

    assert settings.json()["receiptsEnabled"] is True


async def test_receipts_disabled_without_storage(
    session_factory: async_sessionmaker[AsyncSession], clock: MovableClock
) -> None:
    with pytest.raises(AppError) as raised:
        await ReceiptsService(session_factory, clock, None).attach(
            PETROVA, uuid.uuid4(), "чек.pdf", PDF
        )

    assert (raised.value.code, raised.value.status_code) == ("receipts_disabled", 409)
