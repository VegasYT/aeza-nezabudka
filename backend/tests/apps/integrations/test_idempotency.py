import httpx
import pytest
from pydantic.alias_generators import to_camel
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from apps.payments.models import RecurringPayment
from tests.apps.integrations.conftest import ERP, events
from tests.apps.payments.conftest import ADMIN

pytestmark = pytest.mark.integration

BODY = {"name": "Аренда склада", "amountMinor": 9_000_000, "currency": "RUB"}


async def _create(
    api: httpx.AsyncClient, headers: dict[str, str], key: str | None, **fields: object
) -> httpx.Response:
    extra = {} if key is None else {"Idempotency-Key": key}
    return await api.post(
        "/api/v1/recurring-payments",
        json=BODY | {"nextDueDate": "2026-11-05"} | {to_camel(k): v for k, v in fields.items()},
        headers=headers | extra,
    )


async def _payments(session_factory: async_sessionmaker[AsyncSession]) -> int:
    async with session_factory() as session:
        return await session.scalar(select(func.count()).select_from(RecurringPayment)) or 0


async def test_repeat_with_same_body_returns_same_payment(
    api: httpx.AsyncClient, session_factory: async_sessionmaker[AsyncSession]
) -> None:
    first = await _create(api, ERP, "1c-42")
    second = await _create(api, ERP, "1c-42")

    assert (first.status_code, second.status_code) == (201, 201)
    assert first.json()["id"] == second.json()["id"]
    assert await _payments(session_factory) == 1
    assert [e["type"] for e in await events(session_factory)] == ["payment.created"]


async def test_repeat_with_other_body_is_rejected(
    api: httpx.AsyncClient, session_factory: async_sessionmaker[AsyncSession]
) -> None:
    await _create(api, ERP, "1c-42")

    response = await _create(api, ERP, "1c-42", amount_minor=9_500_000)

    assert (response.status_code, response.json()["error"]) == (400, "idempotency_key_reused")
    assert await _payments(session_factory) == 1


async def test_keys_of_different_authors_do_not_clash(
    api: httpx.AsyncClient, session_factory: async_sessionmaker[AsyncSession]
) -> None:
    erp = await _create(api, ERP, "same-key")
    admin = await _create(api, ADMIN, "same-key")

    assert erp.json()["id"] != admin.json()["id"]
    assert await _payments(session_factory) == 2


async def test_without_key_repeat_creates_twice(
    api: httpx.AsyncClient, session_factory: async_sessionmaker[AsyncSession]
) -> None:
    await _create(api, ERP, None)
    await _create(api, ERP, None)

    assert await _payments(session_factory) == 2
