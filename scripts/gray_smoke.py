#!/usr/bin/env python3
"""Gray release smoke tests covering all critical scenarios."""

from __future__ import annotations

import argparse
import json
import os
import sys
import time
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional

from gate_common import ROOT, REPORT_DIR, sanitize

try:
    import requests
except ImportError:
    requests = None


def extract_data(response_json: dict) -> dict:
    """Extract data from ApiResponse wrapper."""
    if "data" in response_json:
        return response_json["data"]
    return response_json


def check_p1_sit_status(root: Path) -> tuple[bool, str, Optional[Path]]:
    """Check P1 SIT status from artifact directory.

    Returns:
        (passed, error_message, report_path)
        - passed: True if P1 SIT passed and valid for sign-off
        - error_message: Error description if failed, None if passed
        - report_path: Path to the summary file used
    """
    possible_paths = [
        root / "artifacts" / "p1-sit",
        root / "build" / "artifacts" / "p1-sit",
    ]

    p1_sit_report = None
    for path in possible_paths:
        if path.exists():
            p1_sit_report = path
            break

    if not p1_sit_report:
        return False, f"P1 SIT report not found in {possible_paths}", None

    # Look for latest P1 SIT summary
    for timestamp_dir in sorted(p1_sit_report.iterdir(), reverse=True):
        # Prefer summary.json (machine-readable)
        summary_json_file = timestamp_dir / "summary.json"
        summary_md_file = timestamp_dir / "summary.md"

        if summary_json_file.exists():
            try:
                data = json.loads(summary_json_file.read_text(encoding="utf-8"))
                overall_status = data.get("overall_status", "").upper()
                valid_for_signoff = data.get("valid_for_p1_signoff", False)

                if overall_status == "PASS" and valid_for_signoff:
                    return True, None, summary_json_file
                else:
                    error = f"P1 SIT status: {overall_status}, valid_for_p1_signoff: {valid_for_signoff}"
                    return False, error, summary_json_file
            except (json.JSONDecodeError, KeyError) as e:
                # Fallback to summary.md if JSON is invalid
                pass

        if summary_md_file.exists():
            return _check_p1_sit_markdown(summary_md_file)

    return False, f"No P1 SIT summary found in {p1_sit_report}", None


def _check_p1_sit_markdown(summary_path: Path) -> tuple[bool, str, Optional[Path]]:
    """Check P1 SIT status from summary.md using strict parsing.

    Strict rules:
    - fail == 0
    - pending == 0
    - allowed-pending == 0
    - allowed-fail == 0
    - pass > 0
    """
    content = summary_path.read_text(encoding="utf-8")
    lines = content.splitlines()

    counts = {}
    for line in lines:
        # Parse table rows like: | pass | 5 |
        if line.startswith("|") and "|" in line[1:]:
            parts = [p.strip() for p in line.split("|")]
            if len(parts) >= 3:
                status_name = parts[1].strip()
                count_str = parts[2].strip()
                if status_name in ("pass", "fail", "pending", "allowed-pending", "allowed-fail"):
                    try:
                        counts[status_name] = int(count_str)
                    except ValueError:
                        pass

    pass_count = counts.get("pass", 0)
    fail_count = counts.get("fail", 0)
    pending_count = counts.get("pending", 0)
    allowed_pending_count = counts.get("allowed-pending", 0)
    allowed_fail_count = counts.get("allowed-fail", 0)

    # Strict validation
    if fail_count > 0:
        return False, f"P1 SIT has {fail_count} failure(s)", summary_path
    if pending_count > 0:
        return False, f"P1 SIT has {pending_count} pending test(s)", summary_path
    if allowed_pending_count > 0:
        return False, f"P1 SIT has {allowed_pending_count} allowed-pending (NOT VALID for sign-off)", summary_path
    if allowed_fail_count > 0:
        return False, f"P1 SIT has {allowed_fail_count} allowed-fail(s)", summary_path
    if pass_count <= 0:
        return False, "P1 SIT has no passing tests", summary_path

    return True, None, summary_path


