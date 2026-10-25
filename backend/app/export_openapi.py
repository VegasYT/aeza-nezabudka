"""Выгружает контракт приложения в `api/openapi.yaml`: `uv run python -m app.export_openapi`."""

from pathlib import Path
from typing import Any

import yaml
from pydantic import SecretStr

from app.main import create_app
from core.config import Settings

OPENAPI_PATH = Path(__file__).resolve().parent.parent / "api" / "openapi.yaml"

# Контракт не зависит от окружения: engine создаётся лениво и к этому адресу не подключается.
_EXPORT_SETTINGS = {
    "database_url": SecretStr("postgresql+asyncpg://export:export@127.0.0.1:1/export"),
    "tz": "UTC",
}


def build_openapi() -> dict[str, Any]:
    return create_app(Settings.model_validate(_EXPORT_SETTINGS)).openapi()


def render(schema: dict[str, Any]) -> str:
    return yaml.safe_dump(schema, sort_keys=False, allow_unicode=True, width=100)


def main() -> None:
    OPENAPI_PATH.parent.mkdir(exist_ok=True)
    OPENAPI_PATH.write_text(render(build_openapi()), encoding="utf-8")
    print(f"Контракт выгружен: {OPENAPI_PATH}")


if __name__ == "__main__":
    main()
