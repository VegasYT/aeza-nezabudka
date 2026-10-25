# syntax=docker/dockerfile:1
# Сборка frontend и раздача статики. Контекст сборки - frontend/:
#   docker build -f infra/frontend/Dockerfile frontend
# Файл лежит в infra/, чтобы выкладка не требовала правок в frontend/.
FROM node:22-alpine AS build
WORKDIR /src
RUN corepack enable
# зависимости отдельным слоем: он переиспользуется, пока не менялся pnpm-lock.yaml
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile
COPY . .
RUN pnpm build

FROM caddy:2.10-alpine
COPY --from=build /src/dist /srv
# HTTPS и домены - забота внешнего прокси (infra/caddy/Caddyfile), здесь обычный HTTP.
COPY <<'EOF' /etc/caddy/Caddyfile
{
	admin off
	auto_https off
}

:80 {
	root * /srv
	encode zstd gzip
	# адреса страниц обрабатывает роутер в браузере: неизвестный путь отдаёт index.html
	try_files {path} /index.html
	file_server

	# имена файлов сборки содержат хеш содержимого и не меняются
	@assets path /assets/*
	header @assets Cache-Control "public, max-age=31536000, immutable"

	# index.html браузер сверяет с сервером при каждом открытии, иначе после выкладки
	# он держит старую страницу со ссылками на старую сборку
	@pages not path /assets/*
	header @pages Cache-Control "no-cache"
}
EOF
