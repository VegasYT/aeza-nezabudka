# AGENTS.md - backend

Серверная часть Invoice Keeper: REST API `/api/v1`, Swagger, фоновая задача периодов и напоминаний, Telegram-бот. Общий контекст проекта: [../AGENTS.md](../AGENTS.md), кейс: [../docs/Case.md](../docs/Case.md).

Архитектурные решения приняты в [../docs/ADR.md](../docs/ADR.md), состав системы и этапы - в [../docs/plan.md](../docs/plan.md). Код не должен им противоречить. Если задача требует отступить от ADR, сначала меняется ADR через OpenSpec change.

## Стек

Python 3.12, весь ввод-вывод асинхронный (ADR-013):

- FastAPI, Pydantic v2, pydantic-settings;
- SQLAlchemy 2 (async) + asyncpg, миграции Alembic;
- httpx - клиент API Aéza: вход и проверка `X-API-KEY` (ADR-014);
- aiogram - Telegram, прокси через aiohttp-socks (`TELEGRAM_PROXY_URL`);
- httpx - webhook; aiokafka - адаптер Kafka;
- structlog - JSON-логи; prometheus-client - `/metrics`;
- uv, ruff (линтер и форматирование), mypy (strict), import-linter (границы модулей);
- pytest, pytest-asyncio, testcontainers (PostgreSQL, Kafka).

Шаги реализации - [plan.md](plan.md).

## Структура

```text
backend/
  app/
    main.py            процесс api: FastAPI, роутеры apps, middleware, health, /metrics
    worker.py          процесс worker: планировщик, отправители, чтение обновлений бота
    seed.py            команда тестовых данных
    export_openapi.py  выгрузка api/openapi.yaml
  core/                общее: настройки, база и сессии, Clock, проверка токена, ошибки, логи, метрики
  apps/
    payments/          регулярные платежи и периоды, расчёт сроков, просрочка, итоги
    reminders/         планировщик, outbox напоминаний, Telegram, привязка личных чатов
    users/             вход через API Aéza, белый список участников, сессии
    departments/       справочник отделов
    integrations/      интеграционные события, адаптеры webhook и Kafka, идемпотентность
    audit/             журнал действий
  migrations/          Alembic
  tests/               тесты, повторяют структуру apps/
  api/openapi.yaml     контракт, выгружается из кода
  pyproject.toml       зависимости и настройки ruff, mypy, pytest, import-linter
```

- Модуль `apps/<имя>/`: `router.py` (HTTP), `schemas.py` (Pydantic), `models.py` (таблицы SQLAlchemy), `service.py` (сценарии и транзакции), `domain.py` (чистые функции), `repository.py` (запросы). Пустые файлы не заводим.
- Модуль обращается к другому только через его `service.py`, не к таблицам и репозиторию напрямую. `core/` не импортирует из `apps/`. Правило проверяет `lint-imports`: контракты в `pyproject.toml`. Новый модуль в `apps/` получает свой контракт и попадает в списки запрещённых модулей остальных.
- Время берётся только из `core` `Clock`, не из `datetime.now()`: иначе тесты сроков и просрочки не управляемы.
- Транзакция открывается в сервисе. Роутер не ходит в базу, репозиторий не решает.

## Команды

Запускаются из `backend/`. Python 3.12 ставить отдельно не нужно: uv скачает его сам.

