"""
Cross-tenant isolation and security tests.

Verifies that:
- Users cannot access resources from other organizations
- Role enforcement works correctly within an org
- Invitation tokens cannot be reused or stolen
- Project CRUD is properly isolated
- Token security is enforced
- Removed members lose access immediately
- Tasks are isolated across orgs
- Wiki pages and spaces are isolated across orgs
- Notifications are isolated per user
"""

import uuid
import pytest
import httpx

BASE_URL = "http://api:8000"


def unique_email(prefix: str) -> str:
    """Generate a unique email for each test run to avoid conflicts."""
    return f"{prefix}_{uuid.uuid4().hex[:8]}@example.com"


def unique_slug(prefix: str) -> str:
    """Generate a unique org slug for each test run."""
    return f"{prefix}-{uuid.uuid4().hex[:6]}"


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

async def register(client: httpx.AsyncClient, email: str, password: str = "password123", display_name: str = "Test User") -> dict:
    resp = await client.post(f"{BASE_URL}/api/v1/auth/register", json={
        "email": email,
        "password": password,
        "display_name": display_name,
    })
    assert resp.status_code == 201, f"Register failed: {resp.text}"
    return resp.json()


async def login(client: httpx.AsyncClient, email: str, password: str = "password123") -> str:
    resp = await client.post(f"{BASE_URL}/api/v1/auth/login", json={
        "email": email,
        "password": password,
    })
    assert resp.status_code == 200, f"Login failed: {resp.text}"
    return resp.json()["access_token"]


async def create_org(client: httpx.AsyncClient, token: str, name: str, slug: str) -> dict:
    resp = await client.post(
        f"{BASE_URL}/api/v1/organizations",
        json={"name": name, "slug": slug},
        headers={"Authorization": f"Bearer {token}"},
    )
    assert resp.status_code == 201, f"Create org failed: {resp.text}"
    return resp.json()


async def create_project(client: httpx.AsyncClient, token: str, slug: str, name: str, key: str) -> dict:
    resp = await client.post(
        f"{BASE_URL}/api/v1/organizations/{slug}/projects",
        json={"name": name, "key": key, "type": "kanban"},
        headers={"Authorization": f"Bearer {token}"},
    )
    assert resp.status_code == 201, f"Create project failed: {resp.text}"
    return resp.json()


async def invite_member(client: httpx.AsyncClient, token: str, slug: str, email: str, role: str = "member") -> tuple[str, str]:
    """Returns (invitation_id, invitation_token)."""
    resp = await client.post(
        f"{BASE_URL}/api/v1/organizations/{slug}/invite",
        json={"email": email, "role": role},
        headers={"Authorization": f"Bearer {token}"},
    )
    assert resp.status_code == 201, f"Invite failed: {resp.text}"
    data = resp.json()
    return data["id"], data["token"]


async def accept_invite(client: httpx.AsyncClient, token: str) -> httpx.Response:
    resp = await client.post(f"{BASE_URL}/api/v1/auth/invitations/{token}/accept")
    return resp


async def setup_org_with_member(
    client: httpx.AsyncClient,
    owner_email: str,
    member_email: str,
    org_name: str,
    org_slug: str,
    member_role: str = "member",
) -> tuple[str, str, str]:
    """Create org, invite member, return (owner_token, member_token, slug)."""
    await register(client, owner_email)
    await register(client, member_email)
    owner_token = await login(client, owner_email)
    member_token = await login(client, member_email)
    await create_org(client, owner_token, org_name, org_slug)
    _, invite_token = await invite_member(client, owner_token, org_slug, member_email, member_role)
    accept_resp = await accept_invite(client, invite_token)
    assert accept_resp.status_code == 200, f"Accept invite failed: {accept_resp.text}"
    return owner_token, member_token, org_slug


async def create_task(
    client: httpx.AsyncClient,
    token: str,
    org_slug: str,
    project_id: str,
    status_id: str,
    title: str = "Test Task",
) -> dict:
    resp = await client.post(
        f"{BASE_URL}/api/v1/organizations/{org_slug}/projects/{project_id}/tasks",
        json={"title": title, "status_id": status_id},
        headers={"Authorization": f"Bearer {token}"},
    )
    assert resp.status_code == 201, f"Create task failed: {resp.text}"
    return resp.json()


