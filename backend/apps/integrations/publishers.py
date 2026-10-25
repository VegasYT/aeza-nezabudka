"""Адаптеры доставки событий системам заказчика: webhook и Kafka (ADR-011)."""

import asyncio
import hashlib
import hmac
from dataclasses import dataclass
from typing import Protocol
from uuid import UUID

import httpx
from aiokafka import AIOKafkaProducer

from core.config import IntegrationSettings

ERROR_LIMIT = 500
REQUEST_TIMEOUT_SECONDS = 10.0


@dataclass(frozen=True)
class OutgoingEvent:
    id: UUID
    type: str
    partition_key: str
    body: bytes


class PublishError(Exception):
    def __init__(self, reason: str) -> None:
        super().__init__(reason)
        self.reason = reason[:ERROR_LIMIT]


class TemporaryPublishError(PublishError):
    pass


class PermanentPublishError(PublishError):
    pass


class EventPublisher(Protocol):
    async def publish(self, event: OutgoingEvent) -> None: ...

    async def close(self) -> None: ...


def signature(body: bytes, secret: str) -> str:
    return "sha256=" + hmac.new(secret.encode(), body, hashlib.sha256).hexdigest()


class WebhookPublisher:
    def __init__(self, url: str, secret: str, http: httpx.AsyncClient | None = None) -> None:
        self._url = url
        self._secret = secret
        self._http = http or httpx.AsyncClient(timeout=REQUEST_TIMEOUT_SECONDS)

    async def publish(self, event: OutgoingEvent) -> None:
        headers = {
            "Content-Type": "application/json",
            "X-Event-Id": str(event.id),
            "X-Event-Type": event.type,
            "X-Signature": signature(event.body, self._secret),
        }
        try:
            response = await self._http.post(self._url, content=event.body, headers=headers)
        except httpx.HTTPError as error:
            raise TemporaryPublishError(f"{type(error).__name__}: {error}") from None
        status = response.status_code
        if status < 300:
            return
        reason = f"HTTP {status}: {response.text}"
        if status >= 500 or status == 429:
            raise TemporaryPublishError(reason)
        raise PermanentPublishError(reason)

    async def close(self) -> None:
        await self._http.aclose()


class KafkaPublisher:
    """Продюсер стартует при первой публикации: недоступный брокер не мешает запуску worker."""

    def __init__(self, brokers: str, topic: str) -> None:
        self._brokers = brokers
        self._topic = topic
        self._producer: AIOKafkaProducer | None = None
        self._lock = asyncio.Lock()

    async def publish(self, event: OutgoingEvent) -> None:
        try:
            producer = await self._started()
            await producer.send_and_wait(
                self._topic, value=event.body, key=event.partition_key.encode()
            )
        except Exception as error:
            # Брокер недоступен, нет лидера партиции, таймаут: повторим позже.
            await self.close()
            raise TemporaryPublishError(f"{type(error).__name__}: {error}") from None

    async def close(self) -> None:
        if self._producer is not None:
            producer, self._producer = self._producer, None
            await producer.stop()

    async def _started(self) -> AIOKafkaProducer:
        async with self._lock:
            if self._producer is None:
                producer = AIOKafkaProducer(bootstrap_servers=self._brokers, acks="all")
                try:
                    await producer.start()
                except Exception:
                    await producer.stop()
                    raise
                self._producer = producer
            return self._producer


def build_publishers(settings: IntegrationSettings) -> dict[str, EventPublisher]:
    publishers: dict[str, EventPublisher] = {}
    if settings.webhook_url is not None and settings.webhook_secret is not None:
        publishers["webhook"] = WebhookPublisher(
            settings.webhook_url, settings.webhook_secret.get_secret_value()
        )
    if settings.kafka_brokers is not None:
        publishers["kafka"] = KafkaPublisher(settings.kafka_brokers, settings.kafka_topic)
    return publishers
