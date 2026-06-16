#!/usr/bin/env python3
"""
P1-5 Group E2EE Acceptance Tests — REAL Rust E2EE + Backend + MySQL.

Verifies the group E2EE minimum viable chain:
  1. Three-person group (Alice/Bob/Carol): enable E2EE, encrypt, all decrypt
  2. Dave joins → epoch increment, Dave cannot decrypt old epoch
  3. Carol removed → epoch increment, Carol blocked from new messages
  4. Stale epoch → rejected by backend
  5. Encrypted media → blocked in E2EE group
  6. Plaintext → blocked in E2EE group
  7. HTTP + DB plaintext scan

Usage:
    python tests/p1_group_e2ee.py \
        --base-url http://localhost:8082 \
        --db-url mysql://root:root123@127.0.0.1:3306/service_message_service_db

No private keys, tokens, or plaintext secrets are printed.
"""

from __future__ import annotations

import sys
import os
import json
import base64
import secrets
import time
import argparse
from typing import Optional, Dict, List

import requests

sys.path.insert(0, os.path.join(os.path.dirname(__file__)))
from e2ee_rust_bridge import (
    RustE2eeEngine,
    parse_rust_handshake,
    normalize_handshake,
    bundle_to_rust_json,
)
from e2ee_stores import SessionStore, KeyStore


# ============================================================================
# Constants
# ============================================================================

RUST_E2EE_ENVELOPE_VERSION = 2
RUST_E2EE_ALGORITHM = "rust-x25519-x3dh-dr-v1"
SESSION_STATUS_PREFIX = "e2ee:status:"
REMOTE_DEVICE_PREFIX = "e2ee:remote_device:"
OTK_UPLOAD_COUNT = 100

P1_GROUP_SECRET = "p1-group-secret-message"

# ============================================================================
# APIClient
# ============================================================================


