## MODIFIED Requirements

### Requirement: Адреса
Наружу SHALL быть открыты только порты 80 и 443 прокси. Панель SHALL отвечать на `https://<домен>`, API - на `https://<домен>/api/v1`, `www.<домен>` SHALL перенаправлять на основной адрес, Grafana SHALL открываться на `https://grafana.<домен>` только с паролем администратора, pgAdmin - на `https://pgadmin.<домен>` только со своим email и паролем, Kafka UI с профилем `integration` - на `https://kafka.<домен>` только с паролем и только для чтения. `/metrics`, `/healthz` и `/readyz` процессов, PostgreSQL, Prometheus и Loki SHALL быть недоступны из интернета.

#### Scenario: Метрики закрыты
- **WHEN** клиент из интернета запрашивает `https://<домен>/metrics`
- **THEN** ответ - страница панели, а не метрики backend

#### Scenario: pgAdmin без входа
- **WHEN** клиент из интернета открывает `https://pgadmin.<домен>` без входа
- **THEN** он видит страницу входа pgAdmin, данные базы недоступны

#### Scenario: Kafka UI
- **WHEN** набор поднят с `COMPOSE_PROFILES=integration` и открыт `https://kafka.<домен>`
- **THEN** видна форма входа; после входа - топик `invoice-keeper.events`, менять ничего нельзя

