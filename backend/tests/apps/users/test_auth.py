"""Вход через Aéza, свои сессии, X-API-KEY и пределы неудачных входов."""

from datetime import timedelta

import httpx
import pytest

from tests.apps.users.conftest import ADMIN_EMAIL, AuthClock, bearer, login, sign_in
from tests.apps.users.fakes import FakeAeza

pytestmark = pytest.mark.integration


async def _add(
    api: httpx.AsyncClient, admin: dict[str, str], email: str, role: str = "user"
) -> str:
    response = await api.post("/api/v1/users", json={"email": email, "role": role}, headers=admin)
    assert response.status_code == 201, response.text
    return str(response.json()["id"])


async def test_login_steps_give_session_and_close_aeza_session(
    api: httpx.AsyncClient, aeza: FakeAeza
) -> None:
    first = await login(api, ADMIN_EMAIL.upper())
    second = await api.post(
        "/api/v1/auth/use-challenge", json={"challenge": first.json()["challenge"]}
    )

    assert first.json() == {"challenge": first.json()["challenge"], "requirements": []}
    body = second.json()
    assert set(body) == {"session", "expiresAt"}
    assert len(body["session"]) == 43
    me = await api.get("/api/v1/auth/me", headers={"Authorization": f"Bearer {body['session']}"})
    assert me.json()["email"] == ADMIN_EMAIL
    assert me.json()["role"] == "admin"
    assert aeza.open_sessions() == 0


async def test_login_audit_names_ip_and_browser(api: httpx.AsyncClient) -> None:
    first = await login(api, ADMIN_EMAIL, ip="10.0.0.7")
    second = await api.post(
        "/api/v1/auth/use-challenge",
        json={"challenge": first.json()["challenge"]},
        headers={"X-Forwarded-For": "10.0.0.7", "User-Agent": "Mozilla/5.0 " + "x" * 400},
    )
    admin = {"Authorization": f"Bearer {second.json()['session']}"}

    entries = (await api.get("/api/v1/audit-log", headers=admin)).json()["items"]
    entry = next(e for e in entries if e["action"] == "auth.login")
    assert entry["details"] == {"ip": "10.0.0.7", "userAgent": ("Mozilla/5.0 " + "x" * 400)[:300]}


async def test_wrong_password(api: httpx.AsyncClient) -> None:
    response = await login(api, ADMIN_EMAIL, "wrong")

    assert (response.status_code, response.json()["error"]) == (400, "invalid_credentials")


async def test_stale_challenge(api: httpx.AsyncClient) -> None:
    response = await api.post("/api/v1/auth/use-challenge", json={"challenge": "stale"})

    assert (response.status_code, response.json()["error"]) == (400, "invalid_challenge")


async def test_account_outside_white_list(api: httpx.AsyncClient, aeza: FakeAeza) -> None:
    aeza.add("stranger@mail.ru")

    response = await sign_in(api, "stranger@mail.ru")

    assert (response.status_code, response.json()["error"]) == (403, "not_a_member")
    assert aeza.open_sessions() == 0


async def test_second_factor(api: httpx.AsyncClient, aeza: FakeAeza) -> None:
    admin = await bearer(api, ADMIN_EMAIL)
    aeza.add("buh@company.ru", tfa_code="123456")
    await _add(api, admin, "buh@company.ru")

    first = await login(api, "buh@company.ru")
    challenge = first.json()["challenge"]
    wrong = await api.post("/api/v1/auth/tfa/totp", json={"challenge": challenge, "code": "000000"})
    right = await api.post("/api/v1/auth/tfa/totp", json={"challenge": challenge, "code": "123456"})

    assert first.json()["requirements"] == ["totp"]
    assert (wrong.status_code, wrong.json()["error"]) == (400, "invalid_code")
    assert right.status_code == 200
    assert "session" in right.json()


async def test_first_login_binds_account(api: httpx.AsyncClient, aeza: FakeAeza) -> None:
    admin = await bearer(api, ADMIN_EMAIL)
    aeza.add("buh@company.ru")
    member_id = await _add(api, admin, "buh@company.ru")
    await sign_in(api, "buh@company.ru")

    aeza.rename("buh@company.ru", "petrova@company.ru")
    again = await sign_in(api, "petrova@company.ru")
    me = await api.get(
        "/api/v1/auth/me", headers={"Authorization": f"Bearer {again.json()['session']}"}
    )

    assert me.json()["id"] == member_id
    listed = (await api.get("/api/v1/users", headers=admin)).json()["items"]
    assert listed[0]["linked"] is True


async def test_logout_ends_session(api: httpx.AsyncClient) -> None:
    admin = await bearer(api, ADMIN_EMAIL)

    logout = await api.post("/api/v1/auth/logout", headers=admin)
    after = await api.get("/api/v1/auth/me", headers=admin)

    assert (logout.status_code, after.status_code) == (204, 401)


async def test_session_expires(api: httpx.AsyncClient, clock: AuthClock) -> None:
    admin = await bearer(api, ADMIN_EMAIL)

    clock.shift = timedelta(hours=12, seconds=1)

    assert (await api.get("/api/v1/auth/me", headers=admin)).status_code == 401


