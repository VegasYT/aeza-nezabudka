## ADDED Requirements

### Requirement: Настройки системы
`GET /settings` SHALL возвращать любой роли серверное "сегодня" (`today`) в часовом поясе системы, имя часового пояса (`timezone`) и окно напоминаний в днях (`reminderDaysBefore`).

#### Scenario: Панель узнаёт сегодня
- **WHEN** пользователь запрашивает `GET /settings`, а `CLOCK_TODAY` задан 30 ноября 2026
- **THEN** `today` равно `2026-11-30`
