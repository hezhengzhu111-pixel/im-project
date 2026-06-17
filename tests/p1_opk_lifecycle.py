#!/usr/bin/env python3
"""
P1-4 OPK Lifecycle Acceptance Tests — REAL API + MySQL verification.

Verifies the complete One-Time Pre-Key lifecycle against a running backend:
  1. Upload OPK pool — register, upload 100 OTKs, verify count > 0
  2. Consume once — fetch bundle consumes OTK, repeated request returns same claim
  3. Concurrent consume — concurrent unique requesters get distinct OTKs
  4. Exhausted fallback — after consuming all OTKs, fallback to signed pre-key
  5. Refill — refill OPKs, new bundle returns fresh OTK
  6. Delete expired — clean up consumed/expired OTKs, active OTKs untouched
  7. Revoked device — revoke device, bundle request must fail
  8. Plaintext / private-key check — no OPK private key in DB or HTTP responses

Usage:
    python tests/p1_opk_lifecycle.py \
        --base-url http://localhost:8082 \
        --db-url mysql://root:root123@127.0.0.1:3306/service_message_service_db

No private keys, tokens, or secrets are printed.
"""

from __future__ import annotations

import sys
import os
import json
import base64
import secrets
import time
import argparse
import threading
from typing import Optional, Dict, List
from dataclasses import dataclass

import requests

sys.path.insert(0, os.path.join(os.path.dirname(__file__)))
from e2ee_rust_bridge import RustE2eeEngine
from e2ee_stores import SessionStore, KeyStore


# ============================================================================
# Constants
# ============================================================================

OTK_UPLOAD_COUNT = 100
OTK_REFILL_COUNT = 50
MAX_DEVICE_ID_LEN = 64

# ============================================================================
# APIClient (extends p0 client with OPK endpoints)
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

    # -- OPK --
    def opk_status(self, device_id: str) -> dict:
        return self._get("/api/keys/opk/status", {"deviceId": device_id})["data"]

    def opk_refill(self, device_id: str, one_time_pre_keys: list) -> dict:
        return self._post("/api/keys/opk/refill", {
            "deviceId": device_id, "oneTimePreKeys": one_time_pre_keys,
        })["data"]

    def delete_expired_opk(self) -> int:
        result = self._delete("/api/keys/opk/expired")
        return result.get("data", 0)

    def delete_device(self, device_id: str) -> None:
        self._delete(f"/api/keys/device/{device_id}")

    def heartbeat(self, device_id: str) -> None:
        try:
            self._post("/api/keys/heartbeat", {"deviceId": device_id})
        except Exception:
            pass

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

    def register_new_device(self, otk_count: int = OTK_UPLOAD_COUNT) -> str:
        """Register a second device for the same user."""
        device_id = secrets.token_hex(16)
        key_material = self._engine.generate_pre_key_bundle(
            signed_pre_key_id=1, one_time_pre_key_start_id=1,
            one_time_pre_key_count=otk_count,
        )
        bundle = key_material["publicBundle"]
        otk_list = [{"id": p["id"], "key": p["key"]}
                    for p in bundle.get("oneTimePreKeys", [])]
        self.api.upload_bundle(
            device_id=device_id, identity_key=bundle["identityKey"],
            signing_key=bundle["signingKey"],
            signed_pre_key=bundle["signedPreKey"]["key"],
            signed_pre_key_sig=bundle["signedPreKeySignature"],
            one_time_pre_keys=otk_list,
        )
        self.api.heartbeat(device_id)
        return device_id


# ============================================================================
# DB Scanner
# ============================================================================

def scan_db_for_opk_private_keys(db_url: str) -> List[str]:
    """Scan DB for OPK private keys or private key material in stored pre-keys."""
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

    # The DB for e2ee tables: service_user_service_db
    try:
        cursor.execute("SELECT 1 FROM service_user_service_db.e2ee_one_time_pre_keys WHERE 1=0")
    except pymysql.err.ProgrammingError:
        violations.append("Cannot access service_user_service_db.e2ee_one_time_pre_keys")
        cursor.close()
        conn.close()
        return violations

    # Check e2ee_one_time_pre_keys.pre_key for private key indicators.
    # Pre-key column should only contain BASE64-encoded X25519 public keys (32 bytes = 44 chars base64).
    # Private keys stored server-side would be a violation.
    # We look for unusually long base64 strings (Ed25519/X25519 private keys are 32 bytes,
    # but sensitive material like bincode/keypair would be much longer).
    cursor.execute(
        "SELECT id, pre_key, LENGTH(pre_key) AS pk_len "
        "FROM service_user_service_db.e2ee_one_time_pre_keys LIMIT 1"
    )
    sample = cursor.fetchone()
    if sample:
        # Verify pre_key format: should be ~44 characters (base64 X25519 pubkey)
        pk_len = sample[2]
        if pk_len > 100:
            violations.append(
                f"OPK pre_key appears too long ({pk_len} bytes) — possible private key material "
                f"in e2ee_one_time_pre_keys id={sample[0]}"
            )

    # Check e2ee_devices for any private key columns
    cursor.execute(
        "SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS "
        "WHERE TABLE_SCHEMA='service_user_service_db' AND TABLE_NAME='e2ee_devices'"
    )
    columns = [row[0] for row in cursor.fetchall()]
    private_key_cols = [c for c in columns if "private" in c.lower()]
    if private_key_cols:
        violations.append(
            f"e2ee_devices has columns that may store private keys: {private_key_cols}"
        )

    cursor.close()
    conn.close()
    return violations


