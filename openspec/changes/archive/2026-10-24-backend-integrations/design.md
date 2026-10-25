# Design

## Context

`payments.service` уже зовёт `departments.service` и `audit.service` в своих транзакциях; `reminders` зависит от `payments`. Очередь напоминаний (шаг 6) показала рабочий способ доставки: строка - одна транзакция, `skip locked`, повторная попытка по времени.

## Decisions

### Модуль и зависимости

`apps/integrations` ничего не знает о платежах: принимает готовое событие (тип, данные, ключ раздела, `dedup_key`) и доставляет его. Данные события собирает `payments.service`, потому что знает свои таблицы. Тик зовёт `payments.service.record_time_events`, а тот - `integrations.service`. Цикла нет: `integrations` ни от кого, кроме `core`, не зависит.

### Таблицы

- `integration_events`: `id` (uuid, ключ идемпотентности для получателя), `type`, `schema_version` (1), `dedup_key` (unique, может быть пустым), `partition_key` (идентификатор платежа), `payload` (jsonb, конверт целиком), `created_at`.
- `integration_deliveries`: `id`, `event_id` (fk, `on delete cascade`), `target` (`webhook` | `kafka`), `state`, `attempts`, `next_attempt_at`, `last_error`, `sent_at`, `unique (event_id, target)`, частичный индекс по ожидающим.
- `idempotency_keys`: `actor_id`, `key`, `operation`, `request_hash`, `resource_id`, `created_at`, `unique (actor_id, key)`.

Отступление от раздела 3 `docs/plan.md`: у ключа идемпотентности хранится не ответ целиком, а идентификатор созданного платежа. Повтор возвращает платёж в текущем состоянии - этого требует сценарий "тот же платёж", а копия ответа устаревала бы после изменений.

### Конверт события

```json
{
  "id": "…",
  "type": "occurrence.paid",
  "schema_version": 1,
  "occurred_at": "2026-10-24T09:00:00Z",
  "data": {
    "payment": {"id": "…", "name": "Аренда офиса", "amount_minor": 15000000, "currency": "RUB",
                "anchor_day": 5, "department": {"id": "…", "name": "Офис"}, "stopped": false},
    "occurrence": {"id": "…", "due_date": "2026-11-05", "amount_minor": 15000000,
                   "currency": "RUB", "paid_on": "2026-11-03", "paid_by_login": "buh.petrova"},
    "actor_login": "buh.petrova"
  }
}
```

У событий платежа нет `occurrence`; у событий по времени `actor_login` - `null`. Персональных данных, кроме логина автора, нет.

### Запись

`record_event(session, targets, event)`: `insert ... on conflict (dedup_key) do nothing returning id`, затем строки доставки для включённых адаптеров. Без адаптеров событие остаётся журналом. События по времени тик ставит для тех же периодов, что и напоминания: `due_soon` - неоплаченные действующие со сроком в окне, `overdue` - просроченные; `dedup_key` - `<тип>:<id периода>`.

`occurrence.due_soon` для поздно добавленного платежа выпускается первым тиком, а не в транзакции создания: получатель и так узнаёт о платеже из `payment.created`.

### Адаптеры

Протокол `EventPublisher.publish(event: OutgoingEvent)`; ошибки - `TemporaryPublishError`, `PermanentPublishError`.

- **webhook** (httpx): POST тела конверта, `Content-Type: application/json`, `X-Event-Id`, `X-Event-Type`, `X-Signature: sha256=<hex HMAC-SHA256 тела по WEBHOOK_SECRET>`. Ответ 2xx - доставлено; сеть, таймаут, 5xx и 429 - повтор; остальные 4xx - `failed`. Тело для подписи и отправки - одни и те же байты.
- **Kafka** (aiokafka): `send_and_wait(KAFKA_TOPIC, value=тело, key=partition_key)`; любая ошибка - повтор. Продюсер стартует при первой публикации и останавливается вместе с `worker`.

### Доставка

Задача `event_delivery` в `worker` раз в 2 секунды, как отправитель напоминаний: одна строка - одна транзакция, `skip locked`, пауза `core.retry.retry_delay`. Предела попыток нет. Получатель webhook дедуплицирует по `id` события: повтор после падения между ответом и коммитом возможен.

### Идемпотентность

`PaymentsService.create(..., idempotency_key=...)` в той же транзакции вставляет `idempotency_keys` с `on conflict do nothing`. Если ключ уже был: другой хеш тела - 422 `idempotency_key_reused`, тот же - возвращается сохранённый платёж, новый не создаётся. Параллельные запросы с одним ключом упорядочивает уникальный индекс: второй ждёт коммита первого и видит его платёж. Ключ различается по автору: одинаковые ключи двух систем не мешают друг другу. Хеш - sha256 JSON тела с отсортированными ключами.

### Очистка

Задача `integrations_cleanup` раз в час удаляет ключи старше суток и события старше 30 дней, у которых нет недоставленных строк.

### Настройки

`IntegrationSettings` читают `api` и `worker`: `WEBHOOK_URL` (http(s)), `WEBHOOK_SECRET` (обязателен при адресе), `KAFKA_BROKERS` (через запятую), `KAFKA_TOPIC` (по умолчанию `invoice-keeper.events`). Адаптер включён, если задан его адрес.
