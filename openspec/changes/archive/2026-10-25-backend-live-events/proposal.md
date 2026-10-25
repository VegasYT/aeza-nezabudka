## Why

Оплату отмечают из панели, из API и кнопкой в Telegram, а открытая панель узнаёт об этом только при следующем запросе. Привязку Telegram панель ждёт опросом раз в 3 секунды. Нужен поток событий, по которому панель обновляется сразу (ADR-016).

## What Changes

- `GET /api/v1/events` - поток Server-Sent Events для всех ролей: `ready` при подключении, `change` при изменении, `resync` после потери событий.
- Каждая запись журнала действий публикует событие `change` после коммита транзакции; личная привязка Telegram публикует `telegram.changed`.
- Видимость событий по роли и адресату.
- Метрика `live_clients` - открытые потоки.

## Impact

- `backend/core/live.py`, `backend/app/events.py`, `backend/apps/audit`, `backend/apps/reminders`, `backend/app/main.py`, `backend/core/logging.py`.
- Контракт: новая операция `GET /api/v1/events` (`text/event-stream`).
- Frontend: подписка на поток и перечитывание запросов по событиям.
