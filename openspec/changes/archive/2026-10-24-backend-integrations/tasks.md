# Tasks

Часть репо: backend, команды из `backend/`. Тесты с базой и Kafka интеграционные, нужен Docker.

## 1. Модуль и запись событий

- [x] 1.1 `core/retry.py`; `IntegrationSettings`, `.env.example`; модели и миграция; контракт import-linter для `apps.integrations`.
- [x] 1.2 `integrations.service.record_event`; события в `payments.service` и `record_time_events` в тике; тесты: состав событий, откат без события, два тика - одно событие, без адаптеров нет доставок.

## 2. Идемпотентность

- [x] 2.1 Ключ в создании платежа; тесты: тот же ключ и тело, другое тело - 422, разные авторы, без ключа.

## 3. Доставка

- [x] 3.1 `EventPublisher`, webhook и Kafka; отправитель доставок; тесты: подпись, повтор после 500 с тем же `id`, 400 - `failed`, Kafka в контейнере - порядок по ключу.
- [x] 3.2 Задачи `event_delivery` и `integrations_cleanup` в `worker`; тест очистки.

## 4. Проверки

- [x] 4.1 `backend/AGENTS.md`, `backend/plan.md`; полный набор проверок.
