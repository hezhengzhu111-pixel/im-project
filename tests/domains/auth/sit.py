#!/usr/bin/env python3
"""Auth domain SIT cases."""

from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "common"))

from api_client import ImApiClient
from fixtures import assert_ok, register_and_login, unique_username, valid_password
from gate_common import StepResult, run_step


PYTHON = sys.executable


def run_auth_sit(base_url: str) -> list[StepResult]:
    results: list[StepResult] = []

    # Register / login success
    client = ImApiClient(base_url)
    user = register_and_login(client)
    results.append(
        StepResult(
            name="auth register and login",
            status="PASS",
            exit_code=0,
            duration_seconds=0.0,
            command="",
            cwd="",
        )
    )

    # Wrong password
    wrong_login = client.post(
        "/api/user/login", {"username": user.username, "password": "WrongPass1"}
    )
    results.append(
        run_step(
            "auth wrong password rejected",
            [PYTHON, "-c", f"assert {wrong_login.status_code} == 401"],
            cwd=Path.cwd(),
            timeout=10,
        )
    )

    # Refresh token flow
    refresh_client = ImApiClient(base_url)
    login_data = assert_ok(
        refresh_client.post(
            "/api/user/login",
            {"username": user.username, "password": valid_password()},
        ),
        "login for refresh",
    )
    refresh_token = login_data.get("refreshToken")
    if refresh_token:
        refresh_resp = refresh_client.post("/api/auth/refresh", {"refreshToken": refresh_token})
        results.append(
            run_step(
                "auth refresh token",
                [PYTHON, "-c", f"assert {refresh_resp.status_code} == 200"],
                cwd=Path.cwd(),
                timeout=10,
            )
        )

    # Parse valid token
    parse_resp = refresh_client.post("/api/auth/parse", {"token": user.token})
    results.append(
        run_step(
            "auth parse valid token",
            [PYTHON, "-c", f"assert {parse_resp.status_code} == 200 and {parse_resp.json.get('data', {}).get('valid')} is True"],
            cwd=Path.cwd(),
            timeout=10,
        )
    )

    # WS ticket requires auth
    ws_ticket_unauth = client.post("/api/auth/ws-ticket", {})
    results.append(
        run_step(
            "auth ws ticket requires auth",
            [PYTHON, "-c", f"assert {ws_ticket_unauth.status_code} == 401"],
            cwd=Path.cwd(),
            timeout=10,
        )
    )

    # WS ticket with auth
    ws_ticket_auth = ImApiClient(base_url, user.token).post("/api/auth/ws-ticket", {})
    results.append(
        run_step(
            "auth ws ticket success",
            [PYTHON, "-c", f"assert {ws_ticket_auth.status_code} == 200"],
            cwd=Path.cwd(),
            timeout=10,
        )
    )

    # Logout invalidates token
    logout_resp = ImApiClient(base_url, user.token).post("/api/user/logout", {})
    results.append(
        run_step(
            "auth logout success",
            [PYTHON, "-c", f"assert {logout_resp.status_code} == 200"],
            cwd=Path.cwd(),
            timeout=10,
        )
    )

    return results
