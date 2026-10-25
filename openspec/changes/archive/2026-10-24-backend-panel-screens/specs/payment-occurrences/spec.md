## ADDED Requirements

### Requirement: Фильтры и поля для экранов
`GET /payment-occurrences`, `GET /payments/summary` и `GET /recurring-payments` SHALL принимать `departmentId=none` - только платежи без отдела - и `q` - часть названия платежа без учёта регистра. `GET /payment-occurrences` и `GET /payments/summary` SHALL принимать `paymentStatus` (`active` или `stopped`). `RecurringPayment` SHALL содержать `overdueCount` и `oldestOverdueDays` (`null` без просрочки). `CurrencyTotals` SHALL содержать `paidCount`, `unpaidCount` и `overdueCount`.

#### Scenario: Без отдела
- **WHEN** есть платёж отдела "Офис" и платёж без отдела, клиент запрашивает `departmentId=none`
- **THEN** в ответе только платёж без отдела

#### Scenario: Просрочка у платежа
- **WHEN** сегодня 10 декабря 2026, у платежа не оплачены периоды 5 октября, 5 ноября и 5 декабря
- **THEN** `overdueCount = 3`, `oldestOverdueDays = 66`
