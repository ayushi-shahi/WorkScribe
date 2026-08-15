"""
Smoke tests — run in-process against a real Postgres and Redis.

Unlike tests/test_isolation.py, these need no separately running server: they
drive the ASGI app directly through TestClient, so CI can execute them with
nothing but service containers.

They cover the failures that actually took production down:
  * a 500 must still carry CORS headers, or the browser hides the real error
  * liveness must not depend on the database
  * readiness must report which dependency is broken
  * refresh tokens must rotate AND the rotated token must keep working
  * a replayed refresh token must be rejected
  * login must be rate limited
"""

from __future__ import annotations

import os
import uuid

import pytest
from fastapi.testclient import TestClient

ORIGIN = "https://work-scribe.vercel.app"
os.environ.setdefault("CORS_ORIGINS", ORIGIN)
os.environ.setdefault("JWT_SECRET_KEY", "test-secret-key-that-is-long-enough-32")

from app.main import app  # noqa: E402


@pytest.fixture(scope="module")
def client():
    with TestClient(app) as c:
        yield c


def _email() -> str:
    return f"smoke-{uuid.uuid4().hex[:10]}@example.com"


PASSWORD = "smoketest123"


# ── health ────────────────────────────────────────────────────────────────────

def test_liveness_does_not_touch_dependencies(client):
    r = client.get("/health")
    assert r.status_code == 200
    assert r.json()["status"] == "ok"


def test_readiness_reports_each_dependency(client):
    r = client.get("/health/ready")
    assert r.status_code in (200, 503)
    checks = r.json()["checks"]
    assert "database" in checks and "redis" in checks
    # When a dependency is down the failure must be named, not swallowed.
    for component in ("database", "redis"):
        if not checks[component]["ok"]:
            assert checks[component].get("error")


# ── CORS on errors ────────────────────────────────────────────────────────────

def test_500_response_still_carries_cors_headers(client):
    """
    Regression test for the outage: Starlette's 500 handler sits outside
    CORSMiddleware, so unhandled errors used to reach the browser without
    Access-Control-Allow-Origin and were reported as CORS violations.
    """
    @app.get("/__smoke_boom")
    async def _boom():
        raise RuntimeError("intentional")

    with TestClient(app, raise_server_exceptions=False) as c:
        r = c.get("/__smoke_boom", headers={"Origin": ORIGIN})
    assert r.status_code == 500
    assert r.headers.get("access-control-allow-origin") == ORIGIN
    assert r.json()["detail"]["error_id"]


def test_preflight_is_allowed(client):
    r = client.options(
        "/api/v1/auth/login",
        headers={
            "Origin": ORIGIN,
            "Access-Control-Request-Method": "POST",
            "Access-Control-Request-Headers": "content-type",
        },
    )
    assert r.status_code == 200
    assert r.headers.get("access-control-allow-origin") == ORIGIN


# ── auth ──────────────────────────────────────────────────────────────────────

def test_register_returns_the_user_object(client):
    r = client.post(
        "/api/v1/auth/register",
        json={"email": _email(), "password": PASSWORD, "display_name": "Smoke Test"},
    )
    assert r.status_code == 201
    body = r.json()
    # The frontend reads data.user directly; a missing object blanked the UI.
    assert body["user"]["display_name"] == "Smoke Test"
    assert body["access_token"] and body["refresh_token"]


def test_refresh_rotates_and_the_new_token_works(client):
    email = _email()
    reg = client.post(
        "/api/v1/auth/register",
        json={"email": email, "password": PASSWORD, "display_name": "Rotator"},
    )
    first = reg.json()["refresh_token"]

    one = client.post("/api/v1/auth/refresh", json={"refresh_token": first})
    assert one.status_code == 200
    second = one.json()["refresh_token"]
    assert second != first, "refresh token must rotate"

    # The bug that killed every session: the second refresh used to fail.
    two = client.post("/api/v1/auth/refresh", json={"refresh_token": second})
    assert two.status_code == 200

    # Replaying a rotated token must be rejected.
    replay = client.post("/api/v1/auth/refresh", json={"refresh_token": first})
    assert replay.status_code == 401


def test_wrong_password_is_401_not_500(client):
    email = _email()
    client.post(
        "/api/v1/auth/register",
        json={"email": email, "password": PASSWORD, "display_name": "Wrong Pw"},
    )
    r = client.post(
        "/api/v1/auth/login", json={"email": email, "password": "definitely-wrong-1"}
    )
    assert r.status_code == 401
    assert r.json()["detail"]["code"] == "INVALID_CREDENTIALS"


def test_login_is_rate_limited(client):
    """Brute-force protection: the login bucket is far tighter than the global one."""
    email = _email()
    codes = [
        client.post(
            "/api/v1/auth/login", json={"email": email, "password": "wrong-guess-1"}
        ).status_code
        for _ in range(14)
    ]
    assert 429 in codes, f"expected a 429 within 14 attempts, got {codes}"


def test_me_requires_a_token(client):
    assert client.get("/api/v1/auth/me").status_code == 401
