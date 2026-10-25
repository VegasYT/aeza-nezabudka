## MODIFIED Requirements

### Requirement: Вход для разработки
Если задан `DEV_LOGIN_PASSWORD`, вход SHALL проходить без обращения к Aéza: `POST /auth/login` с любым email и этим паролем SHALL возвращать `challenge`, подписанный этим паролем, для email с `+2fa` - с `requirements: ["totp"]` и кодом `000000`, а `X-API-KEY: dev:<email>:<пароль>` SHALL узнавать аккаунт `<email>`. `challenge` без верной подписи и ключ без верного пароля SHALL отклоняться. Белый список, роли, сессии и лимиты неудачных входов SHALL работать как при входе через Aéza. При `APP_ENV=production` настройка SHALL быть запрещена: `api` не запускается.

#### Scenario: Вход участника
- **WHEN** задан `DEV_LOGIN_PASSWORD`, участник из белого списка отправляет свой email и этот пароль, затем полученный `challenge`
- **THEN** ответ 200 `{session, expiresAt}`, запросов в Aéza нет

#### Scenario: Вход с 2FA
- **WHEN** email участника содержит `+2fa`
- **THEN** `POST /auth/login` возвращает `requirements: ["totp"]`, а `POST /auth/tfa/totp` с кодом `000000` выдаёт сессию

#### Scenario: Неверный пароль
- **WHEN** пароль не совпадает с `DEV_LOGIN_PASSWORD`
- **THEN** ответ 400 `invalid_credentials`, неудачная попытка считается в лимитах

#### Scenario: Поддельный challenge или ключ
- **WHEN** клиент отправляет в `use-challenge` строку `dev-challenge:<email>` без подписи или передаёт `X-API-KEY: dev:<email>` без пароля
- **THEN** ответ 400 `invalid_challenge` или 401, сессия не выдаётся

#### Scenario: Запрет в production
- **WHEN** `api` запускается с `APP_ENV=production` и заданным `DEV_LOGIN_PASSWORD`
- **THEN** запуск прерывается с ошибкой настройки `DEV_LOGIN_PASSWORD`