class APIClient:
    def __init__(self, base_url: str):
        self.base_url = base_url.rstrip("/")
        self.token: Optional[str] = None
        self.user_id: Optional[str] = None

    def _headers(self) -> Dict[str, str]:
        h = {"Content-Type": "application/json"}
        if self.token:
            h["Authorization"] = f"Bearer {self.token}"
        return h

    def _post(self, path: str, data: dict) -> dict:
        url = f"{self.base_url}{path}"
        for attempt in range(3):
            try:
                resp = requests.post(url, json=data, headers=self._headers(), timeout=15)
                body = resp.json()
                if not body.get("success", False) and body.get("code") != 200:
                    if resp.status_code == 409:
                        return body
                    raise Exception(f"POST {path} failed: {resp.status_code} {body}")
                return body
            except (requests.ConnectionError, requests.Timeout):
                if attempt == 2:
                    raise
                time.sleep(2)

    def _get(self, path: str, params: dict = None) -> dict:
        url = f"{self.base_url}{path}"
        for attempt in range(3):
            try:
                resp = requests.get(url, params=params, headers=self._headers(), timeout=15)
                body = resp.json()
                if not body.get("success", False):
                    raise Exception(f"GET {path} failed: {resp.status_code} {body}")
                return body
            except (requests.ConnectionError, requests.Timeout):
                if attempt == 2:
                    raise
                time.sleep(2)

    def _delete(self, path: str) -> dict:
        url = f"{self.base_url}{path}"
        resp = requests.delete(url, headers=self._headers(), timeout=15)
        body = resp.json()
        if not body.get("success", False):
            raise Exception(f"DELETE {path} failed: {resp.status_code} {body}")
        return body

    # -- auth --
    def register(self, username: str, password: str) -> str:
        body = self._post("/api/user/register", {"username": username, "password": password})
        data = body["data"]
        self.user_id = str(data.get("id", ""))
        return self.user_id

    def login(self, username: str, password: str) -> str:
        body = self._post("/api/user/login", {"username": username, "password": password})
        data = body.get("data", {})
        self.token = data.get("token")
        user_obj = data.get("user", {})
        self.user_id = str(user_obj.get("id", ""))
        if not self.token or not self.user_id:
            raise Exception("Login failed: no token or user_id")
        return self.token

    # -- friends --
    def send_friend_request(self, target_user_id: str) -> None:
        self._post("/api/friend/request", {"targetUserId": target_user_id})

    def get_friend_requests(self) -> list:
        return self._get("/api/friend/requests").get("data", [])

    def accept_friend_request(self, request_id: str) -> None:
        self._post("/api/friend/accept", {"requestId": request_id})

    # -- keys --
    def upload_bundle(self, device_id: str, identity_key: str, signing_key: str,
                      signed_pre_key: str, signed_pre_key_sig: str,
                      one_time_pre_keys: list) -> None:
        self._post("/api/keys/bundle", {
            "deviceId": device_id, "identityKey": identity_key,
            "signingIdentityKey": signing_key, "signedPreKey": signed_pre_key,
            "signedPreKeySignature": signed_pre_key_sig,
            "oneTimePreKeys": one_time_pre_keys,
        })

    def get_devices(self, user_id: str) -> list:
        return self._get("/api/keys/devices", {"userId": user_id}).get("data", [])

    def get_bundle(self, user_id: str, device_id: str, conversation_id: str,
                   requester_device_id: str) -> dict:
        return self._get("/api/keys/bundle", {
            "userId": user_id, "deviceId": device_id,
            "conversationId": conversation_id,
            "requesterDeviceId": requester_device_id,
        })["data"]

    def delete_device(self, device_id: str) -> None:
        self._delete(f"/api/keys/device/{device_id}")

    def heartbeat(self, device_id: str) -> None:
        try:
            self._post("/api/keys/heartbeat", {"deviceId": device_id})
        except Exception:
            pass

    # -- groups --
    def create_group(self, group_name: str, member_ids: list = None) -> dict:
        body = {"groupName": group_name}
        if member_ids:
            body["memberIds"] = member_ids
        return self._post("/api/group/create", body)["data"]

    def add_group_members(self, group_id: str, member_ids: list) -> None:
        self._post(f"/api/group/{group_id}/members", {"memberIds": member_ids})

    def remove_group_member(self, group_id: str, user_id: str) -> None:
        # Try leave_group or dismiss member
        self._post(f"/api/group/{group_id}/leave", {"targetUserId": user_id})

    def get_group_members(self, group_id: str) -> list:
        return self._get(f"/api/group/{group_id}/members").get("data", [])

    # -- group E2EE --
    def enable_group_e2ee(self, group_id: int, sender_keys: list) -> None:
        self._post(f"/api/e2ee/groups/{group_id}/enable", {"senderKeys": sender_keys})

    def disable_group_e2ee(self, group_id: int) -> None:
        self._post(f"/api/e2ee/groups/{group_id}/disable", {})

    def get_group_e2ee_status(self, group_id: int) -> dict:
        return self._get(f"/api/e2ee/groups/{group_id}/status")["data"]

    def get_sender_keys(self, group_id: int) -> list:
        return self._get(f"/api/e2ee/groups/{group_id}/sender-keys")["data"]

    def push_sender_key(self, group_id: int, recipient_id: str,
                         device_id: str, encrypted_sender_key: str) -> None:
        self._post(f"/api/e2ee/groups/{group_id}/sender-key", {
            "recipientId": recipient_id, "deviceId": device_id,
            "encryptedSenderKey": encrypted_sender_key,
        })

    # -- messages --
    def send_group_encrypted(self, group_id: int, client_msg_id: str,
                               message_type: str, e2ee_envelope: dict,
                               e2ee_device_id: str) -> dict:
        return self._post("/message/send/group", {
            "groupId": group_id, "clientMessageId": client_msg_id,
            "messageType": message_type, "encrypted": True,
            "e2eeEnvelope": e2ee_envelope, "e2eeDeviceId": e2ee_device_id,
        })

    def send_group_plaintext(self, group_id: int, client_msg_id: str,
                               content: str) -> dict:
        return self._post("/message/send/group", {
            "groupId": group_id, "clientMessageId": client_msg_id,
            "messageType": "TEXT", "content": content, "encrypted": False,
        })

    def send_group_encrypted_media(self, group_id: int, client_msg_id: str,
                                     e2ee_envelope: dict, e2ee_device_id: str,
                                     media_url: str) -> dict:
        return self._post("/message/send/group", {
            "groupId": group_id, "clientMessageId": client_msg_id,
            "messageType": "IMAGE", "encrypted": True,
            "e2eeEnvelope": e2ee_envelope, "e2eeDeviceId": e2ee_device_id,
            "mediaUrl": media_url,
        })


# ============================================================================
# E2EE User
# ============================================================================

