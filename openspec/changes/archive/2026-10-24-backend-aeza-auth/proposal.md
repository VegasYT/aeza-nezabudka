# Proposal

## Why

Уточнение к кейсу (2026-10-24): своя база пользователей не нужна, если вход идёт через аккаунты Aéza и на нём показан весь сценарий. Команда решила также сделать весь API в стиле Aéza v2 (ADR-015). Принято ADR-014: вход через API Aéza (challenge), белый список участников с ролями, свои сессии, `X-API-KEY` для других систем. Сейчас backend входит через Keycloak (шаг 4, ADR-008). Это шаг 12 `backend/plan.md`.

## What Changes

- **BREAKING** Весь контракт `/api/v1` - в стиле Aéza v2 (ADR-015): camelCase, списки `{items, total}`, ошибки `{statusCode, message, error, timestamp, path, payload, requestId}`, ошибки проверки - 400 вместо 422, "не найдено" - 404 `not_found` с `{entity, id}`, без авторизации - 401 `not_auth`. События webhook и Kafka - тоже camelCase.

- **BREAKING** Вход шагами Aéza: `POST /auth/login` (email и пароль аккаунта Aéza) → `{challenge, requirements}`, `POST /auth/use-challenge` или `POST /auth/tfa/totp` → `{session, expiresAt}`, где `session` - токен своей сессии; `POST /auth/logout`. OIDC через Keycloak убирается.
- **BREAKING** `Authorization: Bearer` - токен своей сессии (а не JWT Keycloak); добавлен `X-API-KEY` - ключ аккаунта Aéza.
- **BREAKING** `/users` - белый список: email и роль (`user` или `integration`), без паролей. Поле `login` в схемах пользователей и `GET /auth/me` заменено на `email`.
- Администраторы - `ADMIN_EMAILS` вместо `ADMIN_LOGIN` и `ADMIN_PASSWORD`.
- Ограничение неудачных входов до обращения к Aéza: на email, на IP клиента и общий предел на сервер, дальше 429.
- `/readyz` больше не ждёт синхронизации с Keycloak.
- Swagger: схемы `bearer` и `X-API-KEY` вместо OAuth2.
- Сид: участник `DEMO_USER_EMAIL`; smoke: `X-API-KEY` вместо client credentials.
- Удаляются: Keycloak (`infra/keycloak`, контейнер в тестах, `KeycloakIdentityProvider`), python-keycloak, PyJWT, переменные `KEYCLOAK_*`, `ADMIN_LOGIN`, `ADMIN_PASSWORD`, `DEMO_USER_LOGIN`, `DEMO_USER_PASSWORD`.

Логика платежей, периодов, напоминаний, Telegram, отделов и событий не меняется: меняется только вид JSON. Модули знают только `Principal` (id, логин, роль); логином теперь служит email.

## Capabilities

### New Capabilities

Нет.

### Modified Capabilities

- `authentication`: вход через Aéza, свои сессии, `X-API-KEY`, ограничение входов вместо проверки JWT Keycloak.
- `user-management`: белый список участников вместо пользователей Keycloak.
- `backend-platform`: готовность без синхронизации с Keycloak.
- `http-api`: стиль Aéza v2 (camelCase, списки, формат ошибок, 400 вместо 422), схемы безопасности `bearer` и `X-API-KEY`, новые операции входа.
- `observability`: зависимость `aeza` вместо `keycloak`.
- `demo-data`: участник для демо вместо пользователя с паролем.
- `smoke-check`: вход smoke по `X-API-KEY`.

## Impact

- backend: `core/auth.py`, `core/config.py`, `apps/users/`, `app/main.py`, `app/seed.py`, `app/smoke.py`, `app/worker.py` (очистка сессий), миграция, `.env.example`, тесты, `api/openapi.yaml`, `pyproject.toml`.
- infra: удаление `infra/keycloak`.
- frontend: форма входа вместо перехода на Keycloak, хранение токена, экран "Пользователи" без паролей, `email` вместо `login` в `auth/me` и `/users`. Точный контракт - в `design.md`, после реализации - в `backend/api/openapi.yaml`.
- Документация уже обновлена: ADR-014, `docs/plan.md` (раздел 5), `docs/user-stories.md`.
