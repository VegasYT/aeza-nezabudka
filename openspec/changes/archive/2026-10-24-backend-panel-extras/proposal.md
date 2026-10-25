# Proposal

## Why

Для дополнительных экранов панели фронтенду нужны журнал действий, календарь будущих платежей, бюджет по месяцам и снимок итогов на дату. Журнал уже пишется, но прочитать его через API нельзя.

## What Changes

- `GET /audit-log` для администратора: фильтры по действию (точно или префиксом `auth.*`), сущности, id, автору и времени; новые сверху; `entityName` - название на момент действия; ключи `details` в camelCase; в подробностях - платёж у периода, прежние роль и включение участника, название отдела у платежа. Время записи - `clock_timestamp()`, чтобы записи одной транзакции шли по порядку.
- `GET /payments/forecast`: плановые периоды действующих платежей, которых ещё нет в базе, без записи; диапазон не больше двух лет.
- `GET /payments/summary`: `includePlanned` (`plannedMinor`, `plannedCount`), `groupBy=month` (`months`), `asOf` - снимок на дату.
- `reminderSentAt` у периода - когда ушло последнее напоминание.

## Capabilities

### New Capabilities

Нет.

### Modified Capabilities

- `audit-log`, `payment-totals`, `payment-occurrences`.

## Impact

- `backend/apps/audit/` (router, schemas, repository), `backend/apps/payments/`, `backend/apps/reminders/` (время отправки), миграция `audit_log.entity_name`, тесты, `backend/api/openapi.yaml`.
