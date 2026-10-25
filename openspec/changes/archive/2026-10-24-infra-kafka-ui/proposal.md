# Proposal

## Why

Интеграционные события (ADR-011) пишутся в базу, но на стенде никуда не уходят: Kafka выключена. Для показа встраивания нужна работающая Kafka и способ увидеть сообщения без консоли сервера.

## What Changes

- Kafka UI (`kafbat/kafka-ui` v1.5.0) в профиле `integration`, адрес `https://kafka.<домен>`, вход `admin` и `KAFKA_UI_PASSWORD`, режим только чтения, память до 512 МБ.
- `KAFKA_UI_PASSWORD` обязательна в `infra/.env` всегда: compose проверяет переменные и у выключенных профилей.
- На стенде включены профиль `integration` и `KAFKA_BROKERS=kafka:19092`: события идут в топик `invoice-keeper.events`.

## Capabilities

### New Capabilities

Нет.

### Modified Capabilities

- `deployment`: адрес Kafka UI.

## Impact

- `infra/compose.prod.yaml`, `infra/caddy/Caddyfile`, `infra/.env.example`, `infra/README.md`; на сервере - `infra/.env` и DNS-запись `kafka.<домен>`.
