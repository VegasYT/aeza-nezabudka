import asyncio
from datetime import date
from typing import Any

import httpx
import pytest
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncEngine, AsyncSession, async_sessionmaker

from apps.audit.models import AuditRecord
from apps.payments.models import PaymentOccurrence, RecurringPayment
from apps.payments.service import PaymentsService
from tests.apps.payments.conftest import ADMIN, USER, MovableClock, create_payment, occurrences
from tests.auth_helpers import ADMIN_ID

pytestmark = pytest.mark.integration

MISSING_ID = "3c2b1a09-8f7e-4d6c-9b5a-4f3e2d1c0b9a"


def _dues(items: list[dict[str, Any]]) -> list[str]:
    return sorted(str(item["dueDate"]) for item in items)


async def _history(api: httpx.AsyncClient, clock: MovableClock) -> dict[str, Any]:
    """Платёж с оплаченным периодом на 5 октября и неоплаченным на 5 ноября; сегодня 24 октября."""
    clock.current = date(2026, 10, 5)
    payment = await create_payment(api, "2026-10-05")
    october = next(o for o in await occurrences(api, payment["id"]) if o["dueDate"] == "2026-10-05")
    paid = await api.patch(
        f"/api/v1/payment-occurrences/{october['id']}", json={"paid": True}, headers=USER
    )
    assert paid.status_code == 200, paid.text
    clock.current = date(2026, 10, 24)
    return payment


async def test_create_with_future_date(api: httpx.AsyncClient) -> None:
    payment = await create_payment(api, "2026-11-05")

    assert (payment["anchorDay"], payment["nextDueDate"]) == (5, "2026-11-05")
    assert payment["createdByLogin"] == "admin"
    assert _dues(await occurrences(api, payment["id"])) == ["2026-11-05"]


async def test_create_due_today_adds_next_period(api: httpx.AsyncClient) -> None:
    payment = await create_payment(api, "2026-10-24")

    assert _dues(await occurrences(api, payment["id"])) == ["2026-10-24", "2026-11-24"]


@pytest.mark.parametrize(
    ("fields", "field"),
    [
        ({"nextDueDate": "2026-10-23"}, "nextDueDate"),
        ({"departmentId": "9a8b7c6d-5e4f-4a3b-8c2d-1e0f9a8b7c6d"}, "departmentId"),
    ],
)
async def test_create_rejects(api: httpx.AsyncClient, fields: dict[str, str], field: str) -> None:
    body = {"name": "Аренда", "amountMinor": 100, "currency": "RUB", "nextDueDate": "2026-11-05"}

    response = await api.post("/api/v1/recurring-payments", json=body | fields, headers=ADMIN)

    assert response.status_code == 400
    assert {f["field"] for f in response.json()["payload"]} == {field}


async def test_list_get_and_status_filter(api: httpx.AsyncClient) -> None:
    active = await create_payment(api, "2026-11-05", name="Б-сервер")
    stopped = await create_payment(api, "2026-11-05", name="А-подписка")
    await api.delete(f"/api/v1/recurring-payments/{stopped['id']}", headers=ADMIN)

    all_items = (await api.get("/api/v1/recurring-payments", headers=USER)).json()
    only_stopped = (
        await api.get("/api/v1/recurring-payments", params={"status": "stopped"}, headers=USER)
    ).json()
    one = await api.get(f"/api/v1/recurring-payments/{active['id']}", headers=USER)
    missing = await api.get(f"/api/v1/recurring-payments/{MISSING_ID}", headers=USER)

    assert [p["name"] for p in all_items["items"]] == ["А-подписка", "Б-сервер"]
    assert [p["id"] for p in only_stopped["items"]] == [stopped["id"]]
    assert only_stopped["total"] == 1
    assert one.json()["id"] == active["id"]
    assert (missing.status_code, missing.json()["error"]) == (404, "not_found")


async def test_next_due_date_skips_overdue(api: httpx.AsyncClient, clock: MovableClock) -> None:
    clock.current = date(2026, 10, 5)
    payment = await create_payment(api, "2026-10-05")
    clock.current = date(2026, 10, 24)

    current = (await api.get(f"/api/v1/recurring-payments/{payment['id']}", headers=USER)).json()

    assert current["nextDueDate"] == "2026-11-05"


async def test_update_amount_keeps_history(api: httpx.AsyncClient, clock: MovableClock) -> None:
    payment = await _history(api, clock)

    response = await api.patch(
        f"/api/v1/recurring-payments/{payment['id']}",
        json={"amountMinor": 16_000_000},
        headers=ADMIN,
    )

    assert response.status_code == 200
    amounts = {o["dueDate"]: o["amountMinor"] for o in await occurrences(api, payment["id"])}
    assert amounts == {"2026-10-05": 15_000_000, "2026-11-05": 16_000_000}


async def test_update_date_replaces_future_periods(
    api: httpx.AsyncClient, clock: MovableClock
) -> None:
    payment = await _history(api, clock)
    url = f"/api/v1/recurring-payments/{payment['id']}"

    response = await api.patch(url, json={"nextDueDate": "2026-11-10"}, headers=ADMIN)
    past = await api.patch(url, json={"nextDueDate": "2026-10-01"}, headers=ADMIN)

    assert (response.json()["anchorDay"], response.json()["nextDueDate"]) == (10, "2026-11-10")
    assert _dues(await occurrences(api, payment["id"])) == ["2026-10-05", "2026-11-10"]
    assert (past.status_code, {f["field"] for f in past.json()["payload"]}) == (
        400,
        {"nextDueDate"},
    )


