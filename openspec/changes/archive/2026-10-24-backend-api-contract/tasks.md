# Tasks

Часть репо: backend, команды из `backend/`; задача 6.2 трогает и `frontend/AGENTS.md`, задача 6.3 - `docs/plan.md`.

## 1. Общие части контракта

- [x] 1.1 Добавить PyYAML; `core/schemas.py`: `Page[T]`, `ErrorResponse`, хелпер `error_responses(...)`; `NotImplementedYet` в `core/errors.py`; тест: обработчик с `NotImplementedYet` отвечает 501 `not_implemented` с русским текстом, а некорректный параметр - 422 раньше 501; проверка: `uv run pytest tests/core/test_errors.py`.
- [x] 1.2 `core/security.py`: схема OAuth2 с потоками Authorization Code и client credentials по относительным адресам Keycloak, зависимость с `auto_error=False`; в `app/main.py` - роутер `/api/v1` с этой зависимостью, адрес возврата OAuth2 Swagger и `swagger_ui_init_oauth` с клиентом `web` и PKCE; проверка: `uv run pytest tests/app` проходит, `/api/v1/docs/oauth2-redirect` отвечает 200 (тест).

## 2. Пользователи

- [x] 2.1 `apps/users`: схемы и роутер `GET /auth/me`, `GET`, `POST /users`, `PATCH`, `DELETE /users/{id}` с полями, ограничениями, кодами ответов и описаниями ошибок из design; подключить к приложению; проверка: тест контракта из группы 5 видит операции, `uv run mypy .` проходит.

## 3. Отделы и личный Telegram

- [x] 3.1 `apps/departments`: схемы и роутер `/departments` (список, создание, изменение, удаление); проверка: как в 2.1.
- [x] 3.2 `apps/reminders`: схемы и роутер `/me/telegram` (`GET`, `PATCH`, `DELETE`) и `POST /me/telegram/link`; проверка: как в 2.1.

## 4. Платежи

- [x] 4.1 `apps/payments`: схемы и роутер `/recurring-payments` (`GET` список с фильтрами, `POST` с заголовком `Idempotency-Key`, `GET`, `PATCH`, `DELETE /{id}`), `/payment-occurrences` (`GET` список с фильтрами и `order`, `GET /{id}`, `PATCH /{id}`), `/payments/summary`; общие типы валюты и ссылки на отдел; примеры значений для mock; проверка: как в 2.1.

## 5. Выгрузка и проверка контракта

- [x] 5.1 `app/export_openapi.py` и выгруженный `backend/api/openapi.yaml`; тест совпадения файла с `app.openapi()`; проверка: `uv run python -m app.export_openapi` создаёт файл, `uv run pytest tests/app/test_openapi.py` проходит, а после ручной правки файла - падает.
- [x] 5.2 Тест контракта: каждая операция из спецификации есть в схеме; у каждой операции `/api/v1` есть схема безопасности OAuth2 и ответы 401 и, где положено, 403, 404, 409, 422 со схемой `ErrorResponse`; у `POST /recurring-payments` - заголовок `Idempotency-Key`; списки отвечают `Page`; каждая операция на корректный запрос отвечает 501 `not_implemented`; `limit=500` даёт 422; проверка: `uv run pytest tests/app/test_contract.py`.

## 6. Mock-сервер и документация

- [x] 6.1 Проверить mock-сервер Prism по выгруженному файлу; проверка: `npx -y @stoplight/prism-cli@5 mock api/openapi.yaml -p 4010` стартует, `GET /api/v1/payment-occurrences` и `GET /api/v1/payments/summary` отвечают 200 с примерами из схем.
- [x] 6.2 `backend/AGENTS.md`: команда выгрузки становится проверенной, добавить команду mock-сервера; `frontend/AGENTS.md`: где лежит контракт и как поднять mock; проверка: упомянутые пути и команды существуют и выполняются.
- [x] 6.3 `docs/plan.md`, раздел 7: добавить `GET /recurring-payments/{id}` в таблицу соответствия; `backend/plan.md`: статус шага 2; проверка: поиск по `docs/plan.md` находит новую строку.

## 7. Итоговая проверка

- [x] 7.1 Полный набор проверок из `backend/AGENTS.md`; проверка: `uv run pytest`, `uv run ruff check .`, `uv run ruff format --check .`, `uv run mypy .`, `uv run lint-imports` проходят.

## Workflow follow-up

- Архивировать change после ревью.