- `uv sync` - установить зависимости
- `uv run python -m app.main` - процесс `api` на `:8000`; при разработке с перезапуском - `uv run uvicorn app.main:app_from_env --factory --reload`
- `uv run python -m app.worker` - процесс `worker`: раз в минуту досоздаёт периоды и ставит напоминания (`scheduler`), каждые 2 секунды отправляет их в Telegram (`reminder_sender`) и читает команды бота `/start <код>` и `/stop` (`telegram_updates`, один экземпляр под advisory-блокировкой); эти две задачи - только с `TELEGRAM_BOT_TOKEN`; тик также выпускает события `occurrence.due_soon` и `occurrence.overdue`, `event_delivery` каждые 2 секунды доставляет события на webhook и в Kafka (если они настроены), `integrations_cleanup` раз в час удаляет старые события и ключи идемпотентности
- `uv run alembic upgrade head` - применить миграции; `uv run alembic revision --autogenerate -m "<что>"` - новая миграция (имя на английском: из него строится имя файла)
- `uv run pytest -m "not integration"` - быстрые тесты без Docker
- `uv run pytest` - все тесты; интеграционные (маркер `integration`) поднимают PostgreSQL в контейнере, нужен запущенный Docker. Тесты идут в 4 процесса (`pytest-xdist`, у каждого свой контейнер), около минуты; для отладки по шагам - `uv run pytest -n 0`
- `uv run ruff check .` и `uv run ruff format .` - линтер и форматирование
- `uv run mypy .` - типы
- `uv run lint-imports` - границы модулей
- `uv run python -m app.export_openapi` - выгрузить `api/openapi.yaml` после правки схем или роутеров; результат коммитится, тест `tests/app/test_openapi.py` падает, если файл устарел
- `npx -y @stoplight/prism-cli@5 mock api/openapi.yaml -p 4010` - mock-сервер по контракту на `:4010`; запросы к нему идут с заголовком `Authorization: Bearer <что угодно>`
- В быстрых тестах участника задаёт сам токен `make_token(...)` и `FakeAuthenticator` (`tests/auth_helpers.py`); настоящие сессии и вход проверяют тесты `tests/apps/users` с фейком API Aéza (`tests/apps/users/fakes.py`)
- `docker build -t invoice-keeper-backend .` - образ; процесс задаёт команда контейнера: `python -m app.main`, `python -m app.worker`, `alembic upgrade head`

- `uv run python -m app.seed` - тестовые данные для демо: аренда (RUB) с просрочкой на 5 дней, сервер (USD) со сроком через 2 дня, подписка (EUR) с якорем 31 и оплатой с опозданием, участник `DEMO_USER_EMAIL` с ролью `user` (если задан), отделы "Офис" (аренда, подписка) и "ИТ" (сервер). Даты считаются от сегодняшнего дня, повторный запуск ничего не добавляет. К Aéza не обращается.
- `SMOKE_API_KEY=... uv run python -m app.smoke --api http://localhost:8000` - сценарий защиты через API с `X-API-KEY` аккаунта Aéza из белого списка с ролью `integration` или `admin`, после сида. Код выхода 1 и название шага при сбое; демо-данные возвращает как были, свой платёж прекращает

Метрики Prometheus: `/metrics` у `api` (вне `/api/v1` и контракта, наружу его не пускает Caddy) и у `worker` на `WORKER_HTTP_PORT`. Все метрики объявлены в `core/metrics.py`; в метках только ограниченные значения, без идентификаторов, логинов и текстов ошибок (ADR-009). Время последнего тика - `worker_job_last_success_timestamp_seconds{job="scheduler"}`. На тик планировщика `worker` обновляет срез для дашборда: `payments_active`, `payment_occurrences_open` и `payment_occurrences_open_amount` (метки `state` - `overdue` или `due_soon`, `currency`); нажатия кнопок в Telegram - `telegram_actions_total`.

Перед завершением задачи должны проходить все тесты, `ruff check`, `ruff format --check`, `mypy` и `lint-imports`.

Настройки для локального запуска удобно держать в `backend/.env` (образец - `.env.example`, сам `.env` в git не попадает). На Windows:

- Git Bash не передаёт процессам переменную `TZ`: задавай её в `.env` или запускай из PowerShell;
- русский текст в выводе читается с `PYTHONUTF8=1`;
- в тестах отключён Ryuk testcontainers (`TESTCONTAINERS_RYUK_DISABLED`): Docker Desktop не публикует его порт, контейнеры останавливают сами фикстуры.

