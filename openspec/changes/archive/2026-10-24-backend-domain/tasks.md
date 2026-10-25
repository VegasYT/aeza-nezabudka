# Tasks

Часть репо: backend, команды из `backend/`. Docker не нужен.

## 1. Расписание

- [x] 1.1 `apps/payments/domain.py`: `Schedule`, `PlannedOccurrence`, `due_date(schedule, seq)` с переносом на последний день месяца; табличный тест: якорь 31 на январь-май 2026, 30 января 2028 (високосный февраль), 15 декабря 2026 (переход года), отрезок с `from_seq` больше 0; проверка: `uv run pytest tests/apps/payments/test_domain.py -k due`.
- [x] 1.2 `occurrences_to_create(schedule, last_seq, today)`; тест: новый платёж, наступивший срок, простой в несколько месяцев, нечего создавать; проверка: `uv run pytest tests/apps/payments/test_domain.py -k create`.
- [x] 1.3 `OccurrenceState`, `is_replaceable`, `next_segment_from_seq`, `removed_on_stop`; тест по сценариям изменения даты, суммы и прекращения из спецификации `payment-schedule`, включая период со сроком сегодня; проверка: `uv run pytest tests/apps/payments/test_domain.py -k "replace or stop or segment"`.
- [x] 1.4 `next_due_date_error` и `paid_on_error`; тест на вчера, сегодня и завтра для обеих; проверка: `uv run pytest tests/apps/payments/test_domain.py -k error`.

## 2. Просрочка и итоги

- [x] 2.1 `overdue_days` и `is_overdue`; табличный тест: неоплаченный в день срока и на следующий день, оплата в день срока, оплата с опозданием, исправление даты; проверка: `uv run pytest tests/apps/payments/test_domain.py -k overdue`.
- [x] 2.2 `CurrencyTotals` и `summarize(states, today)`; тест: три валюты, пустой список, просроченный неоплаченный, оплаченный с опозданием; проверка: `uv run pytest tests/apps/payments/test_domain.py -k summarize`.

## 3. Напоминания

- [x] 3.1 `apps/reminders/domain.py`: `due_soon(due_date, paid, active, today, days_before)` и `overdue_reminder(due_date, paid, active, today)`; табличный тест по сценариям спецификации `reminders`; проверка: `uv run pytest tests/apps/reminders/test_domain.py`.

## 4. Завершение

- [x] 4.1 `backend/plan.md`: статус шага 3; проверка: строка шага 3 в таблице состояния обновлена.
- [x] 4.2 Полный набор проверок из `backend/AGENTS.md`; проверка: `uv run pytest`, `uv run ruff check .`, `uv run ruff format --check .`, `uv run mypy .`, `uv run lint-imports` проходят.

## Workflow follow-up

- Архивировать change после ревью.
