# Proposal

## Why

В dev-входе `challenge` собирался из одного email (`dev-challenge:<email>`), а ключ `dev:<email>` не содержал пароля. На открытом стенде любой мог отправить такой `challenge` в `use-challenge` или такой ключ в `X-API-KEY` и войти администратором без пароля.

## What Changes

- `challenge` и внутренняя сессия dev-входа подписаны HMAC-SHA256 на ключе `DEV_LOGIN_PASSWORD`; без подписи - 400 `invalid_challenge`.
- Ключ dev-входа - `dev:<email>:<пароль>`; без верного пароля - 401.

## Capabilities

### New Capabilities

Нет.

### Modified Capabilities

- `authentication`: dev-вход не обходит пароль.

## Impact

- `backend/apps/users/dev_aeza.py`, тесты, `backend/.env.example`, `infra/README.md`, `docs/ADR.md`.