## Контракт

- Контракт выгружается из кода (ADR-002, ADR-013): источник истины - схемы Pydantic и роутеры, `api/openapi.yaml` - их копия. После правки схем выгрузи файл заново; тест падает, если файл устарел. Правка контракта затрагивает frontend.
- Формат как у Aéza v2 (ADR-015): JSON в camelCase через общую базу `core.schemas.ApiModel` (в коде snake_case), список `Page` - `{items, total}`, ошибки - `{statusCode, message, error, timestamp, path, payload, requestId}` из `core/errors.py`. Ошибка проверки - 400 `bad_request` (`AppError(..., fields=...)` или `invalid_field`), не найдено - `not_found(entity, id, message)`. Новые схемы наследуют `ApiModel` или `InputModel`, а не `BaseModel`.
- Swagger на `/api/v1/docs`; схемы `bearer` (`session` из `POST /auth/use-challenge` или `tfa/totp`) и `X-API-KEY` (ADR-014).
- Эндпоинты из [../docs/Case.md](../docs/Case.md) не переименовываются, кроме отступлений, перечисленных в [../docs/plan.md](../docs/plan.md), раздел 7. Новое отступление от кейса сначала записывается туда.

## Правила предметной области

- Вход - через аккаунты Aéza (ADR-014): пароли и 2FA у Aéza, у нас белый список `members` (кто может войти и с какой ролью) и свои сессии. `Bearer` - токен нашей сессии, проверяется по своей базе; `X-API-KEY` - ключ аккаунта Aéza, проверяется через `accounts/me` с кешем 60 секунд. Аккаунт не из белого списка - 403. Вход повторяет шаги Aéza: `POST /auth/login`, затем `use-challenge` или `tfa/totp` (ADR-015). Подробно - [../docs/plan.md](../docs/plan.md), раздел 5.
- Сессию Aéza backend закрывает сразу после входа; пароль, `challenge` и `X-API-KEY` не хранятся и не пишутся в журнал.
- Неудачные входы ограничиваются у нас до обращения к Aéza: на email, на IP клиента и общий предел на сервер. Все входы идут в Aéza с одного IP, а их WAF может его забанить.
- Роль проверяется на сервере для каждой операции. Тест на запрет операции администратора для пользователя обязателен (критерий приёмки).
- Суммы - целые минимальные единицы валюты, итоги только по одной валюте (ADR-007).
- Даты срока и оплаты - без времени, "сегодня" в часовом поясе из `TZ` (ADR-006).
- Напоминания идут через очередь в базе (outbox): одно напоминание каждого вида (`due_soon`, `overdue`) на период и получателя гарантирует `unique`, отправка берёт строки через `for update skip locked` (ADR-004).
- Дата ближайшей оплаты при создании и изменении платежа не раньше сегодня, фактическая дата оплаты не позже сегодня; иначе 400 `bad_request`.
- Telegram: бот принимает `/start <код>`, `/stop` и две кнопки под напоминанием - "Оплачено" и "Напомнить завтра". Нажавший определяется по личной привязке; без неё кнопки ничего не меняют. Остальные действия - только в панели (ADR-010).
- Получатели напоминаний: общий чат из `TELEGRAM_CHAT_ID`, личные чаты и групповые чаты, подключённые администратором (`/telegram-chats`, получатель в очереди `chat:<id>`, фильтр отделов).
- Интеграционное событие пишется в той же транзакции, что и изменение (ADR-011).
- Секреты (токен бота, пароли, токены сессий, ключи Aéza) не попадают в логи и ответы API.

## Переменные окружения

Описание и значения по умолчанию - в `.env.example`; переменные следующих шагов добавляются туда вместе с кодом.

