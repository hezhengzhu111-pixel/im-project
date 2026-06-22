#!/usr/bin/env python3
"""P1 Media Message Smoke Test.

Verifies the private media message main link using the real backend:
- Register A and B and make them friends
- A uploads an image and sends an IMAGE private message to B
- B can fetch the IMAGE message from history
- A uploads a file and sends a FILE private message to B
- B can fetch the FILE message from history
- Sending the same clientMessageId twice does not duplicate history entries
- Media messages in this test are sent in plaintext (encrypted=false)

Usage:
    python tests/p1/p1_media_message_smoke.py --base-url http://localhost:8082
"""

from __future__ import annotations

import argparse
import io
import os
import sys
import time
import uuid
from typing import Any

# Allow imports from tests/domains/common
sys.path.insert(
    0, os.path.join(os.path.dirname(__file__), "..", "domains", "common")
)
from api_client import ImApiClient
from fixtures import (
    TestUser,
    assert_ok,
    make_friends,
    register_and_login,
    unique_username,
)


def _client(base_url: str, user: TestUser) -> ImApiClient:
    return ImApiClient(base_url, user.token)


def _upload_image(base_url: str, user: TestUser) -> dict[str, Any]:
    """Upload a minimal PNG and return the upload response data."""
    # PNG magic bytes + minimal IHDR chunk (8x8 RGBA)
    png = (
        b"\x89PNG\r\n\x1a\n"
        b"\x00\x00\x00\rIHDR\x00\x00\x00\x08\x00\x00\x00\x08\x08\x06\x00\x00\x00\xc4\x7f\x96\xb5"
        b"\x00\x00\x00\x00IEND\xaeB`\x82"
    )
    name = f"smoke-{uuid.uuid4().hex[:8]}.png"
    session = _client(base_url, user).session
    resp = session.post(
        f"{base_url.rstrip('/')}/api/file/upload/image",
        headers={"Authorization": f"Bearer {user.token}"},
        files={"file": (name, io.BytesIO(png), "image/png")},
        timeout=30,
    )
    if resp.status_code != 200:
        raise RuntimeError(f"image upload failed: {resp.status_code} {resp.text}")
    data = resp.json().get("data", {})
    if not data or not data.get("url"):
        raise RuntimeError(f"image upload returned no url: {resp.text}")
    return data


def _upload_file(base_url: str, user: TestUser) -> dict[str, Any]:
    """Upload a text file and return the upload response data."""
    content = b"P1 media message smoke test file content."
    name = f"smoke-{uuid.uuid4().hex[:8]}.txt"
    session = _client(base_url, user).session
    resp = session.post(
        f"{base_url.rstrip('/')}/api/file/upload/file",
        headers={"Authorization": f"Bearer {user.token}"},
        files={"file": (name, io.BytesIO(content), "text/plain")},
        timeout=30,
    )
    if resp.status_code != 200:
        raise RuntimeError(f"file upload failed: {resp.status_code} {resp.text}")
    data = resp.json().get("data", {})
    if not data or not data.get("url"):
        raise RuntimeError(f"file upload returned no url: {resp.text}")
    return data


def _send_private_media(
    base_url: str,
    sender: TestUser,
    receiver_id: int,
    message_type: str,
    media_url: str,
    media_name: str,
    media_size: int,
    client_msg_id: str,
) -> dict[str, Any]:
    resp = _client(base_url, sender).post(
        "/api/message/send/private",
        {
            "receiverId": receiver_id,
            "clientMessageId": client_msg_id,
            "messageType": message_type,
            "mediaUrl": media_url,
            "mediaName": media_name,
            "mediaSize": media_size,
        },
    )
    return assert_ok(resp, f"send private {message_type}")


def _private_history(
    base_url: str, user: TestUser, friend_id: int
) -> list[dict[str, Any]]:
    resp = _client(base_url, user).get(f"/api/message/private/{friend_id}")
    data = assert_ok(resp, "private history")
    return data if isinstance(data, list) else []


def run(base_url: str) -> dict[str, Any]:
    results: dict[str, str] = {}

    # Register two users and make them friends.
    alice = register_and_login(ImApiClient(base_url), unique_username("a_"))
    bob = register_and_login(ImApiClient(base_url), unique_username("b_"))
    make_friends(base_url, alice, bob)

    # ---- IMAGE message ----
    image_upload = _upload_image(base_url, alice)
    image_cid = f"media-img-{uuid.uuid4().hex[:8]}"
    _send_private_media(
        base_url,
        alice,
        bob.user_id,
        "IMAGE",
        image_upload["url"],
        image_upload.get("originalFilename", image_upload.get("filename", "image.png")),
        int(image_upload.get("size", 0)),
        image_cid,
    )
    time.sleep(0.5)

    bob_history = _private_history(base_url, bob, alice.user_id)
    image_messages = [
        m
        for m in bob_history
        if m.get("clientMessageId") == image_cid and m.get("messageType") == "IMAGE"
    ]
    results["private_image_history"] = "PASS" if image_messages else "FAIL"
    results["private_image_encrypted_flag"] = (
        "PASS"
        if image_messages and image_messages[0].get("encrypted") is not True
        else "FAIL"
    )

    # ---- FILE message ----
    file_upload = _upload_file(base_url, alice)
    file_cid = f"media-file-{uuid.uuid4().hex[:8]}"
    _send_private_media(
        base_url,
        alice,
        bob.user_id,
        "FILE",
        file_upload["url"],
        file_upload.get("originalFilename", file_upload.get("filename", "file.txt")),
        int(file_upload.get("size", 0)),
        file_cid,
    )
    time.sleep(0.5)

    bob_history2 = _private_history(base_url, bob, alice.user_id)
    file_messages = [
        m
        for m in bob_history2
        if m.get("clientMessageId") == file_cid and m.get("messageType") == "FILE"
    ]
    results["private_file_history"] = "PASS" if file_messages else "FAIL"
    results["private_file_encrypted_flag"] = (
        "PASS"
        if file_messages and file_messages[0].get("encrypted") is not True
        else "FAIL"
    )

    # ---- Idempotency: resend the same IMAGE clientMessageId ----
    _send_private_media(
        base_url,
        alice,
        bob.user_id,
        "IMAGE",
        image_upload["url"],
        image_upload.get("originalFilename", image_upload.get("filename", "image.png")),
        int(image_upload.get("size", 0)),
        image_cid,
    )
    time.sleep(0.5)

    bob_history3 = _private_history(base_url, bob, alice.user_id)
    image_duplicates = [
        m
        for m in bob_history3
        if m.get("clientMessageId") == image_cid and m.get("messageType") == "IMAGE"
    ]
    results["client_message_id_idempotent"] = (
        "PASS" if len(image_duplicates) == 1 else "FAIL"
    )

    return {
        "results": results,
        "summary": "PASS" if all(v == "PASS" for v in results.values()) else "FAIL",
        "media_e2ee_status": "not_enabled_in_smoke",
    }


def main() -> int:
    parser = argparse.ArgumentParser(description="P1 Media Message Smoke Test")
    parser.add_argument("--base-url", default="http://localhost:8082")
    args = parser.parse_args()

    print(f"Running P1 media message smoke against {args.base_url}")
    outcome = run(args.base_url)
    for name, result in outcome["results"].items():
        print(f"  {name}: {result}")
    print(f"  media_e2ee_status: {outcome['media_e2ee_status']}")
    print(f"SUMMARY: {outcome['summary']}")
    return 0 if outcome["summary"] == "PASS" else 1


if __name__ == "__main__":
    sys.exit(main())
