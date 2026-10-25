# Tasks

Часть репо: backend, команды из `backend/`. Тесты с базой интеграционные, нужен Docker.

## 1. Очередь

- [x] 1.1 `ReminderSettings` в `core/config.py`, `.env.example`; модель `Notification` и миграция; проверка: тест `.env.example`, `alembic upgrade head` на чистой базе.
- [x] 1.2 `payments.service`: `open_occurrence_ids`, `occurrence_subjects`, `after_change` в создании и изменении; `reminders.service`: постановка; тесты: поздний платёж, изменение срока в окно, оплаченный и прекращённый, просрочка после простоя, без общего чата, два тика параллельно.

## 2. Отправка

- [x] 2.1 `apps/reminders/telegram.py`: `Notifier`, ошибки, реализация на aiogram с прокси; текст напоминаний в `domain.py`; тесты: тексты, соответствие ошибок aiogram, токен скрыт.
- [x] 2.2 Отправитель: выборка `skip locked`, повторная проверка, итоги, паузы; тесты с фейковым `Notifier`: два отправителя - одно сообщение, отмена оплаченного и прекращённого, повтор и 429, `failed`, паузы.

## 3. Worker и проверки

- [x] 3.1 `app/worker.py`: задачи `scheduler` и `reminder_sender`, запуск без токена; `app/main.py`: `after_change`; тест сборки задач.
- [x] 3.2 `backend/AGENTS.md`, `backend/plan.md`; полный набор проверок: `uv run pytest`, `uv run ruff check .`, `uv run ruff format --check .`, `uv run mypy .`, `uv run lint-imports`.
