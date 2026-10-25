# Tasks

Часть репо - frontend. Команды запускаются из `frontend/`.

## 1. Журнал

- [x] 1.1 `userAgentLabel` в `src/pages/audit-log/lib/user-agent.ts`: браузер с основной версией и система, нераспознанная строка как есть или с обрезкой до 40 символов. Тест на набор строк User-Agent. Проверка: `pnpm exec vitest run src/pages/audit-log`.
- [x] 1.2 `describeEntry`: у `auth.login` строка «IP …, браузер на системе», полная строка User-Agent в `hint`; без `ip` и `userAgent` подробностей нет. Тесты в `describe-entry.test.ts`.
- [x] 1.3 Строки с подсказкой в таблице (`Tooltip` по наведению и фокусу) и в карточках телефона (`Popover` по нажатию, цель 44 px). Проверка на стенде: компьютер и телефон, светлая и тёмная схема, без горизонтальной прокрутки.
- [x] 1.4 `frontend/AGENTS.md`: строка про вход в разделе «Журнал». `pnpm check` проходит.
