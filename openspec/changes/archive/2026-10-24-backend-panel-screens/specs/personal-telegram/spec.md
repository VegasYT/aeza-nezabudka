## MODIFIED Requirements

### Requirement: Состояние личного Telegram
`GET /me/telegram` SHALL возвращать для текущего пользователя: привязан ли чат, имя пользователя (`telegramUsername`) и имя (`telegramName`) в Telegram, включены ли личные напоминания, заблокирован ли бот, настроен ли бот в системе (`botConfigured`), есть ли общий чат из настроек или подключённая группа (`groupChatConfigured`) и фильтр отделов `departmentIds` (`null` - все платежи). Операция доступна ролям `admin` и `user`.

#### Scenario: Без привязки
- **WHEN** пользователь ещё не привязывал Telegram
- **THEN** `linked = false`, `personal_enabled = false`, `blocked = false`, `departmentIds = null`

## ADDED Requirements

### Requirement: Блокировка бота сразу
Обновление `my_chat_member` о том, что пользователь заблокировал бота, SHALL сразу ставить отметку блокировки в привязке, о том, что снова запустил, - снимать её.

#### Scenario: Пользователь заблокировал бота
- **WHEN** пользователь с привязкой блокирует бота в Telegram
- **THEN** `GET /me/telegram` сразу показывает `blocked = true`
