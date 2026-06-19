#!/usr/bin/env python3
"""User domain SIT cases."""

from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "common"))

from api_client import ImApiClient
from fixtures import assert_ok, register_and_login, unique_username, valid_password
from gate_common import StepResult


def run_user_sit(base_url: str) -> list[StepResult]:
    results: list[StepResult] = []
    client = ImApiClient(base_url)
    user = register_and_login(client)
    token_client = ImApiClient(base_url, user.token)

    # Update profile
    profile = assert_ok(token_client.put("/api/user/profile", {"nickname": "Updated"}), "update profile")
    results.append(StepResult("user update profile", "PASS" if profile is True or profile == {} else "FAIL", 0, 0.0, "", ""))

    # Get settings
    settings = assert_ok(token_client.get("/api/user/settings"), "get settings")
    results.append(StepResult("user get settings", "PASS" if isinstance(settings, dict) else "FAIL", 0, 0.0, "", ""))

    # Heartbeat
    heartbeat = assert_ok(token_client.post("/api/user/heartbeat", {}), "heartbeat")
    results.append(StepResult("user heartbeat", "PASS" if isinstance(heartbeat, dict) else "FAIL", 0, 0.0, "", ""))

    # Online status
    online = assert_ok(token_client.post("/api/user/online-status", {"isOnline": True}), "online status")
    results.append(StepResult("user online status", "PASS" if isinstance(online, dict) else "FAIL", 0, 0.0, "", ""))

    # Search by username
    search = assert_ok(token_client.get(f"/api/user/search?keyword={user.username}"), "search")
    results.append(StepResult("user search", "PASS" if any(u.get("username") == user.username for u in search) else "FAIL", 0, 0.0, "", ""))

    # Change password flow
    new_password = "NewPass123!"
    change = token_client.put("/api/user/password", {"oldPassword": valid_password(), "newPassword": new_password})
    results.append(StepResult("user change password", "PASS" if change.status_code == 200 else "FAIL", 0, 0.0, "", ""))

    # Login with new password
    if change.status_code == 200:
        re_login = client.post("/api/user/login", {"username": user.username, "password": new_password})
        results.append(StepResult("user login after password change", "PASS" if re_login.status_code == 200 else "FAIL", 0, 0.0, "", ""))

    return results
