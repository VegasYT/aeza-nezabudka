import httpx
import pytest

from tests.app.test_contract import ID, OPERATIONS, PUBLIC
from tests.auth_helpers import make_token

USER_TOKEN = make_token(roles=("user",), login="buh.petrova")
INTEGRATION_TOKEN = make_token(roles=("integration", "user"), login="service-account-1c")

# Операции, которые каждой роли запрещены (authorization spec, матрица design).
FORBIDDEN = {
    "user": {
        "list_users",
        "create_user",
        "update_user",
        "delete_user",
        "create_recurring_payment",
        "update_recurring_payment",
        "stop_recurring_payment",
        "resume_recurring_payment",
        "create_department",
        "update_department",
        "delete_department",
        "list_group_chats",
        "create_group_chat_link",
        "update_group_chat",
        "delete_group_chat",
        "list_audit_log",
    },
    "integration": {
        "list_users",
        "create_user",
        "update_user",
        "delete_user",
        "create_department",
        "update_department",
        "delete_department",
        "get_telegram_status",
        "create_telegram_link",
        "update_telegram_settings",
        "unlink_telegram",
        "list_group_chats",
        "create_group_chat_link",
        "update_group_chat",
        "delete_group_chat",
        "list_audit_log",
    },
}
TOKENS = {"user": USER_TOKEN, "integration": INTEGRATION_TOKEN}


async def _call(client: httpx.AsyncClient, name: str, token: str | None) -> httpx.Response:
    method, path, body = OPERATIONS[name]
    headers = {"Authorization": f"Bearer {token}"} if token else {}
    return await client.request(method, path, json=body, headers=headers)


@pytest.mark.parametrize("name", sorted(set(OPERATIONS) - PUBLIC))
async def test_operation_requires_token(offline_client: httpx.AsyncClient, name: str) -> None:
    response = await _call(offline_client, name, None)

    assert response.status_code == 401
    assert response.json()["error"] == "not_auth"
    assert response.headers["WWW-Authenticate"] == "Bearer"


@pytest.mark.parametrize(
    ("role", "name"),
    [(role, name) for role in TOKENS for name in sorted(set(OPERATIONS) - PUBLIC)],
)
async def test_role_matrix(offline_client: httpx.AsyncClient, role: str, name: str) -> None:
    response = await _call(offline_client, name, TOKENS[role])

    if name in FORBIDDEN[role]:
        assert response.status_code == 403
        assert response.json()["error"] == "forbidden"
    else:
        assert response.status_code in (200, 501)


async def test_forbidden_comes_before_not_found_and_validation(
    offline_client: httpx.AsyncClient,
) -> None:
    headers = {"Authorization": f"Bearer {USER_TOKEN}"}

    missing = await offline_client.delete(f"/api/v1/users/{ID}", headers=headers)
    invalid = await offline_client.patch("/api/v1/users/not-a-uuid", json={}, headers=headers)

    assert (missing.status_code, invalid.status_code) == (403, 403)


async def test_unknown_token_is_unauthorized(offline_client: httpx.AsyncClient) -> None:
    response = await offline_client.get(
        "/api/v1/auth/me", headers={"Authorization": "Bearer not-a-session"}
    )

    assert response.status_code == 401


@pytest.mark.parametrize("name", sorted(PUBLIC))
async def test_sign_in_needs_no_token(offline_client: httpx.AsyncClient, name: str) -> None:
    response = await _call(offline_client, name, None)

    assert response.status_code == 501


async def test_current_user_comes_from_token(offline_client: httpx.AsyncClient) -> None:
    response = await offline_client.get(
        "/api/v1/auth/me", headers={"Authorization": f"Bearer {USER_TOKEN}"}
    )

    assert response.status_code == 200
    assert response.json() == {
        "id": "2f6c4a1e-8d3b-4c5a-9e7f-1a2b3c4d5e6f",
        "email": "buh.petrova",
        "role": "user",
    }


async def test_docs_do_not_need_token(offline_client: httpx.AsyncClient) -> None:
    assert (await offline_client.get("/api/v1/docs")).status_code == 200