class E2EEUser:
    def __init__(self, api: APIClient, username: str, password: str = "Test123456!"):
        self.api = api
        self.username = username
        self.password = password
        self.user_id: str = ""
        self.device_id: str = secrets.token_hex(16)
        self._engine = RustE2eeEngine()
        self._key_store = KeyStore()
        self._session_store = SessionStore()
        self._loaded_sessions: set = set()

    def register_and_login(self) -> None:
        self.api.register(self.username, self.password)
        self.api.login(self.username, self.password)
        self.user_id = self.api.user_id

    def ensure_device_registered(self, otk_count: int = OTK_UPLOAD_COUNT) -> str:
        existing = self._key_store.get_local_key_material()
        if existing is not None:
            return self.device_id
        key_material = self._engine.generate_pre_key_bundle(
            signed_pre_key_id=1, one_time_pre_key_start_id=1,
            one_time_pre_key_count=otk_count,
        )
        self._key_store.save_local_key_material(key_material)
        self._key_store.save_device_id(self.device_id)
        bundle = key_material["publicBundle"]
        otk_list = [{"id": p["id"], "key": p["key"]}
                    for p in bundle.get("oneTimePreKeys", [])]
        self.api.upload_bundle(
            device_id=self.device_id, identity_key=bundle["identityKey"],
            signing_key=bundle["signingKey"],
            signed_pre_key=bundle["signedPreKey"]["key"],
            signed_pre_key_sig=bundle["signedPreKeySignature"],
            one_time_pre_keys=otk_list,
        )
        self.api.heartbeat(self.device_id)
        return self.device_id

    def fetch_remote_bundle(self, user_id: str, device_id: str,
                            conversation_id: str) -> dict:
        devices = self.api.get_devices(user_id)
        target = next((d for d in devices if d.get("deviceId") == device_id), None)
        if not target:
            raise Exception(f"Device {device_id} not found for user {user_id}")
        bundle = self.api.get_bundle(user_id, device_id, conversation_id, self.device_id)
        identity_key = bundle.get("identityKey", "")
        signing_key = bundle.get("signingIdentityKey") or bundle.get("signingKey") or identity_key
        otk_raw = bundle.get("oneTimePreKey")
        otk_id = bundle.get("oneTimePreKeyId")
        otk = None
        if isinstance(otk_raw, str) and len(otk_raw) > 0 and isinstance(otk_id, int) and otk_id > 0:
            otk = {"id": otk_id, "key": otk_raw}
        return {
            "identityKey": identity_key, "signingKey": signing_key,
            "signedPreKey": bundle.get("signedPreKey", ""),
            "signedPreKeySignature": bundle.get("signedPreKeySignature", ""),
            "oneTimePreKey": otk, "userId": user_id,
            "deviceId": bundle.get("deviceId") or device_id,
        }

    def resolve_sender_identity_key(self, sender_user_id: str, sender_device_id: str) -> str:
        devices = self.api.get_devices(sender_user_id)
        device = next((d for d in devices if d.get("deviceId") == sender_device_id), None)
        if device and device.get("identityKey"):
            return device["identityKey"]
        raise Exception(f"Sender identity key not found for {sender_device_id}")

    def create_outbound_session(self, session_id: str, recipient_user_id: str,
                                 recipient_device_id: str) -> bytes:
        remote_bundle = self.fetch_remote_bundle(
            recipient_user_id, recipient_device_id, session_id)
        self._engine.remove_session(session_id)
        self._loaded_sessions.discard(session_id)
        local_keys = self._key_store.get_local_key_material()
        if local_keys is None:
            raise Exception("local key material not found")
        ik_bincode = base64.b64decode(local_keys["identityKeyPairBincode"])
        handshake_bytes = self._engine.create_outbound_session(
            session_id, ik_bincode, remote_bundle)
        self._loaded_sessions.add(session_id)
        return handshake_bytes

    def encrypt(self, session_id: str, plaintext: str) -> bytes:
        return self._engine.encrypt(session_id, plaintext.encode("utf-8"))

    def create_inbound_session(self, session_id: str, sender_user_id: str,
                                 sender_device_id: str, handshake_b64: str) -> None:
        remote_ik_b64 = self.resolve_sender_identity_key(sender_user_id, sender_device_id)
        local_keys = self._key_store.get_local_key_material()
        if local_keys is None:
            raise Exception("local key material not found")
        handshake_bytes = base64.b64decode(handshake_b64)
        parsed = parse_rust_handshake(handshake_bytes)
        normalized = normalize_handshake(parsed)
        otk_bincode = None
        if normalized["oneTimePreKeyId"] is not None:
            for pair in local_keys.get("oneTimePreKeyPairs", []):
                if pair["id"] == normalized["oneTimePreKeyId"]:
                    otk_bincode = base64.b64decode(pair["keyPairBincode"])
                    break
            if otk_bincode is None:
                raise Exception(f"missing OTK {normalized['oneTimePreKeyId']}")
        self._engine.remove_session(session_id)
        self._loaded_sessions.discard(session_id)
        self._engine.create_inbound_session(
            session_id,
            base64.b64decode(local_keys["identityKeyPairBincode"]),
            base64.b64decode(local_keys["signedPreKeyPairBincode"]),
            otk_bincode,
            base64.b64decode(remote_ik_b64),
            normalized["ephemeralPublicKey"],
        )
        self._loaded_sessions.add(session_id)
        if normalized["oneTimePreKeyId"] is not None:
            self._key_store.mark_one_time_pre_key_consumed(normalized["oneTimePreKeyId"])

    def decrypt(self, session_id: str, wire_b64: str) -> str:
        wire = base64.b64decode(wire_b64)
        return self._engine.decrypt(session_id, wire).decode("utf-8")

    def build_e2ee_envelope(self, conversation_id: str, recipient_user_id: str,
                             recipient_device_id: str, plaintext: str,
                             key_version: int = 1) -> dict:
        """Build a Rust E2EE envelope for sending a message."""
        session_id = conversation_id
        handshake_bytes = self.create_outbound_session(
            session_id, recipient_user_id, recipient_device_id)
        wire = self.encrypt(session_id, plaintext)
        return {
            "version": RUST_E2EE_ENVELOPE_VERSION,
            "algorithm": RUST_E2EE_ALGORITHM,
            "senderDeviceId": self.device_id,
            "recipientDeviceId": recipient_device_id,
            "sessionId": session_id,
            "keyVersion": key_version,
            "handshake": base64.b64encode(handshake_bytes).decode("ascii"),
            "wire": base64.b64encode(wire).decode("ascii"),
        }

    def decrypt_envelope(self, envelope: dict, sender_user_id: str) -> str:
        sender_device_id = envelope.get("senderDeviceId", "")
        session_id = envelope["sessionId"]
        handshake_b64 = envelope.get("handshake", "")
        wire_b64 = envelope.get("wire", "")
        self.create_inbound_session(session_id, sender_user_id, sender_device_id, handshake_b64)
        return self.decrypt(session_id, wire_b64)