class GraySmokeTest:
    """Gray release smoke test suite."""

    def __init__(
        self,
        env: str,
        api_base: str,
        ws_base: str,
        db_url: str,
        prefix: str,
    ):
        self.env = env
        self.api_base = api_base
        self.ws_base = ws_base
        self.db_url = db_url
        self.prefix = prefix
        self.scenarios = []
        self.users = {}  # {username: {token, user_id, ...}}
        self.groups = {}
        self.messages = {}
        self.files = {}
        self.moments = {}

    def generate_username(self, suffix: str = "") -> str:
        """Generate unique test username."""
        return f"{self.prefix}_{suffix}_{uuid.uuid4().hex[:6]}"

    def register_and_login(self, username: str, password: str = "TestPassword123!") -> dict:
        """Register and login a user."""
        try:
            # Register
            resp = requests.post(
                f"{self.api_base}/api/user/register",
                json={"username": username, "password": password},
                timeout=30,
            )
            if resp.status_code not in (200, 201):
                return {"success": False, "error": f"Register failed: {resp.status_code}"}

            data = extract_data(resp.json())
            token = data.get("token") or data.get("accessToken")
            user_id = data.get("userId") or data.get("id")

            if not token:
                return {"success": False, "error": "No token received"}

            return {
                "success": True,
                "token": token,
                "user_id": user_id,
                "username": username,
            }
        except Exception as e:
            return {"success": False, "error": str(e)[:100]}

    def get_headers(self, username: str) -> dict:
        """Get authorization headers for user."""
        user = self.users.get(username, {})
        token = user.get("token", "")
        return {"Authorization": f"Bearer {token}"} if token else {}

    def add_scenario(
        self,
        name: str,
        status: str,
        critical: bool = True,
        error: Optional[str] = None,
        duration_ms: float = 0,
        details: Optional[dict] = None,
    ):
        """Add scenario result."""
        self.scenarios.append({
            "name": name,
            "status": status,
            "critical": critical,
            "error": error,
            "duration_ms": round(duration_ms, 2),
            "details": details or {},
        })

    def run_scenario(self, name: str, func, critical: bool = True):
        """Run a scenario and record result."""
        print(f"\n==> {name}")
        start = time.time()
        try:
            result = func()
            duration = (time.time() - start) * 1000
            if result.get("success", False):
                self.add_scenario(name, "PASS", critical, duration_ms=duration, details=result.get("details", {}))
                print(f"  PASS ({duration:.2f}ms)")
            else:
                self.add_scenario(name, "FAIL", critical, error=result.get("error"), duration_ms=duration)
                print(f"  FAIL: {result.get('error')}")
            return result
        except Exception as e:
            duration = (time.time() - start) * 1000
            self.add_scenario(name, "FAIL", critical, error=str(e)[:100], duration_ms=duration)
            print(f"  FAIL: {e}")
            return {"success": False, "error": str(e)[:100]}

    # ===== A. Auth Smoke =====

    def test_auth_register(self) -> dict:
        """Register users A, B, C."""
        for suffix in ["A", "B", "C"]:
            username = self.generate_username(suffix)
            password = "TestPassword123!"
            result = self.register_and_login(username, password)
            if not result["success"]:
                return {"success": False, "error": f"Failed to register {username}: {result.get('error')}"}
            self.users[username] = {
                "token": result["token"],
                "user_id": result["user_id"],
                "password": password,
            }
        return {"success": True, "details": {"users_registered": len(self.users)}}

    def test_auth_login(self) -> dict:
        """Verify login for all users."""
        for username, user in self.users.items():
            try:
                resp = requests.post(
                    f"{self.api_base}/api/user/login",
                    json={"username": username, "password": user["password"]},
                    timeout=30,
                )
                if resp.status_code != 200:
                    return {"success": False, "error": f"Login failed for {username}: {resp.status_code}"}
                data = extract_data(resp.json())
                if not (data.get("token") or data.get("accessToken")):
                    return {"success": False, "error": f"No token for {username}"}
            except Exception as e:
                return {"success": False, "error": f"Login error for {username}: {str(e)[:50]}"}
        return {"success": True}

    def test_auth_refresh(self) -> dict:
        """Test token refresh."""
        if not self.users:
            return {"success": False, "error": "No users available"}
        username = list(self.users.keys())[0]
        headers = self.get_headers(username)
        try:
            resp = requests.post(
                f"{self.api_base}/api/auth/refresh",
                headers=headers,
                timeout=30,
            )
            if resp.status_code == 200:
                return {"success": True}
            return {"success": False, "error": f"Refresh failed: {resp.status_code}"}
        except Exception as e:
            return {"success": False, "error": str(e)[:100]}

    def test_auth_ws_ticket(self) -> dict:
        """Test ws-ticket endpoint."""
        if not self.users:
            return {"success": False, "error": "No users available"}
        username = list(self.users.keys())[0]
        headers = self.get_headers(username)
        try:
            resp = requests.post(
                f"{self.api_base}/api/auth/ws-ticket",
                headers=headers,
                timeout=30,
            )
            if resp.status_code == 200:
                data = extract_data(resp.json())
                return {"success": True, "details": {"has_ticket": "ticket" in data or "token" in data}}
            return {"success": False, "error": f"Get ticket failed: {resp.status_code}"}
        except Exception as e:
            return {"success": False, "error": str(e)[:100]}

    def test_auth_logout(self) -> dict:
        """Test logout."""
        if not self.users:
            return {"success": False, "error": "No users available"}
        username = list(self.users.keys())[0]
        headers = self.get_headers(username)
        try:
            resp = requests.post(
                f"{self.api_base}/api/user/logout",
                headers=headers,
                timeout=30,
            )
            if resp.status_code in (200, 204):
                return {"success": True}
            return {"success": False, "error": f"Logout failed: {resp.status_code}"}
        except Exception as e:
            return {"success": False, "error": str(e)[:100]}

    # ===== B. User Smoke =====

    def test_user_profile(self) -> dict:
        """Test get user profile."""
        if not self.users:
            return {"success": False, "error": "No users available"}
        username = list(self.users.keys())[0]
        headers = self.get_headers(username)
        try:
            resp = requests.get(
                f"{self.api_base}/api/user/profile",
                headers=headers,
                timeout=30,
            )
            if resp.status_code == 200:
                return {"success": True}
            return {"success": False, "error": f"Get profile failed: {resp.status_code}"}
        except Exception as e:
            return {"success": False, "error": str(e)[:100]}

    def test_user_update_profile(self) -> dict:
        """Test update user profile."""
        if not self.users:
            return {"success": False, "error": "No users available"}
        username = list(self.users.keys())[0]
        headers = self.get_headers(username)
        try:
            resp = requests.put(
                f"{self.api_base}/api/user/profile",
                headers=headers,
                json={
                    "nickname": f"Gray Test {uuid.uuid4().hex[:4]}",
                    "signature": "Gray test signature",
                    "location": "Test City",
                },
                timeout=30,
            )
            if resp.status_code == 200:
                return {"success": True}
            return {"success": False, "error": f"Update profile failed: {resp.status_code}"}
        except Exception as e:
            return {"success": False, "error": str(e)[:100]}

    def test_user_search(self) -> dict:
        """Test user search."""
        if len(self.users) < 2:
            return {"success": False, "error": "Need at least 2 users"}
        username = list(self.users.keys())[0]
        search_username = list(self.users.keys())[1]
        headers = self.get_headers(username)
        try:
            resp = requests.get(
                f"{self.api_base}/api/user/search",
                headers=headers,
                params={"keyword": search_username[:10]},
                timeout=30,
            )
            if resp.status_code == 200:
                return {"success": True}
            return {"success": False, "error": f"Search user failed: {resp.status_code}"}
        except Exception as e:
            return {"success": False, "error": str(e)[:100]}

    def test_user_heartbeat(self) -> dict:
        """Test user heartbeat."""
        if not self.users:
            return {"success": False, "error": "No users available"}
        username = list(self.users.keys())[0]
        headers = self.get_headers(username)
        try:
            resp = requests.post(
                f"{self.api_base}/api/user/heartbeat",
                headers=headers,
                json=[],  # Empty array for heartbeat
                timeout=30,
            )
            if resp.status_code in (200, 204):
                return {"success": True}
            return {"success": False, "error": f"Heartbeat failed: {resp.status_code}"}
        except Exception as e:
            return {"success": False, "error": str(e)[:100]}

    def test_user_settings(self) -> dict:
        """Test user settings get/update."""
        if not self.users:
            return {"success": False, "error": "No users available"}
        username = list(self.users.keys())[0]
        headers = self.get_headers(username)
        try:
            # Get settings
            resp = requests.get(
                f"{self.api_base}/api/user/settings",
                headers=headers,
                timeout=30,
            )
            if resp.status_code != 200:
                return {"success": False, "error": f"Get settings failed: {resp.status_code}"}

            # Update settings
            resp = requests.put(
                f"{self.api_base}/api/user/settings/general",
                headers=headers,
                json={"theme": "dark"},
                timeout=30,
            )
            if resp.status_code in (200, 204):
                return {"success": True}
            return {"success": False, "error": f"Update settings failed: {resp.status_code}"}
        except Exception as e:
            return {"success": False, "error": str(e)[:100]}

    # ===== C. Friend Smoke =====

    def test_friend_request_and_accept(self) -> dict:
        """Test friend request flow."""
        if len(self.users) < 2:
            return {"success": False, "error": "Need at least 2 users"}
        user_a = list(self.users.keys())[0]
        user_b = list(self.users.keys())[1]
        headers_a = self.get_headers(user_a)
        headers_b = self.get_headers(user_b)
        try:
            # A sends friend request to B
            resp = requests.post(
                f"{self.api_base}/api/friend/request",
                headers=headers_a,
                json={"targetUserId": str(self.users[user_b]["user_id"])},
                timeout=30,
            )
            if resp.status_code not in (200, 201):
                return {"success": False, "error": f"Send request failed: {resp.status_code}"}

            # B lists friend requests
            resp = requests.get(
                f"{self.api_base}/api/friend/requests",
                headers=headers_b,
                timeout=30,
            )
            if resp.status_code != 200:
                return {"success": False, "error": f"List requests failed: {resp.status_code}"}

            # Extract request ID
            requests_data = extract_data(resp.json())
            request_list = requests_data if isinstance(requests_data, list) else requests_data.get("requests", [])
            if not request_list:
                return {"success": False, "error": "No friend requests found"}

            request_id = request_list[0].get("requestId") or request_list[0].get("id")

            # B accepts request
            resp = requests.post(
                f"{self.api_base}/api/friend/accept",
                headers=headers_b,
                json={"requestId": str(request_id)},
                timeout=30,
            )
            if resp.status_code in (200, 201):
                return {"success": True}
            return {"success": False, "error": f"Accept request failed: {resp.status_code}"}
        except Exception as e:
            return {"success": False, "error": str(e)[:100]}

    def test_friend_list(self) -> dict:
        """Test friend list contains each other."""
        if len(self.users) < 2:
            return {"success": False, "error": "Need at least 2 users"}
        user_a = list(self.users.keys())[0]
        user_b = list(self.users.keys())[1]
        headers_a = self.get_headers(user_a)
        try:
            resp = requests.get(
                f"{self.api_base}/api/friend/list",
                headers=headers_a,
                timeout=30,
            )
            if resp.status_code == 200:
                data = extract_data(resp.json())
                friends = data if isinstance(data, list) else data.get("friends", [])
                user_b_id = str(self.users[user_b]["user_id"])
                found = any(
                    str(f.get("userId") or f.get("id")) == user_b_id
                    for f in friends
                )
                if found:
                    return {"success": True}
                return {"success": False, "error": "User B not in friend list"}
            return {"success": False, "error": f"Get friends failed: {resp.status_code}"}
        except Exception as e:
            return {"success": False, "error": str(e)[:100]}

    # ===== D. Private Message Smoke =====

    def test_private_message(self) -> dict:
        """Test private message send and receive."""
        if len(self.users) < 2:
            return {"success": False, "error": "Need at least 2 users"}
        user_a = list(self.users.keys())[0]
        user_b = list(self.users.keys())[1]
        headers_a = self.get_headers(user_a)
        headers_b = self.get_headers(user_b)
        message_text = f"Gray test message {uuid.uuid4().hex[:8]}"
        client_message_id = str(uuid.uuid4())
        try:
            # A sends message to B
            resp = requests.post(
                f"{self.api_base}/api/message/send/private",
                headers=headers_a,
                json={
                    "receiverId": str(self.users[user_b]["user_id"]),
                    "content": message_text,
                    "messageType": "text",
                    "clientMessageId": client_message_id,
                },
                timeout=30,
            )
            if resp.status_code not in (200, 201):
                return {"success": False, "error": f"Send message failed: {resp.status_code}"}

            data = extract_data(resp.json())
            message_id = data.get("messageId") or data.get("id")
            self.messages[message_id] = {"text": message_text, "client_id": client_message_id}

            # B gets private history
            resp = requests.get(
                f"{self.api_base}/api/message/private/{self.users[user_a]['user_id']}",
                headers=headers_b,
                params={"size": 20},
                timeout=30,
            )
            if resp.status_code == 200:
                return {"success": True, "details": {"message_id": message_id}}
            return {"success": False, "error": f"Get history failed: {resp.status_code}"}
        except Exception as e:
            return {"success": False, "error": str(e)[:100]}

    def test_private_message_recall(self) -> dict:
        """Test private message recall."""
        if not self.messages:
            return {"success": False, "error": "No messages to recall"}
        user_a = list(self.users.keys())[0]
        headers_a = self.get_headers(user_a)
        message_id = list(self.messages.keys())[0]
        try:
            resp = requests.post(
                f"{self.api_base}/api/message/recall/{message_id}",
                headers=headers_a,
                timeout=30,
            )
            if resp.status_code in (200, 204):
                return {"success": True}
            return {"success": False, "error": f"Recall failed: {resp.status_code}"}
        except Exception as e:
            return {"success": False, "error": str(e)[:100]}

    def test_old_message_path_negative(self) -> dict:
        """Test old /message path returns 404/405."""
        if not self.users:
            return {"success": False, "error": "No users available"}
        username = list(self.users.keys())[0]
        headers = self.get_headers(username)
        try:
            resp = requests.get(
                f"{self.api_base}/message/send",
                headers=headers,
                timeout=30,
            )
            if resp.status_code in (404, 405, 400):
                return {"success": True, "details": {"status_code": resp.status_code}}
            return {"success": False, "error": f"Expected 404/405, got {resp.status_code}"}
        except Exception as e:
            return {"success": False, "error": str(e)[:100]}

    # ===== E. Private E2EE Smoke =====

    def test_e2ee_private_smoke(self) -> dict:
        """Test E2EE private smoke - MUST depend on P1 SIT report."""
        passed, error, report_path = check_p1_sit_status(ROOT)
        if not passed:
            return {"success": False, "error": f"{error} ({report_path}) - E2EE smoke cannot proceed"}
        return {"success": True, "details": {"p1_sit_report": str(report_path)}}

    def test_e2ee_group_smoke(self) -> dict:
        """Test E2EE group smoke - MUST depend on P1 SIT report."""
        passed, error, report_path = check_p1_sit_status(ROOT)
        if not passed:
            return {"success": False, "error": f"{error} ({report_path}) - Group E2EE smoke cannot proceed"}
        return {"success": True, "details": {"p1_sit_report": str(report_path)}}

    # ===== F. Group Smoke =====

    def test_group_create(self) -> dict:
        """Test group creation."""
        if not self.users:
            return {"success": False, "error": "No users available"}
        user_a = list(self.users.keys())[0]
        headers_a = self.get_headers(user_a)
        group_name = f"gray_group_{uuid.uuid4().hex[:8]}"
        try:
            resp = requests.post(
                f"{self.api_base}/api/group/create",
                headers=headers_a,
                json={
                    "groupName": group_name,
                },
                timeout=30,
            )
            if resp.status_code in (200, 201):
                data = extract_data(resp.json())
                group_id = data.get("groupId") or data.get("id")
                self.groups[group_id] = {"name": group_name, "owner": user_a}
                return {"success": True, "details": {"group_id": group_id}}
            return {"success": False, "error": f"Create group failed: {resp.status_code}"}
        except Exception as e:
            return {"success": False, "error": str(e)[:100]}

    def test_group_add_members(self) -> dict:
        """Test adding members to group."""
        if not self.groups or len(self.users) < 3:
            return {"success": False, "error": "Need group and at least 3 users"}
        group_id = list(self.groups.keys())[0]
        user_a = list(self.users.keys())[0]
        headers_a = self.get_headers(user_a)
        try:
            # Add user B and C to group
            member_ids = [str(self.users[username]["user_id"]) for username in list(self.users.keys())[1:3]]
            resp = requests.post(
                f"{self.api_base}/api/group/{group_id}/add-members",
                headers=headers_a,
                json=member_ids,
                timeout=30,
            )
            if resp.status_code in (200, 201):
                return {"success": True}
            return {"success": False, "error": f"Add members failed: {resp.status_code}"}
        except Exception as e:
            return {"success": False, "error": str(e)[:100]}

    def test_group_members_list(self) -> dict:
        """Test group members list."""
        if not self.groups:
            return {"success": False, "error": "No groups available"}
        group_id = list(self.groups.keys())[0]
        user_a = list(self.users.keys())[0]
        headers_a = self.get_headers(user_a)
        try:
            resp = requests.post(
                f"{self.api_base}/api/group/members/list",
                headers=headers_a,
                json={"groupId": str(group_id)},
                timeout=30,
            )
            if resp.status_code == 200:
                return {"success": True}
            return {"success": False, "error": f"Get members failed: {resp.status_code}"}
        except Exception as e:
            return {"success": False, "error": str(e)[:100]}

    def test_group_message(self) -> dict:
        """Test group message send and history."""
        if not self.groups:
            return {"success": False, "error": "No groups available"}
        group_id = list(self.groups.keys())[0]
        user_a = list(self.users.keys())[0]
        headers_a = self.get_headers(user_a)
        try:
            # Send group message
            resp = requests.post(
                f"{self.api_base}/api/message/send/group",
                headers=headers_a,
                json={
                    "groupId": str(group_id),
                    "content": f"Gray group message {uuid.uuid4().hex[:8]}",
                    "messageType": "text",
                },
                timeout=30,
            )
            if resp.status_code not in (200, 201):
                return {"success": False, "error": f"Send group message failed: {resp.status_code}"}

            # Get group history
            resp = requests.get(
                f"{self.api_base}/api/message/group/{group_id}",
                headers=headers_a,
                params={"size": 20},
                timeout=30,
            )
            if resp.status_code == 200:
                return {"success": True}
            return {"success": False, "error": f"Get group history failed: {resp.status_code}"}
        except Exception as e:
            return {"success": False, "error": str(e)[:100]}

    def test_group_dismiss(self) -> dict:
        """Test group dismiss."""
        if not self.groups:
            return {"success": False, "error": "No groups available"}
        group_id = list(self.groups.keys())[0]
        user_a = list(self.users.keys())[0]
        headers_a = self.get_headers(user_a)
        try:
            resp = requests.delete(
                f"{self.api_base}/api/group/{group_id}",
                headers=headers_a,
                timeout=30,
            )
            if resp.status_code in (200, 204):
                del self.groups[group_id]
                return {"success": True}
            return {"success": False, "error": f"Dismiss group failed: {resp.status_code}"}
        except Exception as e:
            return {"success": False, "error": str(e)[:100]}

    # ===== H. File/Avatar Smoke =====

    def test_file_upload(self) -> dict:
        """Test file upload."""
        if not self.users:
            return {"success": False, "error": "No users available"}
        username = list(self.users.keys())[0]
        headers = self.get_headers(username)
        try:
            test_content = b"gray-test-file-content-" + uuid.uuid4().bytes
            files = {"file": ("gray_test.txt", test_content, "text/plain")}
            resp = requests.post(
                f"{self.api_base}/api/file/upload/file",
                headers=headers,
                files=files,
                timeout=30,
            )
            if resp.status_code in (200, 201):
                data = extract_data(resp.json())
                filename = data.get("filename")
                category = data.get("category", "file")
                upload_date = data.get("uploadDate")
                self.files[filename] = {
                    "content": test_content,
                    "filename": "gray_test.txt",
                    "category": category,
                    "date": upload_date,
                }
                return {"success": True, "details": {"filename": filename}}
            return {"success": False, "error": f"Upload failed: {resp.status_code}"}
        except Exception as e:
            return {"success": False, "error": str(e)[:100]}

    def test_file_download(self) -> dict:
        """Test file download."""
        if not self.files:
            return {"success": False, "error": "No files available"}
        username = list(self.users.keys())[0]
        headers = self.get_headers(username)
        filename = list(self.files.keys())[0]
        file_info = self.files[filename]
        try:
            resp = requests.get(
                f"{self.api_base}/api/file/download",
                headers=headers,
                params={
                    "category": file_info["category"],
                    "date": file_info["date"],
                    "filename": filename,
                },
                timeout=30,
            )
            if resp.status_code == 200:
                return {"success": True}
            return {"success": False, "error": f"Download failed: {resp.status_code}"}
        except Exception as e:
            return {"success": False, "error": str(e)[:100]}

    def test_file_delete(self) -> dict:
        """Test file delete."""
        if not self.files:
            return {"success": False, "error": "No files available"}
        username = list(self.users.keys())[0]
        headers = self.get_headers(username)
        filename = list(self.files.keys())[0]
        file_info = self.files[filename]
        try:
            resp = requests.delete(
                f"{self.api_base}/api/file/delete",
                headers=headers,
                params={
                    "category": file_info["category"],
                    "date": file_info["date"],
                    "filename": filename,
                },
                timeout=30,
            )
            if resp.status_code in (200, 204):
                del self.files[filename]
                return {"success": True}
            return {"success": False, "error": f"Delete failed: {resp.status_code}"}
        except Exception as e:
            return {"success": False, "error": str(e)[:100]}

    # ===== I. Moments Smoke =====

    def test_moments_create(self) -> dict:
        """Test create moment post."""
        if not self.users:
            return {"success": False, "error": "No users available"}
        username = list(self.users.keys())[0]
        headers = self.get_headers(username)
        try:
            resp = requests.post(
                f"{self.api_base}/api/moments",
                headers=headers,
                json={"content": f"Gray test moment {uuid.uuid4().hex[:8]}", "visibility": "public"},
                timeout=30,
            )
            if resp.status_code in (200, 201):
                data = extract_data(resp.json())
                moment_id = data.get("momentId") or data.get("id")
                self.moments[moment_id] = {"content": "Gray test moment"}
                return {"success": True, "details": {"moment_id": moment_id}}
            return {"success": False, "error": f"Create moment failed: {resp.status_code}"}
        except Exception as e:
            return {"success": False, "error": str(e)[:100]}

    def test_moments_feed(self) -> dict:
        """Test moments feed."""
        if not self.users:
            return {"success": False, "error": "No users available"}
        username = list(self.users.keys())[0]
        headers = self.get_headers(username)
        try:
            resp = requests.get(
                f"{self.api_base}/api/moments/feed",
                headers=headers,
                timeout=30,
            )
            if resp.status_code == 200:
                return {"success": True}
            return {"success": False, "error": f"Get feed failed: {resp.status_code}"}
        except Exception as e:
            return {"success": False, "error": str(e)[:100]}

    def test_moments_like(self) -> dict:
        """Test moments like/unlike."""
        if not self.moments:
            return {"success": False, "error": "No moments available"}
        username = list(self.users.keys())[0]
        headers = self.get_headers(username)
        moment_id = list(self.moments.keys())[0]
        try:
            # Like
            resp = requests.post(
                f"{self.api_base}/api/moments/{moment_id}/like",
                headers=headers,
                timeout=30,
            )
            if resp.status_code not in (200, 201):
                return {"success": False, "error": f"Like failed: {resp.status_code}"}

            # Unlike
            resp = requests.delete(
                f"{self.api_base}/api/moments/{moment_id}/like",
                headers=headers,
                timeout=30,
            )
            if resp.status_code in (200, 204):
                return {"success": True}
            return {"success": False, "error": f"Unlike failed: {resp.status_code}"}
        except Exception as e:
            return {"success": False, "error": str(e)[:100]}

    def test_moments_comment(self) -> dict:
        """Test moments comment."""
        if not self.moments:
            return {"success": False, "error": "No moments available"}
        username = list(self.users.keys())[0]
        headers = self.get_headers(username)
        moment_id = list(self.moments.keys())[0]
        try:
            # Create comment
            resp = requests.post(
                f"{self.api_base}/api/moments/{moment_id}/comments",
                headers=headers,
                json={"content": f"Gray comment {uuid.uuid4().hex[:8]}"},
                timeout=30,
            )
            if resp.status_code in (200, 201):
                return {"success": True}
            return {"success": False, "error": f"Create comment failed: {resp.status_code}"}
        except Exception as e:
            return {"success": False, "error": str(e)[:100]}

    def test_moments_delete(self) -> dict:
        """Test delete moment."""
        if not self.moments:
            return {"success": False, "error": "No moments available"}
        username = list(self.users.keys())[0]
        headers = self.get_headers(username)
        moment_id = list(self.moments.keys())[0]
        try:
            resp = requests.delete(
                f"{self.api_base}/api/moments/{moment_id}",
                headers=headers,
                timeout=30,
            )
            if resp.status_code in (200, 204):
                del self.moments[moment_id]
                return {"success": True}
            return {"success": False, "error": f"Delete moment failed: {resp.status_code}"}
        except Exception as e:
            return {"success": False, "error": str(e)[:100]}

    # ===== J. AI Smoke =====

    def test_ai_keys(self) -> dict:
        """Test AI key management."""
        if not self.users:
            return {"success": False, "error": "No users available"}
        username = list(self.users.keys())[0]
        headers = self.get_headers(username)
        try:
            # List keys
            resp = requests.get(
                f"{self.api_base}/api/ai/keys",
                headers=headers,
                timeout=30,
            )
            if resp.status_code != 200:
                return {"success": False, "error": f"List keys failed: {resp.status_code}"}

            # Create key (with test key)
            resp = requests.post(
                f"{self.api_base}/api/ai/keys",
                headers=headers,
                json={"provider": "openai", "key": "sk-test-gray-key-12345", "label": "Gray Test Key"},
                timeout=30,
            )
            if resp.status_code in (200, 201):
                return {"success": True}
            return {"success": False, "error": f"Create key failed: {resp.status_code}"}
        except Exception as e:
            return {"success": False, "error": str(e)[:100]}

    def test_ai_settings(self) -> dict:
        """Test AI settings."""
        if not self.users:
            return {"success": False, "error": "No users available"}
        username = list(self.users.keys())[0]
        headers = self.get_headers(username)
        try:
            resp = requests.get(
                f"{self.api_base}/api/ai/settings",
                headers=headers,
                timeout=30,
            )
            if resp.status_code == 200:
                return {"success": True}
            return {"success": False, "error": f"Get AI settings failed: {resp.status_code}"}
        except Exception as e:
            return {"success": False, "error": str(e)[:100]}

    # ===== K. Push Smoke =====

    def test_push_register(self) -> dict:
        """Test push device registration."""
        if not self.users:
            return {"success": False, "error": "No users available"}
        username = list(self.users.keys())[0]
        headers = self.get_headers(username)
        try:
            resp = requests.post(
                f"{self.api_base}/api/push/devices/register",
                headers=headers,
                json={
                    "deviceId": f"gray_device_{uuid.uuid4().hex[:8]}",
                    "platform": "android",
                    "fcmToken": f"gray_fcm_{uuid.uuid4().hex[:8]}",
                    "deviceModel": "Gray Test Device",
                },
                timeout=30,
            )
            if resp.status_code in (200, 201):
                return {"success": True}
            return {"success": False, "error": f"Register device failed: {resp.status_code}"}
        except Exception as e:
            return {"success": False, "error": str(e)[:100]}

    def test_push_settings(self) -> dict:
        """Test push settings."""
        if not self.users:
            return {"success": False, "error": "No users available"}
        username = list(self.users.keys())[0]
        headers = self.get_headers(username)
        try:
            resp = requests.get(
                f"{self.api_base}/api/push/settings",
                headers=headers,
                timeout=30,
            )
            if resp.status_code == 200:
                return {"success": True}
            return {"success": False, "error": f"Get push settings failed: {resp.status_code}"}
        except Exception as e:
            return {"success": False, "error": str(e)[:100]}

    # ===== L. WebSocket Smoke =====

    def test_websocket_connectivity(self) -> dict:
        """Test WebSocket connectivity."""
        if not self.users:
            return {"success": False, "error": "No users available"}
        username = list(self.users.keys())[0]
        headers = self.get_headers(username)
        try:
            # Get ws-ticket
            resp = requests.post(
                f"{self.api_base}/api/auth/ws-ticket",
                headers=headers,
                timeout=30,
            )
            if resp.status_code != 200:
                return {"success": False, "error": f"Get ticket failed: {resp.status_code}"}

            data = extract_data(resp.json())
            ticket = data.get("ticket") or data.get("token")

            if not ticket:
                return {"success": False, "error": "No ticket received"}

            # Note: Full WebSocket connection test would require websockets library
            # For now, just verify ticket acquisition
            return {"success": True, "details": {"ticket_received": True}}
        except Exception as e:
            return {"success": False, "error": str(e)[:100]}

    # ===== M. Security Smoke =====

    def test_old_api_path_negative(self) -> dict:
        """Test old non-/api paths return 404/405."""
        if not self.users:
            return {"success": False, "error": "No users available"}
        username = list(self.users.keys())[0]
        headers = self.get_headers(username)
        try:
            # Test various old paths
            old_paths = [
                "/user/profile",
                "/message/send",
                "/groups",
                "/friends",
                "/auth/login",
            ]
            for path in old_paths:
                resp = requests.get(
                    f"{self.api_base}{path}",
                    headers=headers,
                    timeout=30,
                )
                if resp.status_code not in (404, 405, 400, 401):
                    return {"success": False, "error": f"Old path {path} returned {resp.status_code}"}
            return {"success": True}
        except Exception as e:
            return {"success": False, "error": str(e)[:100]}

    def test_error_no_secrets(self) -> dict:
        """Test error responses don't leak secrets."""
        if not self.users:
            return {"success": False, "error": "No users available"}
        username = list(self.users.keys())[0]
        headers = self.get_headers(username)
        try:
            # Trigger an error
            resp = requests.get(
                f"{self.api_base}/api/nonexistent-endpoint-12345",
                headers=headers,
                timeout=30,
            )
            # Check response doesn't contain sensitive info
            text = resp.text.lower()
            sensitive_patterns = ["stack trace", "sql", "password", "secret", "token"]
            for pattern in sensitive_patterns:
                if pattern in text:
                    return {"success": False, "error": f"Error response contains '{pattern}'"}
            return {"success": True}
        except Exception as e:
            return {"success": False, "error": str(e)[:100]}

    # ===== Main Run =====

    def run_all_scenarios(self) -> dict:
        """Run all smoke test scenarios."""
        print(f"\n{'='*60}")
        print(f"Gray Release Smoke Tests")
        print(f"Environment: {self.env}")
        print(f"API Base: {self.api_base}")
        print(f"Prefix: {self.prefix}")
        print(f"{'='*60}")

        start_time = time.time()

        # A. Auth smoke
        self.run_scenario("A1. Register users A/B/C", self.test_auth_register)
        self.run_scenario("A2. Login users", self.test_auth_login)
        self.run_scenario("A3. Refresh token", self.test_auth_refresh)
        self.run_scenario("A4. Get ws-ticket", self.test_auth_ws_ticket)
        self.run_scenario("A5. Logout", self.test_auth_logout, critical=False)

        # B. User smoke
        self.run_scenario("B1. Get profile", self.test_user_profile)
        self.run_scenario("B2. Update profile", self.test_user_update_profile)
        self.run_scenario("B3. Search user", self.test_user_search)
        self.run_scenario("B4. Heartbeat", self.test_user_heartbeat, critical=False)
        self.run_scenario("B5. User settings", self.test_user_settings, critical=False)

        # C. Friend smoke
        self.run_scenario("C1. Friend request/accept", self.test_friend_request_and_accept)
        self.run_scenario("C2. Friend list", self.test_friend_list)

        # D. Private message smoke
        self.run_scenario("D1. Private message", self.test_private_message)
        self.run_scenario("D2. Recall message", self.test_private_message_recall, critical=False)
        self.run_scenario("D3. Old message path negative", self.test_old_message_path_negative)

        # E. Private E2EE smoke (depends on P1 SIT)
        self.run_scenario("E1. Private E2EE smoke", self.test_e2ee_private_smoke)

        # F. Group smoke
        self.run_scenario("F1. Create group", self.test_group_create)
        self.run_scenario("F2. Add members", self.test_group_add_members)
        self.run_scenario("F3. Group members list", self.test_group_members_list)
        self.run_scenario("F4. Group message", self.test_group_message)
        self.run_scenario("F5. Dismiss group", self.test_group_dismiss, critical=False)

        # G. Group E2EE smoke (depends on P1 SIT)
        self.run_scenario("G1. Group E2EE smoke", self.test_e2ee_group_smoke)

        # H. File/avatar smoke
        self.run_scenario("H1. File upload", self.test_file_upload)
        self.run_scenario("H2. File download", self.test_file_download)
        self.run_scenario("H3. File delete", self.test_file_delete, critical=False)

        # I. Moments smoke
        self.run_scenario("I1. Create moment", self.test_moments_create)
        self.run_scenario("I2. Moments feed", self.test_moments_feed)
        self.run_scenario("I3. Like/unlike", self.test_moments_like, critical=False)
        self.run_scenario("I4. Comment", self.test_moments_comment, critical=False)
        self.run_scenario("I5. Delete moment", self.test_moments_delete, critical=False)

        # J. AI smoke
        self.run_scenario("J1. AI keys", self.test_ai_keys, critical=False)
        self.run_scenario("J2. AI settings", self.test_ai_settings, critical=False)

        # K. Push smoke
        self.run_scenario("K1. Push register", self.test_push_register)
        self.run_scenario("K2. Push settings", self.test_push_settings, critical=False)

        # L. WebSocket smoke
        self.run_scenario("L1. WebSocket connectivity", self.test_websocket_connectivity)

        # M. Security smoke
        self.run_scenario("M1. Old API path negative", self.test_old_api_path_negative)
        self.run_scenario("M2. Error no secrets", self.test_error_no_secrets)

        total_duration = (time.time() - start_time) * 1000

        # Calculate results
        passed = sum(1 for s in self.scenarios if s["status"] == "PASS")
        failed = sum(1 for s in self.scenarios if s["status"] == "FAIL")
        not_run = sum(1 for s in self.scenarios if s["status"] == "NOT RUN")
        critical_failures = [
            s for s in self.scenarios
            if s["status"] == "FAIL" and s.get("critical", False)
        ]

        if critical_failures:
            overall_status = "FAIL"
        elif failed > 0:
            overall_status = "WARN"
        elif not_run > 0:
            overall_status = "WARN"
        else:
            overall_status = "PASS"

        return {
            "generated_at": datetime.now(timezone.utc).isoformat(),
            "gray_environment": self.env,
            "api_base_url": self.api_base,
            "prefix": self.prefix,
            "overall_status": overall_status,
            "total_duration_ms": round(total_duration, 2),
            "summary": {
                "total": len(self.scenarios),
                "passed": passed,
                "failed": failed,
                "not_run": not_run,
                "critical_failures": len(critical_failures),
            },
            "scenarios": self.scenarios,
        }


