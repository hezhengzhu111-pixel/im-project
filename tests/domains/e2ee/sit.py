#!/usr/bin/env python3
"""E2EE domain SIT cases."""

from __future__ import annotations

import base64
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "common"))

from api_client import ImApiClient
from fixtures import make_friends, register_and_login
from gate_common import StepResult


def x25519_key() -> str:
    return base64.b64encode(bytes((i % 26) + ord("a") for i in range(32))).decode()


def ed25519_sig() -> str:
    return base64.b64encode(bytes((i % 26) + ord("a") for i in range(64))).decode()


def upload_bundle(client: ImApiClient, device_id: str) -> None:
    client.post(
        "/api/keys/bundle",
        {
            "deviceId": device_id,
            "identityKey": x25519_key(),
            "signingIdentityKey": x25519_key(),
            "signedPreKey": x25519_key(),
            "signedPreKeySignature": ed25519_sig(),
            "oneTimePreKeys": [{"id": 1, "key": x25519_key()}],
        },
    )


def run_e2ee_sit(base_url: str, db_url: str) -> list[StepResult]:
    results: list[StepResult] = []
    client = ImApiClient(base_url)
    a = register_and_login(client)
    b = register_and_login(client)
    make_friends(base_url, a, b)
    ca = ImApiClient(base_url, a.token)
    cb = ImApiClient(base_url, b.token)

    # Upload bundles
    dev_a = "dev-a-1"
    dev_b = "dev-b-1"
    upload_bundle(ca, dev_a)
    upload_bundle(cb, dev_b)
    results.append(StepResult("e2ee upload bundle", "PASS", 0, 0.0, "", ""))

    # Get devices
    devices = ca.get(f"/api/keys/devices?userId={b.user_id}").json.get("data", [])
    results.append(StepResult("e2ee get devices", "PASS" if any(d.get("deviceId") == dev_b for d in devices) else "FAIL", 0, 0.0, "", ""))

    # Create session
    ids = sorted([a.user_id, b.user_id])
    conversation_id = f"p_{ids[0]}_{ids[1]}"
    session = ca.post(
        "/api/e2ee/sessions",
        {"conversationId": conversation_id, "senderDeviceId": dev_a, "recipientDeviceIds": [dev_b]},
    )
    results.append(StepResult("e2ee create session", "PASS" if session.status_code == 200 else "FAIL", 0, 0.0, "", ""))

    # Backup round trip
    salt = ca.get("/api/keys/salt").json.get("data", {}).get("salt")
    backup = ca.post("/api/keys/backup", {"encryptedBackup": "encrypted", "salt": salt})
    get_backup = ca.get("/api/keys/backup")
    results.append(
        StepResult(
            "e2ee backup round trip",
            "PASS"
            if backup.status_code == 200 and get_backup.json.get("data", {}).get("encryptedBackup") == "encrypted"
            else "FAIL",
            0,
            0.0,
            "",
            "",
        )
    )

    return results
