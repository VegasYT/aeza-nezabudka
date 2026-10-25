# payment-occurrences Specification

## Purpose
Периоды оплаты через API: общий список для бухгалтерии с просрочкой и отметка оплаты конкретного периода.

## Requirements

### Requirement: Список периодов
`GET /payment-occurrences` SHALL возвращать периоды всех платежей, включая прекращённые, страницами, по сроку (`order` `asc` по умолчанию или `desc`), с фильтрами: `status` (`paid` - оплаченные, `unpaid` - неоплаченные, `overdue` - неоплаченные со сроком раньше сегодня), `currency`, `recurring_payment_id`, `department_id`, `from` и `to` (срок включительно). У каждого периода SHALL быть `overdue` и `days_overdue` по правилам `payment-status`.

#### Scenario: Просроченные
- **WHEN** сегодня 24 октября 2026, есть неоплаченные периоды на 20 октября и 5 ноября и оплаченный на 1 октября
- **THEN** `status=overdue` возвращает только период на 20 октября с `days_overdue` 4

#### Scenario: Диапазон сроков
- **WHEN** `from=2026-10-01` и `to=2026-10-31`
- **THEN** в ответе только периоды со сроком в октябре 2026

#### Scenario: Сортировка
- **WHEN** `order=desc`
- **THEN** периоды идут от позднего срока к раннему

### Requirement: Период по идентификатору
`GET /payment-occurrences/{id}` SHALL возвращать период или 404 `not_found`.

#### Scenario: Неизвестный период
- **WHEN** периода с таким идентификатором нет
- **THEN** ответ 404 `not_found`

### Requirement: Отметка оплаты
`PATCH /payment-occurrences/{id}` с `paid: true` SHALL отмечать оплату с датой `paid_on` (по умолчанию сегодня) и запоминать логин того, кто отметил; повторный вызов с другой датой исправляет дату, срок не меняется. С `paid: false` SHALL снимать отметку и очищать дату и автора. Дата оплаты позже сегодня SHALL давать 400 `bad_request` с полем `paid_on`. Каждое изменение SHALL записываться в журнал.

#### Scenario: Отметка без даты
- **WHEN** сегодня 24 октября 2026 пользователь `buh.petrova` отмечает период оплаченным без `paid_on`
- **THEN** `paid` true, `paid_on` 2026-10-24, `paid_by_login` `buh.petrova`

#### Scenario: Исправление даты убирает просрочку
- **WHEN** период со сроком 5 октября оплачен 8 октября, а затем дата исправлена на 5 октября
- **THEN** `overdue` false, `days_overdue` 0, `due_date` 2026-10-05

#### Scenario: Отмена
- **WHEN** у оплаченного периода со сроком 20 октября отметку снимают, сегодня 24 октября
- **THEN** `paid` false, `paid_on` и `paid_by_login` пустые, `overdue` true

#### Scenario: Оплата в будущем
- **WHEN** `paid_on` 25 октября 2026, а сегодня 24 октября
- **THEN** ответ 400 `bad_request`, в `payload` есть поле `paidOn`

### Requirement: Фильтры и поля для экранов
`GET /payment-occurrences`, `GET /payments/summary` и `GET /recurring-payments` SHALL принимать `departmentId=none` - только платежи без отдела - и `q` - часть названия платежа без учёта регистра. `GET /payment-occurrences` и `GET /payments/summary` SHALL принимать `paymentStatus` (`active` или `stopped`). `RecurringPayment` SHALL содержать `overdueCount` и `oldestOverdueDays` (`null` без просрочки). `CurrencyTotals` SHALL содержать `paidCount`, `unpaidCount` и `overdueCount`.

#### Scenario: Без отдела
- **WHEN** есть платёж отдела "Офис" и платёж без отдела, клиент запрашивает `departmentId=none`
- **THEN** в ответе только платёж без отдела

#### Scenario: Просрочка у платежа
- **WHEN** сегодня 10 декабря 2026, у платежа не оплачены периоды 5 октября, 5 ноября и 5 декабря
- **THEN** `overdueCount = 3`, `oldestOverdueDays = 66`

### Requirement: Плановые периоды
`GET /payments/forecast` с `to` (и необязательными `from`, `departmentId`, `q`) SHALL возвращать любой роли будущие периоды действующих платежей по расписанию, которых ещё нет в базе, по сроку, страницами, и ничего не записывать. Диапазон больше двух лет или конец раньше начала SHALL давать 400.

#### Scenario: Календарь на три месяца
- **WHEN** у платежа с якорем 31 есть только период 31 октября 2026 и запрошен прогноз до 31 января 2027
- **THEN** в ответе 30 ноября, 31 декабря и 31 января, в базе по-прежнему один период

### Requirement: Время напоминания у периода
Период SHALL содержать `reminderSentAt` - время последнего отправленного напоминания о нём, или `null`.

#### Scenario: Напоминание ушло
- **WHEN** напоминание о периоде отправлено в общий чат
- **THEN** у периода заполнено `reminderSentAt`