async def get_first_status_id(
    client: httpx.AsyncClient,
    token: str,
    org_slug: str,
    project_id: str,
) -> str:
    resp = await client.get(
        f"{BASE_URL}/api/v1/organizations/{org_slug}/projects/{project_id}/statuses",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert resp.status_code == 200, f"Get statuses failed: {resp.text}"
    statuses = resp.json()
    assert len(statuses) > 0, "No statuses found for project"
    return statuses[0]["id"]


async def create_wiki_space(
    client: httpx.AsyncClient,
    token: str,
    org_slug: str,
    name: str,
    key: str,
) -> dict:
    resp = await client.post(
        f"{BASE_URL}/api/v1/organizations/{org_slug}/wiki/spaces",
        json={"name": name, "key": key},
        headers={"Authorization": f"Bearer {token}"},
    )
    assert resp.status_code == 201, f"Create wiki space failed: {resp.text}"
    return resp.json()


async def create_page(
    client: httpx.AsyncClient,
    token: str,
    space_id: str,
    title: str = "Test Page",
) -> dict:
    resp = await client.post(
        f"{BASE_URL}/api/v1/wiki/spaces/{space_id}/pages",
        json={"title": title},
        headers={"Authorization": f"Bearer {token}"},
    )
    assert resp.status_code == 201, f"Create page failed: {resp.text}"
    return resp.json()


# ---------------------------------------------------------------------------
# 1. Basic Cross-Org Isolation
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_cannot_access_other_org():
    async with httpx.AsyncClient(timeout=30.0) as client:
        email_a = unique_email("iso1a")
        email_b = unique_email("iso1b")
        slug_a = unique_slug("iso1a")
        slug_b = unique_slug("iso1b")
        await register(client, email_a)
        await register(client, email_b)
        token_a = await login(client, email_a)
        token_b = await login(client, email_b)
        await create_org(client, token_a, "Org A", slug_a)
        await create_org(client, token_b, "Org B", slug_b)

        resp = await client.get(
            f"{BASE_URL}/api/v1/organizations/{slug_b}",
            headers={"Authorization": f"Bearer {token_a}"},
        )
        assert resp.status_code == 403


@pytest.mark.asyncio
async def test_cannot_list_other_org_members():
    async with httpx.AsyncClient(timeout=30.0) as client:
        email_a = unique_email("iso2a")
        email_b = unique_email("iso2b")
        slug_a = unique_slug("iso2a")
        slug_b = unique_slug("iso2b")
        await register(client, email_a)
        await register(client, email_b)
        token_a = await login(client, email_a)
        token_b = await login(client, email_b)
        await create_org(client, token_a, "Org A", slug_a)
        await create_org(client, token_b, "Org B", slug_b)

        resp = await client.get(
            f"{BASE_URL}/api/v1/organizations/{slug_b}/members",
            headers={"Authorization": f"Bearer {token_a}"},
        )
        assert resp.status_code == 403


@pytest.mark.asyncio
async def test_unauthenticated_request_rejected():
    async with httpx.AsyncClient(timeout=30.0) as client:
        resp = await client.get(f"{BASE_URL}/api/v1/organizations/any-org")
        assert resp.status_code == 401


# ---------------------------------------------------------------------------
# 2. Project CRUD Isolation
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_cannot_list_other_org_projects():
    async with httpx.AsyncClient(timeout=30.0) as client:
        email_a = unique_email("proj1a")
        email_b = unique_email("proj1b")
        slug_a = unique_slug("proj1a")
        slug_b = unique_slug("proj1b")
        await register(client, email_a)
        await register(client, email_b)
        token_a = await login(client, email_a)
        token_b = await login(client, email_b)
        await create_org(client, token_a, "Org A", slug_a)
        await create_org(client, token_b, "Org B", slug_b)
        await create_project(client, token_b, slug_b, "Secret", "SEC")

        resp = await client.get(
            f"{BASE_URL}/api/v1/organizations/{slug_b}/projects",
            headers={"Authorization": f"Bearer {token_a}"},
        )
        assert resp.status_code == 403


@pytest.mark.asyncio
async def test_cannot_create_project_in_other_org():
    async with httpx.AsyncClient(timeout=30.0) as client:
        email_a = unique_email("proj2a")
        email_b = unique_email("proj2b")
        slug_a = unique_slug("proj2a")
        slug_b = unique_slug("proj2b")
        await register(client, email_a)
        await register(client, email_b)
        token_a = await login(client, email_a)
        token_b = await login(client, email_b)
        await create_org(client, token_a, "Org A", slug_a)
        await create_org(client, token_b, "Org B", slug_b)

        resp = await client.post(
            f"{BASE_URL}/api/v1/organizations/{slug_b}/projects",
            json={"name": "Injected", "key": "INJ", "type": "kanban"},
            headers={"Authorization": f"Bearer {token_a}"},
        )
        assert resp.status_code == 403


@pytest.mark.asyncio
async def test_cannot_get_other_org_project():
    async with httpx.AsyncClient(timeout=30.0) as client:
        email_a = unique_email("proj3a")
        email_b = unique_email("proj3b")
        slug_a = unique_slug("proj3a")
        slug_b = unique_slug("proj3b")
        await register(client, email_a)
        await register(client, email_b)
        token_a = await login(client, email_a)
        token_b = await login(client, email_b)
        await create_org(client, token_a, "Org A", slug_a)
        await create_org(client, token_b, "Org B", slug_b)
        project = await create_project(client, token_b, slug_b, "Secret", "SCRT")
        project_id = project["id"]

        resp = await client.get(
            f"{BASE_URL}/api/v1/organizations/{slug_b}/projects/{project_id}",
            headers={"Authorization": f"Bearer {token_a}"},
        )
        assert resp.status_code == 403


@pytest.mark.asyncio
async def test_cannot_update_other_org_project():
    async with httpx.AsyncClient(timeout=30.0) as client:
        email_a = unique_email("proj4a")
        email_b = unique_email("proj4b")
        slug_a = unique_slug("proj4a")
        slug_b = unique_slug("proj4b")
        await register(client, email_a)
        await register(client, email_b)
        token_a = await login(client, email_a)
        token_b = await login(client, email_b)
        await create_org(client, token_a, "Org A", slug_a)
        await create_org(client, token_b, "Org B", slug_b)
        project = await create_project(client, token_b, slug_b, "Secret", "UPDT")
        project_id = project["id"]

        resp = await client.patch(
            f"{BASE_URL}/api/v1/organizations/{slug_b}/projects/{project_id}",
            json={"name": "Hacked"},
            headers={"Authorization": f"Bearer {token_a}"},
        )
        assert resp.status_code == 403


@pytest.mark.asyncio
async def test_cannot_archive_other_org_project():
    async with httpx.AsyncClient(timeout=30.0) as client:
        email_a = unique_email("proj5a")
        email_b = unique_email("proj5b")
        slug_a = unique_slug("proj5a")
        slug_b = unique_slug("proj5b")
        await register(client, email_a)
        await register(client, email_b)
        token_a = await login(client, email_a)
        token_b = await login(client, email_b)
        await create_org(client, token_a, "Org A", slug_a)
        await create_org(client, token_b, "Org B", slug_b)
        project = await create_project(client, token_b, slug_b, "Secret", "ARCH")
        project_id = project["id"]

        resp = await client.delete(
            f"{BASE_URL}/api/v1/organizations/{slug_b}/projects/{project_id}",
            headers={"Authorization": f"Bearer {token_a}"},
        )
        assert resp.status_code == 403


# ---------------------------------------------------------------------------
# 3. Role Enforcement Within Own Org
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_member_cannot_create_project():
    async with httpx.AsyncClient(timeout=30.0) as client:
        slug = unique_slug("role1")
        owner_token, member_token, slug = await setup_org_with_member(
            client, unique_email("role1o"), unique_email("role1m"),
            "Role Org 1", slug, "member"
        )
        resp = await client.post(
            f"{BASE_URL}/api/v1/organizations/{slug}/projects",
            json={"name": "Member Project", "key": "MBR", "type": "kanban"},
            headers={"Authorization": f"Bearer {member_token}"},
        )
        assert resp.status_code == 403


@pytest.mark.asyncio
async def test_member_can_list_projects():
    async with httpx.AsyncClient(timeout=30.0) as client:
        slug = unique_slug("role2")
        owner_token, member_token, slug = await setup_org_with_member(
            client, unique_email("role2o"), unique_email("role2m"),
            "Role Org 2", slug, "member"
        )
        await create_project(client, owner_token, slug, "Visible Project", "VIS")

        resp = await client.get(
            f"{BASE_URL}/api/v1/organizations/{slug}/projects",
            headers={"Authorization": f"Bearer {member_token}"},
        )
        assert resp.status_code == 200
        assert len(resp.json()["projects"]) == 1


@pytest.mark.asyncio
async def test_member_cannot_invite_others():
    async with httpx.AsyncClient(timeout=30.0) as client:
        slug = unique_slug("role3")
        owner_token, member_token, slug = await setup_org_with_member(
            client, unique_email("role3o"), unique_email("role3m"),
            "Role Org 3", slug, "member"
        )
        resp = await client.post(
            f"{BASE_URL}/api/v1/organizations/{slug}/invite",
            json={"email": unique_email("newuser"), "role": "member"},
            headers={"Authorization": f"Bearer {member_token}"},
        )
        assert resp.status_code == 403


@pytest.mark.asyncio
async def test_member_cannot_change_roles():
    async with httpx.AsyncClient(timeout=30.0) as client:
        slug = unique_slug("role4")
        owner_token, member_token, slug = await setup_org_with_member(
            client, unique_email("role4o"), unique_email("role4m"),
            "Role Org 4", slug, "member"
        )
        members_resp = await client.get(
            f"{BASE_URL}/api/v1/organizations/{slug}/members",
            headers={"Authorization": f"Bearer {owner_token}"},
        )
        members = members_resp.json()["members"]
        member_user = next(m for m in members if m["role"] == "member")
        member_user_id = member_user["user_id"]

        resp = await client.patch(
            f"{BASE_URL}/api/v1/organizations/{slug}/members/{member_user_id}",
            json={"role": "admin"},
            headers={"Authorization": f"Bearer {member_token}"},
        )
        assert resp.status_code == 403


@pytest.mark.asyncio
async def test_admin_can_create_project():
    async with httpx.AsyncClient(timeout=30.0) as client:
        slug = unique_slug("role5")
        owner_token, admin_token, slug = await setup_org_with_member(
            client, unique_email("role5o"), unique_email("role5a"),
            "Role Org 5", slug, "admin"
        )
        resp = await client.post(
            f"{BASE_URL}/api/v1/organizations/{slug}/projects",
            json={"name": "Admin Project", "key": "ADM", "type": "kanban"},
            headers={"Authorization": f"Bearer {admin_token}"},
        )
        assert resp.status_code == 201


@pytest.mark.asyncio
async def test_member_cannot_archive_project():
    async with httpx.AsyncClient(timeout=30.0) as client:
        slug = unique_slug("role6")
        owner_token, member_token, slug = await setup_org_with_member(
            client, unique_email("role6o"), unique_email("role6m"),
            "Role Org 6", slug, "member"
        )
        project = await create_project(client, owner_token, slug, "To Archive", "TARC")
        project_id = project["id"]

        resp = await client.delete(
            f"{BASE_URL}/api/v1/organizations/{slug}/projects/{project_id}",
            headers={"Authorization": f"Bearer {member_token}"},
        )
        assert resp.status_code == 403


# ---------------------------------------------------------------------------
# 4. Invitation Isolation & Token Security
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_invitation_token_cannot_be_reused():
    async with httpx.AsyncClient(timeout=30.0) as client:
        slug = unique_slug("inv1")
        owner_email = unique_email("inv1o")
        member_email = unique_email("inv1m")
        await register(client, owner_email)
        await register(client, member_email)
        owner_token = await login(client, owner_email)
        await create_org(client, owner_token, "Inv Org 1", slug)
        _, invite_token = await invite_member(client, owner_token, slug, member_email)

        resp1 = await accept_invite(client, invite_token)
        assert resp1.status_code == 200

        resp2 = await accept_invite(client, invite_token)
        assert resp2.status_code in (400, 404, 409)


@pytest.mark.asyncio
async def test_fake_invitation_token_rejected():
    async with httpx.AsyncClient(timeout=30.0) as client:
        resp = await client.post(
            f"{BASE_URL}/api/v1/auth/invitations/totally-fake-token-12345/accept"
        )
        assert resp.status_code in (400, 404)


@pytest.mark.asyncio
async def test_cannot_revoke_other_org_invitation():
    async with httpx.AsyncClient(timeout=30.0) as client:
        slug_a = unique_slug("inv2a")
        slug_b = unique_slug("inv2b")
        email_a = unique_email("inv2a")
        email_b = unique_email("inv2b")
        target_email = unique_email("inv2t")
        await register(client, email_a)
        await register(client, email_b)
        await register(client, target_email)
        token_a = await login(client, email_a)
        token_b = await login(client, email_b)
        await create_org(client, token_a, "Inv Org A", slug_a)
        await create_org(client, token_b, "Inv Org B", slug_b)

        invite_id, _ = await invite_member(client, token_b, slug_b, target_email)

        resp = await client.delete(
            f"{BASE_URL}/api/v1/organizations/{slug_b}/invitations/{invite_id}",
            headers={"Authorization": f"Bearer {token_a}"},
        )
        assert resp.status_code == 403


# ---------------------------------------------------------------------------
# 5. Token Security
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_malformed_token_rejected():
    async with httpx.AsyncClient(timeout=30.0) as client:
        resp = await client.get(
            f"{BASE_URL}/api/v1/organizations/any-org",
            headers={"Authorization": "Bearer this.is.not.a.valid.jwt"},
        )
        assert resp.status_code == 401


@pytest.mark.asyncio
async def test_missing_bearer_prefix_rejected():
    async with httpx.AsyncClient(timeout=30.0) as client:
        resp = await client.get(
            f"{BASE_URL}/api/v1/organizations/any-org",
            headers={"Authorization": "not-a-bearer-token"},
        )
        assert resp.status_code == 401


@pytest.mark.asyncio
async def test_no_auth_header_rejected():
    async with httpx.AsyncClient(timeout=30.0) as client:
        resp = await client.get(f"{BASE_URL}/api/v1/organizations/any-org")
        assert resp.status_code == 401


# ---------------------------------------------------------------------------
# 6. Member Removal Loses Access
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_removed_member_loses_access():
    async with httpx.AsyncClient(timeout=30.0) as client:
        slug = unique_slug("rem1")
        owner_token, member_token, slug = await setup_org_with_member(
            client, unique_email("rem1o"), unique_email("rem1m"),
            "Rem Org 1", slug, "member"
        )

        resp = await client.get(
            f"{BASE_URL}/api/v1/organizations/{slug}/projects",
            headers={"Authorization": f"Bearer {member_token}"},
        )
        assert resp.status_code == 200

        members_resp = await client.get(
            f"{BASE_URL}/api/v1/organizations/{slug}/members",
            headers={"Authorization": f"Bearer {owner_token}"},
        )
        members = members_resp.json()["members"]
        member_user = next(m for m in members if m["role"] == "member")
        member_user_id = member_user["user_id"]

        remove_resp = await client.delete(
            f"{BASE_URL}/api/v1/organizations/{slug}/members/{member_user_id}",
            headers={"Authorization": f"Bearer {owner_token}"},
        )
        assert remove_resp.status_code == 200

        resp_after = await client.get(
            f"{BASE_URL}/api/v1/organizations/{slug}/projects",
            headers={"Authorization": f"Bearer {member_token}"},
        )
        assert resp_after.status_code == 403


@pytest.mark.asyncio
async def test_owner_cannot_remove_themselves():
    async with httpx.AsyncClient(timeout=30.0) as client:
        slug = unique_slug("rem2")
        owner_email = unique_email("rem2o")
        await register(client, owner_email)
        owner_token = await login(client, owner_email)
        await create_org(client, owner_token, "Rem Org 2", slug)

        members_resp = await client.get(
            f"{BASE_URL}/api/v1/organizations/{slug}/members",
            headers={"Authorization": f"Bearer {owner_token}"},
        )
        members = members_resp.json()["members"]
        owner_user = next(m for m in members if m["role"] == "owner")
        owner_user_id = owner_user["user_id"]

        resp = await client.delete(
            f"{BASE_URL}/api/v1/organizations/{slug}/members/{owner_user_id}",
            headers={"Authorization": f"Bearer {owner_token}"},
        )
        assert resp.status_code == 403


# ---------------------------------------------------------------------------
# 7. Task Isolation
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_cannot_read_other_org_task():
    """User A cannot GET a task that belongs to Org B."""
    async with httpx.AsyncClient(timeout=30.0) as client:
        slug_a = unique_slug("tsk1a")
        slug_b = unique_slug("tsk1b")
        email_a = unique_email("tsk1a")
        email_b = unique_email("tsk1b")
        await register(client, email_a)
        await register(client, email_b)
        token_a = await login(client, email_a)
        token_b = await login(client, email_b)
        await create_org(client, token_a, "Task Org A", slug_a)
        await create_org(client, token_b, "Task Org B", slug_b)

        project_b = await create_project(client, token_b, slug_b, "Proj B", "PRJB")
        status_id_b = await get_first_status_id(client, token_b, slug_b, project_b["id"])
        task_b = await create_task(client, token_b, slug_b, project_b["id"], status_id_b, "Secret Task")

        resp = await client.get(
            f"{BASE_URL}/api/v1/tasks/{task_b['id']}",
            headers={"Authorization": f"Bearer {token_a}"},
        )
        assert resp.status_code == 403


@pytest.mark.asyncio
async def test_cannot_update_other_org_task():
    """User A cannot PATCH a task that belongs to Org B."""
    async with httpx.AsyncClient(timeout=30.0) as client:
        slug_a = unique_slug("tsk2a")
        slug_b = unique_slug("tsk2b")
        email_a = unique_email("tsk2a")
        email_b = unique_email("tsk2b")
        await register(client, email_a)
        await register(client, email_b)
        token_a = await login(client, email_a)
        token_b = await login(client, email_b)
        await create_org(client, token_a, "Task Org A", slug_a)
        await create_org(client, token_b, "Task Org B", slug_b)

        project_b = await create_project(client, token_b, slug_b, "Proj B", "PRJB")
        status_id_b = await get_first_status_id(client, token_b, slug_b, project_b["id"])
        task_b = await create_task(client, token_b, slug_b, project_b["id"], status_id_b)

        resp = await client.patch(
            f"{BASE_URL}/api/v1/tasks/{task_b['id']}",
            json={"title": "Hacked Title"},
            headers={"Authorization": f"Bearer {token_a}"},
        )
        assert resp.status_code == 403


@pytest.mark.asyncio
async def test_cannot_delete_other_org_task():
    """User A cannot DELETE a task that belongs to Org B."""
    async with httpx.AsyncClient(timeout=30.0) as client:
        slug_a = unique_slug("tsk3a")
        slug_b = unique_slug("tsk3b")
        email_a = unique_email("tsk3a")
        email_b = unique_email("tsk3b")
        await register(client, email_a)
        await register(client, email_b)
        token_a = await login(client, email_a)
        token_b = await login(client, email_b)
        await create_org(client, token_a, "Task Org A", slug_a)
        await create_org(client, token_b, "Task Org B", slug_b)

        project_b = await create_project(client, token_b, slug_b, "Proj B", "PRJB")
        status_id_b = await get_first_status_id(client, token_b, slug_b, project_b["id"])
        task_b = await create_task(client, token_b, slug_b, project_b["id"], status_id_b)

        resp = await client.delete(
            f"{BASE_URL}/api/v1/tasks/{task_b['id']}",
            headers={"Authorization": f"Bearer {token_a}"},
        )
        assert resp.status_code == 403


@pytest.mark.asyncio
async def test_cannot_list_other_org_tasks():
    """User A cannot list tasks under Org B's project via org slug."""
    async with httpx.AsyncClient(timeout=30.0) as client:
        slug_a = unique_slug("tsk4a")
        slug_b = unique_slug("tsk4b")
        email_a = unique_email("tsk4a")
        email_b = unique_email("tsk4b")
        await register(client, email_a)
        await register(client, email_b)
        token_a = await login(client, email_a)
        token_b = await login(client, email_b)
        await create_org(client, token_a, "Task Org A", slug_a)
        await create_org(client, token_b, "Task Org B", slug_b)

        project_b = await create_project(client, token_b, slug_b, "Proj B", "PRJB")

        resp = await client.get(
            f"{BASE_URL}/api/v1/organizations/{slug_b}/projects/{project_b['id']}/tasks",
            headers={"Authorization": f"Bearer {token_a}"},
        )
        assert resp.status_code == 403


# ---------------------------------------------------------------------------
# 8. Wiki Page Isolation
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_cannot_read_other_org_page():
    """User A cannot GET a page that belongs to Org B."""
    async with httpx.AsyncClient(timeout=30.0) as client:
        slug_a = unique_slug("wiki1a")
        slug_b = unique_slug("wiki1b")
        email_a = unique_email("wiki1a")
        email_b = unique_email("wiki1b")
        await register(client, email_a)
        await register(client, email_b)
        token_a = await login(client, email_a)
        token_b = await login(client, email_b)
        await create_org(client, token_a, "Wiki Org A", slug_a)
        await create_org(client, token_b, "Wiki Org B", slug_b)

        space_b = await create_wiki_space(client, token_b, slug_b, "Eng B", "ENGB")
        page_b = await create_page(client, token_b, space_b["id"], "Secret Page")

        resp = await client.get(
            f"{BASE_URL}/api/v1/wiki/pages/{page_b['id']}",
            headers={"Authorization": f"Bearer {token_a}"},
        )
        assert resp.status_code == 403


@pytest.mark.asyncio
async def test_cannot_update_other_org_page():
    """User A cannot PATCH a page that belongs to Org B."""
    async with httpx.AsyncClient(timeout=30.0) as client:
        slug_a = unique_slug("wiki2a")
        slug_b = unique_slug("wiki2b")
        email_a = unique_email("wiki2a")
        email_b = unique_email("wiki2b")
        await register(client, email_a)
        await register(client, email_b)
        token_a = await login(client, email_a)
        token_b = await login(client, email_b)
        await create_org(client, token_a, "Wiki Org A", slug_a)
        await create_org(client, token_b, "Wiki Org B", slug_b)

        space_b = await create_wiki_space(client, token_b, slug_b, "Eng B", "ENGB")
        page_b = await create_page(client, token_b, space_b["id"])

        resp = await client.patch(
            f"{BASE_URL}/api/v1/wiki/pages/{page_b['id']}",
            json={"title": "Hacked"},
            headers={"Authorization": f"Bearer {token_a}"},
        )
        assert resp.status_code == 403


@pytest.mark.asyncio
async def test_cannot_list_other_org_space_pages():
    """User A cannot list pages in Org B's wiki space."""
    async with httpx.AsyncClient(timeout=30.0) as client:
        slug_a = unique_slug("wiki3a")
        slug_b = unique_slug("wiki3b")
        email_a = unique_email("wiki3a")
        email_b = unique_email("wiki3b")
        await register(client, email_a)
        await register(client, email_b)
        token_a = await login(client, email_a)
        token_b = await login(client, email_b)
        await create_org(client, token_a, "Wiki Org A", slug_a)
        await create_org(client, token_b, "Wiki Org B", slug_b)

        space_b = await create_wiki_space(client, token_b, slug_b, "Eng B", "ENGB")

        resp = await client.get(
            f"{BASE_URL}/api/v1/wiki/spaces/{space_b['id']}/pages",
            headers={"Authorization": f"Bearer {token_a}"},
        )
        assert resp.status_code == 403


# ---------------------------------------------------------------------------
# 9. Notification Isolation
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_cannot_read_other_users_notifications():
    """User A cannot see User B's notifications."""
    async with httpx.AsyncClient(timeout=30.0) as client:
        slug = unique_slug("notif1")
        owner_token, member_token, slug = await setup_org_with_member(
            client, unique_email("notif1o"), unique_email("notif1m"),
            "Notif Org", slug, "member"
        )

        # Both users fetch their own notifications
        resp_owner = await client.get(
            f"{BASE_URL}/api/v1/notifications",
            headers={"Authorization": f"Bearer {owner_token}"},
        )
        resp_member = await client.get(
            f"{BASE_URL}/api/v1/notifications",
            headers={"Authorization": f"Bearer {member_token}"},
        )
        assert resp_owner.status_code == 200
        assert resp_member.status_code == 200

        # Verify notifications endpoint is scoped per user — IDs don't overlap
        owner_ids = {n["id"] for n in resp_owner.json().get("notifications", [])}
        member_ids = {n["id"] for n in resp_member.json().get("notifications", [])}
        assert owner_ids.isdisjoint(member_ids), "Notification IDs overlap between users"