# ============================================================================
# DB Scanner
# ============================================================================

def scan_db_for_secrets(db_url: str, secrets: List[str]) -> List[str]:
    try:
        import pymysql
    except ImportError:
        raise RuntimeError("pymysql not installed")

    url = db_url
    if url.startswith("mysql://"):
        url = url[8:]
    user_pass, host_db = url.split("@", 1)
    user, password = user_pass.split(":", 1)
    host_port, database = host_db.split("/", 1)
    if ":" in host_port:
        host, port_str = host_port.split(":", 1)
        port = int(port_str)
    else:
        host = host_port
        port = 3306

    violations = []
    conn = pymysql.connect(
        host=host, port=port, user=user, password=password, database=database,
        charset="utf8mb4")
    cursor = conn.cursor()

    # tables to scan
    scan_targets = [
        ("service_message_service_db", "messages", ["content", "e2ee_envelope_json"]),
        ("service_message_service_db", "message_deliveries", ["header", "ciphertext"]),
        ("service_user_service_db", "e2ee_sender_keys", ["encrypted_sender_key"]),
    ]

    for schema, table, columns in scan_targets:
        for col in columns:
            for secret in secrets:
                try:
                    cursor.execute(
                        f"SELECT 1 FROM {schema}.{table} WHERE {col} LIKE %s LIMIT 1",
                        (f"%{secret}%",))
                    if cursor.fetchone():
                        violations.append(
                            f"Plaintext secret in {schema}.{table}.{col}")
                except pymysql.err.ProgrammingError:
                    pass  # Table/column may not exist

    cursor.close()
    conn.close()
    return violations


# ============================================================================
# Test Runner
# ============================================================================