async def test_stop_keeps_history_and_refuses_changes(
    api: httpx.AsyncClient, clock: MovableClock
) -> None:
    payment = await _history(api, clock)
    url = f"/api/v1/recurring-payments/{payment['id']}"

    stopped = await api.delete(url, headers=ADMIN)
    again = await api.delete(url, headers=ADMIN)
    changed = await api.patch(url, json={"name": "Новое"}, headers=ADMIN)
    current = (await api.get(url, headers=USER)).json()

    assert stopped.status_code == 204
    assert (again.status_code, again.json()["error"]) == (409, "payment_stopped")
    assert (changed.status_code, changed.json()["error"]) == (409, "payment_stopped")
    assert current["stoppedAt"] is not None
    assert current["nextDueDate"] is None
    assert _dues(await occurrences(api, payment["id"])) == ["2026-10-05"]


async def test_changes_are_audited(
    api: httpx.AsyncClient, session_factory: async_sessionmaker[AsyncSession]
) -> None:
    payment = await create_payment(api, "2026-11-05")
    url = f"/api/v1/recurring-payments/{payment['id']}"
    await api.patch(url, json={"name": "Офис"}, headers=ADMIN)
    await api.delete(url, headers=ADMIN)

    async with session_factory() as session:
        actions = set(
            await session.scalars(
                select(AuditRecord.action).where(AuditRecord.entity_id == payment["id"])
            )
        )
    assert actions == {"payment.created", "payment.updated", "payment.stopped"}


async def test_ensure_periods_for_all_payments_is_safe_in_parallel(
    migrated_engine: AsyncEngine,
) -> None:
    # Нужны настоящие параллельные транзакции, поэтому данные коммитятся и удаляются в конце.
    factory = async_sessionmaker(migrated_engine, expire_on_commit=False)
    clock = MovableClock(date(2026, 10, 24))
    service = PaymentsService(factory, clock)
    ids = []
    try:
        async with factory() as session, session.begin():
            for name in ("Аренда", "Сервер", "Подписка"):
                payment = RecurringPayment(
                    name=name,
                    amount_minor=100,
                    currency="RUB",
                    period="month",
                    anchor_day=5,
                    schedule_first_due_date=date(2026, 11, 5),
                    schedule_from_seq=0,
                    created_by_id=ADMIN_ID,
                    created_by_login="admin",
                    stopped_at=clock.now() if name == "Подписка" else None,
                )
                session.add(payment)
                await session.flush()
                ids.append(payment.id)
        await service.ensure_periods()
        clock.current = date(2026, 11, 5)

        await asyncio.gather(service.ensure_periods(), service.ensure_periods())

        async with factory() as session:
            rows = (
                await session.execute(
                    select(
                        PaymentOccurrence.recurring_payment_id, PaymentOccurrence.due_date
                    ).where(PaymentOccurrence.recurring_payment_id.in_(ids))
                )
            ).all()
        per_payment = {i: sorted(str(due) for owner, due in rows if owner == i) for i in ids}
        assert per_payment[ids[0]] == ["2026-11-05", "2026-12-05"]
        assert per_payment[ids[1]] == ["2026-11-05", "2026-12-05"]
        assert per_payment[ids[2]] == []
    finally:
        async with factory() as session, session.begin():
            await session.execute(
                delete(PaymentOccurrence).where(PaymentOccurrence.recurring_payment_id.in_(ids))
            )
            await session.execute(delete(RecurringPayment).where(RecurringPayment.id.in_(ids)))


async def test_resume_continues_schedule(api: httpx.AsyncClient, clock: MovableClock) -> None:
    clock.current = date(2026, 10, 1)
    payment = await create_payment(api, "2026-10-05")
    clock.current = date(2026, 10, 24)
    path = f"/api/v1/recurring-payments/{payment['id']}"
    await api.delete(path, headers=ADMIN)

    resumed = await api.post(f"{path}/resume", headers=ADMIN)
    again = await api.post(f"{path}/resume", headers=ADMIN)

    body = resumed.json()
    assert resumed.status_code == 200, resumed.text
    assert (body["stoppedAt"], body["nextDueDate"], body["overdueCount"]) == (None, "2026-11-05", 1)
    assert (again.status_code, again.json()["error"]) == (409, "payment_active")


async def test_resume_from_new_date(api: httpx.AsyncClient) -> None:
    payment = await create_payment(api, "2026-10-26")
    path = f"/api/v1/recurring-payments/{payment['id']}"
    await api.delete(path, headers=ADMIN)

    past = await api.post(f"{path}/resume", json={"nextDueDate": "2026-10-01"}, headers=ADMIN)
    resumed = await api.post(f"{path}/resume", json={"nextDueDate": "2026-12-01"}, headers=ADMIN)
    as_user = await api.post(f"{path}/resume", headers=USER)

    assert past.status_code == 400
    assert (resumed.json()["nextDueDate"], resumed.json()["anchorDay"]) == ("2026-12-01", 1)
    assert as_user.status_code == 403
