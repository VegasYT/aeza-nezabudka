"""Белый список через API: добавление, изменение, удаление, защита администраторов."""

import httpx
import pytest
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from apps.users.models import Member
from tests.apps.users.conftest import ADMIN_EMAIL, bearer

pytestmark = pytest.mark.integration

MISSING = "3c2b1a09-8f7e-4d6c-9b5a-4f3e2d1c0b9a"


async def test_add_member(api: httpx.AsyncClient) -> None:
    admin = await bearer(api, ADMIN_EMAIL)

    created = await api.post(
        "/api/v1/users", json={"email": "Buh.Petrova@Company.ru"}, headers=admin
    )

    body = created.json()
    assert created.status_code == 201
    assert (body["email"], body["role"], body["enabled"], body["linked"]) == (
        "buh.petrova@company.ru",
        "user",
        True,
        False,
    )
    assert body["lastLoginAt"] is None


async def test_list_shows_admins_from_settings_first(api: httpx.AsyncClient) -> None:
    admin = await bearer(api, ADMIN_EMAIL)
    await api.post("/api/v1/users", json={"email": "b@company.ru"}, headers=admin)
    await api.post(
        "/api/v1/users", json={"email": "a@company.ru", "role": "integration"}, headers=admin
    )

    listed = (await api.get("/api/v1/users", headers=admin)).json()

    assert [(m["email"], m["role"], m["editable"]) for m in listed["items"]] == [
        (ADMIN_EMAIL, "admin", False),
        ("a@company.ru", "integration", True),
        ("b@company.ru", "user", True),
    ]
    assert listed["total"] == 3


async def test_email_must_be_unique_and_role_not_admin(api: httpx.AsyncClient) -> None:
    admin = await bearer(api, ADMIN_EMAIL)
    await api.post("/api/v1/users", json={"email": "buh@company.ru"}, headers=admin)

    taken = await api.post("/api/v1/users", json={"email": "BUH@company.ru"}, headers=admin)
    as_admin = await api.post(
        "/api/v1/users", json={"email": "x@company.ru", "role": "admin"}, headers=admin
    )
    bad_email = await api.post("/api/v1/users", json={"email": "not-an-email"}, headers=admin)

    assert (taken.status_code, taken.json()["error"]) == (409, "login_taken")
    assert as_admin.status_code == 400
    assert bad_email.status_code == 400


async def test_change_role(api: httpx.AsyncClient) -> None:
    admin = await bearer(api, ADMIN_EMAIL)
    member = (
        await api.post("/api/v1/users", json={"email": "buh@company.ru"}, headers=admin)
    ).json()

    changed = await api.patch(
        f"/api/v1/users/{member['id']}", json={"role": "integration"}, headers=admin
    )

    assert changed.json()["role"] == "integration"


async def test_delete_member(
    api: httpx.AsyncClient, session_factory: async_sessionmaker[AsyncSession]
) -> None:
    admin = await bearer(api, ADMIN_EMAIL)
    member = (
        await api.post("/api/v1/users", json={"email": "buh@company.ru"}, headers=admin)
    ).json()

    deleted = await api.delete(f"/api/v1/users/{member['id']}", headers=admin)
    again = await api.delete(f"/api/v1/users/{member['id']}", headers=admin)

    assert deleted.status_code == 204
    assert (again.status_code, again.json()["error"]) == (404, "not_found")
    async with session_factory() as session:
        assert await session.scalar(select(Member).where(Member.email == "buh@company.ru")) is None


async def test_admin_from_settings_is_protected(
    api: httpx.AsyncClient, session_factory: async_sessionmaker[AsyncSession]
) -> None:
    admin = await bearer(api, ADMIN_EMAIL)
    async with session_factory() as session:
        admin_id = await session.scalar(select(Member.id).where(Member.email == ADMIN_EMAIL))

    deleted = await api.delete(f"/api/v1/users/{admin_id}", headers=admin)
    changed = await api.patch(f"/api/v1/users/{admin_id}", json={"enabled": False}, headers=admin)
    missing = await api.patch(f"/api/v1/users/{MISSING}", json={"enabled": False}, headers=admin)

    assert (deleted.json()["error"], changed.json()["error"]) == ("admin_protected",) * 2
    assert missing.status_code == 404


async def test_update_needs_a_field(api: httpx.AsyncClient) -> None:
    admin = await bearer(api, ADMIN_EMAIL)

    response = await api.patch(f"/api/v1/users/{MISSING}", json={}, headers=admin)

    assert response.status_code == 400
