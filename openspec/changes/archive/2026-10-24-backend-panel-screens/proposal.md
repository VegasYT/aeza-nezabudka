# Proposal

## Why

Экранам панели не хватало данных и фильтров backend: администраторов из настроек не было в списке участников, нельзя было отфильтровать платежи без отдела, найти платёж по названию, увидеть просрочку у платежа и счётчики в итогах. Telegram узнавал об удалении бота только при следующей отправке, а удаление отдела молча выключало групповой чат с фильтром по этому отделу.

## What Changes

- `GET /users`: все участники, администраторы из настроек первыми, поля `editable` и `lastSeenAt`, роль полностью (`admin`, `user`, `integration`).
- `departmentId=none` - без отдела; `q` - поиск по названию; `paymentStatus` у периодов и итогов.
- `RecurringPayment`: `overdueCount`, `oldestOverdueDays`; `CurrencyTotals`: `paidCount`, `unpaidCount`, `overdueCount`.
- Отделы: пробелы по краям обрезаются, название уникально без учёта регистра, `paymentsCount`.
- Telegram: `botConfigured`, `telegramName`, `groupChatConfigured` учитывает группы; `my_chat_member` - блокировка и снятие сразу; переименование группы обновляет название; пустой список отделов - 400; фильтр без единого отдела (отделы удалили) - все платежи.
- Понятные тексты ошибок для `name`, `amountMinor`, `departmentIds`; коды ошибок в описаниях операций, 503 у ссылок Telegram.
- Прекращение платежа: неоплаченный период со сроком сегодня остаётся (описано в контракте).

## Capabilities

### New Capabilities

Нет.

### Modified Capabilities

- `user-management`, `departments`, `group-telegram-chats`, `personal-telegram`, `payment-occurrences`, `http-api`.

## Impact

- `backend/apps/{users,departments,payments,reminders}`, `backend/core/messages.py`, миграция, тесты, `backend/api/openapi.yaml`.
- `docs/ADR.md` (ADR-010, ADR-012).
