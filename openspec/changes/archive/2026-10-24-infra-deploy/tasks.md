# Tasks

## 1. Набор и выкладка

- [x] 1.1 `infra/compose.prod.yaml`, Caddy, образ frontend, наблюдаемость, `infra/.env.example`, `infra/deploy.sh`; проверка: набор поднят локально, панель, API и Grafana отвечают, `/metrics` закрыт.
- [x] 1.2 `.github/workflows/main.yml`, `infra/README.md`, ADR-009, `docs/plan.md`.

## 2. Сервер

- [x] 2.1 Docker, пользователь `deploy`, ufw, `/opt/nezabudka`, `infra/.env`; первая выкладка.
- [x] 2.2 Секреты GitHub; выкладка из `main` проходит; проверка https://nezabudka.space, вход через Aéza, Grafana.
