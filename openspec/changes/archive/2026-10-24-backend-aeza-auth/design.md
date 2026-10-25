# Design

Решения и их обоснование - ADR-014 (вход через Aéza) и ADR-015 (весь контракт в стиле Aéza v2), схема по шагам - `docs/plan.md`, раздел 5. Здесь - контракт, на который опираются backend и frontend, и детали реализации.

## API Aéza

Адрес - `AEZA_API_URL`, по умолчанию `https://my.aeza.ru/api`. Проверено на тестовом аккаунте хакатона 2026-10-24.

| Вызов | Ответ |
| --- | --- |
| `POST /v2/auth/login` `{email, password}` | 200 `{challenge, requirements: [...]}`; 400 `{"error": "invalid_credentials"}` |
| `POST /v2/auth/use-challenge` `{challenge}` | 200 `{session, expiresAt}` |
| `POST /v2/auth/tfa/totp` `{challenge, code}` | сессия, как у `use-challenge` (по коду кабинета Aéza; на аккаунте с 2FA не проверено) |
| `GET /v2/accounts/me` с `Authorization: Bearer <session>` или `X-API-KEY` | 200 `{id, email, roles, ...}`; 401 `{"error": "not_auth"}` |
| `POST /v2/auth/logout` с `Bearer` | 204 |

Если `requirements` не пуст, считаем, что нужен код 2FA. Неизвестное значение в `requirements` - тоже второй шаг: пользователь увидит поле для кода, а неверный код даст `invalid_code`.

Таймаут запроса к Aéza - 10 секунд. Ошибка сети, таймаут, 5xx и неожиданный формат ответа - 503 `identity_unavailable` у нас.

## Контракт для frontend

Весь `/api/v1` - в стиле Aéza v2 (ADR-015). После реализации точный контракт - `backend/api/openapi.yaml`.

### Общие соглашения

- JSON в camelCase: и тела, и параметры запроса (`recurringPaymentId`, `departmentId`, `amountMinor`, `nextDueDate`).
- Даты без времени - `"2026-11-05"`, моменты времени - ISO 8601 в UTC с `Z`.
- Список - `{"items": [...], "total": 12}`, параметры `limit` (1-100, по умолчанию 50) и `offset` (от 0).
- Ошибка:

```json
{
  "statusCode": 400,
  "message": "Проверьте введённые данные",
  "error": "bad_request",
  "timestamp": "2026-10-24T14:09:29.458Z",
  "path": "/api/v1/recurring-payments",
  "payload": [{"field": "nextDueDate", "message": "Дата ближайшей оплаты не может быть раньше сегодняшней"}],
  "requestId": "b0c7c20f-e159-4906-a094-2b5f79d561bd"
}
```

| Код | `error` | `payload` |
| --- | --- | --- |
| 400 | `bad_request` | список `{field, message}`; `field` - имя в camelCase, для параметров запроса - имя параметра |
| 400 | `invalid_credentials`, `invalid_challenge`, `invalid_code` | текст ошибки |
| 401 | `not_auth` | текст ошибки |
| 403 | `forbidden`, `not_a_member` | текст ошибки |
| 404 | `not_found` | `{entity, id}`, например `{"entity": "RecurringPayment", "id": "..."}`; для неизвестного пути - текст |
| 409 | свой код операции (`payment_stopped`, `admin_protected`, `login_taken`, ...) | текст ошибки |
| 429 | `too_many_attempts` | текст ошибки; заголовок `Retry-After` в секундах |
| 503 | `identity_unavailable` | текст ошибки |

`message` - на русском, его можно показывать пользователю. `requestId` совпадает с заголовком ответа `X-Request-ID`.

### Вход

Шаги повторяют вход Aéza. Все три операции - без авторизации.

