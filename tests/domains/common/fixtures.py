#!/usr/bin/env python3
"""Shared fixtures and helpers for IM domain tests."""

from __future__ import annotations

import time
import uuid
from dataclasses import dataclass
from typing import Any

from api_client import ApiResponse, ImApiClient


@dataclass
class TestUser:
    user_id: int
    username: str
    token: str


def unique_username(prefix: str = "t") -> str:
    return f"{prefix}{int(time.time() * 1000) % 1_000_000}{uuid.uuid4().hex[:6]}"


def valid_password() -> str:
    return "Test1234!"


def register_and_login(client: ImApiClient, username: str | None = None) -> TestUser:
    username = username or unique_username()
    password = valid_password()
    reg = client.post(
        "/api/user/register",
        {"username": username, "password": password, "nickname": username},
    )
    # Duplicate registration may happen with collisions; login handles both cases.
    login = client.post("/api/user/login", {"username": username, "password": password})
    if login.status_code != 200:
        raise RuntimeError(f"login failed: {login.status_code} {login.text}")
    user_id = int(login.json["data"]["user"]["id"])
    token = login.json["data"]["token"]
    return TestUser(user_id=user_id, username=username, token=token)


def make_friends(base_url: str, user_a: TestUser, user_b: TestUser) -> None:
    a = ImApiClient(base_url, user_a.token)
    b = ImApiClient(base_url, user_b.token)
    resp = a.post("/api/friend/request", {"targetUserId": user_b.user_id})
    if resp.status_code != 200:
        raise RuntimeError(f"friend request failed: {resp.status_code} {resp.text}")
    requests = b.get("/api/friend/requests").json.get("data", [])
    req_id = None
    for req in requests:
        if int(req.get("applicantId", 0)) == user_a.user_id and req.get("status") == "PENDING":
            req_id = req.get("id")
            break
    if req_id is None:
        raise RuntimeError("pending friend request not found")
    accept = b.post("/api/friend/accept", {"requestId": req_id})
    if accept.status_code != 200:
        raise RuntimeError(f"accept friend failed: {accept.status_code} {accept.text}")


def create_group(base_url: str, owner: TestUser, member_ids: list[int], group_name: str | None = None) -> int:
    client = ImApiClient(base_url, owner.token)
    resp = client.post(
        "/api/group/create",
        {"groupName": group_name or unique_username("g"), "memberIds": member_ids},
    )
    if resp.status_code != 200:
        raise RuntimeError(f"create group failed: {resp.status_code} {resp.text}")
    return int(resp.json["data"]["id"])


def send_private_message(base_url: str, sender: TestUser, receiver_id: int, content: str) -> dict[str, Any]:
    client = ImApiClient(base_url, sender.token)
    resp = client.post(
        "/api/message/send/private",
        {"receiverId": receiver_id, "messageType": "TEXT", "content": content},
    )
    if resp.status_code != 200:
        raise RuntimeError(f"send private message failed: {resp.status_code} {resp.text}")
    return resp.json.get("data", {})


def send_group_message(base_url: str, sender: TestUser, group_id: int, content: str) -> dict[str, Any]:
    client = ImApiClient(base_url, sender.token)
    resp = client.post(
        "/api/message/send/group",
        {"groupId": group_id, "messageType": "TEXT", "content": content},
    )
    if resp.status_code != 200:
        raise RuntimeError(f"send group message failed: {resp.status_code} {resp.text}")
    return resp.json.get("data", {})


def assert_ok(resp: ApiResponse, message: str = "request") -> dict[str, Any]:
    if resp.status_code != 200:
        raise AssertionError(f"{message} failed with status {resp.status_code}: {resp.text}")
    code = resp.json.get("code", 200)
    if code != 200:
        raise AssertionError(f"{message} returned business error {code}: {resp.json}")
    return resp.json.get("data", {})
