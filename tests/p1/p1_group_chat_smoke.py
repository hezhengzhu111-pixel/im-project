#!/usr/bin/env python3
"""P1 Group Chat Smoke Test.

Verifies the core group chat main link using the real backend:
- Create group and invite members
- Group list for all members
- Send / receive group text messages
- Group history recovery
- Owner removes member
- Member leaves group
- Owner dismisses group
- Dismissed / removed members cannot send messages

Usage:
    python tests/p1/p1_group_chat_smoke.py --base-url http://localhost:8082
"""

from __future__ import annotations

import argparse
import os
import sys
import time
from typing import Any

# Allow imports from tests/domains/common
sys.path.insert(
    0, os.path.join(os.path.dirname(__file__), "..", "domains", "common")
)
from api_client import ImApiClient
from fixtures import (
    TestUser,
    assert_ok,
    create_group,
    make_friends,
    register_and_login,
    send_group_message,
    unique_username,
)


def _client(base_url: str, user: TestUser) -> ImApiClient:
    return ImApiClient(base_url, user.token)


def _user_groups(base_url: str, user: TestUser) -> list[dict[str, Any]]:
    resp = _client(base_url, user).get(f"/api/group/user/{user.user_id}")
    data = assert_ok(resp, f"list groups for {user.username}")
    return data if isinstance(data, list) else []


def _group_history(
    base_url: str, user: TestUser, group_id: int
) -> list[dict[str, Any]]:
    resp = _client(base_url, user).get(f"/api/message/group/{group_id}")
    data = assert_ok(resp, f"group history for {user.username}")
    return data if isinstance(data, list) else []


def _try_send_group(
    base_url: str, user: TestUser, group_id: int, content: str
) -> bool:
    try:
        send_group_message(base_url, user, group_id, content)
        return True
    except RuntimeError:
        return False


def run(base_url: str) -> dict[str, Any]:
    results: dict[str, str] = {}

    # Register three users.
    owner = register_and_login(ImApiClient(base_url), unique_username("p1g_owner_"))
    member_b = register_and_login(
        ImApiClient(base_url), unique_username("p1g_member_b_")
    )
    member_c = register_and_login(
        ImApiClient(base_url), unique_username("p1g_member_c_")
    )

    # Establish friendships so members can be added.
    make_friends(base_url, owner, member_b)
    make_friends(base_url, owner, member_c)

    # Create group with B and C.
    group_id = create_group(
        base_url,
        owner,
        [member_b.user_id, member_c.user_id],
        unique_username("p1g_group_"),
    )

    # B and C should see the group in their list.
    time.sleep(0.5)
    owner_groups = _user_groups(base_url, owner)
    b_groups = _user_groups(base_url, member_b)
    c_groups = _user_groups(base_url, member_c)

    results["owner_sees_group"] = (
        "PASS" if any(g["id"] == str(group_id) for g in owner_groups) else "FAIL"
    )
    results["b_sees_group"] = (
        "PASS" if any(g["id"] == str(group_id) for g in b_groups) else "FAIL"
    )
    results["c_sees_group"] = (
        "PASS" if any(g["id"] == str(group_id) for g in c_groups) else "FAIL"
    )

    # Owner sends a group message.
    send_group_message(base_url, owner, group_id, "hello from owner")
    time.sleep(0.5)

    # B and C should see the message in history.
    b_history = _group_history(base_url, member_b, group_id)
    c_history = _group_history(base_url, member_c, group_id)

    results["b_sees_owner_message"] = (
        "PASS"
        if any(m.get("content") == "hello from owner" for m in b_history)
        else "FAIL"
    )
    results["c_sees_owner_message"] = (
        "PASS"
        if any(m.get("content") == "hello from owner" for m in c_history)
        else "FAIL"
    )

    # B sends a group message.
    send_group_message(base_url, member_b, group_id, "hello from b")
    time.sleep(0.5)

    # Owner and C should see B's message.
    owner_history = _group_history(base_url, owner, group_id)
    c_history2 = _group_history(base_url, member_c, group_id)

    results["owner_sees_b_message"] = (
        "PASS"
        if any(m.get("content") == "hello from b" for m in owner_history)
        else "FAIL"
    )
    results["c_sees_b_message"] = (
        "PASS"
        if any(m.get("content") == "hello from b" for m in c_history2)
        else "FAIL"
    )

    # Owner removes C.
    remove_resp = _client(base_url, owner).post(
        f"/api/group/{group_id}/remove-members",
        {"memberIds": [member_c.user_id]},
    )
    assert_ok(remove_resp, "owner removes c")
    time.sleep(0.5)

    # C should no longer be able to send group messages.
    c_can_send = _try_send_group(base_url, member_c, group_id, "from removed c")
    results["removed_c_cannot_send"] = "PASS" if not c_can_send else "FAIL"

    # B leaves the group.
    leave_resp = _client(base_url, member_b).post(
        f"/api/group/{group_id}/leave", {}
    )
    assert_ok(leave_resp, "b leaves group")
    time.sleep(0.5)

    # B should no longer be able to send group messages.
    b_can_send = _try_send_group(base_url, member_b, group_id, "from left b")
    results["left_b_cannot_send"] = "PASS" if not b_can_send else "FAIL"

    # Owner dismisses the group.
    dismiss_resp = _client(base_url, owner).delete(f"/api/group/{group_id}")
    assert_ok(dismiss_resp, "owner dismisses group")
    time.sleep(0.5)

    # Owner should no longer be able to send group messages.
    owner_can_send = _try_send_group(
        base_url, owner, group_id, "from dismissed owner"
    )
    results["dismissed_owner_cannot_send"] = (
        "PASS" if not owner_can_send else "FAIL"
    )

    return {
        "results": results,
        "summary": "PASS" if all(v == "PASS" for v in results.values()) else "FAIL",
    }


def main() -> int:
    parser = argparse.ArgumentParser(description="P1 Group Chat Smoke Test")
    parser.add_argument("--base-url", default="http://localhost:8082")
    args = parser.parse_args()

    print(f"Running P1 group chat smoke against {args.base_url}")
    outcome = run(args.base_url)
    for name, result in outcome["results"].items():
        print(f"  {name}: {result}")
    print(f"SUMMARY: {outcome['summary']}")
    return 0 if outcome["summary"] == "PASS" else 1


if __name__ == "__main__":
    sys.exit(main())
