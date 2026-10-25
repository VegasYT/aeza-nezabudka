# Tasks

Часть репо: backend, команды из `backend/`; задача 4.1 - `infra/`. Интеграционным тестам нужен Docker.

## 1. Настройки и проверка токена

- [x] 1.1 Зависимости PyJWT с криптографией, python-keycloak, httpx в основные; `IdentitySettings` в `core/config.py`; тест: без `KEYCLOAK_BACKEND_CLIENT_SECRET` или `ADMIN_PASSWORD` настройки `api` не загружаются и называют переменную, `worker` и миграции их не требуют; проверка: `uv run pytest tests/core/test_config.py`.
- [x] 1.2 `core/auth.py`: `TokenVerifier` с кешем JWKS и повторным чтением по неизвестному `kid` не чаще раза в 30 секунд, `Principal`, правило роли; заголовки в `AppError`; тесты с локальным RSA-ключом и `httpx.MockTransport`: корректный токен, истёкший, чужой издатель, без аудитории, чужая подпись, неизвестный `kid`, токен без ролей, приоритет ролей, Keycloak недоступен при пустом и заполненном кеше; проверка: `uv run pytest tests/core/test_auth.py`.
- [x] 1.3 Зависимости `current_principal` и `require_roles`, наборы ролей; роутер `/api/v1` проверяет токен; роли у каждой операции по матрице design; `GET /auth/me` по токену; обновить контрактный тест заглушек (токен администратора) и добавить тест матрицы ролей по всем операциям (401 без токена, 403 для недопустимой роли раньше 404 и 422, `WWW-Authenticate`); проверка: `uv run pytest tests/app`.

## 2. Журнал действий

- [x] 2.1 `apps/audit`: модель `audit_log`, миграция Alembic, `record(...)`; интеграционный тест: запись сохраняется с логином автора и без пароля в `details`; проверка: `uv run pytest tests/apps/audit`, `uv run alembic upgrade head` на чистой базе.

## 3. Пользователи

- [x] 3.1 `apps/users/service.py`: протокол `IdentityProvider`, ошибки, сервис операций `/users` с защитой администратора, завершением сессий и журналом; фейковый провайдер в тестах; роутер `/users` вызывает сервис; тесты сервиса и API на фейке: список без администраторов по алфавиту со страницами, создание, 409 `login_taken`, 422 по паролю, 404, 409 `admin_protected`, завершение сессий при смене пароля и отключении, 503 `identity_unavailable`, записи журнала только об успешных операциях; проверка: `uv run pytest tests/apps/users`.
- [x] 3.2 `apps/users/keycloak.py`: `KeycloakIdentityProvider` на python-keycloak и синхронизация администратора; фоновая синхронизация с повтором в `lifespan` и проверка `identity_not_ready` в `/readyz`; тест `/readyz` на фейке, который сначала падает, потом проходит; проверка: `uv run pytest tests/app/test_main.py tests/apps/users`.

## 4. Keycloak

- [x] 4.1 `infra/keycloak/realm.json` по design; проверка: Keycloak 26.8.1 в контейнере импортирует realm без ошибок (журнал контейнера), клиенты и роли видны через Admin API.
- [x] 4.2 `infra/keycloak/configure.sh` на `kcadm.sh`: `rootUrl`, адреса возврата и `webOrigins` клиента `web` из `WEB_PUBLIC_URL`, секрет клиента `backend` из `KEYCLOAK_BACKEND_CLIENT_SECRET`; проверка: в контейнере Keycloak с импортированным realm смена переменных и повторный запуск скрипта меняют настройки клиентов (видно через Admin API), повторный запуск без изменений завершается успешно, созданный до этого пользователь остаётся.
- [x] 4.3 Интеграционные тесты с Keycloak в контейнере: синхронизация администратора (первый запуск, смена пароля, смена логина, повтор без изменений), вход нового пользователя по паролю без почты и имени, токен пользователя проходит `TokenVerifier` с ролью `user`, отключённый и удалённый пользователь не может обновить токен, смена пароля, 409 на занятый логин и на администратора; проверка: `uv run pytest -m integration tests/apps/users`.

## 5. Документация и завершение

- [x] 5.1 Выгрузить `api/openapi.yaml`; `backend/AGENTS.md`: переменные Keycloak и администратора, правило "`realm.json` применяется только при первом старте, изменения на стенд - через `configure.sh` или консоль", `.env.example`; `backend/plan.md`: статус шага 4; проверка: тест совпадения контракта проходит, переменные из `.env.example` совпадают с `IdentitySettings`.
- [x] 5.2 Полный набор проверок из `backend/AGENTS.md`; проверка: `uv run pytest`, `uv run ruff check .`, `uv run ruff format --check .`, `uv run mypy .`, `uv run lint-imports` проходят.

## Workflow follow-up

- Архивировать change после ревью.
- Вход из Swagger через Keycloak проверить после появления `infra/compose.yaml` с Caddy.
