# Design

## Context

Каркас из `backend-foundation`: приложение `app/main.py` с префиксом `/api/v1`, общий формат ошибок (`core/errors.py`), пустой `APIRouter`. Поведение операций описано в `docs/plan.md` (разделы 4-7) и ADR; здесь фиксируется только форма контракта. Frontend ещё не выбрал стек, поэтому контракт должен годиться для любого генератора типов и для mock-сервера.

## Goals / Non-Goals

**Goals:**

- контракт, который не придётся ломать на шагах 4-9: поля и коды ответов заданы сейчас;
- mock-сервер, который отдаёт правдоподобные данные без backend.

**Non-Goals:**

- проверка токенов и ролей (шаг 4), даже если схема безопасности уже описана.

## Decisions

### Где живут роутеры и схемы

| Модуль | Операции |
| --- | --- |
| `apps/users` | `GET /auth/me`, `/users` |
| `apps/payments` | `/recurring-payments`, `/payment-occurrences`, `/payments/summary` |
| `apps/departments` | `/departments` |
| `apps/reminders` | `/me/telegram` |

В каждом модуле `router.py` и `schemas.py`, без сервисов и моделей: их добавят шаги с логикой. Общее - в `core/schemas.py` (страница списка, схема ошибки). `app/main.py` подключает роутеры модулей к роутеру `/api/v1`.

### Схемы

Имена полей фиксируются здесь, чтобы frontend мог на них опираться. Все ответы - модели Pydantic с примерами (`examples`), чтобы mock-сервер отдавал правдоподобные значения.

- **Страница:** `Page[T]` - `items: list[T]`, `total: int`, `limit: int`, `offset: int`.
- **Ошибка:** `ErrorResponse` - `code: str`, `message: str`, `fields: dict[str, str] | null`.
- **Текущий пользователь** (`GET /auth/me`): `id` (UUID из Keycloak), `login`, `role` (`admin` | `user` | `integration`).
- **Пользователь:** `id`, `login`, `enabled`, `created_at`. Создание: `login` (3-64 символа: латиница, цифры, `.`, `_`, `-`), `password` (8-128 символов). Изменение: `password?`, `enabled?`; хотя бы одно поле.
- **Отдел:** `id`, `name` (1-100 символов). Создание и изменение: `name`.
- **Ссылка на отдел** в других ответах: `{id, name}` или `null`.
- **Регулярный платёж:** `id`, `name` (1-200), `amount_minor` (> 0), `currency`, `period` (`month`), `anchor_day` (1-31), `next_due_date` (ближайший неоплаченный срок, `null` у прекращённого), `department`, `stopped_at` (`null` - действует), `created_at`, `created_by_login`. Создание: `name`, `amount_minor`, `currency`, `period` (по умолчанию `month`), `next_due_date` (дата ближайшей оплаты), `department_id?`. Изменение: те же поля, все необязательные, хотя бы одно; `department_id: null` снимает отдел.
- **Период оплаты:** `id`, `recurring_payment` (`{id, name, stopped}`), `department`, `due_date`, `amount_minor`, `currency`, `paid` (bool), `paid_on`, `paid_by_login`, `overdue` (bool), `days_overdue` (int, 0 если не просрочен). Изменение: `paid` (обязательно), `paid_on?`.
- **Итоги:** `from?`, `to?`, `department_id?` в ответе как в запросе; `currencies` - всегда три элемента (`RUB`, `USD`, `EUR`), у каждого `currency`, `total_minor`, `paid_minor`, `unpaid_minor`, `overdue_minor`, `count`. Деление по валютам задано контрактом: интерфейсу не нужно знать, какие валюты встретились.
- **Личный Telegram:** `linked`, `telegram_username`, `personal_enabled`, `blocked`, `group_chat_configured`. Ссылка привязки: `url`, `expires_at`. Изменение: `personal_enabled`.

Фильтры списков:

- `/recurring-payments`: `status` (`active` | `stopped`), `department_id`, пагинация; сортировка по названию.
- `/payment-occurrences`: `status` (`paid` | `unpaid` | `overdue`), `currency`, `recurring_payment_id`, `department_id`, `from`, `to` (по сроку), `order` (`asc` | `desc`, по сроку, по умолчанию `asc`), пагинация.
- `/users` и `/departments`: пагинация.

