# Design

## Decisions

### Где живут метрики

`core/metrics.py` объявляет все метрики в общем реестре `prometheus-client`. Модули `apps` и процессы `app` их только увеличивают: так полный список серий виден в одном файле, а `core` по-прежнему не знает об `apps`. У `api` и `worker` свои процессы и свои реестры; Prometheus опрашивает оба.

| Метрика | Тип | Метки |
| --- | --- | --- |
| `http_requests_total` | counter | `method`, `route`, `status` |
| `http_request_duration_seconds` | histogram | `method`, `route` |
| `worker_job_runs_total` | counter | `job`, `result` (`success`, `failure`) |
| `worker_job_last_success_timestamp_seconds` | gauge | `job` |
| `payment_periods_created_total` | counter | - |
| `outbox_pending` | gauge | `queue` (`notifications`, `integration_deliveries`) |
| `outbox_oldest_pending_age_seconds` | gauge | `queue` |
| `notifications_total` | counter | `recipient` (`group`, `personal`), `result` (`sent`, `retry`, `failed`, `cancelled`) |
| `integration_deliveries_total` | counter | `target`, `result` (`sent`, `retry`, `failed`) |
| `dependency_errors_total` | counter | `dependency` (`postgres`, `keycloak`, `telegram`) |

`route` - шаблон маршрута (`/api/v1/recurring-payments/{payment_id}`) или `unmatched`; идентификаторов, логинов и текстов ошибок в метках нет (ADR-009).

Время последнего тика - это `worker_job_last_success_timestamp_seconds{job="scheduler"}`: одна общая метрика для всех задач вместо отдельной для планировщика.

### Очереди

Размер и возраст очередей считает тик планировщика (раз в минуту): `reminders.service.pending_stats` и `integrations.service.pending_stats` возвращают число ожидающих строк и время создания старейшей. Пустая очередь - размер 0 и возраст 0.

### Ошибки зависимостей

- PostgreSQL: необработанное исключение `SQLAlchemyError` или `OSError` в API (обработчик 500) и в задаче `worker`.
- Keycloak: каждое `identity_unavailable()` и неудачная синхронизация администратора.
- Telegram: каждая ошибка запроса к Bot API в `TelegramNotifier`.

### HTTP worker

`worker` поднимает маленькое ASGI-приложение Starlette на `uvicorn` в том же цикле событий: `/healthz` и `/metrics` на `WORKER_HTTP_PORT`. Новых зависимостей нет, остановка - вместе с задачами. Порт публикуется только внутри сети compose.

У `api` `/metrics` - обычный маршрут FastAPI вне схемы; наружу его не пускает Caddy (этап "Фундамент").

### Логи

- Каждый запуск задачи `worker` получает `operation_id` (uuid) и `job` в контексте structlog, поэтому все строки этой работы связаны.
- Процессор скрытия секретов, кроме ключей (`password`, `token`, `secret`, `authorization`), заменяет в строковых значениях `Bearer <токен>` и токены Telegram-бота (`<цифры>:<35 символов>`) на `***`.