async def test_disabled_member_loses_access_at_once(api: httpx.AsyncClient, aeza: FakeAeza) -> None:
    admin = await bearer(api, ADMIN_EMAIL)
    aeza.add("buh@company.ru")
    member_id = await _add(api, admin, "buh@company.ru")
    user = await bearer(api, "buh@company.ru")

    await api.patch(f"/api/v1/users/{member_id}", json={"enabled": False}, headers=admin)

    assert (await api.get("/api/v1/auth/me", headers=user)).status_code == 401
    assert (await sign_in(api, "buh@company.ru")).json()["error"] == "not_a_member"


async def test_failures_per_email_are_limited(api: httpx.AsyncClient, aeza: FakeAeza) -> None:
    for attempt in range(5):
        await login(api, ADMIN_EMAIL, "wrong", ip=f"10.0.1.{attempt}")
    calls = len(aeza.calls)

    blocked = await login(api, ADMIN_EMAIL, ip="10.0.2.1")

    assert (blocked.status_code, blocked.json()["error"]) == (429, "too_many_attempts")
    assert 1 <= int(blocked.headers["Retry-After"]) <= 600
    assert len(aeza.calls) == calls


async def test_failures_across_server_are_limited(api: httpx.AsyncClient, clock: AuthClock) -> None:
    for attempt in range(20):
        await login(api, f"user{attempt}@mail.ru", "wrong", ip=f"10.1.0.{attempt}")

    blocked = await login(api, ADMIN_EMAIL, ip="10.2.0.1")
    clock.shift = timedelta(minutes=10, seconds=1)
    later = await sign_in(api, ADMIN_EMAIL, ip="10.2.0.1")

    assert blocked.status_code == 429
    assert later.status_code == 200


async def test_api_key_with_cache(api: httpx.AsyncClient, aeza: FakeAeza) -> None:
    admin = await bearer(api, ADMIN_EMAIL)
    aeza.add("erp@company.ru", api_key="1308_key")
    await _add(api, admin, "erp@company.ru", role="integration")
    key = {"X-API-KEY": "1308_key"}

    first = await api.get("/api/v1/auth/me", headers=key)
    second = await api.get("/api/v1/recurring-payments", headers=key)

    assert first.json()["role"] == "integration"
    assert second.status_code == 200
    assert aeza.calls.count("account") == 2  # вход администратора и первый запрос с ключом


async def test_api_key_outside_white_list(api: httpx.AsyncClient, aeza: FakeAeza) -> None:
    aeza.add("other@mail.ru", api_key="foreign")

    unknown = await api.get("/api/v1/auth/me", headers={"X-API-KEY": "nope"})
    foreign = await api.get("/api/v1/auth/me", headers={"X-API-KEY": "foreign"})

    assert unknown.status_code == 401
    assert (foreign.status_code, foreign.json()["error"]) == (403, "not_a_member")


async def test_sessions_survive_aeza_outage(api: httpx.AsyncClient, aeza: FakeAeza) -> None:
    admin = await bearer(api, ADMIN_EMAIL)
    aeza.available = False

    me = await api.get("/api/v1/auth/me", headers=admin)
    sign_in = await login(api, ADMIN_EMAIL)

    assert me.status_code == 200
    assert (sign_in.status_code, sign_in.json()["error"]) == (503, "identity_unavailable")


async def test_integration_cannot_sign_in_with_password(
    api: httpx.AsyncClient, aeza: FakeAeza
) -> None:
    admin = await bearer(api, ADMIN_EMAIL)
    aeza.add("erp@company.ru", api_key="1308_key")
    await _add(api, admin, "erp@company.ru", role="integration")

    first = await login(api, "erp@company.ru")
    denied = await api.post(
        "/api/v1/auth/use-challenge", json={"challenge": first.json()["challenge"]}
    )
    by_key = await api.get("/api/v1/auth/me", headers={"X-API-KEY": "1308_key"})

    assert (denied.status_code, denied.json()["error"]) == (403, "integration_account")
    assert "session" not in denied.json()
    assert by_key.json()["role"] == "integration"


async def test_role_change_closes_sessions(api: httpx.AsyncClient, aeza: FakeAeza) -> None:
    admin = await bearer(api, ADMIN_EMAIL)
    aeza.add("buh@company.ru")
    member_id = await _add(api, admin, "buh@company.ru")
    buh = await bearer(api, "buh@company.ru")

    same = await api.patch(f"/api/v1/users/{member_id}", json={"role": "user"}, headers=admin)
    still = await api.get("/api/v1/auth/me", headers=buh)
    await api.patch(f"/api/v1/users/{member_id}", json={"role": "integration"}, headers=admin)
    closed = await api.get("/api/v1/auth/me", headers=buh)

    assert (same.status_code, still.status_code) == (200, 200)
    assert closed.status_code == 401


async def test_api_key_marks_last_seen(
    api: httpx.AsyncClient, aeza: FakeAeza, clock: AuthClock
) -> None:
    admin = await bearer(api, ADMIN_EMAIL)
    aeza.add("erp@company.ru", api_key="1308_key")
    member_id = await _add(api, admin, "erp@company.ru", role="integration")

    before = (await api.get("/api/v1/users", headers=admin)).json()["items"]
    await api.get("/api/v1/auth/me", headers={"X-API-KEY": "1308_key"})
    after = (await api.get("/api/v1/users", headers=admin)).json()["items"]

    seen = {m["id"]: m["lastSeenAt"] for m in after}
    assert {m["id"]: m["lastSeenAt"] for m in before}[member_id] is None
    assert seen[member_id] is not None
