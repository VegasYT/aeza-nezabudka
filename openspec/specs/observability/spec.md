# observability Specification

## Purpose
Метрики и логи backend для Prometheus, Loki и Grafana (ADR-009): состояние API, фоновых задач и очередей отправки без утечки секретов и персональных данных.

## Requirements

### Requirement: Метрики API
Процесс `api` SHALL отдавать `/metrics` в формате Prometheus вне `/api/v1` и вне контракта. Каждый HTTP-запрос SHALL учитываться в `http_requests_total` и `http_request_duration_seconds` с метками метода, шаблона маршрута и кода ответа.

#### Scenario: Запрос платежа
- **WHEN** клиент запрашивает `/api/v1/recurring-payments/<id>`
- **THEN** в `/metrics` растёт `http_requests_total` с `route="/api/v1/recurring-payments/{payment_id}"`, а идентификатора в метках нет

### Requirement: Метрики worker
Процесс `worker` SHALL отдавать `/metrics` и `/healthz` на `WORKER_HTTP_PORT`. Для каждой задачи SHALL считаться число запусков по результату и время последнего успешного запуска. Тик SHALL обновлять число созданных периодов, размер и возраст старейшей записи очередей напоминаний и доставок событий.

#### Scenario: После тика
- **WHEN** тик планировщика завершился успешно, в очереди напоминаний две ожидающие строки
- **THEN** `worker_job_last_success_timestamp_seconds{job="scheduler"}` - время этого тика, `outbox_pending{queue="notifications"}` - 2

#### Scenario: Задача упала
- **WHEN** запуск задачи завершился исключением
- **THEN** растёт `worker_job_runs_total{result="failure"}`, время последнего успеха не меняется

### Requirement: Поля логов
Каждая строка лога SHALL содержать `timestamp`, `level`, `service` и `message`; строки запроса API - `request_id`, строки запуска задачи `worker` - `operation_id` и `job`.

#### Scenario: Запуск задачи
- **WHEN** задача `worker` пишет в лог во время запуска
- **THEN** у строки есть `operation_id`, общий для всех строк этого запуска

### Requirement: Секреты не попадают в логи
Значения полей с именами, содержащими `password`, `token`, `secret` или `authorization`, SHALL заменяться на `***`. В любых строковых значениях SHALL заменяться на `***` `Bearer`-токены и токены Telegram-бота.

#### Scenario: Токен в тексте
- **WHEN** в лог пишется сообщение об ошибке с адресом `https://api.telegram.org/bot123456789:AA...` или заголовком `Bearer eyJ...`
- **THEN** в выводе нет ни токена бота, ни Bearer-токена

### Requirement: Метрики отправки, ошибок и входов
Отправка напоминаний SHALL учитываться в `notifications_total` по виду получателя и результату, доставка событий - в `integration_deliveries_total` по адаптеру и результату. Ошибки PostgreSQL, API Aéza и Telegram SHALL учитываться в `dependency_errors_total` по зависимости (`postgres`, `aeza`, `telegram`).

#### Scenario: Повтор отправки
- **WHEN** отправка в общий чат завершилась временной ошибкой Telegram
- **THEN** растут `notifications_total{recipient="group", result="retry"}` и `dependency_errors_total{dependency="telegram"}`

#### Scenario: Aéza недоступна
- **WHEN** вход не прошёл, потому что API Aéza не ответил
- **THEN** растёт `dependency_errors_total{dependency="aeza"}`

### Requirement: Метрика неудачных входов
Неудачные входы SHALL учитываться в `login_failures_total` по причине (`invalid_credentials`, `invalid_challenge`, `invalid_code`, `not_a_member`, `too_many_attempts`), без email и IP в метках.

#### Scenario: Неверный пароль
- **WHEN** вход отклонён с `invalid_credentials`
- **THEN** растёт `login_failures_total{reason="invalid_credentials"}`
