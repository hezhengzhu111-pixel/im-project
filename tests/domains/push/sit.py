#!/usr/bin/env python3
"""Push domain SIT cases."""

from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "common"))

from api_client import ImApiClient
from fixtures import register_and_login
from gate_common import StepResult


def run_push_sit(base_url: str) -> list[StepResult]:
    results: list[StepResult] = []
    client = ImApiClient(base_url)
    user = register_and_login(client)
    client = ImApiClient(base_url, user.token)
    device_id = "sit-device-1"

    # Register
    reg = client.post(
        "/api/push/devices/register",
        {
            "deviceId": device_id,
            "platform": "ANDROID",
            "fcmToken": "token-v1",
            "appVersion": "0.0.1",
            "deviceModel": "Pixel",
            "osVersion": "Android 14",
            "locale": "zh-CN",
            "timezone": "Asia/Shanghai",
        },
    )
    results.append(StepResult("push register", "PASS" if reg.status_code == 200 else "FAIL", 0, 0.0, "", ""))

    # Update token
    update = client.post(
        "/api/push/devices/token",
        {"deviceId": device_id, "oldToken": "token-v1", "newToken": "token-v2"},
    )
    results.append(StepResult("push update token", "PASS" if update.status_code == 200 else "FAIL", 0, 0.0, "", ""))

    # Settings round trip
    put = client.put(
        "/api/push/settings",
        {"enabled": False, "soundEnabled": False, "showPreview": False},
    )
    get = client.get("/api/push/settings")
    data = get.json.get("data", {})
    results.append(
        StepResult(
            "push settings round trip",
            "PASS" if put.status_code == 200 and data.get("enabled") is False else "FAIL",
            0,
            0.0,
            "",
            "",
        )
    )

    # Unregister
    unreg = client.post(
        "/api/push/devices/unregister",
        {"deviceId": device_id, "fcmToken": "token-v2", "reason": "LOGOUT"},
    )
    results.append(StepResult("push unregister", "PASS" if unreg.status_code == 200 else "FAIL", 0, 0.0, "", ""))

    return results
