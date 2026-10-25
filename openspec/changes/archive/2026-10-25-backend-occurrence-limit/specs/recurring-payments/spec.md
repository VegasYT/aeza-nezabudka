## ADDED Requirements

### Requirement: Ограниченное число оплат
Платёж SHALL принимать `occurrenceLimit` от 1 до 1000 или `null` (бессрочно, по умолчанию). У платежа с лимитом SHALL создаваться не больше `occurrenceLimit` периодов, и прогноз SHALL их не превышать. Ответ SHALL содержать `paidOccurrences` и `completed` (все оплаты по лимиту сделаны). `PATCH` с `occurrenceLimit` SHALL удалять лишние неоплаченные непросроченные периоды; лимит меньше числа оплаченных и просроченных периодов SHALL давать 400; `null` SHALL снимать ограничение.

#### Scenario: Еженедельно в течение месяца
- **WHEN** платёж `week` с `occurrenceLimit: 4` начинается 5 октября 2026, а сегодня 1 декабря
- **THEN** у него ровно 4 периода: 5, 12, 19 и 26 октября; после их оплаты `completed = true`, `nextDueDate = null`

#### Scenario: Лимит меньше сделанного
- **WHEN** у платежа 3 просроченных периода и приходит `PATCH` с `occurrenceLimit: 2`
- **THEN** ответ 400
