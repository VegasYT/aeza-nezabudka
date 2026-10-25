from pathlib import Path

from core.config import (
    IdentitySettings,
    IntegrationSettings,
    ReminderSettings,
    SeedSettings,
    Settings,
)

ENV_EXAMPLE = Path(__file__).resolve().parent.parent / ".env.example"


def test_env_example_lists_every_setting() -> None:
    names = set()
    for line in ENV_EXAMPLE.read_text(encoding="utf-8").splitlines():
        candidate = line.removeprefix("# ").split("=", 1)[0]
        if "=" in line and candidate.isupper():
            names.add(candidate)
    expected = {
        name.upper()
        for name in (
            *Settings.model_fields,
            *IdentitySettings.model_fields,
            *SeedSettings.model_fields,
            *ReminderSettings.model_fields,
            *IntegrationSettings.model_fields,
        )
    }

    assert names == expected
