# Tasks

Часть репо: backend. Все команды запускаются из `backend/`. Интеграционным тестам нужен запущенный Docker.

## 1. Проект и инструменты

- [x] 1.1 Создать проект uv без сборки пакета (Python 3.12, `.python-version`), добавить зависимости из `backend/AGENTS.md` (раздел "Стек", пока без aiogram, python-keycloak, aiokafka, PyJWT: их добавят шаги 4, 6, 9) и `tzdata`, закоммитить `uv.lock`; проверка: `uv sync` проходит, `uv run python -c "import fastapi, sqlalchemy, asyncpg, alembic, structlog"` без ошибок.
- [x] 1.2 Настроить в `pyproject.toml` ruff (линтер и форматирование), mypy strict, pytest (`asyncio_mode = auto`, маркер `integration`), import-linter (`core` не импортирует `apps`; модули `apps` не импортируют `repository` и `models` друг друга); создать пакеты `app/`, `core/`, `apps/`, `tests/`; проверка: `uv run ruff check .`, `uv run mypy .`, `uv run lint-imports` проходят на пустом каркасе.

## 2. Настройки и "сегодня"

- [x] 2.1 `core/config.py`: настройки pydantic-settings (`DATABASE_URL`, `TZ`, `APP_ENV`, `CLOCK_TODAY`, `LOG_LEVEL`, `DATABASE_POOL_SIZE`, `SHUTDOWN_TIMEOUT`), проверка имени часового пояса, запрет `CLOCK_TODAY` при `APP_ENV=production`, вывод ошибки со списком имён переменных без значений секретов; тесты на отсутствующую `DATABASE_URL`, неверный `TZ`, `CLOCK_TODAY` в продакшене и отсутствие значения секрета в тексте ошибки; проверка: `uv run pytest tests/core/test_config.py`.
- [x] 2.2 `core/clock.py`: `Clock`, системная и фиксированная реализации, выбор по настройкам; тесты на границу суток UTC и `Europe/Moscow` и на подмену `CLOCK_TODAY`; проверка: `uv run pytest tests/core/test_clock.py`.

## 3. Ошибки, журнал, идентификатор запроса

- [x] 3.1 `core/errors.py`: `AppError` и обработчики для `AppError`, ошибок валидации (422 с `fields`), 404 и 405 Starlette и непредвиденных исключений (500 без деталей, трассировка в журнал); проверка: тесты на тестовом приложении с роутом, который бросает исключение, проходят `uv run pytest tests/core/test_errors.py`.
- [x] 3.2 `core/logging.py` и ASGI-middleware идентификатора запроса: JSON-журнал structlog с подключённым стандартным `logging`, `request_id` из `X-Request-ID` или новый UUID, маскировка ключей с секретами, запись запроса без заголовков и тела; тесты: новый и переданный идентификатор, некорректный идентификатор заменяется, запись журнала содержит `request_id`, значение `Authorization` отсутствует в выводе; проверка: `uv run pytest tests/core/test_logging.py`.
- [x] 3.3 Тексты ошибок полей на русском: перевод частых типов ошибок Pydantic (обязательное поле, тип, число, длина, границы, дата, допустимые значения, лишнее поле) с подстановкой ограничений, собственные сообщения валидаторов без префикса Pydantic, для остальных - общий текст; проверка: тесты на несколько типов ошибок в `uv run pytest tests/core/test_errors.py`.

## 4. База и миграции

- [x] 4.1 `core/db.py` (async engine, фабрика сессий, базовый класс моделей с соглашением имён) и Alembic в асинхронном режиме: URL из настроек, метаданные из базового класса, реестр моделей для автогенерации, первая пустая миграция; проверка: `uv run alembic upgrade head` дважды подряд на пустой базе из `docker run postgres:17-alpine` завершается успешно.
- [x] 4.2 Фикстуры тестов в `tests/conftest.py`: PostgreSQL 17 в testcontainers на сессию, миграции через Alembic, соединение с транзакцией и откатом на тест, сессия в режиме точек сохранения, фиксированный `Clock`, `httpx.AsyncClient` на ASGI-приложение; интеграционный тест "миграции применяются повторно без изменений"; проверка: `uv run pytest -m integration` проходит.

## 5. Процесс api

- [x] 5.1 `app/main.py`: фабрика приложения FastAPI с префиксом `/api/v1`, Swagger на `/api/v1/docs`, схемой на `/api/v1/openapi.json`, обработчиками ошибок и middleware; `/healthz` и `/readyz` вне схемы; проверка готовности по `alembic_version` и голове миграций с таймаутом; точка входа с выводом ошибок конфигурации; интеграционные тесты: `/healthz` 200 и при недоступной базе, `/readyz` 200, 503 `database_unavailable` при недоступной базе, 503 `migrations_pending` без таблицы версий, Swagger 200, путей проверок нет в схеме, неизвестный путь 404 в общем формате; проверка: `uv run pytest tests/app/test_main.py`, ручной запуск `uv run python -m app.main` отвечает на `/healthz`.

## 6. Процесс worker

- [x] 6.1 `app/worker.py`: запуск списка фоновых задач в `TaskGroup`, событие остановки от SIGTERM и SIGINT (на Windows через `signal.signal`), ожидание текущей работы не дольше `SHUTDOWN_TIMEOUT`, затем отмена с предупреждением в журнал, код выхода 0; тесты на цикле с тестовой задачей: остановка в простое, остановка во время работы (текущая единица завершается, новая не начинается), прерывание по таймауту; проверка: `uv run pytest tests/app/test_worker.py`.

## 7. Образ и окружение

- [x] 7.1 `Dockerfile` (python:3.12-slim, uv из `ghcr.io/astral-sh/uv`, `uv sync --frozen --no-dev` отдельным слоем, непривилегированный пользователь, команда по умолчанию `api`), `.dockerignore`, `.env.example` со всеми переменными этого шага и комментариями; проверка: `docker build -t invoice-keeper-backend .` проходит, `docker run --rm invoice-keeper-backend` без `DATABASE_URL` завершается с ненулевым кодом и называет переменную.

## 8. Документация

- [x] 8.1 Обновить `backend/AGENTS.md`: команды из раздела "Команды" сделать проверенными (убрать пометку "цель"), добавить `SHUTDOWN_TIMEOUT` и `DATABASE_POOL_SIZE` в переменные окружения; отметить шаг 1 в `backend/plan.md`; проверка: каждая команда из раздела "Команды", которая уже имеет смысл на этом шаге, выполняется без ошибки, упомянутые пути существуют.

## 9. Итоговая проверка

- [x] 9.1 Полный набор проверок из `backend/AGENTS.md`; проверка: `uv run pytest`, `uv run ruff check .`, `uv run ruff format --check .`, `uv run mypy .`, `uv run lint-imports` проходят.

## Workflow follow-up

- Архивировать change после ревью, отметить в `backend/plan.md` статус шага 1 "готово".
