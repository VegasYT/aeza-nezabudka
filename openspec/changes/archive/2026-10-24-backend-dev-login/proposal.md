# Proposal

## Why

Фронтендеру нужно проверять экран входа, 2FA и обе роли, а войти можно только настоящим аккаунтом Aéza. Тестовый аккаунт один, у него роль администратора и нет 2FA, а после пары ошибок в пароле Aéza отвечает 429 и на время перестаёт пускать всех: вход идёт с одного адреса сервера (ADR-014).

## What Changes

- Настройка `DEV_LOGIN_PASSWORD`: если задана, `api` проходит вход без Aéza. Любой email с этим паролем получает `challenge`, email с `+2fa` требует код `000000`, ключ `X-API-KEY: dev:<email>` узнаёт аккаунт `<email>`. Белый список, роли, сессии, лимиты неудачных входов и формат ответов не меняются.
- При `APP_ENV=production` настройка запрещена: `api` не запускается.
- `infra/compose.dev.yaml`: PostgreSQL, миграции, тестовые данные и `api` с dev-входом на `127.0.0.1:8000` для локальной работы над frontend.
- ADR-014 дополнен исключением для разработки.

## Capabilities

### New Capabilities

Нет.

### Modified Capabilities

- `authentication`: вход для разработки без Aéza.

## Impact

- `backend/core/config.py`, `backend/apps/users/dev_aeza.py`, `backend/app/main.py`, тесты.
- `backend/.env.example`, `infra/compose.dev.yaml`, `infra/README.md`, `docs/ADR.md` (ADR-014).
- Контракт API не меняется.
