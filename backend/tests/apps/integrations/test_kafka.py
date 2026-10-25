"""Kafka в контейнере изображает брокер заказчика: события одного платежа идут по порядку."""

import json
import time
from collections.abc import Iterator
from datetime import date

import pytest
from aiokafka import AIOKafkaConsumer
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker
from testcontainers.community.kafka import KafkaContainer

from apps.integrations.publishers import KafkaPublisher
from apps.integrations.service import EventDeliverer
from apps.payments.schemas import Currency, RecurringPaymentCreate, RecurringPaymentUpdate
from apps.payments.service import PaymentsService
from core.auth import Principal, Role
from tests.apps.payments.conftest import MovableClock
from tests.auth_helpers import ADMIN_ID

pytestmark = pytest.mark.integration

TOPIC = "invoice-keeper.events"
ADMIN = Principal(ADMIN_ID, "admin", Role.ADMIN)


class _Kafka(KafkaContainer):
    def get_exposed_port(self, port: int) -> int:
        # Docker Desktop публикует порт с задержкой, а контейнер спрашивает его сразу.
        for _ in range(60):
            try:
                return int(super().get_exposed_port(port))
            except ConnectionError:
                time.sleep(0.5)
        raise RuntimeError(f"Docker не опубликовал порт {port}")


@pytest.fixture(scope="module")
def kafka_brokers() -> Iterator[str]:
    with _Kafka("confluentinc/cp-kafka:7.6.0") as container:
        yield container.get_bootstrap_server()


async def test_events_of_payment_keep_order(
    kafka_brokers: str,
    clock: MovableClock,
    session_factory: async_sessionmaker[AsyncSession],
) -> None:
    service = PaymentsService(session_factory, clock, event_targets=("kafka",))
    row = await service.create(
        ADMIN,
        RecurringPaymentCreate(
            name="Сервер",
            amount_minor=2_500,
            currency=Currency.USD,
            next_due_date=date(2026, 11, 1),
        ),
    )
    payment_id = row.payment.id
    await service.update(ADMIN, payment_id, RecurringPaymentUpdate(name="Сервер и бэкап"))
    await service.stop(ADMIN, payment_id)
    publisher = KafkaPublisher(kafka_brokers, TOPIC)
    deliverer = EventDeliverer(session_factory, clock, {"kafka": publisher})

    assert await deliverer.send_due() == 3
    await deliverer.close()

    consumer = AIOKafkaConsumer(
        TOPIC, bootstrap_servers=kafka_brokers, auto_offset_reset="earliest", group_id="test"
    )
    await consumer.start()
    try:
        batches = await consumer.getmany(timeout_ms=10_000, max_records=10)
    finally:
        await consumer.stop()
    messages = [message for batch in batches.values() for message in batch]
    assert {message.key for message in messages} == {str(payment_id).encode()}
    assert len(batches) == 1
    assert [json.loads(message.value)["type"] for message in messages] == [
        "payment.created",
        "payment.updated",
        "payment.stopped",
    ]
