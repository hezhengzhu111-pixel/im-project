#!/usr/bin/env python3
"""P0 E2EE cross-client matrix using the real backend and Rust E2EE engine."""

import argparse
import json
import secrets
import sys
import time

from p0_e2ee_private_text_acceptance import APIClient, E2EEUser


def session_id_for(left: E2EEUser, right: E2EEUser) -> str:
    ids = sorted([left.user_id, right.user_id])
    return f"p_{ids[0]}_{ids[1]}"


def befriend(left: E2EEUser, right: E2EEUser) -> None:
    left.api.send_friend_request(right.user_id)
    time.sleep(0.5)
    pending = right.api.get_friend_requests()
    if pending:
        right.api.accept_friend_request(pending[0]["id"])


def negotiate(requester: E2EEUser, responder: E2EEUser, session_id: str) -> None:
    keys = requester._key_store.get_local_key_material()["publicBundle"]
    requester.api.request_encryption(
        session_id,
        keys["identityKey"],
        keys["signedPreKey"]["key"],
        json.dumps(
            {
                "senderDeviceId": requester.device_id,
                "senderUserId": requester.user_id,
            }
        ),
    )
    responder.api.accept_encryption(session_id)
    for user in (requester, responder):
        status = user.api.get_encryption_status(session_id)
        if status != "encrypted":
            raise AssertionError(f"{user.username} status is {status}, expected encrypted")


def send_and_decrypt(
    sender: E2EEUser,
    receiver: E2EEUser,
    session_id: str,
    label: str,
) -> None:
    secret = f"p0-matrix-{label}-{secrets.token_hex(4)}"
    envelope = sender.encrypt_to_envelope(session_id, receiver.user_id, None, secret)
    client_message_id = f"p0-matrix-{secrets.token_hex(8)}"
    sender.api.send_private_encrypted(
        receiver.user_id,
        client_message_id,
        "TEXT",
        envelope,
        sender.device_id,
    )
    time.sleep(1)
    history = receiver.api.get_private_history(sender.user_id, limit=20)
    encrypted = [m for m in history if m.get("encrypted")]
    if not encrypted:
        raise AssertionError(f"{label}: no encrypted message in receiver history")

    message = None
    for item in encrypted:
        if item.get("clientMessageId") == client_message_id or item.get("client_message_id") == client_message_id:
            message = item
            break
    if message is None:
        raise AssertionError(f"{label}: sent encrypted message not found")

    env = message.get("e2eeEnvelope") or message.get("e2ee_envelope")
    if env is None:
        raise AssertionError(f"{label}: message missing e2ee envelope")
    plaintext = receiver.decrypt_envelope(env, sender.user_id)
    if plaintext != secret:
        raise AssertionError(f"{label}: decrypt mismatch: {plaintext!r}")


def main() -> int:
    parser = argparse.ArgumentParser(description="P0 E2EE cross-client matrix")
    parser.add_argument("--base-url", default="http://localhost:8082")
    args = parser.parse_args()

    clients: dict[str, E2EEUser] = {}
    for label in ("web", "desktop", "mobile"):
        api = APIClient(args.base_url)
        user = E2EEUser(api, f"p0_{label}_{secrets.token_hex(4)}")
        user.register_and_login()
        user.ensure_device_registered()
        clients[label] = user
        print(f"{label}: user={user.user_id} device={user.device_id}")

    pairs = [("web", "desktop"), ("web", "mobile"), ("desktop", "mobile")]
    for left_label, right_label in pairs:
        left = clients[left_label]
        right = clients[right_label]
        sid = session_id_for(left, right)
        print(f"\n[{left_label}<->{right_label}] session={sid}")
        befriend(left, right)
        negotiate(left, right, sid)
        send_and_decrypt(left, right, sid, f"{left_label}-to-{right_label}")
        print(f"  PASS {left_label}->{right_label}")
        send_and_decrypt(right, left, sid, f"{right_label}-to-{left_label}")
        print(f"  PASS {right_label}->{left_label}")

    print("\nP0 E2EE cross-client matrix passed")
    return 0


if __name__ == "__main__":
    sys.exit(main())
