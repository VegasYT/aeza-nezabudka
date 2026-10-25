# Proposal

## Why

ADR-012 обещает, что получатель личных напоминаний может ограничить отделы, но в коде этого не было: в личный чат приходили напоминания обо всех платежах.

## What Changes

- У личной привязки фильтр отделов: все платежи или только платежи выбранных отделов (платежи без отдела при фильтре не приходят), как у групповых чатов.
- `GET /me/telegram` возвращает `departmentIds` (`null` - все).
- `PATCH /me/telegram` меняет только переданные поля: `personalEnabled` и/или `departmentIds`; пустое тело и несуществующий отдел - 400.

## Capabilities

### New Capabilities

Нет.

### Modified Capabilities

- `personal-telegram`: фильтр отделов личных напоминаний.

## Impact

- `backend/apps/reminders/`, миграция, тесты, `backend/api/openapi.yaml` (поле `departmentIds`, `personalEnabled` в `PATCH` стал необязательным - старые запросы работают).
- `docs/ADR.md` (ADR-010, ADR-012).
