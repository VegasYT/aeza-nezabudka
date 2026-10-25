#!/bin/sh
# Выкладка на сервере: пересобрать изменившиеся образы и перезапустить сервисы.
# Код в каталог приносит GitHub Actions (rsync), сервер в GitHub не ходит: репозиторий закрытый.
# Вручную на сервере: sh /opt/nezabudka/infra/deploy.sh
set -eu

# две выкладки одновременно сломали бы друг другу сборку
exec 9>/tmp/nezabudka-deploy.lock
flock 9

cd "$(dirname "$0")/.."
COMPOSE="docker compose -f infra/compose.prod.yaml"
# Без аттестаций сборки неизменённый образ сохраняет id, и его сервис не перезапускается зря.
export BUILDX_NO_DEFAULT_ATTESTATIONS=1

# frontend и backend собираются по очереди: вместе им может не хватить памяти сервера
$COMPOSE build migrate
$COMPOSE build frontend
$COMPOSE build
# без --build: с ним compose пишет в метку контейнера устаревший digest образа
# и при каждой выкладке пересоздаёт api и worker
$COMPOSE up -d --remove-orphans
# Конфиги подключены томами: их правку compose не видит, поэтому сервис перезапускается
# при смене хеша каталога. Первый запуск только запоминает хеши.
for pair in caddy:infra/caddy prometheus:infra/prometheus loki:infra/loki \
	promtail:infra/promtail grafana:infra/grafana garage:infra/garage; do
	service=${pair%%:*}
	sum=$(find "${pair#*:}" -type f | sort | xargs sha256sum | sha256sum | cut -d' ' -f1)
	state="$HOME/.nezabudka-config-$service"
	if [ "$sum" != "$(cat "$state" 2>/dev/null)" ]; then
		[ -f "$state" ] && $COMPOSE restart "$service"
		echo "$sum" > "$state"
	fi
done
# старые слои и кэш сборки старше недели, иначе диск сервера заполнится
docker image prune --force > /dev/null
docker builder prune --force --filter until=168h > /dev/null

if [ -f REVISION ]; then
	echo "Выложен коммит $(cat REVISION)"
fi
$COMPOSE ps --format 'table {{.Service}}\t{{.Status}}'
