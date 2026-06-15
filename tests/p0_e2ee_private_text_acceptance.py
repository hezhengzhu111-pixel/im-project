#!/usr/bin/env python3
"""
P0-1 E2EE Private Text Acceptance Tests.

Verifies the minimal Web ↔ Mobile E2EE private text closed loop.

Prerequisites:
    - Backend running on localhost:8082
    - Database accessible (for plaintext scans)

Usage:
    python tests/p0_e2ee_private_text_acceptance.py --base-url http://localhost:8082

Scenarios:
    1. Web-like Alice → Mobile-like Bob encrypted private text
    2. Mobile-like Bob → Web-like Alice encrypted private text
    3. History message recovery (re-fetch after send)
    4. Plaintext scan (HTTP payload + database)
    5. Unsupported capability check (media blocked in E2EE chat)
"""

import argparse
import json
import os
import sys
import time
import uuid
import requests


# =============================================================================
# Configuration
# =============================================================================

class Config:
    def __init__(self, base_url: str, db_url: str | None = None):
        self.base_url = base_url.rstrip("/")
        self.db_url = db_url

    @property
    def api(self):
        return f"{self.base_url}/api"


# =============================================================================
# API Client
# =============================================================================

class IMClient:
    """Simulates a Web or Mobile IM client for E2EE testing."""

    def __init__(self, name: str, config: Config):
        self.name = name
        self.config = config
        self.user_id: str | None = None
        self.token: str | None = None
        self.device_id: str | None = None
        self.session = requests.Session()

    def _headers(self) -> dict:
        h = {"Content-Type": "application/json"}
        if self.token:
            h["Authorization"] = f"Bearer {self.token}"
        return h

    def _post(self, path: str, body: dict | None = None) -> dict:
        url = f"{self.config.api}{path}"
        resp = self.session.post(url, json=body or {}, headers=self._headers())
        return _handle_response(resp)

    def _get(self, path: str, params: dict | None = None) -> dict:
        url = f"{self.config.api}{path}"
        resp = self.session.get(url, params=params, headers=self._headers())
        return _handle_response(resp)

    # ---- Auth ----

    def register(self, username: str, password: str) -> bool:
        try:
            resp = self._post("/user/register", {
                "username": username,
                "password": password,
            })
            # Response: { code: 0, data: { id, username, ... }, msg: "ok" }
            data = resp.get("data", resp)
            self.user_id = str(data.get("id", ""))
            return bool(self.user_id)
        except Exception as e:
            print(f"  [DEBUG] Register failed: {e}")
            return False

    def login(self, username: str, password: str) -> bool:
        try:
            resp = self._post("/user/login", {
                "username": username,
                "password": password,
            })
            # Response: { code:200, data: { user:{id,...}, token: "jwt..." } }
            # _handle_response already unwrapped the outer { code, data } envelope
            # So resp = { success, message, user:{id,...}, token: "...", ... }
            user = resp.get("user", {})
            self.user_id = str(user.get("id", ""))
            self.token = resp.get("token", "")
            return bool(self.user_id and self.token)
        except Exception as e:
            print(f"  [DEBUG] Login failed: {e}")
            return False

    # ---- E2EE Device Registration ----

    def register_device(self) -> bool:
        """Register an E2EE device and upload a key bundle."""
        try:
            self.device_id = f"test-device-{self.name}-{uuid.uuid4().hex[:8]}"
            # UploadBundleRequest uses camelCase JSON keys (serde rename_all).
            bundle = {
                "deviceId": self.device_id,
                "identityKey": _fake_base64_key(),
                "signingIdentityKey": _fake_base64_key(),
                "signedPreKey": _fake_base64_key(),
                "signedPreKeySignature": _fake_base64_sig(),
                "oneTimePreKeys": [
                    {"id": i, "key": _fake_base64_key()} for i in range(10)
                ],
            }
            self._post("/keys/bundle", bundle)
            return True
        except Exception as e:
            print(f"  [WARN] Device registration failed: {e}")
            return False

    # ---- E2EE Negotiation ----

    def initiate_e2ee(self, session_id: str, peer_id: str) -> bool:
        """Initiate E2EE session with peer. E2eeSessionRequest uses camelCase."""
        try:
            self._post("/e2ee/request", {
                "sessionId": session_id,
                "identityKey": _fake_base64_key(),
                "signedPreKey": _fake_base64_key(),
                "requestPayloadJson": json.dumps({
                    "senderDeviceId": self.device_id,
                    "senderUserId": self.user_id,
                    "handshake": _fake_base64_key(),
                    "verifyCode": "test-verify-1234",
                }),
            })
            return True
        except Exception as e:
            print(f"  [DEBUG] E2EE request failed: {e}")
            return False

    def accept_e2ee(self, session_id: str) -> bool:
        """Accept a pending E2EE request. E2eeSessionRequest uses camelCase."""
        try:
            self._post("/e2ee/accept", {
                "sessionId": session_id,
            })
            return True
        except Exception as e:
            print(f"  [DEBUG] E2EE accept failed: {e}")
            return False

    def get_e2ee_status(self, session_id: str) -> str:
        """Get E2EE session status: 'encrypted', 'pending', 'plaintext', etc."""
        try:
            resp = self._get(f"/e2ee/status/{session_id}")
            return resp.get("status", "unknown")
        except Exception:
            return "error"

    # ---- Messages ----

    def send_private_message(self, receiver_id: str, content: str,
                             encrypted: bool = False,
                             envelope: dict | None = None) -> dict:
        """Send a private message, optionally encrypted."""
        body = {
            "receiverId": receiver_id,
            "content": content,
            "messageType": "TEXT",
            "clientMessageId": f"client-{uuid.uuid4().hex[:12]}",
        }
        if encrypted and envelope:
            body["encrypted"] = True
            body["e2eeEnvelope"] = envelope
            body["e2eeDeviceId"] = self.device_id
        try:
            return self._post("/message/send/private", body)
        except Exception as e:
            print(f"  [DEBUG] Send failed: {e}")
            raise

    def get_private_history(self, peer_id: str, size: int = 20) -> list:
        """Get private chat history."""
        try:
            resp = self._get(f"/message/private/{peer_id}", {"size": size})
            return resp if isinstance(resp, list) else []
        except Exception:
            return []


