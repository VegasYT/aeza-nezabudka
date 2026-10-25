# Proposal

## Why

Frontend не может начать без контракта API, а логика backend появится только на шагах 4-9 `backend/plan.md`. Контракт выгружается из кода (ADR-002, ADR-013), поэтому его источник - роутеры и схемы FastAPI. Нужно сразу описать все эндпоинты с заглушками и выгрузить `backend/api/openapi.yaml`: по нему frontend поднимет mock-сервер и будет работать параллельно с backend.

## What Changes

- Роутеры и схемы Pydantic всех эндпоинтов из `docs/plan.md`, раздел 7: `GET /auth/me`, регулярные платежи (`GET`, `POST`, `GET /{id}`, `PATCH /{id}`, `DELETE /{id}`), периоды оплаты (`GET`, `GET /{id}`, `PATCH /{id}`), итоги `GET /payments/summary`, пользователи (`GET`, `POST`, `PATCH /{id}`, `DELETE /{id}`), отделы (`GET`, `POST`, `PATCH /{id}`, `DELETE /{id}`), личный Telegram (`GET`, `PATCH`, `DELETE /me/telegram`, `POST /me/telegram/link`).
- Пока логики нет, каждая операция отвечает 501 `not_implemented` в общем формате ошибок.
- Общие соглашения контракта: JSON с именами в snake_case, идентификаторы UUID, суммы целыми минимальными единицами вместе с валютой, даты без времени, списки одного вида с пагинацией, описанные ответы с ошибками.
- Схема безопасности OAuth2 (Authorization Code + PKCE для веб-панели и Swagger, client credentials для интеграций); кнопка Authorize в Swagger ведёт на вход Keycloak.
- Заголовок `Idempotency-Key` у создания регулярного платежа (ADR-011).
- Команда выгрузки `backend/api/openapi.yaml`, тест на совпадение файла с приложением, закоммиченный файл.
- Команда mock-сервера по контракту для frontend.

Вне изменения:

- логика операций, таблицы и миграции (шаги 4-9);
- проверка токенов и прав: схема безопасности описана, но токен пока не проверяется (шаг 4);
- клиенты Keycloak и `realm.json` (шаг 4 и infra);
- генерация типов во frontend (его стек не выбран);
- `GET /recurring-payments/{id}` добавлен сверх списка плана: форме изменения платежа нужны его данные.

## Capabilities

### New Capabilities

- `http-api`: опубликованный контракт REST API - состав эндпоинтов, общие соглашения формата, пагинация, описание ошибок и безопасности, совпадение `openapi.yaml` с кодом, ответ на ещё не реализованные операции.

### Modified Capabilities

Нет. `backend-platform` из change `backend-foundation` не меняется: формат ошибок, префикс `/api/v1` и Swagger используются как есть.

## Impact

- `backend/`: модули `apps/payments`, `apps/users`, `apps/departments`, `apps/reminders` (роутеры и схемы), общие схемы и схема безопасности в `core/`, `app/export_openapi.py`, новый файл `backend/api/openapi.yaml`, зависимость PyYAML.
- **Затрагивает frontend:** появляется общий контракт `backend/api/openapi.yaml`, по нему frontend строит запросы и mock-сервер.
- `backend/AGENTS.md`: команды выгрузки контракта и mock-сервера; `frontend/AGENTS.md`: где взять контракт и как поднять mock.
- `docs/plan.md`: в таблицу соответствия эндпоинтов добавляется `GET /recurring-payments/{id}`.