def write_reports(results: dict, output_json: Path, output_md: Path) -> None:
    """Write smoke test results as JSON and Markdown."""
    output_json.parent.mkdir(parents=True, exist_ok=True)

    # JSON
    with open(output_json, "w", encoding="utf-8") as f:
        json.dump(results, f, indent=2, ensure_ascii=False)

    # Markdown
    lines = [
        "# Gray Release Smoke Test Results",
        "",
        f"Generated: {results['generated_at']}",
        f"Gray Environment: {results['gray_environment']}",
        f"API Base URL: {results['api_base_url']}",
        f"Prefix: {results['prefix']}",
        "",
        "## Overall Status: **{}**".format(results["overall_status"]),
        "",
        "## Summary",
        "",
        f"| Metric | Value |",
        f"| --- | ---: |",
        f"| Total Scenarios | {results['summary']['total']} |",
        f"| Passed | {results['summary']['passed']} |",
        f"| Failed | {results['summary']['failed']} |",
        f"| Not Run | {results['summary']['not_run']} |",
        f"| Critical Failures | {results['summary']['critical_failures']} |",
        f"| Total Duration | {results['total_duration_ms']:.2f}ms |",
        "",
        "## Scenarios",
        "",
        "| # | Scenario | Status | Critical | Duration | Error |",
        "| ---: | --- | --- | --- | ---: | --- |",
    ]

    for i, scenario in enumerate(results["scenarios"], 1):
        critical = "Yes" if scenario.get("critical", False) else "No"
        error = scenario.get("error") or ""
        if error:
            error = str(error)[:50]
        lines.append(
            f"| {i} | {scenario['name']} | {scenario['status']} | {critical} | "
            f"{scenario['duration_ms']:.2f}ms | {error} |"
        )

    lines.extend(["", "---", ""])

    # Group by category
    categories = {}
    for scenario in results["scenarios"]:
        category = scenario["name"].split(".")[0] if "." in scenario["name"] else "Other"
        if category not in categories:
            categories[category] = []
        categories[category].append(scenario)

    for category, scenarios in categories.items():
        lines.extend([
            f"## {category}",
            "",
        ])
        for scenario in scenarios:
            status = scenario["status"]
            name = scenario["name"]
            error = scenario.get("error", "")
            if error:
                lines.append(f"- **{name}**: {status} - {error}")
            else:
                lines.append(f"- **{name}**: {status}")
        lines.append("")

    output_md.write_text("\n".join(lines) + "\n", encoding="utf-8")


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--env",
        required=True,
        help="Gray environment name (e.g., local-gray, staging, personal-gray)",
    )
    parser.add_argument(
        "--api-base",
        default=os.environ.get("IM_API_BASE", ""),
        help="API base URL",
    )
    parser.add_argument(
        "--ws-base",
        default=os.environ.get("IM_WS_BASE", ""),
        help="WebSocket base URL",
    )
    parser.add_argument(
        "--db-url",
        default=os.environ.get("IM_DB_URL", ""),
        help="Database URL",
    )
    parser.add_argument(
        "--prefix",
        default=f"gray_{int(time.time())}",
        help="Test data prefix",
    )
    parser.add_argument(
        "--output-json",
        default=str(REPORT_DIR / "gray-smoke.json"),
        help="Output JSON path",
    )
    parser.add_argument(
        "--output-md",
        default=str(REPORT_DIR / "gray-smoke.md"),
        help="Output Markdown path",
    )

    args = parser.parse_args()

    if not args.api_base:
        print("Error: --api-base is required", file=sys.stderr)
        return 1

    test_suite = GraySmokeTest(
        env=args.env,
        api_base=args.api_base,
        ws_base=args.ws_base,
        db_url=args.db_url,
        prefix=args.prefix,
    )

    results = test_suite.run_all_scenarios()
    write_reports(results, Path(args.output_json), Path(args.output_md))

    print(f"\n{'='*60}")
    print(f"Overall Status: {results['overall_status']}")
    print(f"Passed: {results['summary']['passed']}/{results['summary']['total']}")
    print(f"Reports written to:\n  JSON: {args.output_json}\n  MD: {args.output_md}")

    return 0 if results["overall_status"] in ("PASS", "WARN") else 1


if __name__ == "__main__":
    raise SystemExit(main())
