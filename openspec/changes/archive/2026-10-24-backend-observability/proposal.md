# Proposal

## Why

ADR-009 требует видеть в Grafana состояние API, планировщика и очередей отправки, а в логах находить запрос или фоновую операцию по идентификатору. Сейчас метрик нет совсем, а у задач `worker` в логах нет `operation_id`. Без метрики времени последнего тика остановившийся `worker` незаметен: API продолжает отвечать. Это шаг 10 `backend/plan.md`.

## What Changes

- `/metrics` у `api` (не входит в контракт) и у `worker` на отдельном порту вместе с `/healthz`.
- Метрики: HTTP-запросы по шаблону маршрута, методу и коду; запуски и время последнего успеха каждой задачи `worker`; созданные периоды; размер и возраст старейшей записи очередей напоминаний и доставок событий; результаты отправки напоминаний и доставки событий; ошибки PostgreSQL, Keycloak и Telegram.
- `operation_id` в логах каждого запуска задачи `worker`.
- Скрытие секретов в логах дополняется проверкой значений: `Bearer`-токены и токены Telegram-бота заменяются на `***` в любом поле.
- Настройка `WORKER_HTTP_PORT` (по умолчанию 9100).

## Capabilities

### New Capabilities

- `observability`: состав метрик, их метки, поля логов и скрытие секретов.

### Modified Capabilities

Нет.

## Impact

- `core/metrics.py`, `core/logging.py`, `core/errors.py`, `core/auth.py`, `core/config.py`, `app/main.py`, `app/worker.py`, отправители в `apps/reminders` и `apps/integrations`, `.env.example`, `backend/AGENTS.md`, `backend/plan.md`.
- Зависимость `prometheus-client`.
- Контракт API не меняется: `/metrics` вне `/api/v1` и вне схемы.
