"""S3-хранилище в памяти для тестов: тот же протокол `ObjectStorage`."""

from datetime import UTC, datetime

from core.storage import StorageError

PDF = b"%PDF-1.7\n%test receipt\n"
PNG = b"\x89PNG\r\n\x1a\n" + b"\x00" * 32


class MemoryStorage:
    def __init__(self) -> None:
        # ключ - (содержимое, тип, когда записан)
        self.objects: dict[str, tuple[bytes, str, datetime]] = {}
        self.broken = False

    async def put(self, key: str, data: bytes, content_type: str) -> None:
        self._check()
        self.objects[key] = (data, content_type, datetime.now(UTC))

    async def get(self, key: str) -> bytes:
        self._check()
        if key not in self.objects:
            raise StorageError("NoSuchKey")
        return self.objects[key][0]

    async def delete(self, key: str) -> None:
        self._check()
        self.objects.pop(key, None)

    async def keys(self, prefix: str, older_than: datetime) -> list[str]:
        self._check()
        return [
            key
            for key, (_, _, written) in self.objects.items()
            if key.startswith(prefix) and written < older_than
        ]

    async def close(self) -> None:
        return None

    def _check(self) -> None:
        if self.broken:
            raise StorageError("ConnectionError: хранилище недоступно")
