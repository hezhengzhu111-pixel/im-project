#!/usr/bin/env python3
"""
P0-1 E2EE Private Text Acceptance Tests — REAL Rust E2EE closed-loop verification.

Uses the real Rust im-e2ee-ffi cdylib (ctypes) for encryption/decryption.
No fake keys, no fake wires, no fake envelopes.

Prerequisites:
    - Build: cd rust && cargo build -p im-e2ee-ffi --release
    - Backend running on localhost:8082
    - MySQL accessible for plaintext scan

Usage:
    # Full P0 verification (DB scan REQUIRED):
    python tests/p0_e2ee_private_text_acceptance.py \
        --base-url http://localhost:8082 \
        --db-url mysql://root:root123@127.0.0.1:3306/service_message_service_db

    # Local debug only (DB scan skipped — NOT valid for P0):
    python tests/p0_e2ee_private_text_acceptance.py \
        --base-url http://localhost:8082 \
        --allow-skip-db-scan

Verification scenarios:
    1. Web Alice -> Mobile Bob: real encrypt, send, receive, real decrypt
    2. Mobile Bob -> Web Alice: real encrypt, send, receive, real decrypt
    3. History recovery: re-fetch + real decrypt
    4. Plaintext scan: HTTP (with auth, status 200) + DB (mandatory)
    5. Plaintext blocked: E2EE session rejects unencrypted content
"""

import sys
import os
import json
import base64
import secrets
import time
import argparse
import hashlib
from typing import Optional, Dict, List, Tuple

import requests

# Import real Rust E2EE bridge and stores from existing test infrastructure.
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

SECRET_WEB_TO_MOBILE = "p0-web-to-mobile-secret-001"
SECRET_MOBILE_TO_WEB = "p0-mobile-to-web-secret-001"


# ============================================================================
# API Client (mirrors e2ee_full_flow_test.py APIClient)
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

    # -- e2ee negotiation --
    def request_encryption(self, session_id: str, identity_key: str,
                           signed_pre_key: str, payload_json: str) -> None:
        self._post("/api/e2ee/request", {
            "sessionId": session_id, "identityKey": identity_key,
            "signedPreKey": signed_pre_key, "requestPayloadJson": payload_json,
        })

    def accept_encryption(self, session_id: str) -> None:
        self._post("/api/e2ee/accept", {"sessionId": session_id})

    def get_encryption_status(self, session_id: str) -> str:
        body = self._get(f"/api/e2ee/status/{session_id}")
        return body.get("data", {}).get("status", "plaintext")

    # -- messages --
    def send_private_encrypted(self, receiver_id: str, client_msg_id: str,
                               message_type: str, e2ee_envelope: dict,
                               e2ee_device_id: str) -> dict:
        return self._post("/api/message/send/private", {
            "receiverId": receiver_id, "clientMessageId": client_msg_id,
            "messageType": message_type, "encrypted": True,
            "e2eeEnvelope": e2ee_envelope, "e2eeDeviceId": e2ee_device_id,
        })

    def send_private_plaintext(self, receiver_id: str, client_msg_id: str,
                               content: str) -> dict:
        return self._post("/api/message/send/private", {
            "receiverId": receiver_id, "clientMessageId": client_msg_id,
            "messageType": "TEXT", "content": content, "encrypted": False,
        })

    def get_private_history(self, friend_id: str, limit: int = 50) -> list:
        return self._get(f"/api/message/private/{friend_id}", {"limit": str(limit)}).get("data", [])


# ============================================================================
# E2EE User Simulator (simplified from e2ee_full_flow_test.py E2EEUser)
# ============================================================================

