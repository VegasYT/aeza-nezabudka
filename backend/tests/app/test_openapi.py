import yaml

from app.export_openapi import OPENAPI_PATH, build_openapi


def test_committed_contract_matches_application() -> None:
    committed = yaml.safe_load(OPENAPI_PATH.read_text(encoding="utf-8"))
    current = build_openapi()

    differing = sorted(
        set(committed["paths"]) ^ set(current["paths"])
        | {
            path
            for path in current["paths"]
            if committed["paths"].get(path) != current["paths"][path]
        }
    )
    assert committed == current, (
        "api/openapi.yaml устарел, выгрузи заново: uv run python -m app.export_openapi; "
        f"расходятся пути: {differing or 'компоненты'}"
    )
