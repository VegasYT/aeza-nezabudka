# Spec Delta

## REMOVED Requirements

### Requirement: Метрики отправки и ошибок
**Reason**: зависимость `keycloak` заменена на `aeza`, добавлены неудачные входы
**Migration**: требование "Метрики отправки, ошибок и входов" ниже.

## ADDED Requirements

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
