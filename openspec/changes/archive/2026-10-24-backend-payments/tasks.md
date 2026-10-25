# Tasks

Часть репо: backend, команды из `backend/`. Тесты групп 2-4 интеграционные, нужен Docker.

## 1. Хранение

- [x] 1.1 `apps/payments/models.py` (`RecurringPayment`, `PaymentOccurrence` с ограничениями из design), регистрация в `migrations/env.py`, миграция Alembic; проверка: `uv run alembic upgrade head` на чистой базе, тест миграций проходит.
- [x] 1.2 `create_app` принимает `session_factory`; фикстура клиента API с токенами ролей и фабрикой с откатом в `tests/apps/payments/conftest.py`; проверка: `uv run pytest tests/app` проходит.

## 2. Регулярные платежи

- [x] 2.1 `repository.py` и `service.py`: создание с периодами, `ensure_periods` для одного и всех платежей, список, платёж по идентификатору, изменение, прекращение, журнал в той же транзакции; роутер `/recurring-payments`; тесты по сценариям спецификаций `recurring-payments` и `payment-schedule` (досоздание для всех, параллельный запуск, прекращённый платёж), включая 404, 409, 422 по дате и отделу и записи журнала; проверка: `uv run pytest tests/apps/payments/test_recurring.py`.

## 3. Периоды и итоги

- [x] 3.1 Список периодов с фильтрами, сортировкой и страницами, период по идентификатору, отметка, исправление и отмена оплаты с журналом; тесты по сценариям спецификации `payment-occurrences`; проверка: `uv run pytest tests/apps/payments/test_occurrences.py`.
- [x] 3.2 `GET /payments/summary` в SQL; тест по сценариям `payment-totals` и сверка итогов API с `domain.summarize` на тех же периодах; проверка: `uv run pytest tests/apps/payments/test_summary.py`.

## 4. Завершение

- [x] 4.1 Убрать реализованные операции из теста заглушек, выгрузить `api/openapi.yaml`; `backend/plan.md`: статус шага 5; проверка: тест контракта и тест совпадения файла проходят.
- [x] 4.2 Полный набор проверок из `backend/AGENTS.md`; проверка: `uv run pytest`, `uv run ruff check .`, `uv run ruff format --check .`, `uv run mypy .`, `uv run lint-imports` проходят.

## Workflow follow-up

- Архивировать change после ревью.