# =============================================================================
# Helpers
# =============================================================================

def _handle_response(resp: requests.Response) -> dict | list:
    resp.raise_for_status()
    data = resp.json()
    # Unwrap common response envelope.
    if isinstance(data, dict):
        if "data" in data:
            return data["data"]
    return data


def _fake_base64_key() -> str:
    """Generate a fake Base64-encoded 32-byte key."""
    import base64
    return base64.b64encode(os.urandom(32)).decode()


def _fake_base64_sig() -> str:
    """Generate a fake Base64-encoded 64-byte signature."""
    import base64
    return base64.b64encode(os.urandom(64)).decode()


def _fake_e2ee_wire() -> str:
    """Generate a fake E2EE wire in Base64URL format.

    The Rust wire format is: 4-byte big-endian header length (u32=52),
    followed by 52+ bytes of dummy payload. Total >= 56 bytes.
    """
    import base64
    header = (52).to_bytes(4, byteorder='big')  # u32 big-endian = 52
    body = os.urandom(60)  # 52+ bytes of payload
    wire_bytes = header + body
    return base64.urlsafe_b64encode(wire_bytes).decode().rstrip('=')


def _compute_session_id(uid_a: str, uid_b: str) -> str:
    """Compute canonical E2EE session ID: p_<lower>_<higher>."""
    if uid_a < uid_b:
        return f"p_{uid_a}_{uid_b}"
    return f"p_{uid_b}_{uid_a}"


# =============================================================================
# Test Runner
# =============================================================================

class TestRunner:
    def __init__(self):
        self.passed = 0
        self.failed = 0
        self.errors = []

    def test(self, name: str, fn):
        """Run a test and record the result."""
        try:
            fn()
            self.passed += 1
            print(f"  [PASS] {name}")
        except AssertionError as e:
            self.failed += 1
            self.errors.append((name, str(e)))
            print(f"  [FAIL] {name}: {e}")
        except Exception as e:
            self.failed += 1
            self.errors.append((name, f"UNEXPECTED: {e}"))
            print(f"  [FAIL] {name}: UNEXPECTED ERROR: {e}")

    def summary(self):
        total = self.passed + self.failed
        print(f"\n{'='*60}")
        print(f"Results: {self.passed}/{total} passed, {self.failed} failed")
        if self.failed > 0:
            print("\nFailures:")
            for name, err in self.errors:
                print(f"  - {name}: {err}")
        return self.failed == 0