Решения по форме, не заданные в плане явно (выведены из конвенций, подписаны как наши):

- идентификаторы - UUID: их удобно отдавать внешним системам и в событиях (ADR-011);
- пагинация через `limit` и `offset`, а не номер страницы: так же удобно для API интеграций;
- коды: создание 201 с телом, изменение 200 с телом, удаление и прекращение 204 без тела.

### Заглушка

`core/errors.py` получает `NotImplementedYet(AppError)` - 501, `not_implemented`, "Операция ещё не реализована". Обработчики роутеров объявляют настоящие `response_model`, параметры и тело и бросают `NotImplementedYet()`. Поэтому проверка запроса по схеме работает уже сейчас (422 раньше 501), а шаги 4-9 заменяют только тело обработчика.

### Ответы с ошибками

Хелпер `error_responses(401, 403, 404, ...)` в `core/schemas.py` строит словарь `responses` для декоратора со схемой `ErrorResponse` и русским описанием. Какие коды у какой операции - по правилу из спецификации: 401 у всех, 403 у операций администратора, 404 у операций с `{id}`, 409 у прекращения и изменения платежа (прекращённый платёж), у удаления и изменения администратора, у создания пользователя и отдела с занятым именем, 422 у операций с параметрами и телом.

Операции администратора: создание, изменение и прекращение регулярного платежа, все операции `/users`, создание, изменение и удаление отдела.

### Безопасность

Своя схема `OAuth2` (из `fastapi.security`) с двумя потоками, потому что готовый `OAuth2AuthorizationCodeBearer` описывает только один. Адреса относительные: Keycloak опубликован на том же домене по пути `/auth` (ADR-008), поэтому контракт не зависит от окружения и тест совпадения стабилен:

- `authorizationUrl`: `/auth/realms/invoice-keeper/protocol/openid-connect/auth`;
- `tokenUrl`: `/auth/realms/invoice-keeper/protocol/openid-connect/token`.

Имя realm `invoice-keeper` фиксируется здесь; `realm.json` (шаг 4) обязан его использовать. Зависимость безопасности подключена к роутеру `/api/v1` с `auto_error=False`: схема видна в контракте, но отсутствие токена пока не даёт 401. Шаг 4 заменит её на проверку токена.

Swagger: `swagger_ui_oauth2_redirect_url = /api/v1/docs/oauth2-redirect`, `swagger_ui_init_oauth = {clientId: "web", usePkceWithAuthorizationCodeGrant: true, scopes: "openid"}`. Адрес возврата нужно разрешить клиенту `web` в Keycloak (шаг 4).

### Выгрузка и проверка

`app/export_openapi.py` собирает приложение с заглушечными настройками (адрес базы-заглушка: engine создаётся лениво и к базе не подключается) и пишет `app.openapi()` в `backend/api/openapi.yaml` через PyYAML (`sort_keys=False`, `allow_unicode=True`). Тест читает файл и сравнивает с `app.openapi()` как словари; база и Docker не нужны. Альтернатива - хранить JSON: он менее читаем в ревью, а кейс разрешает и `.yml`.

### Mock-сервер

Prism (`npx @stoplight/prism-cli mock backend/api/openapi.yaml`): читает OpenAPI 3.1, отдаёт примеры из схем и проверяет запросы. Ставить в репозиторий ничего не нужно, команда записывается в `frontend/AGENTS.md` и `backend/AGENTS.md`.

## Risks / Trade-offs

- [Контракт придётся поменять на шагах 4-9] -> поля и коды заданы сейчас по плану и ADR; правка контракта идёт через OpenSpec change и затрагивает frontend.
- [Mock отдаёт данные, которые не согласованы между собой] -> примеры подобраны так, чтобы период ссылался на существующий в примерах платёж; для сценариев с логикой frontend переключается на настоящий API.
- [OpenAPI 3.1 не поддержан генератором типов frontend] -> FastAPI выдаёт 3.1; если выбранный генератор его не понимает, вопрос решается при выборе стека frontend.