1. `POST /api/v1/auth/login` с `{"email", "password"}` (пароль аккаунта Aéza) → 200 `{"challenge": "...", "requirements": []}`. Это ответ Aéza как есть. Неверный email или пароль - 400 `invalid_credentials`.
2. Если `requirements` пуст - `POST /api/v1/auth/use-challenge` с `{"challenge"}`. Иначе нужен код 2FA: `POST /api/v1/auth/tfa/totp` с `{"challenge", "code"}`.
3. Оба отвечают 200 `{"session": "kq3...Zx", "expiresAt": "2026-10-25T02:09:29.458Z"}`. `session` - токен нашей сессии. Аккаунта нет в белом списке или участник отключён - 403 `not_a_member`; истёкший `challenge` - 400 `invalid_challenge`; неверный код - 400 `invalid_code`.
4. `GET /api/v1/auth/me` с `Authorization: Bearer <session>` → `{"id", "email", "role"}`, роль `admin`, `user` или `integration`.

`POST /api/v1/auth/logout` - 204, сессия удалена.

Пределы неудачных входов (`invalid_credentials`, `invalid_challenge`, `invalid_code`) - 429 `too_many_attempts` на всех трёх шагах. API Aéza недоступен - 503 `identity_unavailable`.

### Токен

- `session` - непрозрачная строка (43 символа base64url), передаётся как `Authorization: Bearer <session>` на все операции, кроме входа.
- Живёт `SESSION_TTL_HOURS` (по умолчанию 12 часов) с момента входа, не продлевается. После истечения - 401 `not_auth`, frontend показывает форму входа.
- Frontend хранит токен в `sessionStorage`: переживает обновление страницы, пропадает с закрытием вкладки. В `localStorage` и cookie не кладём.

### Белый список: `/api/v1/users`

Только `admin`. Участник:

```json
{
  "id": "5b1d2c3e-...",
  "email": "buh.petrova@company.ru",
  "role": "user",
  "enabled": true,
  "linked": true,
  "createdAt": "2026-10-24T10:00:00Z",
  "lastLoginAt": "2026-10-24T12:30:00Z"
}
```

- `linked` - участник уже входил, его аккаунт Aéza привязан; `lastLoginAt` - `null`, если не входил.
- `GET /users` - `{items, total}` с ролями `user` и `integration` (администраторы из `.env` не показываются), по алфавиту email.
- `POST /users` `{"email", "role"}` - роль `user` (по умолчанию) или `integration`; 201 с участником; 409 `login_taken`, если email уже в списке; 400 для роли `admin` или неверного email.
- `PATCH /users/{id}` `{"role"?, "enabled"?}` - хотя бы одно поле; 404 `not_found`; 409 `admin_protected` для администратора.
- `DELETE /users/{id}` - 204; сессии и привязка Telegram удаляются; 404 и 409 как у `PATCH`.

### Swagger

Схемы `bearer` (HTTP bearer) и `X-API-KEY` (заголовок). Каждая операция `/api/v1`, кроме входа, принимает любую из них. Чтобы попробовать API, жюри проходит `POST /auth/login` и `POST /auth/use-challenge` и вставляет `session` в Authorize.

## Данные

- `members`: `id` uuid pk, `email` (unique, хранится в нижнем регистре), `aeza_account_id` bigint unique null, `role` (check `admin`, `user`, `integration`), `source` (check `env`, `panel`), `enabled`, `created_at`, `last_login_at`.
- `sessions`: `token_hash` (sha256 hex, pk), `member_id` (fk `on delete cascade`), `created_at`, `expires_at`; индекс по `expires_at`.
- `login_failures`: `scope` (`email:<email>`, `ip:<адрес>`, `server`), `failed_at`; индекс `(scope, failed_at)`. Счёт - `count(*)` за последние 10 минут; таблица общая для всех экземпляров `api`.
- На человека ссылаются `created_by_id`, `paid_by_id`, `actor_id`, `telegram_links.user_id` - теперь это id участника. Колонки остаются uuid, миграция данных не нужна: стенд с данными Keycloak пересоздаётся сидом.

## Проверка запроса

