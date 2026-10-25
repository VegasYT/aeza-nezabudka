# Proposal

## Why

С `DEV_LOGIN_PASSWORD` вход через Aéza выключался целиком: на стенде нельзя было проверить и тестовые аккаунты, и настоящий аккаунт Aéza, не переключая настройки.

## What Changes

- Общий пароль действует только для email на `@dev.local`; остальные email, их `challenge`, сессии и ключи идут в настоящую Aéza.
- Ключ `dev:<email>:<пароль>` принимается только для `@dev.local`: им не открыть аккаунт Aéza из белого списка.

## Capabilities

### New Capabilities

Нет.

### Modified Capabilities

- `authentication`: тестовые аккаунты рядом с входом Aéza.

## Impact

- `backend/apps/users/dev_aeza.py`, `backend/app/main.py`, тесты, `docs/ADR.md` (ADR-014), `infra/README.md`, примеры `.env`.
