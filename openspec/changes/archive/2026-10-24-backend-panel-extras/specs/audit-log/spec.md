## ADDED Requirements

### Requirement: Чтение журнала
`GET /audit-log` SHALL возвращать администратору записи журнала, новые сверху, страницами: id, время, логин автора, действие, сущность, её id, `entityName` - название на момент действия - и `details` с ключами в camelCase. Фильтры: `action` (точно или группа по префиксу `auth.*`), `entity`, `entityId`, `actorLogin` (без учёта регистра), `from`, `to`. Другим ролям SHALL отвечать 403.

#### Scenario: Изменения платежа
- **WHEN** платёж "Аренда офиса" создали и изменили, администратор запрашивает `action=payment.*`
- **THEN** первой идёт `payment.updated` с `entityName` "Аренда офиса" и `details.before`, `details.after`, затем `payment.created`

#### Scenario: Пользователь
- **WHEN** пользователь с ролью `user` запрашивает `GET /audit-log`
- **THEN** ответ 403
