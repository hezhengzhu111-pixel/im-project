#!/usr/bin/env python3
"""Private message domain SIT cases."""

from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "common"))

from fixtures import (
    make_friends,
    register_and_login,
    send_private_message,
)
from gate_common import StepResult


def run_private_message_sit(base_url: str) -> list[StepResult]:
    results: list[StepResult] = []
    client = ImApiClient(base_url)
    a = register_and_login(client)
    b = register_and_login(client)
    make_friends(base_url, a, b)

    sent = send_private_message(base_url, a, b.user_id, "hello")
    results.append(StepResult("private send", "PASS" if sent.get("id") else "FAIL", 0, 0.0, "", ""))

    from api_client import ImApiClient
    client_a = ImApiClient(base_url, a.token)
    history = client_a.get(f"/api/message/private/{b.user_id}").json.get("data", [])
    results.append(StepResult("private history", "PASS" if any(m.get("content") == "hello" for m in history) else "FAIL", 0, 0.0, "", ""))

    # Mark read
    conversation_id = f"{min(a.user_id, b.user_id)}_{max(a.user_id, b.user_id)}"
    read = client_a.post(f"/api/message/read/{conversation_id}", {})
    results.append(StepResult("private mark read", "PASS" if read.status_code == 200 else "FAIL", 0, 0.0, "", ""))

    # Recall own message
    msg_id = sent.get("id")
    recall = client_a.post(f"/api/message/recall/{msg_id}", {})
    results.append(StepResult("private recall own", "PASS" if recall.status_code == 200 else "FAIL", 0, 0.0, "", ""))

    return results