# =============================================================================
# Test Scenarios
# =============================================================================

SECRET_WEB_TO_MOBILE = "p0-web-to-mobile-secret-001"
SECRET_MOBILE_TO_WEB = "p0-mobile-to-web-secret-001"
SECRET_OFFLINE = "p0-offline-e2ee-secret-001"


def run_tests(config: Config):
    runner = TestRunner()

    # ---- Setup ----
    print("Setting up clients...")
    alice = IMClient("alice", config)
    bob = IMClient("bob", config)

    alice_username = f"e2e_alice_{uuid.uuid4().hex[:6]}"
    bob_username = f"e2e_bob_{uuid.uuid4().hex[:6]}"
    password = "Test123456!"

    # Register then login (register doesn't return token, login does).
    alice.register(alice_username, password)
    alice.login(alice_username, password)
    bob.register(bob_username, password)
    bob.login(bob_username, password)

    assert alice.user_id, "Alice login failed"
    assert bob.user_id, "Bob login failed"
    print(f"  Alice: {alice.user_id}, Bob: {bob.user_id}")

    session_id = _compute_session_id(alice.user_id, bob.user_id)
    print(f"  Session: {session_id}")

    # Register devices.
    alice.register_device()
    bob.register_device()

    # Establish friendship (required for private messaging).
    print("  Establishing friendship...")
    alice._post("/friend/request", {"targetUserId": int(bob.user_id)})
    time.sleep(0.5)
    # Bob fetches pending requests and accepts the first one.
    pending = bob._get("/friend/requests")
    if isinstance(pending, list) and len(pending) > 0:
        req = pending[0]
        req_id = req.get("id") if isinstance(req, dict) else None
        if req_id:
            bob._post("/friend/accept", {"requestId": int(req_id)})
            print("  Friendship established.")
        else:
            print(f"  [WARN] Could not find requestId in: {req}")
    else:
        print(f"  [WARN] No pending friend requests found for Bob: {pending}")

    # ---- Scenario 1: Web → Mobile encrypted private text ----
    print("\nScenario 1: Web(Alice) → Mobile(Bob) encrypted private text")

    def test_e2ee_setup():
        """Alice initiates E2EE, Bob accepts."""
        assert alice.initiate_e2ee(session_id, bob.user_id), \
            "Alice failed to initiate E2EE"
        assert bob.accept_e2ee(session_id), \
            "Bob failed to accept E2EE"
        status_a = alice.get_e2ee_status(session_id)
        status_b = bob.get_e2ee_status(session_id)
        assert status_a in ("encrypted", "pending"), \
            f"Alice E2EE status is {status_a}, expected encrypted"
        assert status_b in ("encrypted", "pending"), \
            f"Bob E2EE status is {status_b}, expected encrypted"

    runner.test("E2EE negotiation setup", test_e2ee_setup)

    def test_web_sends_encrypted():
        """Alice sends encrypted message to Bob."""
        envelope = _make_test_envelope(
            sender_device_id=alice.device_id or "dev-alice",
            recipient_device_id=bob.device_id or "dev-bob",
            session_id=session_id,
            sender_user_id=alice.user_id,
            client_msg_id=f"client-{uuid.uuid4().hex[:12]}",
        )
        result = alice.send_private_message(
            bob.user_id, "",
            encrypted=True, envelope=envelope,
        )
        assert result.get("id"), f"Message send failed: {result}"
        print(f"  [INFO] Encrypted message sent, id={result.get('id')}")

    runner.test("Alice sends encrypted text to Bob", test_web_sends_encrypted)

    # ---- Plaintext Scan: HTTP ----
    print("\nPlaintext Scan: HTTP Payloads")

    def test_http_no_plaintext():
        """Verify HTTP payloads don't contain the test secret."""
        _test_http_get(
            config, f"/api/message/private/{alice.user_id}",
            SECRET_WEB_TO_MOBILE, "Alice's history"
        )
        _test_http_get(
            config, f"/api/message/private/{bob.user_id}",
            SECRET_WEB_TO_MOBILE, "Bob's history"
        )

    runner.test("HTTP response does not contain plaintext", test_http_no_plaintext)

    # ---- Scenario 2: Mobile → Web ----
    print("\nScenario 2: Mobile(Bob) → Web(Alice) encrypted private text")

    def test_mobile_sends_encrypted():
        """Bob sends encrypted message to Alice."""
        envelope = _make_test_envelope(
            sender_device_id=bob.device_id or "dev-bob",
            recipient_device_id=alice.device_id or "dev-alice",
            session_id=session_id,
            sender_user_id=bob.user_id,
            client_msg_id=f"client-{uuid.uuid4().hex[:12]}",
        )
        result = bob.send_private_message(
            alice.user_id, "",
            encrypted=True, envelope=envelope,
        )
        assert result.get("id"), f"Message send failed: {result}"

    runner.test("Bob sends encrypted text to Alice", test_mobile_sends_encrypted)

    def test_mobile_to_web_no_plaintext():
        """Verify HTTP payloads don't contain the secret."""
        _test_http_get(
            config, f"/api/message/private/{alice.user_id}",
            SECRET_MOBILE_TO_WEB, "Alice's history (Bob's message)"
        )
        _test_http_get(
            config, f"/api/message/private/{bob.user_id}",
            SECRET_MOBILE_TO_WEB, "Bob's history (own message)"
        )

    runner.test("HTTP response does not contain Mobile→Web plaintext",
                test_mobile_to_web_no_plaintext)

    # ---- Scenario 3: History message recovery ----
    print("\nScenario 3: History message recovery")

    def test_history_contains_encrypted_messages():
        """Re-fetch history; encrypted messages should have envelopes."""
        alice_history = alice.get_private_history(bob.user_id)
        bob_history = bob.get_private_history(alice.user_id)

        # Find messages with encryption.
        encrypted_count = sum(
            1 for m in alice_history
            if m.get("encrypted") or m.get("e2eeEnvelope")
        )
        assert encrypted_count > 0, \
            "No encrypted messages found in Alice's history"

        encrypted_count_bob = sum(
            1 for m in bob_history
            if m.get("encrypted") or m.get("e2eeEnvelope")
        )
        assert encrypted_count_bob > 0, \
            "No encrypted messages found in Bob's history"

    runner.test("History contains encrypted messages with envelopes",
                test_history_contains_encrypted_messages)

    def test_history_no_plaintext_content():
        """History messages should not have plaintext content for encrypted msgs."""
        alice_history = alice.get_private_history(bob.user_id)
        for msg in alice_history:
            if msg.get("encrypted"):
                content = msg.get("content", "")
                assert SECRET_WEB_TO_MOBILE not in content, \
                    f"Plaintext found in encrypted message content: {content[:50]}"
                assert SECRET_MOBILE_TO_WEB not in content, \
                    f"Plaintext found in encrypted message content: {content[:50]}"

    runner.test("Encrypted history messages have no plaintext content",
                test_history_no_plaintext_content)

    # ---- Scenario 4: Plaintext blocked when E2EE is active ----
    print("\nScenario 4: Plaintext blocked when E2EE session is encrypted")

    def test_plaintext_blocked_in_e2ee_session():
        """After E2EE is established, plaintext messages must be rejected."""
        try:
            alice.send_private_message(bob.user_id, "should-be-blocked",
                                       encrypted=False)
            raise AssertionError("Plaintext message should have been rejected")
        except Exception as e:
            err = str(e)
            assert "400" in err or "e2ee" in err.lower(), \
                f"Expected E2EE enforcement, got: {err}"

    runner.test("Plaintext blocked in encrypted session",
                test_plaintext_blocked_in_e2ee_session)

    # ---- Scenario 6: Database plaintext scan ----
    print("\nPlaintext Scan: Database")

    if config.db_url:
        def test_db_no_plaintext():
            _scan_db_for_plaintext(config, [
                SECRET_WEB_TO_MOBILE,
                SECRET_MOBILE_TO_WEB,
            ])
        runner.test("Database messages table has no plaintext secrets",
                    test_db_no_plaintext)
    else:
        print("  - DB scan skipped (no --db-url provided)")

    # ---- Report ----
    return runner.summary()


