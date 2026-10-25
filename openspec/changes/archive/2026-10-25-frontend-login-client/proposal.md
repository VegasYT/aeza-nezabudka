# Proposal

## Why

В журнале бывает много входов подряд, и по записи не понять, кто входил: человек из браузера или скрипт (автотесты, запись видео). Backend теперь пишет в `details` записи `auth.login` IP клиента (`ip`) и User-Agent (`userAgent`, до 300 символов). Панель их пока не показывает.

## What Changes

- Подробности записи «Вход» - одна строка: IP и браузер с системой, например «IP 10.0.0.7, Chrome 130 на Windows».
- Браузер и система берутся из User-Agent: Chrome, Edge, Opera, Яндекс Браузер, Samsung Internet, Firefox, Safari и Chrome без окна («Headless Chrome») на Windows, macOS, Linux, ChromeOS, Android, iPhone и iPad. Нераспознанная строка, например `curl/8.4.0` у скрипта, показывается как есть, длинная - с обрезкой.
- Полная строка User-Agent - в подсказке у строки: на компьютере по наведению и фокусу, на телефоне по нажатию.
- У старых записей адреса и браузера нет: подробностей нет, как раньше.

Вне изменения:
- контракт API: `details` - свободный объект, клиент не перегенерируется.

## Capabilities

### Modified Capabilities

- `web-audit-log`: подробности записи о входе.

## Impact

- `frontend/src/pages/audit-log`: `lib/user-agent.ts`, `describeEntry`, вывод строк подробностей в таблице и карточках.
