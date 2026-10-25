"""Хранилище файлов (ADR-017): S3-совместимое, один клиент на процесс."""

import asyncio
from contextlib import AsyncExitStack
from datetime import datetime
from typing import TYPE_CHECKING, Protocol

from aiobotocore.config import AioConfig
from aiobotocore.session import get_session

from core.config import StorageSettings
from core.metrics import DEPENDENCY_ERRORS

# заглушки типов есть только в dev-зависимостях, в образе их нет
if TYPE_CHECKING:
    from types_aiobotocore_s3 import S3Client

TIMEOUT_SECONDS = 15


class StorageError(Exception):
    """Хранилище недоступно или ответило ошибкой."""


class ObjectStorage(Protocol):
    async def put(self, key: str, data: bytes, content_type: str) -> None: ...

    async def get(self, key: str) -> bytes: ...

    async def delete(self, key: str) -> None: ...

    async def keys(self, prefix: str, older_than: datetime) -> list[str]:
        """Ключи с префиксом, изменённые раньше `older_than`."""
        ...

    async def close(self) -> None: ...


class S3Storage:
    def __init__(self, settings: StorageSettings) -> None:
        self._settings = settings
        self._bucket = settings.s3_bucket
        self._stack = AsyncExitStack()
        self._client: S3Client | None = None
        self._lock = asyncio.Lock()

    @classmethod
    def from_settings(cls, settings: StorageSettings) -> "S3Storage | None":
        return None if settings.s3_endpoint_url is None else cls(settings)

    async def put(self, key: str, data: bytes, content_type: str) -> None:
        client = await self._connected()
        try:
            await client.put_object(
                Bucket=self._bucket, Key=key, Body=data, ContentType=content_type
            )
        except Exception as error:
            raise _failed(error) from None

    async def get(self, key: str) -> bytes:
        client = await self._connected()
        try:
            response = await client.get_object(Bucket=self._bucket, Key=key)
            async with response["Body"] as body:
                return await body.read()
        except Exception as error:
            raise _failed(error) from None

    async def delete(self, key: str) -> None:
        client = await self._connected()
        try:
            await client.delete_object(Bucket=self._bucket, Key=key)
        except Exception as error:
            raise _failed(error) from None

    async def keys(self, prefix: str, older_than: datetime) -> list[str]:
        client = await self._connected()
        found: list[str] = []
        try:
            pages = client.get_paginator("list_objects_v2").paginate(
                Bucket=self._bucket, Prefix=prefix
            )
            async for page in pages:
                found.extend(
                    item["Key"]
                    for item in page.get("Contents", [])
                    if item["LastModified"] < older_than
                )
        except Exception as error:
            raise _failed(error) from None
        return found

    async def close(self) -> None:
        await self._stack.aclose()

    async def _connected(self) -> "S3Client":
        async with self._lock:
            if self._client is None:
                settings = self._settings
                secret = settings.s3_secret_access_key
                self._client = await self._stack.enter_async_context(
                    get_session().create_client(
                        "s3",
                        endpoint_url=settings.s3_endpoint_url,
                        region_name=settings.s3_region,
                        aws_access_key_id=settings.s3_access_key_id,
                        aws_secret_access_key=None if secret is None else secret.get_secret_value(),
                        config=AioConfig(
                            # совместимые хранилища понимают не все новые заголовки
                            # контрольных сумм botocore: шлём их, только когда требует операция
                            request_checksum_calculation="when_required",
                            response_checksum_validation="when_required",
                            s3={"addressing_style": "path"},
                            connect_timeout=TIMEOUT_SECONDS,
                            read_timeout=TIMEOUT_SECONDS,
                            retries={"max_attempts": 2},
                        ),
                    )
                )
            return self._client


def _failed(error: Exception) -> StorageError:
    DEPENDENCY_ERRORS.labels("s3").inc()
    return StorageError(f"{type(error).__name__}: {error}"[:500])