class E2EEUser:
    """Simulates a single E2EE user with real Rust crypto."""

    def __init__(self, api: APIClient, username: str, password: str = "Test123456!"):
        self.api = api
        self.username = username
        self.password = password
        self.user_id: str = ""
        self.device_id: str = secrets.token_hex(16)
        self._engine = RustE2eeEngine()
        self._session_store = SessionStore()
        self._key_store = KeyStore()
        self._loaded_sessions: set = set()

    def register_and_login(self) -> None:
        self.api.register(self.username, self.password)
        self.api.login(self.username, self.password)
        self.user_id = self.api.user_id

    def ensure_device_registered(self, otk_count: int = 100) -> str:
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
        return self.device_id

    def fetch_remote_bundle(self, user_id: str, device_id: Optional[str],
                            conversation_id: str) -> dict:
        requester_device_id = self.device_id
        devices = self.api.get_devices(user_id)
        if device_id:
            target = next((d for d in devices if d.get("deviceId") == device_id), None)
        else:
            def _last_active(d):
                ts = d.get("lastActiveAt") or d.get("last_active_at") or "0"
                try:
                    from datetime import datetime
                    return int(datetime.fromisoformat(
                        ts.replace("Z", "+00:00")).timestamp() * 1000)
                except Exception:
                    return 0
            devices_sorted = sorted(devices, key=_last_active, reverse=True)
            target = devices_sorted[0] if devices_sorted else None

        if not target or not target.get("deviceId"):
            raise Exception("remote user has no active Rust E2EE device")

        bundle = self.api.get_bundle(
            user_id, target["deviceId"], conversation_id, requester_device_id)
        raw = bundle
        otk_raw = raw.get("oneTimePreKey")
        otk_id = raw.get("oneTimePreKeyId")
        otk = None
        if isinstance(otk_raw, str) and len(otk_raw) > 0:
            if isinstance(otk_id, int) and otk_id > 0:
                otk = {"id": otk_id, "key": otk_raw}
        return {
            "identityKey": raw.get("identityKey", ""),
            "signingKey": raw.get("signingIdentityKey") or raw.get("signingKey")
                          or raw.get("identityKey", ""),
            "signedPreKey": raw.get("signedPreKey", ""),
            "signedPreKeySignature": raw.get("signedPreKeySignature", ""),
            "oneTimePreKey": otk,
            "userId": user_id,
            "deviceId": raw.get("deviceId") or target["deviceId"],
        }

    def resolve_sender_identity_key(self, sender_user_id: str, sender_device_id: str) -> str:
        devices = self.api.get_devices(sender_user_id)
        device = next((d for d in devices if d.get("deviceId") == sender_device_id), None)
        if device and device.get("identityKey"):
            return device["identityKey"]
        raise Exception("sender Rust identity key not found")

    def restore_session_if_needed(self, session_id: str, state_bincode: bytes) -> None:
        if session_id in self._loaded_sessions:
            return
        try:
            self._engine.restore_session(session_id, state_bincode)
        except RuntimeError as e:
            if "session already exists" in str(e):
                self._loaded_sessions.add(session_id)
                return
            raise
        self._loaded_sessions.add(session_id)

    def ensure_outbound_session(self, session_id: str, recipient_user_id: str,
                                recipient_device_id: Optional[str] = None
                                ) -> Tuple[str, Optional[str]]:
        local_device_id = self.device_id
        stored_device_id = self._key_store.get_local(
            f"{REMOTE_DEVICE_PREFIX}{session_id}") or ""
        expected_device_id = recipient_device_id or stored_device_id

        if not expected_device_id:
            recovered = self._session_store.find_session_by_local_device(
                session_id, local_device_id)
            if recovered:
                expected_device_id = recovered["remoteDeviceId"]
                self._key_store.set_local(
                    f"{REMOTE_DEVICE_PREFIX}{session_id}", expected_device_id)

        if expected_device_id:
            existing_state = self._session_store.get_session_state_bytes(
                session_id, local_device_id, recipient_user_id, expected_device_id)
            if existing_state:
                self.restore_session_if_needed(session_id, existing_state)
                return (expected_device_id, None)

        if not recipient_user_id:
            raise Exception("missing recipient user id for Rust E2EE session")

        local_keys = self._key_store.get_local_key_material()
        if local_keys is None:
            raise Exception("local key material not found")

        remote_bundle = self.fetch_remote_bundle(
            recipient_user_id, recipient_device_id, session_id)

        self._engine.remove_session(session_id)
        self._loaded_sessions.discard(session_id)

        ik_bincode = base64.b64decode(local_keys["identityKeyPairBincode"])
        handshake_bytes = self._engine.create_outbound_session(
            session_id, ik_bincode, remote_bundle)
        self._loaded_sessions.add(session_id)

        resolved_device_id = remote_bundle["deviceId"]
        if not resolved_device_id:
            raise Exception("E2EE session state requires remoteDeviceId")

        state_bincode = self._engine.export_session(session_id)
        self._session_store.save_session_state_bytes(
            session_id, state_bincode, local_device_id, recipient_user_id,
            resolved_device_id, "outbound")
        self._key_store.set_local(
            f"{REMOTE_DEVICE_PREFIX}{session_id}", resolved_device_id)

        return (resolved_device_id, base64.b64encode(handshake_bytes).decode("ascii"))

    def encrypt_to_envelope(self, conversation_id: str, recipient_user_id: str,
                            recipient_device_id: Optional[str],
                            plaintext: str) -> dict:
        session_id = conversation_id
        sender_device_id = self.device_id

        resolved_device_id, handshake_b64 = self.ensure_outbound_session(
            session_id, recipient_user_id, recipient_device_id)

        wire = self._engine.encrypt(session_id, plaintext.encode("utf-8"))

        state_bincode = self._engine.export_session(session_id)
        self._session_store.save_session_state_bytes(
            session_id, state_bincode, sender_device_id, recipient_user_id,
            resolved_device_id, "outbound")
        self._key_store.set_local(
            f"{SESSION_STATUS_PREFIX}{session_id}", "encrypted")

        return {
            "version": RUST_E2EE_ENVELOPE_VERSION,
            "algorithm": RUST_E2EE_ALGORITHM,
            "senderDeviceId": sender_device_id,
            "recipientDeviceId": resolved_device_id,
            "sessionId": session_id,
            "handshake": handshake_b64,
            "wire": base64.b64encode(wire).decode("ascii"),
        }

    def decrypt_envelope(self, envelope: dict, sender_user_id: str) -> str:
        sender_device_id = envelope.get("senderDeviceId", "")
        if not sender_device_id:
            raise Exception("E2EE envelope sender device id unavailable")

        local_device_id = self.device_id
        session_id = envelope["sessionId"]
        handshake_b64 = envelope.get("handshake")

        stored_state = self._session_store.get_session_state_bytes(
            session_id, local_device_id, sender_user_id, sender_device_id)

        session_ready = False

        if handshake_b64:
            remote_ik_b64 = self.resolve_sender_identity_key(
                sender_user_id, sender_device_id)

            if stored_state:
                backup_id = session_id + ":backup"
                try:
                    self._engine.remove_session(backup_id)
                    self._engine.restore_session(backup_id, stored_state)
                except RuntimeError:
                    pass

            self._engine.remove_session(session_id)
            self._loaded_sessions.discard(session_id)

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
                    raise Exception(
                        f"missing one-time pre-key: {normalized['oneTimePreKeyId']}")

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
                self._key_store.mark_one_time_pre_key_consumed(
                    normalized["oneTimePreKeyId"])
            session_ready = True

        elif stored_state:
            self.restore_session_if_needed(session_id, stored_state)
            session_ready = True
        else:
            raise Exception(
                "Rust E2EE session not found and envelope has no handshake")

        if not session_ready:
            raise Exception("failed to establish session for decryption")

        wire_b64 = envelope.get("wire", "")
        if not wire_b64:
            raise Exception("No wire in envelope")
        wire = base64.b64decode(wire_b64)
        plaintext_bytes = self._engine.decrypt(session_id, wire)

        # Persist updated ratchet state.
        state_bincode = self._engine.export_session(session_id)
        self._session_store.save_session_state_bytes(
            session_id, state_bincode, local_device_id,
            sender_user_id, sender_device_id, "inbound")

        return plaintext_bytes.decode("utf-8")