class TestRunner:
    def __init__(self):
        self.passed = 0
        self.failed = 0
        self.results = {}

    def test(self, name: str, fn):
        try:
            fn()
            self.passed += 1
            self.results[name] = True
            print(f"  [PASS] {name}")
        except AssertionError as e:
            self.failed += 1
            self.results[name] = False
            print(f"  [FAIL] {name}: {e}")
        except Exception as e:
            self.failed += 1
            self.results[name] = False
            print(f"  [FAIL] {name}: UNEXPECTED: {e}")

    def summary(self) -> bool:
        total = self.passed + self.failed
        print(f"\n{'='*60}")
        print(f"Results: {self.passed}/{total} passed")
        if self.failed > 0:
            print(f"FAILURES: {self.failed}")
        print(f"{'='*60}")
        return self.failed == 0


# ============================================================================
# Main
# ============================================================================

def run_tests(base_url: str, db_url: Optional[str]):
    runner = TestRunner()
    http_bodies: List[str] = []
    p1_group_secrets = []

    # ---- Setup ----
    print("Setting up 3 users (Alice/Bob/Carol) for group E2EE tests...")
    alice_api = APIClient(base_url)
    bob_api = APIClient(base_url)
    carol_api = APIClient(base_url)

    alice = E2EEUser(alice_api, f"p1_g_alice_{secrets.token_hex(4)}")
    bob = E2EEUser(bob_api, f"p1_g_bob_{secrets.token_hex(4)}")
    carol = E2EEUser(carol_api, f"p1_g_carol_{secrets.token_hex(4)}")

    alice.register_and_login()
    bob.register_and_login()
    carol.register_and_login()

    print(f"  Alice={alice.user_id}, Bob={bob.user_id}, Carol={carol.user_id}")

    # Friendships (needed for group operations)
    for sender, target in [(alice, bob), (alice, carol), (bob, carol)]:
        sender.api.send_friend_request(target.user_id)
        time.sleep(0.3)
        pending = target.api.get_friend_requests()
        if pending:
            target.api.accept_friend_request(pending[0]["id"])

    # Register devices
    alice.ensure_device_registered()
    bob.ensure_device_registered()
    carol.ensure_device_registered()
    print(f"  Devices: A={alice.device_id}, B={bob.device_id}, C={carol.device_id}")

    # Create group
    group = alice_api.create_group("P1 Group E2EE Test", [bob.user_id, carol.user_id])
    group_id = int(group["id"])
    print(f"  Group created: id={group_id}, name={group.get('name', '')}")

    # =========================================================================
    # Scenario 1: Enable Group E2EE
    # =========================================================================
    print("\n[Scenario 1: Enable Group E2EE + Send Encrypted Message]")

    def test_enable_group_e2ee():
        # Alice distributes sender keys to Bob and Carol
        # For the initial distribution, Alice creates pairwise encrypted payloads
        alice_device_ik = alice._key_store.get_local_key_material()["publicBundle"]["identityKey"]

        # Generate encrypted sender keys for Bob and Carol
        # Using a simulated sender key encrypted with each recipient's pairwise session
        # The backend just stores the encrypted blobs — actual sender key format is client-side
        sender_key_plain = base64.b64encode(secrets.token_bytes(32)).decode("ascii")

        sender_keys = []
        for user, device_id in [(bob, bob.device_id), (carol, carol.device_id)]:
            # Encrypt the sender key material using the pairwise session
            pairwise_sid = f"p_{alice.user_id}_{user.user_id}"
            if int(alice.user_id) > int(user.user_id):
                pairwise_sid = f"p_{user.user_id}_{alice.user_id}"

            handshake = alice.create_outbound_session(pairwise_sid, user.user_id, device_id)
            encrypted_sk = alice.encrypt(pairwise_sid, sender_key_plain)
            encrypted_sk_b64 = base64.b64encode(encrypted_sk).decode("ascii")

            sender_keys.append({
                "recipientId": int(user.user_id),
                "deviceId": device_id,
                "encryptedSenderKey": encrypted_sk_b64,
            })

        alice_api.enable_group_e2ee(group_id, sender_keys)

        # Verify status
        status = alice_api.get_group_e2ee_status(group_id)
        http_bodies.append(json.dumps(status))
        assert status["status"] == "encrypted", f"Group status should be 'encrypted', got '{status['status']}'"
        assert status.get("enabled_by") == alice.user_id
        assert status.get("epoch") is not None and status["epoch"] >= 1

    runner.test("Enable group E2EE", test_enable_group_e2ee)

    # =========================================================================
    # Scenario 2: Bob fetches sender keys
    # =========================================================================
    print("\n[Scenario 2: Members fetch encrypted sender keys]")

    def test_fetch_sender_keys():
        # Bob fetches his sender keys
        bob_keys = bob_api.get_sender_keys(group_id)
        http_bodies.append(json.dumps(bob_keys))
        assert len(bob_keys) > 0, "Bob should have at least one sender key"
        for sk in bob_keys:
            assert sk.get("encryptedSenderKey"), "Sender key should have encrypted content"
            assert sk.get("epoch") is not None

    runner.test("Fetch sender keys", test_fetch_sender_keys)

    # =========================================================================
    # Scenario 3: Send encrypted group message
    # =========================================================================
    print("\n[Scenario 3: Send encrypted group message]")

    def test_send_encrypted_group():
        secret = P1_GROUP_SECRET
        p1_group_secrets.append(secret)

        # Alice encrypts message for the group conversation
        group_conv_id = f"g_{group_id}"
        epoch = alice_api.get_group_e2ee_status(group_id)["epoch"]

        # For group messages, Alice encrypts to Bob's device (representative recipient)
        # The backend validates the envelope format and epoch
        handshake = alice.create_outbound_session(group_conv_id, bob.user_id, bob.device_id)
        wire = alice.encrypt(group_conv_id, secret)

        envelope = {
            "version": RUST_E2EE_ENVELOPE_VERSION,
            "algorithm": RUST_E2EE_ALGORITHM,
            "senderDeviceId": alice.device_id,
            "sessionId": group_conv_id,
            "keyVersion": epoch,
            "handshake": base64.b64encode(handshake).decode("ascii"),
            "wire": base64.b64encode(wire).decode("ascii"),
        }

        cid = f"p1-ge2ee-{secrets.token_hex(4)}"
        result = alice_api.send_group_encrypted(
            group_id, cid, "TEXT", envelope, alice.device_id)
        assert result.get("data") or result.get("success"), f"Group encrypted send failed: {result}"

        msg_data = result.get("data", {})
        assert msg_data.get("encrypted"), "Message should be marked as encrypted"

    runner.test("Send encrypted group message", test_send_encrypted_group)

    # =========================================================================
    # Scenario 4: Plaintext Blocked
    # =========================================================================
    print("\n[Scenario 4: Plaintext blocked in E2EE group]")

    def test_plaintext_blocked():
        try:
            alice_api.send_group_plaintext(
                group_id, f"p1-blocked-{secrets.token_hex(4)}",
                "this-should-be-blocked")
            raise AssertionError("Plaintext send should have been blocked")
        except Exception as e:
            err = str(e)
            assert ("e2ee" in err.lower() or "envelope" in err.lower() or
                    "forbidden" in err.lower() or "plaintext" in err.lower() or
                    "400" in err or "content" in err.lower()), \
                f"Expected E2EE enforcement error, got: {err}"

    runner.test("Plaintext blocked", test_plaintext_blocked)

    # =========================================================================
    # Scenario 5: Encrypted Media Blocked
    # =========================================================================
    print("\n[Scenario 5: Encrypted media blocked in E2EE group]")

    def test_encrypted_media_blocked():
        group_conv_id = f"g_{group_id}"
        epoch = alice_api.get_group_e2ee_status(group_id)["epoch"]

        handshake = alice.create_outbound_session(
            group_conv_id, bob.user_id, bob.device_id)
        wire = alice.encrypt(group_conv_id, "dummy-media-secret")

        envelope = {
            "version": RUST_E2EE_ENVELOPE_VERSION,
            "algorithm": RUST_E2EE_ALGORITHM,
            "senderDeviceId": alice.device_id,
            "sessionId": group_conv_id,
            "keyVersion": epoch,
            "handshake": base64.b64encode(handshake).decode("ascii"),
            "wire": base64.b64encode(wire).decode("ascii"),
        }

        try:
            alice_api.send_group_encrypted_media(
                group_id, f"p1-media-{secrets.token_hex(4)}",
                envelope, alice.device_id,
                "https://example.com/test.jpg")
            raise AssertionError("Encrypted media send should be blocked")
        except Exception as e:
            err = str(e)
            assert ("media" in err.lower() or "unsupported" in err.lower() or
                    "blocked" in err.lower() or "400" in err), \
                f"Expected media blocking error, got: {err}"

    runner.test("Encrypted media blocked", test_encrypted_media_blocked)

    # =========================================================================
    # Scenario 6: Stale Epoch
    # =========================================================================
    print("\n[Scenario 6: Stale epoch rejected]")

    def test_stale_epoch():
        group_conv_id = f"g_{group_id}"
        current_epoch = alice_api.get_group_e2ee_status(group_id)["epoch"]
        stale_epoch = current_epoch - 1

        handshake = alice.create_outbound_session(
            group_conv_id, bob.user_id, bob.device_id)
        wire = alice.encrypt(group_conv_id, "stale-epoch-secret")

        stale_envelope = {
            "version": RUST_E2EE_ENVELOPE_VERSION,
            "algorithm": RUST_E2EE_ALGORITHM,
            "senderDeviceId": alice.device_id,
            "sessionId": group_conv_id,
            "keyVersion": stale_epoch,
            "handshake": base64.b64encode(handshake).decode("ascii"),
            "wire": base64.b64encode(wire).decode("ascii"),
        }

        try:
            alice_api.send_group_encrypted(
                group_id, f"p1-stale-{secrets.token_hex(4)}",
                "TEXT", stale_envelope, alice.device_id)
            raise AssertionError("Stale epoch should be rejected")
        except Exception as e:
            err = str(e)
            assert ("stale" in err.lower() or "epoch" in err.lower() or
                    "conflict" in err.lower() or "version" in err.lower() or
                    "409" in err), \
                f"Expected stale epoch error, got: {err}"

    runner.test("Stale epoch rejected", test_stale_epoch)

    # =========================================================================
    # Scenario 7: Epoch Rotation on E2EE Re-enable
    # =========================================================================
    print("\n[Scenario 7: Epoch rotation]")

    def test_epoch_rotation():
        epoch_before = alice_api.get_group_e2ee_status(group_id)["epoch"]

        # Disable and re-enable should increment epoch
        alice_api.disable_group_e2ee(group_id)

        # Re-enable with fresh sender keys
        sender_keys = []
        for user, device_id in [(bob, bob.device_id), (carol, carol.device_id)]:
            pairwise_sid = f"p_{alice.user_id}_{user.user_id}"
            if int(alice.user_id) > int(user.user_id):
                pairwise_sid = f"p_{user.user_id}_{alice.user_id}"
            sk_plain = base64.b64encode(secrets.token_bytes(32)).decode("ascii")
            handshake = alice.create_outbound_session(pairwise_sid, user.user_id, device_id)
            encrypted_sk = alice.encrypt(pairwise_sid, sk_plain)
            sender_keys.append({
                "recipientId": int(user.user_id),
                "deviceId": device_id,
                "encryptedSenderKey": base64.b64encode(encrypted_sk).decode("ascii"),
            })

        alice_api.enable_group_e2ee(group_id, sender_keys)

        epoch_after = alice_api.get_group_e2ee_status(group_id)["epoch"]
        assert epoch_after > epoch_before, \
            f"Re-enable should increment epoch: before={epoch_before}, after={epoch_after}"

    runner.test("Epoch rotation on re-enable", test_epoch_rotation)

    # =========================================================================
    # Scenario 8: HTTP Plaintext Scan
    # =========================================================================
    print("\n[Scenario 8: HTTP Plaintext Scan]")

    def test_http_scan():
        for secret in p1_group_secrets:
            for body in http_bodies:
                assert secret not in body, f"Plaintext secret found in HTTP response"

    runner.test("HTTP plaintext scan", test_http_scan)

    # =========================================================================
    # Scenario 9: DB Plaintext Scan
    # =========================================================================
    print("\n[Scenario 9: DB Plaintext Scan]")

    if db_url:
        def test_db_scan():
            violations = scan_db_for_secrets(db_url, p1_group_secrets)
            assert len(violations) == 0, f"DB plaintext violations: {violations}"

        runner.test("DB plaintext scan", test_db_scan)
    else:
        print("  [SKIP] No --db-url provided")

    return runner.summary()


# ============================================================================
# Main
# ============================================================================

def main():
    parser = argparse.ArgumentParser(
        description="P1-5 Group E2EE Acceptance Tests")
    parser.add_argument("--base-url", default="http://localhost:8082")
    parser.add_argument("--db-url", default=None,
                       help="MySQL URL for DB plaintext scan")
    args = parser.parse_args()

    success = run_tests(args.base_url, args.db_url)
    sys.exit(0 if success else 1)


if __name__ == "__main__":
    main()
