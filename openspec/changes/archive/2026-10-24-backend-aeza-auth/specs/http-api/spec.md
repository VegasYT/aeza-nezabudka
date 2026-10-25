# Spec Delta

## MODIFIED Requirements

### Requirement: Общие соглашения формата
Контракт SHALL следовать соглашениям Aéza v2 (ADR-015): тела запросов и ответов и параметры запроса - JSON с именами в camelCase. Идентификаторы SHALL быть UUID. Суммы SHALL передаваться целым числом в минимальных единицах валюты (`amountMinor`) вместе с кодом валюты `RUB`, `USD` или `EUR`. Даты без времени SHALL иметь формат `ГГГГ-ММ-ДД`, моменты времени - ISO 8601 в UTC. Имена полей в спецификациях capability даны так, как они названы в коде (snake_case); в контракте им соответствуют имена в camelCase.

#### Scenario: Сумма и валюта
- **WHEN** контракт описывает сумму платежа
- **THEN** это целое поле `amountMinor` и поле `currency` со значениями `RUB`, `USD`, `EUR`

#### Scenario: Срок оплаты
- **WHEN** контракт описывает срок или дату оплаты
- **THEN** это строка в формате даты без времени (`dueDate`, `paidOn`)

#### Scenario: Параметр фильтра
- **WHEN** клиент фильтрует периоды по платежу
- **THEN** параметр запроса называется `recurringPaymentId`

### Requirement: Списки с пагинацией
Каждая операция, которая возвращает список, SHALL отвечать объектом `{items, total}` и принимать параметры `limit` (от 1 до 100, по умолчанию 50) и `offset` (от 0, по умолчанию 0).

#### Scenario: Параметры по умолчанию
- **WHEN** клиент запрашивает список без `limit` и `offset`
- **THEN** контракт задаёт `limit` 50 и `offset` 0, в ответе только `items` и `total`

#### Scenario: Слишком большая страница
- **WHEN** клиент передаёт `limit=500`
- **THEN** ответ 400 `bad_request`, в `payload` указано поле `limit`

### Requirement: Ошибки описаны в контракте
Каждая операция SHALL описывать в контракте ответы с ошибками в общем формате: 401 для операций с авторизацией, 403 для операций только администратора, 404 для операций с `{id}`, 409 там, где операция невозможна в текущем состоянии, и 400 для операций с параметрами или телом. В спецификациях capability ответ "422" с `fields` SHALL означать 400 `bad_request` со списком полей в `payload`, а коды вида `*_not_found` - 404 `not_found` с `{entity, id}`.

#### Scenario: Операция администратора
- **WHEN** клиент читает описание `POST /recurring-payments`
- **THEN** в нём есть ответы 400, 401 и 403 со схемой общего формата ошибок

#### Scenario: Не найдено
- **WHEN** клиент запрашивает `GET /recurring-payments/{id}` с неизвестным id
- **THEN** ответ 404 `not_found`, `payload` - `{"entity": "RecurringPayment", "id": "<id>"}`

### Requirement: Ещё не реализованные операции
Пока логика операции не реализована, операция SHALL отвечать 501 с `error` `not_implemented` и текстом на русском в общем формате ошибок, после проверки токена, роли и параметров и тела по контракту.

#### Scenario: Корректный запрос
- **WHEN** клиент с действующим токеном и подходящей ролью вызывает нереализованную операцию с корректными параметрами
- **THEN** ответ 501 с `error` `not_implemented` и `message` "Операция ещё не реализована"

#### Scenario: Некорректный запрос
- **WHEN** клиент с действующим токеном вызывает нереализованную операцию с телом, которое не проходит проверку
- **THEN** ответ 400 `bad_request`, а не 501

#### Scenario: Без токена
- **WHEN** клиент вызывает нереализованную операцию без токена
- **THEN** ответ 401 `not_auth`, а не 501

### Requirement: Состав эндпоинтов
Контракт SHALL содержать операции под `/api/v1`: `POST /auth/login`; `POST /auth/use-challenge`; `POST /auth/tfa/totp`; `POST /auth/logout`; `GET /auth/me`; `GET`, `POST /recurring-payments`; `GET`, `PATCH`, `DELETE /recurring-payments/{id}`; `GET /payment-occurrences`; `GET`, `PATCH /payment-occurrences/{id}`; `GET /payments/summary`; `GET`, `POST /users`; `PATCH`, `DELETE /users/{id}`; `GET`, `POST /departments`; `PATCH`, `DELETE /departments/{id}`; `GET`, `PATCH`, `DELETE /me/telegram`; `POST /me/telegram/link`.

#### Scenario: Все операции на месте
- **WHEN** клиент читает `/api/v1/openapi.json`
- **THEN** в нём есть каждая перечисленная операция с описанием на русском

### Requirement: Безопасность в контракте
Контракт SHALL описывать две схемы безопасности: `bearer` (HTTP bearer, `session` из `POST /auth/use-challenge` или `POST /auth/tfa/totp`) и `X-API-KEY` (ключ аккаунта Aéza в заголовке). Каждая операция `/api/v1`, кроме документации и шагов входа (`POST /auth/login`, `POST /auth/use-challenge`, `POST /auth/tfa/totp`), SHALL принимать любую из них. Swagger SHALL позволять вставить токен или ключ кнопкой Authorize.

#### Scenario: Операция требует авторизации
- **WHEN** клиент читает описание любой операции `/api/v1`, кроме входа
- **THEN** у операции указаны схемы `bearer` и `X-API-KEY`

#### Scenario: Вход без авторизации
- **WHEN** клиент читает описание `POST /auth/login`
- **THEN** схема безопасности у операции не указана, описаны ответы 400, 429 и 503

#### Scenario: Вход из Swagger
- **WHEN** пользователь проходит `POST /auth/login` и `POST /auth/use-challenge` в `/api/v1/docs` и вставляет `session` в Authorize
- **THEN** Swagger отправляет `Authorization: Bearer` в следующих запросах
