# Proposal

## Why

Прекращение платежа было необратимым: по ошибке прекращённый платёж приходилось создавать заново, и его история оплат оставалась отдельно.

## What Changes

- `POST /recurring-payments/{id}/resume` с необязательной `nextDueDate`: платёж снова действует, оплаченные и просроченные периоды остаются, новые идут с указанной даты или со следующего срока прежнего расписания, не раньше сегодня.
- Действующий платёж - 409 `payment_active`; дата раньше сегодня - 400; только администратор и интеграция.
- Журнал `payment.resumed`, интеграционное событие `payment.resumed`, напоминание сразу, если срок близко.

## Capabilities

### New Capabilities

Нет.

### Modified Capabilities

- `recurring-payments`.

## Impact

- `backend/apps/payments/`, `backend/apps/integrations/service.py` (тип события), тесты, `backend/api/openapi.yaml` (новая операция, frontend добавляет кнопку).