- `Authorization: Bearer <session>`: поиск `sessions` по sha256 токена с `expires_at > now()` и `members.enabled`; иначе 401 `not_auth`.
- `X-API-KEY`: кеш в памяти процесса по sha256 ключа на 60 секунд; промах - `accounts/me`; 401 от Aéza - 401 `not_auth`; аккаунт не в белом списке или отключён - 403 `not_a_member`. Ключ в базу и журнал не попадает.
- Оба заголовка сразу - используется `Bearer`.
- `Principal`: `id` участника, `login` = email, роль из `members`.

## Ограничение входов

Перед обращением к Aéza на каждом шаге входа: если за 10 минут неудач на `email:` не меньше 5, на `ip:` не меньше 5 или на `server` не меньше 20 - 429 с `Retry-After` до освобождения окна. Неудача - `invalid_credentials`, `invalid_challenge` и `invalid_code`: на шаге `login` пишутся три строки (email, IP, server), на `use-challenge` и `tfa/totp` - две (IP, server), email там неизвестен. Успешный вход не сбрасывает счётчики, они истекают сами. IP клиента - из `X-Forwarded-For` от Caddy (первый адрес), иначе адрес соединения.

## Администраторы из `.env`

`ADMIN_EMAILS` - через запятую, хотя бы один, приводятся к нижнему регистру. При старте `api`, до приёма запросов: для каждого email - строка `role = admin`, `source = env`, `enabled = true` (создать или обновить); строки `source = env`, которых нет в списке, удаляются вместе с сессиями. Если email из списка уже был в белом списке как `panel`, он становится `env` и `admin`.

## Метрики

- `dependency_errors_total{dependency="aeza"}` вместо `keycloak`: сеть, таймаут, 5xx и неожиданный ответ Aéza.
- `login_failures_total{reason}`: `invalid_credentials`, `invalid_challenge`, `invalid_code`, `not_a_member`, `too_many_attempts`. Email и IP в метки не попадают.

## Сид и smoke

- Сид добавляет участника `DEMO_USER_EMAIL` с ролью `user`, к Aéza не обращается.
- Smoke ходит с `X-API-KEY` из `SMOKE_API_KEY`; параметры `--token-url`, `--client-id` и `SMOKE_CLIENT_SECRET` уходят. Аккаунт ключа должен быть в белом списке с ролью `integration` или `admin`.

## Очистка

Задача `worker` раз в час удаляет истёкшие сессии и строки `login_failures` старше суток.

## Миграция с Keycloak

- Удаляются `KeycloakIdentityProvider`, `core/auth.py` с JWKS, фикстура Keycloak, `tests/auth_helpers.py` (тестовые JWT) заменяется созданием сессии в базе.
- `IdentityProvider` - протокол клиента Aéza: `login`, `use_challenge`, `submit_totp`, `account`, `logout`; фейк для тестов.
- `/readyz`: остаются `database_unavailable` и `migrations_pending`.

## Риски

- Формат `requirements` и ответа `tfa/totp` взят из кода кабинета, не из документации: на аккаунте без 2FA не проверить. Тест с фейком закрепляет наше понимание; при расхождении меняется только клиент.
- Если Aéza включит капчу на `auth/login`, вход сломается: понадобится виджет Turnstile в панели и передача `X-Captcha-Token`.

## Формат во всём API

- Схемы Pydantic наследуют общую базу с `alias_generator=to_camel` и `populate_by_name`: в коде snake_case, в JSON и OpenAPI - camelCase. Параметры запроса - тоже через модели с псевдонимами.
- Обработчики ошибок `core/errors.py` формируют `{statusCode, message, error, timestamp, path, payload, requestId}`. `AppError` получает `error` (код), `payload` (по умолчанию - текст `message`) и заголовки. Ошибки проверки FastAPI и доменные ошибки полей - 400 `bad_request` со списком `{field, message}`; `field` - имя поля в camelCase.
- Все "не найдено" - 404 `not_found` с `{entity, id}`: `RecurringPayment`, `PaymentOccurrence`, `Department`, `Member`.
- `Page` - `{items, total}`.
- События webhook и Kafka - camelCase (`schemaVersion`, `occurredAt`, `amountMinor`), версия схемы остаётся 1: событий наружу ещё не отдавали.
