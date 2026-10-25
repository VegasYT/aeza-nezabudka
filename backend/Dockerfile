# Один образ для api, worker и migrate; процесс выбирается командой контейнера.
FROM ghcr.io/astral-sh/uv:0.12.16 AS uv

FROM python:3.12-slim
COPY --from=uv /uv /usr/local/bin/uv

ENV PYTHONUNBUFFERED=1 \
    UV_COMPILE_BYTECODE=1 \
    UV_LINK_MODE=copy \
    UV_PYTHON_DOWNLOADS=never \
    UV_PROJECT_ENVIRONMENT=/opt/venv \
    PATH="/opt/venv/bin:$PATH"

WORKDIR /app

# Зависимости отдельным слоем: при правке кода он берётся из кеша.
COPY pyproject.toml uv.lock .python-version ./
RUN uv sync --frozen --no-dev --no-install-project

COPY . .
RUN useradd --system --uid 10001 --no-create-home app
USER app

EXPOSE 8000
# api: python -m app.main; worker: python -m app.worker; migrate: alembic upgrade head
CMD ["python", "-m", "app.main"]
