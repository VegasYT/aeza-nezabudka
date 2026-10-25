# Инфраструктура

`compose.prod.yaml` - вся система на одном сервере: прокси Caddy с HTTPS, frontend, backend (`api`, `worker`, разовая `migrate`), PostgreSQL, S3-хранилище чеков Garage (ADR-017) и наблюдаемость (Prometheus, Loki, Promtail, Grafana, ADR-009).

## Адреса

| Адрес | Что отвечает |
| --- | --- |
| `https://nezabudka.space` | веб-панель |
| `https://nezabudka.space/api/v1` | API |
| `https://nezabudka.space/api/v1/docs` | Swagger |
| `https://www.nezabudka.space` | перенаправление на основной адрес |
| `https://grafana.nezabudka.space` | Grafana, пользователь `admin`, пароль - `GRAFANA_ADMIN_PASSWORD` |
| `https://storage.nezabudka.space` | панель хранилища чеков garage-webui: бакеты, ключи, просмотр файлов; вход - логин и пароль из `GARAGE_WEBUI_AUTH` (пароль стенда - в `/home/deploy/garage-webui-password` на сервере: `infra/` выкладка перезаписывает) |
| `https://kafka.nezabudka.space` | Kafka UI (только с `COMPOSE_PROFILES=integration`), пользователь `admin`, пароль - `KAFKA_UI_PASSWORD`; только чтение |
| `https://pgadmin.nezabudka.space` | pgAdmin, вход - `PGADMIN_EMAIL` и `PGADMIN_PASSWORD`; сервер `nezabudka` уже добавлен, пароль базы - `POSTGRES_PASSWORD` |

Наружу открыты только 80 и 443. PostgreSQL, Garage, Prometheus, Loki, `/metrics`, `/healthz` и `/readyz` процессов из интернета недоступны.

## Первая настройка сервера

Ubuntu, не меньше 2 ГБ памяти. От `root`:

```bash
apt-get update && apt-get install -y docker.io docker-compose-v2 rsync ufw
ufw allow OpenSSH && ufw allow 80/tcp && ufw allow 443 && ufw --force enable
useradd -m -s /bin/bash -G docker deploy
install -d -o deploy -g deploy /opt/nezabudka
install -d -m 700 -o deploy -g deploy /home/deploy/.ssh
# открытая часть ключа выкладки - в /home/deploy/.ssh/authorized_keys

# подкачка 2 ГБ: с Kafka и Kafka UI свободной памяти на сервере в 4 ГБ остаётся мало,
# без подкачки при нехватке ядро завершает процесс, например postgres
fallocate -l 2G /swapfile && chmod 600 /swapfile && mkswap /swapfile && swapon /swapfile
echo '/swapfile none swap sw 0 0' >> /etc/fstab
# в подкачку только при нехватке памяти, иначе туда уйдёт кеш базы
echo 'vm.swappiness=10' > /etc/sysctl.d/99-swappiness.conf && sysctl -p /etc/sysctl.d/99-swappiness.conf
```

От `deploy` в `/opt/nezabudka`: положить `infra/.env` по образцу `infra/.env.example` (пароли: `openssl rand -hex 24`; ключ Garage: `echo GK$(openssl rand -hex 12)`, его секрет и `GARAGE_RPC_SECRET`: `openssl rand -hex 32`). Ключ доступа и бакет `receipts` Garage создаёт сам при первом запуске. Остальной код приносит GitHub Actions.

DNS: записи A для `nezabudka.space`, `www.nezabudka.space`, `grafana.nezabudka.space`, `pgadmin.nezabudka.space`, `storage.nezabudka.space` и `kafka.nezabudka.space` на адрес сервера. Без них Caddy не получит сертификаты.

## Выкладка

Автоматически: коммит попадает в `main`, GitHub Actions копирует код на сервер (`rsync`, без `.git` и без `infra/.env`) и запускает `infra/deploy.sh`. Скрипт пересобирает изменившиеся образы и перезапускает сервисы, а также Caddy, Prometheus, Loki, Promtail и Grafana, если изменились их конфиги в `infra/`: файлы подключены томами, и compose сам их правку не замечает. Тестов и линтеров в workflow нет: их запускают локально перед слиянием (`backend/AGENTS.md`). Повторить выкладку вручную: Actions, workflow `deploy`, Run workflow на ветке `main`.

Вручную на сервере: `sh /opt/nezabudka/infra/deploy.sh`.

Секреты репозитория (Settings, Secrets and variables, Actions):

| Секрет | Значение |
| --- | --- |
| `DEPLOY_HOST` | адрес сервера, `193.233.247.14` |
| `DEPLOY_USER` | `deploy` |
| `DEPLOY_PATH` | `/opt/nezabudka` |
| `DEPLOY_SSH_KEY` | закрытая часть ключа выкладки целиком, без пароля |
| `DEPLOY_KNOWN_HOSTS` | вывод `ssh-keyscan <адрес сервера>` |


## Локальная работа над frontend

`compose.dev.yaml` - PostgreSQL, Garage для чеков, миграции, тестовые данные и `api` на `http://localhost:8000` с входом без Aéza. Нужен только Docker:

```bash
docker compose -f infra/compose.dev.yaml up -d --build
```

Пароль для всех - `dev` (другой - через переменную `DEV_LOGIN_PASSWORD`):

| Email | Роль | Что проверить |
| --- | --- | --- |
| `admin@dev.local` | администратор | вход без 2FA |
| `admin+2fa@dev.local` | администратор | экран кода 2FA, код `000000` |
| `user@dev.local` | пользователь | ограничения роли |

Email не из списка получает 403 `not_a_member`, неверный пароль - 400, после 5 ошибок - 429, как в проде. Ключ `X-API-KEY: dev:<email>:<пароль>` работает как ключ Aéza. Аккаунты Aéza из `ADMIN_EMAILS` и белого списка входят как обычно, через Aéza. Других участников добавляет администратор через `/api/v1/users`. Напоминаний нет: `worker` и Telegram в этот набор не входят.

Vite перенаправляет запросы к API на этот backend, в `frontend/vite.config.ts`:

```ts
server: { proxy: { '/api': 'http://localhost:8000' } }
```

Остановить - `docker compose -f infra/compose.dev.yaml down`, стереть данные - то же с `-v`.

Тот же вход можно включить на сервере: `APP_ENV=development` и `DEV_LOGIN_PASSWORD` в `infra/.env`, dev-email в `ADMIN_EMAILS`, затем `sh infra/deploy.sh`. Общий пароль действует только для `@dev.local`, остальные входят через Aéza как обычно. Пароль общий для всех, поэтому перед показом обе строки лучше убрать.

## Обслуживание

```bash
cd /opt/nezabudka
docker compose -f infra/compose.prod.yaml ps
docker compose -f infra/compose.prod.yaml logs -f api worker
docker compose -f infra/compose.prod.yaml run --rm seed     # тестовые данные демо
```

Данные PostgreSQL, Garage, Grafana, Prometheus и Loki лежат в именованных томах и переживают перезапуск и выкладку. Чеки хранятся не в базе, а в томах Garage (`garage-meta`, `garage-data`): резервная копия базы их не включает, копировать нужно оба.

Своё S3-хранилище заказчика вместо Garage: `S3_ENDPOINT_URL`, `S3_BUCKET`, `S3_REGION` и ключи в `infra/.env`; бакет создаётся заранее. Объекты без записи о чеке (после отмены оплаты или сбоя) `worker` удаляет раз в час, когда им больше суток.
