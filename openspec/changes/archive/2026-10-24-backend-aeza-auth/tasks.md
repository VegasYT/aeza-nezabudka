# Tasks

Часть репо: backend (команды из `backend/`) и `infra/keycloak`. Frontend меняет frontend-разработчик по контракту из `design.md`.

## 1. Клиент Aéza и данные

- [x] 1.1 Настройки: `AEZA_API_URL`, `ADMIN_EMAILS`, `SESSION_TTL_HOURS`, `DEMO_USER_EMAIL` вместо `KEYCLOAK_*`, `ADMIN_LOGIN`, `ADMIN_PASSWORD`, `DEMO_USER_LOGIN`, `DEMO_USER_PASSWORD`; `.env.example`.
- [x] 1.2 `IdentityProvider` - клиент API Aéza на httpx (`login`, `use_challenge`, `submit_totp`, `account`, `logout`) и фейк; тест клиента на локальном HTTP-приёмнике с ответами, снятыми с настоящего API.
- [x] 1.3 Модели `members`, `sessions`, `login_failures`, миграция.

## 2. Вход и проверка запросов

- [x] 2.1 `POST /auth/login`, `POST /auth/tfa`, `POST /auth/logout`, `GET /auth/me`; ограничение неудачных входов; тесты: без 2FA, с 2FA, неверный пароль и код, не из белого списка, отключённый, сессия Aéza закрыта, привязка id при первом входе, пределы на email, IP и сервер.
- [x] 2.2 `core/auth.py`: `Bearer` по своей базе, `X-API-KEY` через Aéza с кешем 60 секунд; тесты: 401 без токена, с истёкшим и неизвестным, после выхода; ключ - кеш и 403 для постороннего; Aéza недоступна - сессии работают.

## 3. Белый список

- [x] 3.1 `/users` над `members`, синхронизация `ADMIN_EMAILS` при старте, удаление сессий и привязки Telegram; тесты из `user-management`.
- [x] 3.2 `/readyz` без `identity_not_ready`; задача `worker` очистки сессий и счётчиков.

## 4. Контракт, сид, smoke

- [x] 4.1 Схемы `bearer` и `X-API-KEY` в OpenAPI, выгрузка `api/openapi.yaml`; тесты контракта и доступа на новых токенах.
- [x] 4.2 Сид: участник `DEMO_USER_EMAIL`; smoke: `SMOKE_API_KEY`.
- [x] 4.3 Метрики: `dependency_errors_total{dependency="aeza"}`, `login_failures_total`.

## 5. Удаление Keycloak и проверки

- [x] 5.1 Удалить `KeycloakIdentityProvider`, python-keycloak, PyJWT, фикстуру Keycloak, `tests/auth_helpers.py` с JWT, `infra/keycloak`.
- [x] 5.2 `backend/AGENTS.md` (убрать пометки "до шага 12"), `backend/plan.md`; полный набор проверок; ручная проверка входа и `X-API-KEY` на тестовом аккаунте my.aeza.ru.