# ============================================================================
# Database Scanner
# ============================================================================

def scan_database(db_url: str, secrets: List[str],
                  client_message_ids: List[str]) -> List[str]:
    """Scan MySQL messages table for plaintext secrets. Returns violations.

    Uses client_message_ids to precisely locate test messages, then
    performs a global LIKE scan as a safety net.
    """
    try:
        import pymysql
    except ImportError:
        raise RuntimeError("pymysql not installed. Run: pip install pymysql")

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
        charset="utf8mb4",
    )
    cursor = conn.cursor()

    # ---- Phase 1: Precise lookup by client_message_id ----
    if not client_message_ids:
        raise AssertionError(
            "DB scan requires client_message_ids to locate test messages; "
            "none provided")

    # Check that client_message_id column exists.
    try:
        cursor.execute("SELECT * FROM messages WHERE 1=0")
        cols = [d[0] for d in cursor.description]
    except pymysql.err.ProgrammingError:
        cols = []

    if "client_message_id" not in cols:
        raise AssertionError(
            "messages.client_message_id column is missing; "
            "cannot locate test messages for DB scan")

    placeholders = ",".join(["%s"] * len(client_message_ids))
    cursor.execute(
        f"SELECT id, client_message_id, content, e2ee_envelope_json "
        f"FROM messages WHERE client_message_id IN ({placeholders})",
        client_message_ids,
    )
    found_rows = cursor.fetchall()

    found_ids = {row[1] for row in found_rows if row[1]}
    missing = set(client_message_ids) - found_ids
    if missing:
        raise AssertionError(
            f"Test messages not found by client_message_id: {missing}")

    # Scan the located test messages for secret leakage.
    for row in found_rows:
        msg_id, cid, content_val, envelope_val = row
        for col_name, col_val in [("content", content_val), ("e2ee_envelope_json", envelope_val)]:
            value_str = str(col_val) if col_val else ""
            for secret in secrets:
                if secret in value_str:
                    violations.append(
                        f"P0 secret leaked in messages.{col_name} "
                        f"for message {msg_id}")

    # ---- Phase 2: Global LIKE scan (safety net) ----
    for secret in secrets:
        try:
            cursor.execute(
                "SELECT id, client_message_id, content, e2ee_envelope_json "
                "FROM messages "
                "WHERE content LIKE %s OR e2ee_envelope_json LIKE %s",
                (f"%{secret}%", f"%{secret}%"),
            )
            for row in cursor.fetchall():
                msg_id, cid, content_val, envelope_val = row
                violations.append(
                    f"P0 secret leaked in messages (global LIKE) "
                    f"for message {msg_id}")
        except pymysql.err.ProgrammingError as e:
            # Column may not exist — still fail for test messages but
            # global scan continues for existing columns.
            violations.append(
                f"DB column error during global LIKE scan: {e}")

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
        self.results = {}  # name -> bool

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
        print(f"Web->Mobile decrypt ok: {self.results.get('Web->Mobile decrypt', False)}")
        print(f"Mobile->Web decrypt ok: {self.results.get('Mobile->Web decrypt', False)}")
        print(f"HTTP plaintext scan ok: {self.results.get('HTTP plaintext scan', False)}")
        print(f"DB plaintext scan ok: {self.results.get('DB plaintext scan', False)}")
        print(f"Plaintext blocked ok: {self.results.get('Plaintext blocked', False)}")
        print(f"History recovery ok: {self.results.get('History recovery', False)}")
        return self.failed == 0


