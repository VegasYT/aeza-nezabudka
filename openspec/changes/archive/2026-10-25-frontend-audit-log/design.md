# Design

## Context

Мотивация - в proposal.md. Контракт готов: `GET /audit-log` с `limit` (до 100), `offset`, `action` (точно или `префикс.*`), `actorLogin`, `from`, `to` (моменты), ответ `{items, total}`, запись - `id`, `at`, `actorLogin`, `action`, `entity`, `entityId`, `entityName`, `details` (ключи в camelCase, старые записи сервер тоже отдаёт в camelCase). Клиент сгенерирован, в том числе `listAuditLogInfiniteOptions` со смещением. Макеты - доски `ExtraAudit`, `ExtraAuditEmpty`, `ExtraAuditFilter`, `ExtraAuditPhone`; значок и место раздела - `PhoneNav` (`audit`).

Какие действия и подробности пишет backend (проверено по `backend/apps/*/service.py`):

| Действие | Объект (`entityName`) | `details` |
| --- | --- | --- |
| `auth.login`, `auth.logout` | email участника | - |
| `occurrence.paid`, `occurrence.unpaid` | название платежа | `paymentId`, `paymentName`, `dueDate`, `paidOnBefore`, `paidOn` |
| `payment.created` | название | снимок: `name`, `amountMinor`, `currency`, `scheduleFirstDueDate`, `period`, `periodCount`, `departmentId`, `departmentName` |
| `payment.updated` | название | `before`, `after` - снимки |
| `payment.stopped` | название | `removedPeriods` |
| `member.created` | email | `email`, `role` |
| `member.updated` | email | `email`, `roleBefore`, `enabledBefore`, `role?`, `enabled?` |
| `member.deleted` | email | `email` |
| `department.created`, `department.deleted` | название | `name` |
| `department.renamed` | новое название | `nameBefore`, `name` |
| `telegram_chat.linked`, `telegram_chat.deleted` | название группы | `title` |
| `telegram_chat.updated` | название группы | `departmentIds` (`null` - все платежи) |

## Goals / Non-Goals

**Goals:** понятная строка на каждое известное действие; фильтры в адресе; подгрузка без постраничной навигации.

**Non-Goals:** фильтр по объекту, переход из записи к объекту, своя пагинация страницами.

## Decisions

### Слайс и маршрут

Код в `src/pages/audit-log`: `model/` (разбор адреса, запрос с подгрузкой), `lib/` (описание записи, группировка по дням - чистые функции с табличными тестами), `ui/` (страница, фильтры, таблица и карточки, значки действий). Маршрут `_authenticated/_admin/audit.tsx` - под `_admin`, поэтому проверка роли и «Нет доступа» уже есть. Раздел добавляется в `sections.ts` последним, значок `IconJournal` - в конец `@shared/ui/icons` (контур из макета `PhoneNav`).

### Описание записи - одна чистая функция

`describeEntry(entry, departments)` возвращает `{ kind, action, object, objectNote, details }`: вид значка, название действия, объект, уточнение и строки подробностей. Таблица и карточки рисуют одно и то же описание. Названия действий и правила подробностей - по таблице выше и макету: «Отметка оплаты» без прежней даты, «Исправление даты оплаты» при обеих датах; у `payment.updated` - только изменившиеся поля «Поле: было → стало» (название, сумма, первая дата, периодичность, отдел); у `telegram_chat.updated` - названия отделов из справочника. Неизвестное действие - его код, объект - `entityName`.

Периодичность в подробностях подписывается общей `periodLabel` из `@entities/recurring-payment` («ежемесячно», «раз в квартал»), как в «Регулярных платежах». В старых записях без `period` и `periodCount` платёж считается ежемесячным: другой периодичности тогда не было.

### Значки действий

Контуры из макета (вход, выход, оплата, отмена, дата, правка, прекращение, участник, новый участник, чат) рисуются через `IconBase` в слайсе: нужны только журналу. Цвет: отметка оплаты - `--nz-status-paid-ink`, отмена - `--nz-status-overdue-ink`, остальные - `--nz-ink-3`.

### Фильтры и адрес

`validateAuditSearch`: `action` - ключ группы (`auth`, `occurrences`, `payments`, `members`, `departments`, `chats`), `actor` - email, `from` и `to` - даты `YYYY-MM-DD`; неизвестное и значения по умолчанию в адрес не пишутся. Группа превращается в `action=<префикс>.*`, даты - в моменты: `from` - начало дня, `to` - конец дня в часовом поясе браузера (журнал - про моменты, так же показывается и время записей).

Допущение (в макете период показан примером): по умолчанию последние 30 дней по сегодня браузера включительно.

«Кто» - `Select` с поиском по участникам из `GET /users` (`limit: 100`, кэш общий с разделом «Пользователи»). Если в адресе автор, которого нет в списке (удалён), он всё равно добавляется в варианты: записи удалённых участников остаются в журнале.

«Когда» - `DatePickerInput` с диапазоном, не позже сегодня; адрес меняется, когда выбраны обе даты.

### Подгрузка

`useInfiniteQuery` с `listAuditLogInfiniteOptions`, страница 50, следующее смещение - число уже загруженных записей, пока оно меньше `total`. Смена фильтров меняет ключ запроса и начинает с первой страницы. Группировка по дням идёт по всем загруженным записям, поэтому день, разрезанный подгрузкой, остаётся одной группой.

### Состояния

Пустой результат и ошибка - `ListState` и `LoadError` из `@shared/ui/list-state`, как в других разделах.

### Тесты

Сценарии через `renderApp('/audit')` в `src/app/audit.test.tsx` с `signIn('admin')`; «сегодня» задаётся `vi.setSystemTime`. Описание записей и группировка по дням - табличные тесты в `lib/`. Тест навигации (`app-layout.test.tsx`) получает шестой раздел.

## Risks / Trade-offs

- [Шесть подписей в шапке на ширине `lg` (1200 px)] → проверить скриншотом на 1200 и 1440; email рядом с аватаром уже прячется, когда не хватает места (container query).
- [Много записей за 30 дней] → подгрузка по 50, группировка по загруженным; сервер ограничивает страницу 100.