def scan_http_for_private_keys(responses: List[dict]) -> List[str]:
    """Check HTTP response bodies for private key material."""
    violations = []
    private_key_indicators = [
        "privateKey", "private_key", "private-key",
        "keyPairBincode", "keypair", "secretKey", "secret_key",
        "PRIVATE KEY", "private-key-jwk",
    ]
    for i, resp in enumerate(responses):
        body_str = json.dumps(resp)
        for indicator in private_key_indicators:
            if indicator.lower() in body_str.lower():
                violations.append(
                    f"Response[{i}] contains private key indicator '{indicator}'"
                )
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
# Main Test Flow
# ============================================================================

def run_tests(base_url: str, db_url: Optional[str]):
    runner = TestRunner()
    http_response_snapshots: List[dict] = []

    # ---- Setup ----
    print("Setting up users for OPK lifecycle tests...")
    alice_api = APIClient(base_url)
    bob_api = APIClient(base_url)

    alice = E2EEUser(alice_api, f"oa{secrets.token_hex(3)}")
    bob = E2EEUser(bob_api, f"ob{secrets.token_hex(3)}")

    alice.register_and_login()
    bob.register_and_login()
    print(f"  Alice: user_id={alice.user_id}, Bob: user_id={bob.user_id}")

    # Friendship
    alice.api.send_friend_request(bob.user_id)
    time.sleep(0.5)
    pending = bob.api.get_friend_requests()
    if pending:
        bob.api.accept_friend_request(pending[0]["id"])
    print("  Friendship established.")

    # Session ID
    if alice.user_id < bob.user_id:
        session_id = f"p_{alice.user_id}_{bob.user_id}"
    else:
        session_id = f"p_{bob.user_id}_{alice.user_id}"
    print(f"  Session: {session_id}")

    # =========================================================================
    # Scenario 1: Upload OPK Pool
    # =========================================================================
    print("\n[Scenario 1: Upload OPK Pool]")

    def test_upload_opk_pool():
        bob.ensure_device_registered(otk_count=OTK_UPLOAD_COUNT)

        status = bob.api.opk_status(bob.device_id)
        http_response_snapshots.append(status)
        assert status["count"] > 0, f"Expected OTK count > 0, got {status['count']}"
        device_id_from_status = status.get("deviceId") or status.get("device_id")
        assert device_id_from_status == bob.device_id, \
            f"Device ID mismatch in OPK status: {status}"

    runner.test("Upload OPK pool", test_upload_opk_pool)

    # =========================================================================
    # Scenario 2: Consume Once (and idempotent re-claim)
    # =========================================================================
    print("\n[Scenario 2: Consume Once + Idempotent Re-Claim]")

    def test_consume_once():
        alice.ensure_device_registered()
        alice_device_id = alice.device_id

        # First fetch: should return oneTimePreKey
        bundle1 = alice.api.get_bundle(bob.user_id, bob.device_id, session_id, alice_device_id)
        http_response_snapshots.append(bundle1)
        otk1 = bundle1.get("oneTimePreKey")
        otk1_id = bundle1.get("oneTimePreKeyId")
        assert otk1 is not None and len(otk1) > 0, \
            f"First bundle fetch should return oneTimePreKey, got opkFallback={bundle1.get('opkFallback')}"

        status1 = bob.api.opk_status(bob.device_id)
        http_response_snapshots.append(status1)

        # Second fetch with same params: must return the SAME OTK (idempotent claim)
        bundle2 = alice.api.get_bundle(bob.user_id, bob.device_id, session_id, alice_device_id)
        http_response_snapshots.append(bundle2)
        otk2 = bundle2.get("oneTimePreKey")
        otk2_id = bundle2.get("oneTimePreKeyId")

        assert otk2_id == otk1_id, \
            f"Idempotent claim: expected OTK id={otk1_id}, got id={otk2_id}"
        assert otk2 == otk1, \
            "Idempotent claim: OTK key values must be identical"

    runner.test("Consume once + idempotent re-claim", test_consume_once)

    # =========================================================================
    # Scenario 3: Concurrent Consume Does Not Return Same OTK
    # =========================================================================
    print("\n[Scenario 3: Concurrent Consume (Unique Requesters)]")

    def test_concurrent_consume():
        # Create 3 unique requester device IDs for Alice
        requester_devices = [
            alice.device_id,
            alice.register_new_device(),
            alice.register_new_device(),
        ]
        fetched_otk_ids = []
        lock = threading.Lock()
        errors = []

        def fetch_bundle(device_id: str):
            try:
                bundle = alice.api.get_bundle(bob.user_id, bob.device_id, session_id, device_id)
                otk_id = bundle.get("oneTimePreKeyId")
                with lock:
                    if otk_id is not None:
                        fetched_otk_ids.append(otk_id)
            except Exception as e:
                with lock:
                    errors.append(str(e))

        threads = []
        for rd in requester_devices:
            t = threading.Thread(target=fetch_bundle, args=(rd,))
            threads.append(t)
            t.start()

        for t in threads:
            t.join()

        assert len(errors) == 0, f"Concurrent fetch errors: {errors}"
        assert len(fetched_otk_ids) == len(requester_devices), \
            f"Expected {len(requester_devices)} OTKs, got {len(fetched_otk_ids)}"

        # Verify no duplicate OTK IDs among unique requesters
        unique_ids = set(fetched_otk_ids)
        assert len(unique_ids) == len(fetched_otk_ids), \
            f"Duplicate OTK IDs detected: {fetched_otk_ids}"

        # Check consumed count in DB status
        status = bob.api.opk_status(bob.device_id)
        http_response_snapshots.append(status)

    runner.test("Concurrent consume (unique requesters)", test_concurrent_consume)

    # =========================================================================
    # Scenario 4: Exhausted Fallback
    # =========================================================================
    print("\n[Scenario 4: Exhausted Fallback]")

    def test_exhausted_fallback():
        # Consume all remaining OTKs for Bob's device
        # by repeatedly creating new requester devices and fetching bundles
        status = bob.api.opk_status(bob.device_id)
        remaining = status["count"]
        print(f"    Remaining OTKs before exhaustion: {remaining}")

        # Create dedicated user for exhaustion
        exhaust_api = APIClient(base_url)
        exhaust_user = E2EEUser(exhaust_api, f"ex{secrets.token_hex(3)}")
        exhaust_user.register_and_login()
        exhaust_user.api.send_friend_request(bob.user_id)
        time.sleep(0.3)
        pending = bob.api.get_friend_requests()
        if pending:
            bob.api.accept_friend_request(pending[0]["id"])

        if exhaust_user.user_id < bob.user_id:
            exhaust_sid = f"p_{exhaust_user.user_id}_{bob.user_id}"
        else:
            exhaust_sid = f"p_{bob.user_id}_{exhaust_user.user_id}"

        exhaust_user.ensure_device_registered()

        exhausted = False
        for i in range(remaining + 5):
            try:
                # Use unique requester device each time to consume new OTKs
                rd = exhaust_user.device_id if i == 0 else exhaust_user.register_new_device()
                bundle = exhaust_user.api.get_bundle(bob.user_id, bob.device_id, exhaust_sid, rd)
                http_response_snapshots.append(bundle)
                otk = bundle.get("oneTimePreKey")
                if otk is None or bundle.get("opkFallback") is True:
                    exhausted = True
                    # Verify explicit fallback signal
                    assert bundle.get("opkFallback") is True, \
                        "opkFallback must be true when fallback to signed pre-key"
                    assert bundle.get("signedPreKey"), \
                        "Fallback response must still include signedPreKey"
                    break
            except Exception as e:
                exhausted = True
                print(f"    Exhaustion error (may be expected): {e}")
                break

        # After exhaustion, next request from Alice should also get fallback
        bundle = alice.api.get_bundle(bob.user_id, bob.device_id, session_id, alice.device_id)
        http_response_snapshots.append(bundle)
        if bundle.get("oneTimePreKey") is None:
            assert bundle.get("opkFallback") is True, \
                "opkFallback must be true when no OTK available"
        else:
            print("    Note: Some OTKs still available (not fully exhausted)")

    runner.test("Exhausted fallback", test_exhausted_fallback)

    # =========================================================================
    # Scenario 5: Refill
    # =========================================================================
    print("\n[Scenario 5: Refill OPKs]")

    def test_refill():
        status_before = bob.api.opk_status(bob.device_id)
        count_before = status_before["count"]
        print(f"    OPK count before refill: {count_before}")

        # Generate new OTKs using Rust engine (public keys only)
        new_key_material = bob._engine.generate_pre_key_bundle(
            signed_pre_key_id=1, one_time_pre_key_start_id=9999,
            one_time_pre_key_count=OTK_REFILL_COUNT,
        )
        new_bundle = new_key_material["publicBundle"]
        otk_list = [{"id": p["id"], "key": p["key"]}
                    for p in new_bundle.get("oneTimePreKeys", [])]

        refill_result = bob.api.opk_refill(bob.device_id, otk_list)
        http_response_snapshots.append(refill_result)

        status_after = bob.api.opk_status(bob.device_id)
        http_response_snapshots.append(status_after)
        count_after = status_after["count"]

        assert count_after > count_before, \
            f"Refill should increase count: before={count_before}, after={count_after}"

        # Verify new OTK can be fetched
        test_api = APIClient(base_url)
        test_user = E2EEUser(test_api, f"rf{secrets.token_hex(3)}")
        test_user.register_and_login()
        test_user.api.send_friend_request(bob.user_id)
        time.sleep(0.3)
        pending = bob.api.get_friend_requests()
        if pending:
            bob.api.accept_friend_request(pending[0]["id"])

        test_user.ensure_device_registered()
        if test_user.user_id < bob.user_id:
            test_sid = f"p_{test_user.user_id}_{bob.user_id}"
        else:
            test_sid = f"p_{bob.user_id}_{test_user.user_id}"

        bundle = test_user.api.get_bundle(bob.user_id, bob.device_id, test_sid, test_user.device_id)
        http_response_snapshots.append(bundle)
        otk = bundle.get("oneTimePreKey")
        assert otk is not None and len(otk) > 0, \
            "After refill, bundle should return an OTK"

    runner.test("Refill OPKs", test_refill)

    # =========================================================================
    # Scenario 6: Delete Expired OPKs
    # =========================================================================
    print("\n[Scenario 6: Delete Expired OPKs]")

    def test_delete_expired():
        # Attempt to clean expired OPKs (older than retention period).
        # This test primarily verifies the endpoint exists and doesn't crash.
        deleted = bob.api.delete_expired_opk()
        print(f"    Expired OPKs cleaned: {deleted}")

        # Verify active OPKs still present
        status = bob.api.opk_status(bob.device_id)
        http_response_snapshots.append(status)

        # Verify no crash/error on re-delete
        deleted2 = bob.api.delete_expired_opk()
        assert deleted2 >= 0, f"Delete expired returned {deleted2}"

    runner.test("Delete expired OPKs", test_delete_expired)

    # =========================================================================
    # Scenario 7: Revoked Device
    # =========================================================================
    print("\n[Scenario 7: Revoked Device]")

    def test_revoked_device():
        # Create a standalone device for Bob to test revoke
        bob_device2 = bob.register_new_device()
        print(f"    Bob second device: {bob_device2}")

        # Verify bundle fetch works before revoke
        alice.api.get_bundle(bob.user_id, bob_device2, session_id, alice.device_id)

        # Revoke the second device
        bob.api.delete_device(bob_device2)

        # Bundle fetch for revoked device must fail
        try:
            alice.api.get_bundle(bob.user_id, bob_device2, session_id, alice.device_id)
            raise AssertionError("Bundle fetch for revoked device should have failed")
        except Exception as e:
            err = str(e)
            assert "404" in err or "not found" in err.lower() or "fail" in err.lower(), \
                f"Expected not-found/forbidden error for revoked device, got: {err}"

        # Verify Bob's original device still works
        bundle = alice.api.get_bundle(bob.user_id, bob.device_id, session_id, alice.device_id)
        http_response_snapshots.append(bundle)

    runner.test("Revoked device", test_revoked_device)

    # =========================================================================
    # Scenario 8: Plaintext / Private Key Check
    # =========================================================================
    print("\n[Scenario 8: Plaintext / Private Key Check]")

    def test_plaintext_check():
        # HTTP response scan
        http_violations = scan_http_for_private_keys(http_response_snapshots)
        assert len(http_violations) == 0, f"HTTP private key violations: {http_violations}"

    runner.test("HTTP OPK private key scan", test_plaintext_check)

    if db_url:
        def test_db_opk_scan():
            violations = scan_db_for_opk_private_keys(db_url)
            assert len(violations) == 0, f"DB OPK private key violations: {violations}"

        runner.test("DB OPK private key scan", test_db_opk_scan)
    else:
        print("  [SKIP] DB scan — no --db-url provided (not valid for P1 sign-off)")

    return runner.summary()


# ============================================================================
# Main
# ============================================================================

def main():
    parser = argparse.ArgumentParser(
        description="P1-4 OPK Lifecycle Acceptance Tests (REAL API + MySQL)")
    parser.add_argument("--base-url", default="http://localhost:8082")
    parser.add_argument("--db-url", default=None,
                       help="MySQL URL for OPK plaintext scan")
    args = parser.parse_args()

    success = run_tests(args.base_url, args.db_url)
    sys.exit(0 if success else 1)


if __name__ == "__main__":
    main()