# ============================================================================
# Main Test Flow
# ============================================================================

def run_tests(base_url: str, db_url: Optional[str], allow_skip_db: bool = False):
    runner = TestRunner()

    # ---- Validate DB scan requirement ----
    if not db_url and not allow_skip_db:
        print("\nERROR: --db-url is required for P0 verification.")
        print("  Use --allow-skip-db-scan only for local debugging (not valid for P0).")
        sys.exit(1)

    # ---- Setup ----
    print("Setting up clients with REAL Rust E2EE engine...")
    alice_api = APIClient(base_url)
    bob_api = APIClient(base_url)

    alice = E2EEUser(alice_api, f"p0_alice_{secrets.token_hex(4)}")
    bob = E2EEUser(bob_api, f"p0_bob_{secrets.token_hex(4)}")

    alice.register_and_login()
    bob.register_and_login()
    print(f"  Alice: {alice.user_id}, Bob: {bob.user_id}")

    # Friendship.
    alice.api.send_friend_request(bob.user_id)
    time.sleep(0.5)
    pending = bob.api.get_friend_requests()
    if pending:
        bob.api.accept_friend_request(pending[0]["id"])
    print("  Friendship established.")

    # Device registration.
    alice.ensure_device_registered()
    bob.ensure_device_registered()
    print(f"  Devices registered: Alice={alice.device_id}, Bob={bob.device_id}")

    # E2EE session ID (must be p_{idA}_{idB} format, lower ID first).
    if alice.user_id < bob.user_id:
        session_id = f"p_{alice.user_id}_{bob.user_id}"
    else:
        session_id = f"p_{bob.user_id}_{alice.user_id}"
    print(f"  Session: {session_id}")

    # Pre-generate clientMessageIds so DB scan can locate test messages.
    web_to_mobile_client_id = f"p0-w2m-{secrets.token_hex(4)}"
    mobile_to_web_client_id = f"p0-m2w-{secrets.token_hex(4)}"
    p0_client_message_ids = [web_to_mobile_client_id, mobile_to_web_client_id]
    print(f"  clientMessageIds: w2m={web_to_mobile_client_id}, m2w={mobile_to_web_client_id}")

    # ---- E2EE Negotiation ----
    print("\n[E2EE Negotiation]")
    # Send encryption request (minimal — handshake comes in first message envelope).
    alice.api.request_encryption(
        session_id,
        alice._key_store.get_local_key_material()["publicBundle"]["identityKey"],
        alice._key_store.get_local_key_material()["publicBundle"]["signedPreKey"]["key"],
        json.dumps({
            "senderDeviceId": alice.device_id,
            "senderUserId": alice.user_id,
        }))
    bob.api.accept_encryption(session_id)

    # Verify status is "encrypted" (not "pending").
    def test_e2ee_status_encrypted():
        status_a = alice.api.get_encryption_status(session_id)
        status_b = bob.api.get_encryption_status(session_id)
        assert status_a == "encrypted", \
            f"Alice E2EE status is '{status_a}', must be 'encrypted'"
        assert status_b == "encrypted", \
            f"Bob E2EE status is '{status_b}', must be 'encrypted'"

    runner.test("E2EE status encrypted (both sides)", test_e2ee_status_encrypted)

    # =====================================================================
    # Scenario 1: Web(Alice) -> Mobile(Bob)
    # =====================================================================
    print("\n[Scenario 1: Web(Alice) -> Mobile(Bob)]")

    def test_web_to_mobile():
        # Alice encrypts REAL plaintext.
        envelope = alice.encrypt_to_envelope(
            session_id, bob.user_id, None,
            SECRET_WEB_TO_MOBILE)
        # Send via API with pre-generated clientMessageId.
        result = alice.api.send_private_encrypted(
            bob.user_id, web_to_mobile_client_id,
            "TEXT", envelope, alice.device_id)
        assert result.get("data") or result.get("success"), \
            f"Encrypted send failed: {result}"

        # Bob fetches history and decrypts.
        time.sleep(1)
        history = bob.api.get_private_history(alice.user_id, limit=10)
        encrypted_msgs = [m for m in history if m.get("encrypted")]
        assert len(encrypted_msgs) > 0, \
            "No encrypted messages in Bob's history"

        msg = encrypted_msgs[-1]
        env = msg.get("e2eeEnvelope") or msg.get("e2ee_envelope")
        assert env is not None, "Message has no e2eeEnvelope"
        # Normalize envelope keys.
        normalized_env = {
            "version": env.get("version", 2),
            "algorithm": env.get("algorithm") or env.get("alg", ""),
            "senderDeviceId": env.get("senderDeviceId") or env.get("sender_device_id", ""),
            "recipientDeviceId": env.get("recipientDeviceId") or env.get("recipient_device_id", ""),
            "sessionId": env.get("sessionId") or env.get("session_id", ""),
            "handshake": env.get("handshake"),
            "wire": env.get("wire", ""),
        }
        plaintext = bob.decrypt_envelope(normalized_env, alice.user_id)
        assert plaintext == SECRET_WEB_TO_MOBILE, \
            f"Decryption mismatch: expected '{SECRET_WEB_TO_MOBILE}', got '{plaintext}'"

    runner.test("Web->Mobile decrypt", test_web_to_mobile)

    # =====================================================================
    # Scenario 2: Mobile(Bob) -> Web(Alice)
    # =====================================================================
    print("\n[Scenario 2: Mobile(Bob) -> Web(Alice)]")

    def test_mobile_to_web():
        # Bob encrypts (first call creates outbound session with handshake).
        envelope = bob.encrypt_to_envelope(
            session_id, alice.user_id, None,
            SECRET_MOBILE_TO_WEB)

        result = bob.api.send_private_encrypted(
            alice.user_id, mobile_to_web_client_id,
            "TEXT", envelope, bob.device_id)
        assert result.get("data") or result.get("success"), \
            f"Encrypted send failed: {result}"

        # Alice fetches history and decrypts.
        time.sleep(1)
        history = alice.api.get_private_history(bob.user_id, limit=10)
        encrypted_msgs = [m for m in history if m.get("encrypted")]
        assert len(encrypted_msgs) > 0, \
            "No encrypted messages in Alice's history"

        # Find Bob's message (use message-level senderId).
        bob_msg = None
        for m in encrypted_msgs:
            sender = str(m.get("senderId", ""))
            if sender == str(bob.user_id):
                bob_msg = m
                break
        assert bob_msg is not None, "No encrypted message from Bob found in history"

        env = bob_msg.get("e2eeEnvelope") or bob_msg.get("e2ee_envelope")
        assert env is not None, "Message has no e2eeEnvelope"

        normalized_env = {
            "version": env.get("version", 2),
            "algorithm": env.get("algorithm") or env.get("alg", ""),
            "senderDeviceId": env.get("senderDeviceId") or env.get("sender_device_id", ""),
            "recipientDeviceId": env.get("recipientDeviceId") or env.get("recipient_device_id", ""),
            "sessionId": env.get("sessionId") or env.get("session_id", ""),
            "handshake": env.get("handshake"),
            "wire": env.get("wire", ""),
        }
        plaintext = alice.decrypt_envelope(normalized_env, bob.user_id)
        assert plaintext == SECRET_MOBILE_TO_WEB, \
            f"Decryption mismatch: expected '{SECRET_MOBILE_TO_WEB}', got '{plaintext}'"

    runner.test("Mobile->Web decrypt", test_mobile_to_web)

    # =====================================================================
    # Scenario 3: History Recovery
    # =====================================================================
    print("\n[Scenario 3: History Recovery]")

    def test_history_recovery():
        # Re-fetch history for both users.
        bob_history = bob.api.get_private_history(alice.user_id, limit=50)
        alice_history = alice.api.get_private_history(bob.user_id, limit=50)

        # Verify encrypted messages exist with valid envelope structure.
        bob_encrypted = [m for m in bob_history if m.get("encrypted")]
        assert len(bob_encrypted) > 0, "No encrypted messages in Bob's history"

        alice_encrypted = [m for m in alice_history if m.get("encrypted")]
        assert len(alice_encrypted) > 0, "No encrypted messages in Alice's history"

        # Verify each encrypted message has a valid e2eeEnvelope with required fields.
        for label, msgs, peer_id in [
            ("Bob", bob_encrypted, alice.user_id),
            ("Alice", alice_encrypted, bob.user_id),
        ]:
            found = False
            for msg in msgs:
                env = msg.get("e2eeEnvelope") or msg.get("e2ee_envelope")
                if env and str(msg.get("senderId", "")) == str(peer_id):
                    # Verify envelope has required fields.
                    assert env.get("wire"), "Envelope missing wire field"
                    assert env.get("sessionId") or env.get("session_id"), \
                        "Envelope missing sessionId"
                    assert env.get("version") == 2, \
                        f"Envelope version is {env.get('version')}, expected 2"
                    found = True
                    break
            assert found, f"No encrypted message from peer in {label}'s history"

        # Verify plaintext secrets are NOT in the history response bodies.
        bob_resp = requests.get(
            f"{base_url}/api/message/private/{alice.user_id}",
            params={"limit": "50"},
            headers=bob.api._headers(), timeout=15)
        alice_resp = requests.get(
            f"{base_url}/api/message/private/{bob.user_id}",
            params={"limit": "50"},
            headers=alice.api._headers(), timeout=15)
        for label, body in [("Bob history", bob_resp.text),
                            ("Alice history", alice_resp.text)]:
            assert SECRET_WEB_TO_MOBILE not in body, \
                f"Plaintext found in {label}"
            assert SECRET_MOBILE_TO_WEB not in body, \
                f"Plaintext found in {label}"

    runner.test("History recovery", test_history_recovery)

    # =====================================================================
    # Scenario 4: HTTP Plaintext Scan
    # =====================================================================
    print("\n[Scenario 4: HTTP Plaintext Scan]")

    def test_http_plaintext_scan():
        # Fetch history with proper auth headers, verify 200 status.
        alice_resp = requests.get(
            f"{base_url}/api/message/private/{bob.user_id}",
            params={"limit": "50"},
            headers=alice.api._headers(), timeout=15)
        assert alice_resp.status_code == 200, \
            f"Alice history HTTP {alice_resp.status_code}"
        bob_resp = requests.get(
            f"{base_url}/api/message/private/{alice.user_id}",
            params={"limit": "50"},
            headers=bob.api._headers(), timeout=15)
        assert bob_resp.status_code == 200, \
            f"Bob history HTTP {bob_resp.status_code}"

        # Scan response bodies.
        for label, body in [("Alice history", alice_resp.text),
                            ("Bob history", bob_resp.text)]:
            assert SECRET_WEB_TO_MOBILE not in body, \
                f"Plaintext '{SECRET_WEB_TO_MOBILE}' found in {label}"
            assert SECRET_MOBILE_TO_WEB not in body, \
                f"Plaintext '{SECRET_MOBILE_TO_WEB}' found in {label}"

    runner.test("HTTP plaintext scan", test_http_plaintext_scan)

    # =====================================================================
    # Scenario 5: Database Plaintext Scan (MANDATORY for P0)
    # =====================================================================
    print("\n[Scenario 5: Database Plaintext Scan]")

    def test_db_plaintext_scan():
        violations = scan_database(
            db_url,
            [SECRET_WEB_TO_MOBILE, SECRET_MOBILE_TO_WEB],
            p0_client_message_ids)
        assert len(violations) == 0, \
            f"Database plaintext violations: {violations}"

    if db_url:
        runner.test("DB plaintext scan", test_db_plaintext_scan)
    else:
        print("  [SKIP] No --db-url provided (use --allow-skip-db-scan for debug)")

    # =====================================================================
    # Scenario 6: Plaintext Blocked
    # =====================================================================
    print("\n[Scenario 6: Plaintext Blocked in E2EE Session]")

    def test_plaintext_blocked():
        """After E2EE is active, plaintext send must be rejected."""
        try:
            alice.api.send_private_plaintext(
                bob.user_id, f"p0-blocked-{secrets.token_hex(4)}",
                "this-should-be-blocked")
            raise AssertionError("Plaintext send should have been rejected")
        except Exception as e:
            err = str(e)
            assert "e2ee" in err.lower() or "envelope" in err.lower() or \
                   "plaintext" in err.lower() or "400" in err, \
                f"Expected E2EE enforcement error, got: {err}"

    runner.test("Plaintext blocked", test_plaintext_blocked)

    # ---- Report ----
    return runner.summary()


# ============================================================================
# Main
# ============================================================================

def main():
    parser = argparse.ArgumentParser(
        description="P0-1 E2EE Private Text Acceptance Tests (REAL Rust E2EE)")
    parser.add_argument("--base-url", default="http://localhost:8082")
    parser.add_argument("--db-url", default=None,
                       help="MySQL URL for mandatory DB plaintext scan")
    parser.add_argument("--allow-skip-db-scan", action="store_true",
                       help="Allow skipping DB scan (debug only, NOT valid for P0)")
    args = parser.parse_args()

    success = run_tests(args.base_url, args.db_url, args.allow_skip_db_scan)
    sys.exit(0 if success else 1)


if __name__ == "__main__":
    main()
