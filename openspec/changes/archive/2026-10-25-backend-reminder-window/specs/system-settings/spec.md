## MODIFIED Requirements

### Requirement: Настройки системы
`GET /settings` SHALL возвращать любой роли серверное "сегодня" (`today`) в часовом поясе системы, имя часового пояса (`timezone`) и действующее общее окно напоминаний в днях (`reminderDaysBefore`): заданное администратором в панели, иначе `REMINDER_DAYS_BEFORE`.

#### Scenario: Панель узнаёт сегодня
- **WHEN** пользователь запрашивает `GET /settings`, а `CLOCK_TODAY` задан 30 ноября 2026
- **THEN** `today` равно `2026-11-30`

## ADDED Requirements

### Requirement: Общее окно напоминаний из панели
`PATCH /settings` с `reminderDaysBefore` от 0 до 30 SHALL менять общее окно напоминаний без перезапуска, только для администратора, и записываться в журнал (`settings.updated`, старое и новое значение). `reminderDaysBefore` `null` SHALL возвращать окно из `REMINDER_DAYS_BEFORE`. `GET /settings` SHALL отдавать и значение сервера (`reminderDaysBeforeDefault`). Другая роль SHALL получать 403, значение вне диапазона - 400.

#### Scenario: Администратор меняет окно
- **WHEN** администратор отправляет `PATCH /settings` с `reminderDaysBefore` 5
- **THEN** `GET /settings` возвращает `reminderDaysBefore` 5, а в журнале запись `settings.updated`

#### Scenario: Сброс к значению сервера
- **WHEN** администратор задал окно 10, затем отправил `PATCH /settings` с `reminderDaysBefore` `null`, а `REMINDER_DAYS_BEFORE` равно 3
- **THEN** `GET /settings` возвращает `reminderDaysBefore` 3

#### Scenario: Пользователь
- **WHEN** пользователь с ролью `user` отправляет `PATCH /settings`
- **THEN** ответ 403
