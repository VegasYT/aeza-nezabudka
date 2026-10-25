import httpx

from tests.auth_helpers import make_token


async def test_settings_for_any_role(offline_client: httpx.AsyncClient) -> None:
    headers = {"Authorization": f"Bearer {make_token(roles=('integration',))}"}

    response = await offline_client.get("/api/v1/settings", headers=headers)

    assert response.status_code == 200, response.text
    body = response.json()
    assert set(body) == {"today", "timezone", "reminderDaysBefore"}
    assert (body["timezone"], body["reminderDaysBefore"]) == ("Europe/Moscow", 3)
