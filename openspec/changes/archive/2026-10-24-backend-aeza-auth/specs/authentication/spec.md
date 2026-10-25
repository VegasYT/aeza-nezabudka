# Spec Delta

## REMOVED Requirements

### Requirement: Проверка токена
**Reason**: токены Keycloak больше не используются (ADR-014).
**Migration**: требования "Своя сессия" и "Ключ X-API-KEY" ниже.

### Requirement: Роль из токена
**Reason**: роль хранится в белом списке, а не в токене.
**Migration**: требование "Своя сессия" и capability `user-management`.

### Requirement: Ключи подписи без обращения на каждый запрос
**Reason**: своя сессия проверяется по базе, ключей подписи нет.
**Migration**: требование "API Aéza недоступен".

## MODIFIED Requirements

### Requirement: Текущий пользователь
`GET /auth/me` SHALL возвращать id участника, email аккаунта Aéza и роль из белого списка (`admin`, `user` или `integration`).

#### Scenario: Пользователь вошёл
- **WHEN** участник `buh.petrova@company.ru` с ролью `user` запрашивает `GET /auth/me`
- **THEN** ответ 200 с его id, email `buh.petrova@company.ru` и ролью `user`

## ADDED Requirements

### Requirement: Вход через Aéza
`POST /auth/login` с email и паролем аккаунта Aéza, доступный без авторизации, SHALL передавать их во вход Aéza и возвращать ответ Aéza: 200 `{challenge, requirements}`. Неверный email или пароль SHALL давать 400 `invalid_credentials`. Пароль SHALL не сохраняться и не попадать в журнал.

#### Scenario: Верный пароль
- **WHEN** пользователь отправляет верные email и пароль аккаунта Aéza без 2FA
- **THEN** ответ 200 `{challenge, requirements: []}`

#### Scenario: Неверный пароль
- **WHEN** пароль неверный
- **THEN** ответ 400 `invalid_credentials`

### Requirement: Обмен challenge на сессию
`POST /auth/use-challenge` с `challenge` SHALL обменивать его в Aéza на сессию Aéza, узнавать аккаунт, сразу закрывать сессию Aéza и, если аккаунт есть в белом списке и включён, возвращать 200 `{session, expiresAt}`, где `session` - токен нашей сессии. Аккаунт не из белого списка или отключённый SHALL давать 403 `not_a_member`, неверный или истёкший `challenge` - 400 `invalid_challenge`. Операция SHALL быть доступна без авторизации, `challenge` SHALL не попадать в журнал.

#### Scenario: Вход без 2FA
- **WHEN** участник из белого списка прошёл `POST /auth/login` и отправил полученный `challenge`
- **THEN** ответ 200 `{session, expiresAt}`; сессия Aéza закрыта

#### Scenario: Посторонний аккаунт Aéza
- **WHEN** пароль был верный, но email аккаунта нет в белом списке
- **THEN** ответ 403 `not_a_member`, сессия не создаётся, сессия Aéza закрыта

#### Scenario: Первый вход привязывает аккаунт
- **WHEN** участник, добавленный по email, входит первый раз
- **THEN** к нему привязывается id аккаунта Aéza, и дальше он находится по id, даже если email в Aéza сменился

### Requirement: Второй фактор
Если в ответе `POST /auth/login` непустой `requirements`, `POST /auth/tfa/totp` с `challenge` и кодом SHALL завершать вход так же, как `POST /auth/use-challenge`. Неверный код SHALL давать 400 `invalid_code`.

#### Scenario: Вход с 2FA
- **WHEN** у аккаунта включена 2FA, пользователь отправил `challenge` и верный код
- **THEN** ответ 200 `{session, expiresAt}`

#### Scenario: Неверный код
- **WHEN** код неверный
- **THEN** ответ 400 `invalid_code`

### Requirement: Своя сессия
Каждая операция `/api/v1`, кроме документации и шагов входа, SHALL принимать `Authorization: Bearer <session>` действующей сессии включённого участника и брать роль из белого списка; иначе SHALL быть 401 `not_auth` с заголовком `WWW-Authenticate: Bearer`. В базе SHALL храниться только хеш токена. Сессия SHALL действовать `SESSION_TTL_HOURS` часов (по умолчанию 12) с момента входа без продления.

#### Scenario: Без токена
- **WHEN** клиент вызывает операцию `/api/v1` без авторизации
- **THEN** ответ 401 `not_auth`

#### Scenario: Истёкшая сессия
- **WHEN** с момента входа прошло больше `SESSION_TTL_HOURS` часов
- **THEN** ответ 401

#### Scenario: Документация без токена
- **WHEN** клиент открывает `/api/v1/docs` без токена
- **THEN** ответ 200

### Requirement: Выход
`POST /auth/logout` SHALL удалять текущую сессию; токен после этого SHALL давать 401.

#### Scenario: Выход
- **WHEN** участник вызывает `POST /auth/logout`, затем любую операцию с тем же токеном
- **THEN** ответ 204, затем 401

### Requirement: Ключ X-API-KEY
Операции `/api/v1` SHALL принимать заголовок `X-API-KEY` - ключ аккаунта Aéza. Backend SHALL проверять его через `v2/accounts/me`, запоминать результат на 60 секунд по хешу ключа и пускать с ролью из белого списка. Ключ, отклонённый Aéza, SHALL давать 401 `not_auth`, аккаунт не из белого списка - 403 `not_a_member`. Ключ SHALL не сохраняться в базе и не попадать в журнал. Если переданы и `Authorization`, и `X-API-KEY`, SHALL использоваться `Authorization`.

#### Scenario: Внешняя система
- **WHEN** 1С передаёт `X-API-KEY` аккаунта, добавленного с ролью `integration`, и создаёт платёж
- **THEN** платёж создаётся, `created_by_login` - email этого аккаунта

#### Scenario: Кеш ключа
- **WHEN** тот же ключ приходит второй раз в течение 60 секунд
- **THEN** Aéza не вызывается повторно

### Requirement: Ограничение неудачных входов
Неудачей входа SHALL считаться ответ `invalid_credentials`, `invalid_challenge` или `invalid_code`. Если за последние 10 минут неудач не меньше 5 для этого email, не меньше 5 для IP клиента или не меньше 20 на весь сервер, шаги входа SHALL отвечать 429 `too_many_attempts` с заголовком `Retry-After` и не обращаться к Aéza. Счётчики SHALL быть общими для всех экземпляров `api`.

#### Scenario: Перебор пароля одного аккаунта
- **WHEN** для одного email уже было 5 неудачных входов за 10 минут
- **THEN** шестая попытка получает 429 без запроса в Aéza

#### Scenario: Ошибки разных людей
- **WHEN** за 10 минут было 20 неудачных входов с разных email и IP
- **THEN** следующий вход любого участника получает 429, пока окно не освободится

### Requirement: API Aéza недоступен
Если API Aéza не отвечает за 10 секунд, отвечает 5xx или в неожиданном формате, вход и проверка нового `X-API-KEY` SHALL давать 503 `identity_unavailable`. Уже выданные сессии SHALL работать без обращения к Aéza.

#### Scenario: Сбой Aéza
- **WHEN** API Aéza недоступен и участник с действующей сессией запрашивает список платежей
- **THEN** операция выполняется

#### Scenario: Вход при сбое Aéza
- **WHEN** API Aéza недоступен и пользователь пытается войти
- **THEN** ответ 503 `identity_unavailable`