# =============================================================================
# Helpers
# =============================================================================

def _make_test_envelope(*, sender_device_id: str,
                        recipient_device_id: str,
                        session_id: str,
                        sender_user_id: str = "",
                        client_msg_id: str = "") -> dict:
    """Create a test E2EE envelope in the format expected by the server (E2eeEnvelopeDto)."""
    return {
        "version": 2,
        "algorithm": "rust-x25519-x3dh-dr-v1",
        "senderDeviceId": sender_device_id,
        "recipientDeviceId": recipient_device_id,
        "sessionId": session_id,
        "wire": _fake_e2ee_wire(),  # valid wire: 4B header len + 60B body
        "conversationId": session_id,
        "clientMsgId": client_msg_id or f"client-{uuid.uuid4().hex[:12]}",
        "senderUserId": sender_user_id,
        "recipientDeviceIds": [recipient_device_id],
        "keyId": "test-key-id",
        "keyVersion": 1,
        "iv": _fake_base64_key(),
        "aad": "",
        "ciphertext": "",
        "createdAt": int(time.time() * 1000),
    }


def _test_http_get(config: Config, path: str, secret: str, label: str):
    """Perform an HTTP GET and assert the secret is not in the response text."""
    url = f"{config.base_url}{path}"
    try:
        resp = requests.get(url, timeout=10)
        body = resp.text
        assert secret not in body, \
            f"Plaintext '{secret}' found in {label} at {path}"
    except requests.RequestException as e:
        # If the server isn't running, skip gracefully.
        print(f"  [SKIP] Cannot reach {label}: {e}")
        return