- `DATABASE_URL` - `postgresql+asyncpg://...`; `DATABASE_POOL_SIZE` - размер пула, по умолчанию 10
- `APP_ENV` - `development`, `test` или `production`
- `HTTP_HOST`, `HTTP_PORT` - где слушает `api`, по умолчанию `0.0.0.0:8000`
- `WORKER_HTTP_PORT` - порт `/healthz` и `/metrics` процесса `worker`, по умолчанию 9100; только внутри сети compose
- `SHUTDOWN_TIMEOUT` - сколько секунд `worker` ждёт текущую работу при остановке, по умолчанию 15
- только `api` (`IdentitySettings`), `worker` и миграциям не нужны:
  - `ADMIN_EMAILS` - email аккаунтов Aéza администраторов через запятую; синхронизируются в белый список при каждом старте `api`, через API не меняются (ADR-014)
  - `AEZA_API_URL` - API Aéza, по умолчанию `https://my.aeza.ru/api`; `SESSION_TTL_HOURS` - срок сессии, по умолчанию 12
- `api` и `worker` (`ReminderSettings`, `IntegrationSettings`) - в compose передаются обоим сервисам. `api` тоже нужен токен: по нему он узнаёт имя бота для ссылки привязки (без токена - 409), по `TELEGRAM_CHAT_ID` ставит напоминание о позднем платеже сразу, по адресам адаптеров создаёт доставки событий в транзакции изменения.
  - `TELEGRAM_BOT_TOKEN` - без него `worker` не отправляет, только ставит напоминания в очередь; `TELEGRAM_CHAT_ID` - общий чат, необязателен, без токена - ошибка конфигурации; `TELEGRAM_PROXY_URL` - прокси `socks5://` или `http://`, необязателен (ADR-010, ADR-013); `REMINDER_DAYS_BEFORE` - по умолчанию 3
  - `WEBHOOK_URL` и `WEBHOOK_SECRET` (обязателен при адресе), `KAFKA_BROKERS` (через запятую), `KAFKA_TOPIC` (`invoice-keeper.events`) - адаптеры событий, необязательны; без них события только хранятся (ADR-011)
- `TZ` - единый часовой пояс, имя IANA
- `LOG_LEVEL` - по умолчанию `info`
- `DEMO_USER_EMAIL` - email аккаунта Aéza для участника демо с ролью `user`, только для `app.seed`, необязателен
- `CLOCK_TODAY` - подменить "сегодня" для демо и ручных проверок; при `APP_ENV=production` запрещена
- `DEV_LOGIN_PASSWORD` - тестовые аккаунты без Aéza (`apps/users/dev_aeza.py`, ADR-014): email на `@dev.local` из белого списка с этим паролем, остальные входят через Aéza; при `APP_ENV=production` запрещена. Набор для frontend - `infra/compose.dev.yaml`

## API Aéza

- Хост для хакатона - `https://my.aeza.ru` (не my.aeza.net). У v1 рабочий путь `/api/...`, а не `/api/v1`, как в их спецификации; v2 - `/api/v2/...`.
- Данные тестового аккаунта хакатона (email, пароль, `X-API-KEY`) - только в `backend/.env`, в репозиторий и тесты не попадают.
- Не перебирать пароли на настоящем API: у WAF Aéza есть бан IP за неудачные входы.
- В тестах API Aéza заменяет фейковый `IdentityProvider`.

## Скиллы

- Скиллы backend лежат в `backend/.agents/skills/`; `backend/.claude/skills` - симлинк на неё. Общие правила по скиллам - в корневом [AGENTS.md](../AGENTS.md).
- Свои скиллы называем с префиксом `backend-`.
- Перед работой над backend запускай агента из папки `backend/`.

## Комментарии

- Комментарий - исключение и отвечает "почему", а не "что". Код документирует себя именами и структурой.
- Максимум 2 строки. Длинное "почему так" живёт в design.md change или в ADR.
- Комментарий читает будущий читатель файла: без отсылок к диалогу, процессу и прошлым версиям.
- Закомментированный код не оставляем; TODO - только со ссылкой на задачу.
