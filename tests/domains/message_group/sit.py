#!/usr/bin/env python3
"""Group message domain SIT cases."""

from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "common"))

from api_client import ImApiClient
from fixtures import create_group, register_and_login, send_group_message
from gate_common import StepResult


def run_group_message_sit(base_url: str) -> list[StepResult]:
    results: list[StepResult] = []
    client = ImApiClient(base_url)
    owner = register_and_login(client)
    member = register_and_login(client)
    group_id = create_group(base_url, owner, [member.user_id])

    # Member sends group message
    sent = send_group_message(base_url, member, group_id, "group hello")
    results.append(StepResult("group send by member", "PASS" if sent.get("id") else "FAIL", 0, 0.0, "", ""))

    # Non-member cannot send
    outsider = register_and_login(base_url)
    from api_client import ImApiClient
    out = ImApiClient(base_url, outsider.token)
    forbidden = out.post("/api/message/send/group", {"groupId": group_id, "messageType": "TEXT", "content": "x"})
    results.append(StepResult("group non-member send rejected", "PASS" if forbidden.status_code == 403 else "FAIL", 0, 0.0, "", ""))

    # Group history
    owner_client = ImApiClient(base_url, owner.token)
    history = owner_client.get(f"/api/message/group/{group_id}").json.get("data", [])
    results.append(StepResult("group history", "PASS" if any(m.get("content") == "group hello" for m in history) else "FAIL", 0, 0.0, "", ""))

    # Group members
    members = owner_client.post("/api/group/members/list", {"groupId": group_id}).json.get("data", [])
    ids = [int(m.get("userId", m.get("id", 0))) for m in members]
    results.append(StepResult("group members", "PASS" if member.user_id in ids and owner.user_id in ids else "FAIL", 0, 0.0, "", ""))

    # Owner dismisses group
    dismiss = owner_client.delete(f"/api/group/{group_id}")
    results.append(StepResult("group dismiss", "PASS" if dismiss.status_code == 200 else "FAIL", 0, 0.0, "", ""))

    return results
