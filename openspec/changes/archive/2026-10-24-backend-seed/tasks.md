# Tasks

Часть репо: backend, команды из `backend/`. Тесты интеграционные, нужен Docker.

## 1. Сид

- [x] 1.1 `SeedSettings` в `core/config.py`, `app/seed.py` с функцией `seed(...)` и точкой входа; интеграционный тест на запуске 24 октября 2026: состав периодов, статусы и даты из спецификации, автор `seed` в журнале, пользователь создан, второй запуск ничего не добавляет; проверка: `uv run pytest tests/app/test_seed.py`.

## 2. Документация и проверки

- [x] 2.1 `.env.example`, `backend/AGENTS.md` (команда и переменные), `backend/plan.md` (статус основы шага 11); проверка: тест `.env.example` проходит, команда `uv run python -m app.seed` без `DEMO_USER_PASSWORD` завершается ошибкой конфигурации с её именем.
- [x] 2.2 Полный набор проверок из `backend/AGENTS.md`; проверка: `uv run pytest`, `uv run ruff check .`, `uv run ruff format --check .`, `uv run mypy .`, `uv run lint-imports` проходят.

## Workflow follow-up

- Архивировать change после ревью.
