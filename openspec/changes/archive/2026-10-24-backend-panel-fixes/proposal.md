# Proposal

## Why

Фронтенд при сборке панели нашёл ошибки backend, которые нарушают критерии кейса или ломают даты на демо: повторное сохранение платежа присылало напоминания заново, отключённые участники получали личные напоминания, смена роли не закрывала сессии, интеграция входила в панель паролем, а панель не знала серверное "сегодня".

## What Changes

- `PATCH /recurring-payments/{id}` с датой, равной сроку ближайшего заменяемого периода, не трогает расписание, якорь и периоды.
- Отключённому участнику личные напоминания не ставятся и не отправляются; ожидающие отменяются; после включения снова идут.
- Смена роли участника закрывает его сессии.
- Участник с ролью `integration` не входит паролем: `use-challenge` и `tfa/totp` отвечают 403 `integration_account`; `X-API-KEY` работает.
- `GET /settings`: `today`, `timezone`, `reminderDaysBefore`, всем ролям.

## Capabilities

### New Capabilities

- `system-settings`: настройки системы для панели.

### Modified Capabilities

- `recurring-payments`, `personal-telegram`, `user-management`, `authentication`.

## Impact

- `backend/apps/payments/service.py`, `backend/apps/reminders/`, `backend/apps/users/service.py`, `backend/app/main.py`, миграция `telegram_links.member_disabled`, тесты, `backend/api/openapi.yaml`.