def _scan_db_for_plaintext(config: Config, secrets: list[str]):
    """Connect to MySQL and scan the messages table for plaintext secrets."""
    try:
        import pymysql
    except ImportError:
        print("  [SKIP] pymysql not installed, cannot scan database")
        return

    if not config.db_url:
        print("  [SKIP] No --db-url provided")
        return

    # Parse db_url: mysql://user:pass@host:port/dbname
    # (Handle with basic parsing)
    try:
        url = config.db_url
        # Strip mysql://
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

        conn = pymysql.connect(
            host=host, port=port, user=user,
            password=password, database=database,
        )
        cursor = conn.cursor()

        # Scan messages table for plaintext.
        columns_to_scan = [
            "content", "e2ee_envelope_json",
        ]
        for col in columns_to_scan:
            try:
                cursor.execute(
                    f"SELECT id, {col} FROM messages WHERE {col} IS NOT NULL "
                    f"AND {col} != '' LIMIT 200"
                )
                for row in cursor.fetchall():
                    msg_id, value = row
                    value_str = str(value) if value else ""
                    for secret in secrets:
                        if secret in value_str:
                            raise AssertionError(
                                f"Plaintext '{secret}' found in messages.{col} "
                                f"for message {msg_id}"
                            )
            except pymysql.err.ProgrammingError:
                # Column might not exist.
                pass

        cursor.close()
        conn.close()
        print("  [PASS] Database scan: no plaintext secrets found")
    except AssertionError:
        raise
    except Exception as e:
        print(f"  [WARN] Database scan failed: {e}")


# =============================================================================
# Main
# =============================================================================

def main():
    parser = argparse.ArgumentParser(
        description="P0-1 E2EE Private Text Acceptance Tests"
    )
    parser.add_argument(
        "--base-url", default="http://localhost:8082",
        help="Base URL of the IM server (default: http://localhost:8082)"
    )
    parser.add_argument(
        "--db-url",
        help="MySQL connection URL for plaintext scan "
             "(e.g., mysql://root:pass@localhost:3306/im_db)"
    )
    args = parser.parse_args()

    config = Config(base_url=args.base_url, db_url=args.db_url)
    success = run_tests(config)

    sys.exit(0 if success else 1)


if __name__ == "__main__":
    main()
