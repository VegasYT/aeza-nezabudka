"""S3Storage на настоящем Garage: тот же образ и конфиг, что на стенде (ADR-017)."""

import asyncio
import secrets
import time
from collections.abc import AsyncIterator, Iterator
from datetime import UTC, datetime, timedelta
from pathlib import Path

import pytest
from pydantic import SecretStr
from testcontainers.core.container import DockerContainer

from core.config import StorageSettings
from core.storage import S3Storage, StorageError

pytestmark = pytest.mark.integration

GARAGE_IMAGE = "dxflrs/garage:v2.5.0"
GARAGE_CONFIG = Path(__file__).resolve().parents[3] / "infra" / "garage" / "garage.toml"
BUCKET = "receipts"


def _published_port(container: DockerContainer, port: int) -> int:
    # Docker Desktop публикует порт с задержкой, а контейнер спрашивает его сразу.
    for _ in range(60):
        try:
            return int(container.get_exposed_port(port))
        except ConnectionError:
            time.sleep(0.5)
    raise RuntimeError(f"Docker не опубликовал порт {port}")


@pytest.fixture(scope="module")
def garage() -> Iterator[StorageSettings]:
    key = "GK" + secrets.token_hex(12)
    secret = secrets.token_hex(32)
    container = (
        DockerContainer(GARAGE_IMAGE)
        .with_volume_mapping(str(GARAGE_CONFIG), "/etc/garage.toml", "ro")
        .with_env("GARAGE_RPC_SECRET", secrets.token_hex(32))
        .with_env("GARAGE_DEFAULT_ACCESS_KEY", key)
        .with_env("GARAGE_DEFAULT_SECRET_KEY", secret)
        .with_env("GARAGE_DEFAULT_BUCKET", BUCKET)
        .with_command("/garage server --single-node --default-bucket")
        .with_exposed_ports(3900)
    )
    with container:
        host = container.get_container_host_ip()
        port = _published_port(container, 3900)
        yield StorageSettings(
            s3_endpoint_url=f"http://{host}:{port}",
            s3_bucket=BUCKET,
            s3_access_key_id=key,
            s3_secret_access_key=SecretStr(secret),
            s3_region="garage",
        )


@pytest.fixture
async def storage(garage: StorageSettings) -> AsyncIterator[S3Storage]:
    storage = S3Storage(garage)
    # Garage поднимает узел и бакет за секунды после старта контейнера
    for _ in range(60):
        try:
            await storage.keys("", datetime.now(UTC))
            break
        except StorageError:
            await asyncio.sleep(0.5)
    yield storage
    await storage.close()


async def test_put_get_list_delete(storage: S3Storage) -> None:
    data = b"%PDF-1.7 receipt"

    await storage.put("receipts/a/1", data, "application/pdf")
    fresh = await storage.keys("receipts/", datetime.now(UTC) - timedelta(hours=1))
    stale = await storage.keys("receipts/", datetime.now(UTC) + timedelta(minutes=1))
    read = await storage.get("receipts/a/1")
    await storage.delete("receipts/a/1")

    assert read == data
    assert (fresh, stale) == ([], ["receipts/a/1"])
    with pytest.raises(StorageError):
        await storage.get("receipts/a/1")


async def test_wrong_secret_is_storage_error(garage: StorageSettings) -> None:
    storage = S3Storage(garage.model_copy(update={"s3_secret_access_key": SecretStr("wrong")}))

    with pytest.raises(StorageError):
        await storage.put("receipts/b/1", b"%PDF-", "application/pdf")
    await storage.close()
