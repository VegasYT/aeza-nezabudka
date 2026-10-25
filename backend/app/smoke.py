"""Сценарий защиты через API: `SMOKE_API_KEY=... uv run python -m app.smoke --api ...`.

Ходит с ключом аккаунта Aéza (`X-API-KEY`) из белого списка с ролью `integration` или `admin`
(ADR-014); ключ берёт из `SMOKE_API_KEY`. Изменённые демо-данные возвращает, свой платёж прекращает.
"""

import argparse
import asyncio
import os
import sys
import uuid
from datetime import UTC, date, datetime, timedelta
from typing import Any
from zoneinfo import ZoneInfo

import httpx

API = "/api/v1"


class SmokeFailed(Exception):
    pass


class _Steps:
    def __init__(self, client: httpx.AsyncClient) -> None:
        self.client = client
        self.number = 0
        self.title = ""

    def start(self, title: str) -> None:
        self.number += 1
        self.title = title
        print(f"{self.number}. {title}")

    def check(self, condition: bool, response: httpx.Response | None = None) -> None:
        if condition:
            return
        detail = "" if response is None else f": HTTP {response.status_code} {response.text}"
        raise SmokeFailed(f'Шаг {self.number} "{self.title}" не прошёл{detail}')

    async def call(self, method: str, path: str, expected: int, **kwargs: Any) -> httpx.Response:
        response = await self.client.request(method, path, **kwargs)
        self.check(response.status_code == expected, response)
        return response


async def _periods(steps: _Steps, payment_id: str) -> list[dict[str, Any]]:
    response = await steps.call(
        "get",
        f"{API}/payment-occurrences",
        200,
        params={"recurringPaymentId": payment_id, "order": "asc"},
    )
    return list(response.json()["items"])


async def run_smoke(client: httpx.AsyncClient, today: date) -> None:
    """Проходит шаги сценария; на первом сбое поднимает `SmokeFailed`."""
    steps = _Steps(client)

    steps.start("Сервис готов")
    await steps.call("get", "/healthz", 200)
    await steps.call("get", "/readyz", 200)

    steps.start("Платёж со сроком через 2 дня, повтор с тем же Idempotency-Key")
    due = today + timedelta(days=2)
    body = {
        "name": f"Smoke {datetime.now(UTC):%Y-%m-%d %H:%M:%S}",
        "amountMinor": 100_00,
        "currency": "RUB",
        "nextDueDate": due.isoformat(),
    }
    headers = {"Idempotency-Key": f"smoke-{uuid.uuid4()}"}
    created = await steps.call("post", f"{API}/recurring-payments", 201, json=body, headers=headers)
    repeated = await steps.call(
        "post", f"{API}/recurring-payments", 201, json=body, headers=headers
    )
    payment_id = created.json()["id"]
    steps.check(repeated.json()["id"] == payment_id, repeated)

    try:
        steps.start("Период в окне напоминания без просрочки")
        periods = await _periods(steps, payment_id)
        steps.check(bool(periods))
        first = periods[0]
        steps.check(first["dueDate"] == due.isoformat())
        steps.check(not first["paid"] and not first["overdue"])

        steps.start("Отметка оплаты")
        paid = await steps.call(
            "patch", f"{API}/payment-occurrences/{first['id']}", 200, json={"paid": True}
        )
        steps.check(paid.json()["paid"] is True, paid)

        steps.start("Исправление даты оплаты убирает просрочку, следующий период отдельно")
        overdue = await steps.call(
            "get", f"{API}/payment-occurrences", 200, params={"status": "overdue", "limit": 1}
        )
        items = overdue.json()["items"]
        steps.check(bool(items), overdue)
        period = items[0]
        url = f"{API}/payment-occurrences/{period['id']}"
        fixed = await steps.call(
            "patch", url, 200, json={"paid": True, "paidOn": period["dueDate"]}
        )
        steps.check(fixed.json()["overdue"] is False, fixed)
        later = [
            item
            for item in await _periods(steps, period["recurringPayment"]["id"])
            if item["dueDate"] > period["dueDate"]
        ]
        steps.check(bool(later) and later[0]["paid"] is False)
        restored = await steps.call("patch", url, 200, json={"paid": False})
        steps.check(restored.json()["overdue"] is True, restored)

        steps.start("Итоги по трём валютам")
        summary = await steps.call("get", f"{API}/payments/summary", 200)
        currencies = [item["currency"] for item in summary.json()["currencies"]]
        steps.check(currencies == ["RUB", "USD", "EUR"], summary)
    finally:
        steps.start("Прекращение платежа smoke")
        await steps.call("delete", f"{API}/recurring-payments/{payment_id}", 204)


async def _main(args: argparse.Namespace) -> None:
    api_key = os.environ.get("SMOKE_API_KEY", "")
    if not api_key:
        raise SmokeFailed("Не задана переменная SMOKE_API_KEY")
    today = datetime.now(ZoneInfo(os.environ.get("TZ", "Europe/Moscow"))).date()
    async with httpx.AsyncClient(
        base_url=args.api, headers={"X-API-KEY": api_key}, timeout=20
    ) as client:
        await run_smoke(client, today)


def main() -> None:
    parser = argparse.ArgumentParser(description="Сценарий защиты через API")
    parser.add_argument("--api", default="http://localhost:8000", help="адрес backend")
    try:
        asyncio.run(_main(parser.parse_args()))
    except (SmokeFailed, httpx.HTTPError) as error:
        print(error, file=sys.stderr)
        raise SystemExit(1) from None
    print("Сценарий прошёл")


if __name__ == "__main__":
    main()
