# Proposal

## Why

Команде нужно смотреть и править данные на стенде без SSH на сервер: PostgreSQL наружу не открыт.

## What Changes

- pgAdmin 9.18 в `infra/compose.prod.yaml`, адрес `https://pgadmin.<домен>`, вход по `PGADMIN_EMAIL` и `PGADMIN_PASSWORD`. Сервер `nezabudka` добавлен заранее, пароль базы спрашивается при подключении.
- Блокировка после неудачных входов выключена: иначе любой мог бы запереть администратора; защищает длинный случайный пароль.
- PostgreSQL по-прежнему не открыт наружу.

## Capabilities

### New Capabilities

Нет.

### Modified Capabilities

- `deployment`: адрес pgAdmin.

## Impact

- `infra/compose.prod.yaml`, `infra/caddy/Caddyfile`, `infra/pgadmin/servers.json`, `infra/.env.example`, `infra/README.md`; на сервере - переменные в `infra/.env`.
