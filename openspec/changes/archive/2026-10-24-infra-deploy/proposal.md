# Proposal

## Why

Система должна работать на сервере жюри по адресу `nezabudka.space` и обновляться без ручных шагов. Этапы "Фундамент" (compose) и "CI и выкладка" из `docs/plan.md` не сделаны: в репозитории нет ни описания набора для сервера, ни workflow.

## What Changes

- `infra/compose.prod.yaml`: Caddy с HTTPS, frontend, backend (`migrate`, `api`, `worker`), PostgreSQL, Prometheus, Loki, Promtail, Grafana; Kafka и команда тестовых данных - в профилях.
- Адреса: панель и API на `nezabudka.space`, `www` перенаправляет на основной адрес, Grafana на `grafana.nezabudka.space` с паролем (ADR-009 изменён).
- Образ frontend собирается по `infra/frontend/Dockerfile` из `frontend/` без правок в нём.
- `.github/workflows/main.yml`: выкладка из `main`: код копируется на сервер по SSH (репозиторий закрытый, сервер в GitHub не ходит), затем `infra/deploy.sh`. Тестов и линтеров в workflow нет, чтобы выкладка шла быстро: их запускают локально перед слиянием.
- `infra/README.md`: настройка сервера, DNS, секреты GitHub.

## Capabilities

### New Capabilities

- `deployment`: состав набора на сервере, адреса и выкладка.

### Modified Capabilities

Нет.

## Impact

- `infra/`, `.github/workflows/`, `docs/ADR.md` (ADR-009), `docs/plan.md`.
- Код backend и frontend не меняется.
