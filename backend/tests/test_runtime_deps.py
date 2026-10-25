"""Процессы запускаются без dev-зависимостей: в образе Docker их нет."""

import subprocess
import sys
from pathlib import Path

BACKEND = Path(__file__).resolve().parent.parent
# пакеты, которые ставятся только для разработки, но которые легко импортировать случайно
DEV_ONLY = ("types_aiobotocore", "mypy", "pytest", "testcontainers")

SCRIPT = f"""
import sys

class Block:
    def find_spec(self, name, path=None, target=None):
        if name.startswith({DEV_ONLY!r}):
            raise ModuleNotFoundError(name)

sys.meta_path.insert(0, Block())
import app.main, app.worker, app.seed, app.export_openapi
"""


def test_processes_import_without_dev_packages() -> None:
    result = subprocess.run(  # noqa: S603 - запускаем свой же интерпретатор со своим кодом
        [sys.executable, "-c", SCRIPT],
        cwd=BACKEND,
        capture_output=True,
        text=True,
        check=False,
    )

    assert result.returncode == 0, result.stderr
