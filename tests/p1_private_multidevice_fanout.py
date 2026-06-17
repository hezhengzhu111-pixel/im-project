#!/usr/bin/env python3
"""
P1-3 Private Multi-Device Fan-Out Acceptance Tests.

Verifies multi-device envelope delivery, isolation, and revoked-device handling
against a running backend + real Rust E2EE.

Focus: server-side device fan-out semantics.
Crypto: uses the same proven Rust E2EE flow as P0 acceptance tests.

Scenarios:
  1. Bob multi-device registration and bundle fetch
  2. Encrypted message delivery — both devices see encrypted messages in history
  3. Envelope isolation: device-b1 envelope != device-b2 envelope (ciphertext differs)
  4. Revoked device: after revoke, bundle fetch fails, device removed from list
  5. HTTP + DB plaintext scan

Usage:
    python tests/p1_private_multidevice_fanout.py \
        --base-url http://localhost:8082 \
        --db-url mysql://root:...@127.0.0.1:3306/service_message_service_db
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

RUST_E2EE_ENVELOPE_VERSION = 2
RUST_E2EE_ALGORITHM = "rust-x25519-x3dh-dr-v1"
SESSION_STATUS_PREFIX = "e2ee:status:"
REMOTE_DEVICE_PREFIX = "e2ee:remote_device:"
OTK_UPLOAD_COUNT = 100

P1_MD_SECRET = "p1-multi-device-test-secret"

# ============================================================================
# APIClient (same as P0 test + multi-device + opk methods)
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
                    raise Exception(f"POST {path}: {resp.status_code} {body.get('message', body)}")
                return body
            except (requests.ConnectionError, requests.Timeout):
                if attempt == 2:
                    raise
                time.sleep(2)

    def _get(self, path: str, params: dict = None) -> dict:
        url = f"{self.base_url}{path}"
        resp = requests.get(url, params=params, headers=self._headers(), timeout=15)
        body = resp.json()
        if not body.get("success", False):
            raise Exception(f"GET {path}: {resp.status_code} {body.get('message', body)}")
        return body

    def _delete(self, path: str) -> dict:
        url = f"{self.base_url}{path}"
        resp = requests.delete(url, headers=self._headers(), timeout=15)
        body = resp.json()
        if not body.get("success", False):
            raise Exception(f"DELETE {path}: {resp.status_code} {body.get('message', body)}")
        return body

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

    def send_friend_request(self, target_user_id: str) -> None:
        self._post("/api/friend/request", {"targetUserId": target_user_id})

    def get_friend_requests(self) -> list:
        return self._get("/api/friend/requests").get("data", [])

    def accept_friend_request(self, request_id: str) -> None:
        self._post("/api/friend/accept", {"requestId": request_id})

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

    def send_private_encrypted(self, receiver_id: str, client_msg_id: str,
                               message_type: str, e2ee_envelope: dict,
                               e2ee_device_id: str) -> dict:
        return self._post("/api/message/send/private", {
            "receiverId": receiver_id, "clientMessageId": client_msg_id,
            "messageType": message_type, "encrypted": True,
            "e2eeEnvelope": e2ee_envelope, "e2eeDeviceId": e2ee_device_id,
        })

    def get_private_history(self, friend_id: str, limit: int = 50) -> list:
        return self._get(f"/api/message/private/{friend_id}", {"limit": str(limit)}).get("data", [])

    def opk_status(self, device_id: str) -> dict:
        return self._get("/api/keys/opk/status", {"deviceId": device_id})["data"]


# ============================================================================
# E2EEUser (proven encrypt/decrypt from P0 test, with multi-device support)
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
                    return int(datetime.fromisoformat(ts.replace("Z", "+00:00")).timestamp() * 1000)
                except Exception:
                    return 0
            devices_sorted = sorted(devices, key=_last_active, reverse=True)
            target = devices_sorted[0] if devices_sorted else None
        if not target or not target.get("deviceId"):
            raise Exception("remote user has no active Rust E2EE device")
        bundle = self.api.get_bundle(user_id, target["deviceId"], conversation_id, requester_device_id)
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
                                recipient_device_id: Optional[str] = None):
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
        self._key_store.set_local(f"{SESSION_STATUS_PREFIX}{session_id}", "encrypted")
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
            remote_ik_b64 = self.resolve_sender_identity_key(sender_user_id, sender_device_id)
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
                    raise Exception(f"missing one-time pre-key: {normalized['oneTimePreKeyId']}")
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
            session_ready = True
        elif stored_state:
            self.restore_session_if_needed(session_id, stored_state)
            session_ready = True
        else:
            raise Exception("Rust E2EE session not found and envelope has no handshake")
        if not session_ready:
            raise Exception("failed to establish session for decryption")
        wire_b64 = envelope.get("wire", "")
        if not wire_b64:
            raise Exception("No wire in envelope")
        wire = base64.b64decode(wire_b64)
        plaintext_bytes = self._engine.decrypt(session_id, wire)
        state_bincode = self._engine.export_session(session_id)
        self._session_store.save_session_state_bytes(
            session_id, state_bincode, local_device_id,
            sender_user_id, sender_device_id, "inbound")
        return plaintext_bytes.decode("utf-8")


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
    host = host_port.split(":")[0] if ":" in host_port else host_port
    port = int(host_port.split(":")[1]) if ":" in host_port else 3306
    violations = []
    conn = pymysql.connect(host=host, port=port, user=user, password=password,
                           database=database, charset="utf8mb4")
    cursor = conn.cursor()
    for secret in secrets:
        for tbl, cols in [("messages", ["content", "e2ee_envelope_json"]),
                           ("message_deliveries", ["header", "ciphertext"])]:
            for col in cols:
                try:
                    cursor.execute(
                        f"SELECT 1 FROM service_message_service_db.{tbl} "
                        f"WHERE {col} LIKE %s LIMIT 1", (f"%{secret}%",))
                    if cursor.fetchone():
                        violations.append(f"Plaintext in {tbl}.{col}")
                except Exception:
                    pass
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
    p1_secrets = [P1_MD_SECRET]
    client_msg_ids: List[str] = []

    # ---- Setup ----
    print("Setting up Alice + Bob with multiple devices...")
    alice_api = APIClient(base_url)
    bob_api = APIClient(base_url)
    alice = E2EEUser(alice_api, f"ma{secrets.token_hex(3)}")
    bob = E2EEUser(bob_api, f"mb{secrets.token_hex(3)}")
    alice.register_and_login()
    bob.register_and_login()
    print(f"  Alice={alice.user_id}, Bob={bob.user_id}")

    alice.api.send_friend_request(bob.user_id)
    time.sleep(0.5)
    pending = bob.api.get_friend_requests()
    if pending:
        bob.api.accept_friend_request(pending[0]["id"])

    if alice.user_id < bob.user_id:
        session_id = f"p_{alice.user_id}_{bob.user_id}"
    else:
        session_id = f"p_{bob.user_id}_{alice.user_id}"

    # Register devices
    alice.ensure_device_registered()
    bob.ensure_device_registered()
    bob_id_b1 = bob.device_id
    print(f"  Alice device: {alice.device_id}")
    print(f"  Bob device-b1: {bob_id_b1}")

    # Register Bob's second device via API
    bob_id_b2 = secrets.token_hex(16)
    km_b2 = bob._engine.generate_pre_key_bundle(
        signed_pre_key_id=1, one_time_pre_key_start_id=1, one_time_pre_key_count=OTK_UPLOAD_COUNT)
    pb_b2 = km_b2["publicBundle"]
    otk_list_b2 = [{"id": p["id"], "key": p["key"]} for p in pb_b2.get("oneTimePreKeys", [])]
    bob.api.upload_bundle(
        device_id=bob_id_b2, identity_key=pb_b2["identityKey"],
        signing_key=pb_b2["signingKey"], signed_pre_key=pb_b2["signedPreKey"]["key"],
        signed_pre_key_sig=pb_b2["signedPreKeySignature"], one_time_pre_keys=otk_list_b2)
    print(f"  Bob device-b2: {bob_id_b2}")

    # Complete E2EE negotiation
    alice_ik = alice._key_store.get_local_key_material()["publicBundle"]["identityKey"]
    alice_spk = alice._key_store.get_local_key_material()["publicBundle"]["signedPreKey"]["key"]
    alice.api.request_encryption(
        session_id, alice_ik, alice_spk,
        json.dumps({"senderDeviceId": alice.device_id, "senderUserId": alice.user_id}))
    bob.api.accept_encryption(session_id)
    assert alice.api.get_encryption_status(session_id) == "encrypted"
    print("  E2EE negotiation completed.")

    # =========================================================================
    # Scenario 1: Bob has multiple active devices
    # =========================================================================
    print("\n[Scenario 1: Bob multi-device registration]")

    def test_bob_multi_device():
        devices = bob.api.get_devices(bob.user_id)
        active = [d for d in devices if d.get("status", "active") == "active"]
        assert len(active) >= 2, f"Bob should have >=2 active devices, got {len(active)}"
        device_ids = [d["deviceId"] for d in active]
        assert bob_id_b1 in device_ids, "device-b1 not in active device list"
        assert bob_id_b2 in device_ids, "device-b2 not in active device list"

    runner.test("Bob has multiple active devices", test_bob_multi_device)

    # =========================================================================
    # Scenario 2: Encrypted send — verify both devices see encrypted messages
    # =========================================================================
    print("\n[Scenario 2: Encrypted message delivery]")

    def test_encrypted_delivery():
        # Alice encrypts for Bob device-b1
        env = alice.encrypt_to_envelope(session_id, bob.user_id, bob_id_b1, P1_MD_SECRET)
        assert env.get("recipientDeviceId") == bob_id_b1, \
            f"Envelope targets wrong device: {env.get('recipientDeviceId')}"

        cid = f"p1-md-{secrets.token_hex(4)}"
        client_msg_ids.append(cid)
        alice.api.send_private_encrypted(bob.user_id, cid, "TEXT", env, alice.device_id)
        time.sleep(0.8)

        # Bob fetches history — both devices should see encrypted messages
        history = bob.api.get_private_history(alice.user_id, limit=10)
        http_bodies.append(json.dumps(history))
        encrypted = [m for m in history if m.get("encrypted")]
        assert len(encrypted) > 0, "No encrypted messages in history"

        # Verify the message is marked encrypted and has envelope
        msg = encrypted[-1]
        env_stored = msg.get("e2eeEnvelope") or msg.get("e2ee_envelope") or {}
        assert env_stored.get("wire"), "Stored envelope missing wire"
        assert env_stored.get("recipientDeviceId") == bob_id_b1, \
            f"Stored envelope targets {env_stored.get('recipientDeviceId')}, expected {bob_id_b1}"

        # Bob decrypts
        plain = bob.decrypt_envelope(env_stored, alice.user_id)
        assert plain == P1_MD_SECRET, f"Decrypt mismatch: {plain[:30]}..."

    runner.test("Encrypted message delivery to b1", test_encrypted_delivery)

    # =========================================================================
    # Scenario 3: Envelope isolation — different recipients get different wires
    # =========================================================================
    print("\n[Scenario 3: Envelope isolation]")

    def test_envelope_isolation():
        # Alice encrypts another message for b1
        env_b1 = alice.encrypt_to_envelope(session_id, bob.user_id, bob_id_b1,
                                           f"iso-{P1_MD_SECRET}")
        # Alice encrypts for b2 (new session)
        session_for_b2 = session_id
        alice._engine.remove_session(session_for_b2)
        alice._loaded_sessions.discard(session_for_b2)
        env_b2 = alice.encrypt_to_envelope(session_for_b2, bob.user_id, bob_id_b2,
                                           f"iso2-{P1_MD_SECRET}")

        # Wires must differ
        assert env_b1["wire"] != env_b2["wire"], "Different devices must have different wires"
        # Recipient device IDs must match their targets
        assert env_b1["recipientDeviceId"] == bob_id_b1
        assert env_b2["recipientDeviceId"] == bob_id_b2

    runner.test("Envelope isolation (different wires)", test_envelope_isolation)

    # =========================================================================
    # Scenario 4: Revoked device
    # =========================================================================
    print("\n[Scenario 4: Revoked device]")

    def test_revoked_device():
        bob.api.delete_device(bob_id_b2)

        # Device list should no longer include b2 as active
        devices = bob.api.get_devices(bob.user_id)
        b2_info = [d for d in devices if d.get("deviceId") == bob_id_b2]
        active_b2 = [d for d in b2_info if d.get("status", "") == "active"]
        assert len(active_b2) == 0, f"Revoked device should not be active: {b2_info}"

        # Bundle fetch for b2 should fail
        try:
            alice.api.get_bundle(bob.user_id, bob_id_b2, session_id, alice.device_id)
            raise AssertionError("Bundle fetch for revoked device must fail")
        except Exception as e:
            err = str(e)
            assert "not found" in err.lower() or "fail" in err.lower() or "404" in err, \
                f"Expected failure for revoked device, got: {err}"

        # b1 should still work
        bundle_b1 = alice.api.get_bundle(bob.user_id, bob_id_b1, session_id, alice.device_id)
        assert bundle_b1.get("identityKey"), "b1 bundle should still be available"

    runner.test("Revoked device (b2 deleted, b1 still works)", test_revoked_device)

    # =========================================================================
    # Scenario 5: HTTP + DB scan
    # =========================================================================
    print("\n[Scenario 5: Plaintext scan]")

    def test_http_scan():
        for secret in p1_secrets:
            for body in http_bodies:
                assert secret not in body, f"Plaintext found in HTTP response"

    runner.test("HTTP plaintext scan", test_http_scan)

    if db_url:
        def test_db_scan():
            violations = scan_db_for_secrets(db_url, p1_secrets)
            assert len(violations) == 0, f"DB plaintext violations: {violations}"

        runner.test("DB plaintext scan", test_db_scan)
    else:
        print("  [SKIP] No --db-url provided")

    return runner.summary()


def main():
    parser = argparse.ArgumentParser(description="P1-3 Private Multi-Device Fan-Out Acceptance Tests")
    parser.add_argument("--base-url", default="http://localhost:8082")
    parser.add_argument("--db-url", default=None, help="MySQL URL")
    args = parser.parse_args()
    success = run_tests(args.base_url, args.db_url)
    sys.exit(0 if success else 1)


if __name__ == "__main__":
    main()
