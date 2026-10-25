## ADDED Requirements

### Requirement: Интеграция не входит паролем
Для участника с ролью `integration` `POST /auth/use-challenge` и `POST /auth/tfa/totp` SHALL отвечать 403 `integration_account` и не создавать сессию. Доступ по `X-API-KEY` SHALL работать как раньше.

#### Scenario: Вход аккаунтом интеграции
- **WHEN** аккаунт с ролью `integration` проходит пароль Aéza и отправляет `challenge`
- **THEN** ответ 403 `integration_account`, сессии нет
