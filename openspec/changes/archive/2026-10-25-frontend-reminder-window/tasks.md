# Tasks

Часть репо - frontend. Команды запускаются из `frontend/`.

## 1. Клиент и окно платежа

- [x] 1.1 `pnpm api:generate`; тестовые данные: `reminderDaysBefore` у платежей, `reminderDaysBeforeDefault` в `serveSettings`.
- [x] 1.2 `occurrenceStatus` и `nextDueView`: своё окно платежа, без него общее; окно возобновления предупреждает по окну платежа. Тест статуса со своим окном.
- [x] 1.3 Обозначение календаря «Скоро срок».

## 2. Форма и карточка

- [x] 2.1 Поле «Напоминать за, дней» в `payment-form.ts` (схема, значения, `createBody`, `changedFields`) и в форме с подсказкой; `ReminderAlert` по окну из формы. `reminderTiming`, `isReminderWindow`, `REMINDER_MAX` - в `@entities/recurring-payment`. Тесты: больше 30 поле исправляет, пустое уходит `null`.
- [x] 2.2 Строка «Напоминание» в карточке платежа. Тест.

## 3. Общее окно, журнал, события

- [x] 3.1 Остров «Когда напоминать» в «Уведомлениях» у администратора: `PATCH /settings`, «Как на сервере (N)», уведомление, ответ в кэш. Тесты: изменение, сброс, пользователь не видит.
- [x] 3.2 `describeEntry`: `settings.updated`, окно в `payment.created` и `payment.updated`; группа фильтра «Настройки». Тесты.
- [x] 3.3 `LiveUpdates`: `settings.*` перечитывает `getSettings`.

## 4. Проверка

- [x] 4.1 На стенде через `pnpm dev` (только просмотр): форма, карточка, остров «Когда напоминать» в обеих схемах и на телефоне.
- [x] 4.2 `frontend/AGENTS.md`; `pnpm check` проходит.
