#!/usr/bin/env python3
"""Social domain SIT cases."""

from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "common"))

from api_client import ImApiClient
from fixtures import register_and_login
from gate_common import StepResult


def run_social_sit(base_url: str) -> list[StepResult]:
    results: list[StepResult] = []
    client = ImApiClient(base_url)
    a = register_and_login(client)
    b = register_and_login(client)
    ca = ImApiClient(base_url, a.token)
    cb = ImApiClient(base_url, b.token)

    # Send friend request
    req = ca.post("/api/friend/request", {"targetUserId": b.user_id})
    results.append(StepResult("social friend request", "PASS" if req.status_code == 200 else "FAIL", 0, 0.0, "", ""))

    # List pending requests
    pending = cb.get("/api/friend/requests").json.get("data", [])
    req_id = next((r.get("id") for r in pending if int(r.get("applicantId", 0)) == a.user_id), None)
    results.append(StepResult("social pending requests", "PASS" if req_id else "FAIL", 0, 0.0, "", ""))

    # Reject request
    reject = cb.post("/api/friend/reject", {"requestId": req_id})
    results.append(StepResult("social reject request", "PASS" if reject.status_code == 200 else "FAIL", 0, 0.0, "", ""))

    # Re-request and accept
    req2 = ca.post("/api/friend/request", {"targetUserId": b.user_id})
    pending2 = cb.get("/api/friend/requests").json.get("data", [])
    req_id2 = next((r.get("id") for r in pending2 if int(r.get("applicantId", 0)) == a.user_id), None)
    accept = cb.post("/api/friend/accept", {"requestId": req_id2})
    results.append(StepResult("social accept request", "PASS" if accept.status_code == 200 else "FAIL", 0, 0.0, "", ""))

    # Update remark
    remark = ca.put("/api/friend/remark", {"friendUserId": b.user_id, "remark": "Buddy"})
    results.append(StepResult("social update remark", "PASS" if remark.status_code == 200 else "FAIL", 0, 0.0, "", ""))

    # Remove friend
    remove = ca.delete(f"/api/friend/remove?friendUserId={b.user_id}")
    results.append(StepResult("social remove friend", "PASS" if remove.status_code == 200 else "FAIL", 0, 0.0, "", ""))

    return results
