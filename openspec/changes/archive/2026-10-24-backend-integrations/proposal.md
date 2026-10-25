# Proposal

## Why

Система должна встраиваться в инфраструктуру заказчика (ADR-011): учётная система должна узнавать об изменениях платежей, а сама - создавать платежи через API без дублей при повторах. Роль `integration` и заголовок `Idempotency-Key` уже есть в контракте, но заголовок игнорируется, а события наружу не уходят. Это шаг 9 `backend/plan.md`.

## What Changes

- Модуль `apps/integrations`: таблицы `integration_events`, `integration_deliveries`, `idempotency_keys`, миграция.
- События `payment.created`, `payment.updated`, `payment.stopped`, `occurrence.paid`, `occurrence.unpaid` пишутся в транзакции изменения; `occurrence.due_soon` и `occurrence.overdue` ставит тик планировщика, `dedup_key` не даёт выпустить их дважды.
- Адаптеры за интерфейсом `EventPublisher`: webhook (HTTP POST, подпись HMAC-SHA256 в `X-Signature`) и Kafka (ключ - идентификатор платежа). Каждый включается своей настройкой.
- Доставка в `worker`: `for update skip locked`, повторы с растущей паузой, `failed` при окончательной ошибке.
- `Idempotency-Key` у `POST /recurring-payments`: повтор с тем же телом возвращает тот же платёж, с другим телом - 422.
- Раз в час удаляются ключи идемпотентности старше суток и доставленные события старше 30 дней.
- Настройки `WEBHOOK_URL`, `WEBHOOK_SECRET`, `KAFKA_BROKERS`, `KAFKA_TOPIC`.
- Общая функция паузы повторов переезжает в `core/retry.py`: её используют напоминания и события.

Вне изменения: Kafka в compose (профиль `integration`) и инструкция по AD/LDAP - этап "Фундамент" и README.

## Capabilities

### New Capabilities

- `integration-events`: состав событий, запись в транзакции, адаптеры и доставка.
- `idempotent-requests`: повтор `POST` с ключом идемпотентности.

### Modified Capabilities

Нет.

## Impact

- `backend/apps/integrations/` (новый модуль и его контракт import-linter), `backend/apps/payments/service.py`, `backend/app/worker.py`, `backend/app/main.py`, `core/config.py`, `core/retry.py`, миграция, `.env.example`, `backend/AGENTS.md`, `backend/plan.md`.
- Зависимость `aiokafka`; в тестах Kafka в контейнере (`testcontainers.community.kafka`).
- Контракт API не меняется: заголовок и ответ 422 уже описаны.
