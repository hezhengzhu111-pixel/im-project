#!/usr/bin/env python3
"""
Full backend API simulation for the Rust-only SIT stack.

Defaults:
  IM_API_BASE=http://localhost:8082
  IM_MYSQL_CONTAINER=sit-im-mysql-1
  MYSQL_ROOT_PASSWORD=root123
"""

from __future__ import annotations

import base64
import hashlib
import hmac
import http.client
import http.cookiejar
import json
import os
import random
import socket
import string
import subprocess
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
import uuid
from dataclasses import dataclass
from typing import Any, Iterable

API_BASE = os.environ.get("IM_API_BASE", "http://localhost:8082").rstrip("/")
IM_WS_BASE = os.environ.get("IM_WS_BASE")
MYSQL_CONTAINER = os.environ.get("IM_MYSQL_CONTAINER", "sit-im-mysql-1")
MYSQL_ROOT_PASSWORD = os.environ.get("MYSQL_ROOT_PASSWORD", "root123")
INTERNAL_SECRET = os.environ.get(
    "IM_INTERNAL_SECRET",
    "im-internal-secret-im-internal-secret-im-internal-secret-im",
)


class TestFailure(RuntimeError):
    pass


@dataclass
class HttpResult:
    status: int
    headers: dict[str, str]
    body: bytes
    json: Any | None


class ApiClient:
    def __init__(self, base_url: str) -> None:
        self.base_url = base_url.rstrip("/")
        self.cookies = http.cookiejar.CookieJar()
        self.opener = urllib.request.build_opener(
            urllib.request.HTTPCookieProcessor(self.cookies)
        )

    def request(
        self,
        method: str,
        path: str,
        *,
        json_body: Any | None = None,
        body: bytes | None = None,
        headers: dict[str, str] | None = None,
        expected: Iterable[int] = (200,),
        content_type: str | None = None,
    ) -> HttpResult:
        url = path if path.startswith("http") else f"{self.base_url}{path}"
        request_headers = dict(headers or {})
        data = body
        if json_body is not None:
            data = json.dumps(json_body).encode("utf-8")
            request_headers.setdefault("Content-Type", "application/json")
        elif content_type:
            request_headers.setdefault("Content-Type", content_type)
        req = urllib.request.Request(
            url,
            data=data,
            headers=request_headers,
            method=method.upper(),
        )
        try:
            with self.opener.open(req, timeout=20) as resp:
                raw = resp.read()
                result = HttpResult(
                    resp.status,
                    dict(resp.headers.items()),
                    raw,
                    decode_json(raw),
                )
        except urllib.error.HTTPError as exc:
            raw = exc.read()
            result = HttpResult(
                exc.code,
                dict(exc.headers.items()),
                raw,
                decode_json(raw),
            )
        if result.status not in set(expected):
            raise TestFailure(
                f"{method} {path} returned {result.status}, expected {list(expected)}: "
                f"{result.body[:500].decode('utf-8', 'replace')}"
            )
        return result

    def api(
        self,
        method: str,
        path: str,
        *,
        json_body: Any | None = None,
        body: bytes | None = None,
        headers: dict[str, str] | None = None,
        content_type: str | None = None,
    ) -> Any:
        result = self.request(
            method,
            path,
            json_body=json_body,
            body=body,
            headers=headers,
            content_type=content_type,
        )
        if not isinstance(result.json, dict):
            raise TestFailure(f"{method} {path} did not return JSON")
        if result.json.get("code") != 200 or result.json.get("success") is False:
            raise TestFailure(f"{method} {path} API failed: {result.json}")
        return result.json.get("data")

    def auth_headers(self, token: str) -> dict[str, str]:
        return {"Authorization": f"Bearer {token}"}

    def cookie_header(self) -> str:
        return "; ".join(f"{cookie.name}={cookie.value}" for cookie in self.cookies)


def decode_json(raw: bytes) -> Any | None:
    if not raw:
        return None
    try:
        return json.loads(raw.decode("utf-8"))
    except Exception:
        return None


def check(name: str, fn) -> Any:
    start = time.time()
    try:
        value = fn()
        print(f"PASS {name} ({time.time() - start:.2f}s)")
        return value
    except Exception as exc:
        print(f"FAIL {name}: {exc}")
        raise


def unique_suffix() -> str:
    return "".join(random.choice(string.ascii_lowercase + string.digits) for _ in range(8))


def multipart_file(
    field_name: str,
    filename: str,
    content_type: str,
    content: bytes,
) -> tuple[bytes, str]:
    boundary = f"----imtest{uuid.uuid4().hex}"
    parts = [
        f"--{boundary}\r\n".encode(),
        (
            f'Content-Disposition: form-data; name="{field_name}"; '
            f'filename="{filename}"\r\n'
        ).encode(),
        f"Content-Type: {content_type}\r\n\r\n".encode(),
        content,
        b"\r\n",
        f"--{boundary}--\r\n".encode(),
    ]
    return b"".join(parts), f"multipart/form-data; boundary={boundary}"


def sign_internal(method: str, path: str, body: bytes = b"") -> dict[str, str]:
    timestamp = str(int(time.time() * 1000))
    nonce = str(uuid.uuid4())
    digest = base64.urlsafe_b64encode(hashlib.sha256(body).digest()).rstrip(b"=").decode()
    canonical = (
        f"method={method.upper()}&path={path.split('?', 1)[0]}"
        f"&bodyHash={digest}&ts={timestamp}&nonce={nonce}"
    )
    signature = (
        base64.urlsafe_b64encode(
            hmac.new(
                INTERNAL_SECRET.encode("utf-8"),
                canonical.encode("utf-8"),
                hashlib.sha256,
            ).digest()
        )
        .rstrip(b"=")
        .decode()
    )
    return {
        "X-Internal-Timestamp": timestamp,
        "X-Internal-Nonce": nonce,
        "X-Internal-Signature": signature,
    }


def mysql_exec(sql: str) -> None:
    cmd = [
        "docker",
        "exec",
        "-i",
        MYSQL_CONTAINER,
        "mysql",
        "-uroot",
        f"-p{MYSQL_ROOT_PASSWORD}",
        "--default-character-set=utf8mb4",
        "-e",
        sql,
    ]
    result = subprocess.run(cmd, text=True, capture_output=True, timeout=30)
    if result.returncode != 0:
        raise TestFailure(
            f"mysql exec failed: {result.stderr.strip() or result.stdout.strip()}"
        )


def seed_relationships(alice_id: int, bob_id: int, group_id: int) -> None:
    base = int(time.time() * 1000) * 1000 + random.randint(1, 999)
    sql = f"""
    INSERT INTO service_user_service_db.im_friend (id, user_id, friend_id, remark, status)
    VALUES ({base}, {alice_id}, {bob_id}, 'api-test', 1)
    ON DUPLICATE KEY UPDATE status = 1, remark = VALUES(remark);
    INSERT INTO service_user_service_db.im_friend (id, user_id, friend_id, remark, status)
    VALUES ({base + 1}, {bob_id}, {alice_id}, 'api-test', 1)
    ON DUPLICATE KEY UPDATE status = 1, remark = VALUES(remark);
    INSERT INTO service_group_service_db.im_group
      (id, name, avatar, announcement, owner_id, type, max_members, member_count, status)
    VALUES
      ({group_id}, 'api-test-group-{group_id}', NULL, NULL, {alice_id}, 1, 500, 2, 1)
    ON DUPLICATE KEY UPDATE status = 1, member_count = 2;
    INSERT INTO service_group_service_db.im_group_member
      (id, group_id, user_id, nickname, role, status)
    VALUES
      ({base + 2}, {group_id}, {alice_id}, 'alice', 3, 1)
    ON DUPLICATE KEY UPDATE status = 1, role = VALUES(role);
    INSERT INTO service_group_service_db.im_group_member
      (id, group_id, user_id, nickname, role, status)
    VALUES
      ({base + 3}, {group_id}, {bob_id}, 'bob', 1, 1)
    ON DUPLICATE KEY UPDATE status = 1, role = VALUES(role);
    """
    mysql_exec(sql)


def wait_for_api(client: ApiClient) -> None:
    last = None
    for _ in range(90):
        try:
            result = client.request("GET", "/health")
            if result.status == 200:
                return
        except Exception as exc:
            last = exc
        time.sleep(2)
    raise TestFailure(f"api did not become healthy: {last}")


def ws_url(user_id: int) -> str:
    if IM_WS_BASE:
        base = IM_WS_BASE.rstrip("/")
    else:
        parsed = urllib.parse.urlparse(API_BASE)
        scheme = "wss" if parsed.scheme == "https" else "ws"
        base = f"{scheme}://{parsed.netloc}"
    return f"{base}/websocket/{user_id}"


def js_number_string(value: int) -> str:
    result = subprocess.run(
        ["node", "-e", f"console.log(Number('{value}').toString())"],
        text=True,
        capture_output=True,
        timeout=10,
    )
    if result.returncode != 0:
        raise TestFailure(result.stderr.strip() or "node failed")
    return result.stdout.strip()


def websocket_ping(url: str, token: str, cookie_header: str) -> str:
    with open_websocket(url, token, cookie_header) as sock:
        return websocket_roundtrip_ping(sock)


def open_websocket(url: str, token: str, cookie_header: str) -> socket.socket:
    parsed = urllib.parse.urlparse(url)
    host = parsed.hostname or "localhost"
    port = parsed.port or (443 if parsed.scheme == "wss" else 80)
    if parsed.scheme == "wss":
        raise TestFailure("wss is not supported by the stdlib smoke client")
    path = parsed.path or "/"
    if parsed.query:
        path += f"?{parsed.query}"
    key = base64.b64encode(os.urandom(16)).decode()
    sock = socket.create_connection((host, port), timeout=10)
    sock.settimeout(10)
    request = "\r\n".join(
        [
            f"GET {path} HTTP/1.1",
            f"Host: {host}:{port}",
            "Upgrade: websocket",
            "Connection: Upgrade",
            f"Sec-WebSocket-Key: {key}",
            "Sec-WebSocket-Version: 13",
            "Origin: http://localhost",
            f"Authorization: Bearer {token}",
            f"Cookie: {cookie_header}",
            "\r\n",
        ]
    ).encode("utf-8")
    sock.sendall(request)
    response = recv_until(sock, b"\r\n\r\n")
    if b" 101 " not in response.split(b"\r\n", 1)[0]:
        sock.close()
        raise TestFailure(response.decode("utf-8", "replace"))
    return sock


def websocket_roundtrip_ping(sock: socket.socket) -> str:
    send_ws_text(sock, "PING")
    return read_ws_text_until(
        sock,
        lambda text: "PONG" in text or "HEARTBEAT" in text,
        "no heartbeat text frame received",
    )


def read_ws_text_until(sock: socket.socket, predicate, failure: str, timeout: float = 15.0) -> str:
    deadline = time.time() + timeout
    last_text = ""
    while time.time() < deadline:
        opcode, payload = recv_ws_frame(sock)
        if opcode == 1:
            text = payload.decode("utf-8", "replace")
            last_text = text
            if predicate(text):
                return text
        if opcode == 8:
            raise TestFailure("websocket closed while waiting for text frame")
    raise TestFailure(f"{failure}; last text={last_text!r}")


def recv_until(sock: socket.socket, marker: bytes) -> bytes:
    data = b""
    while marker not in data:
        chunk = sock.recv(4096)
        if not chunk:
            break
        data += chunk
    return data


def send_ws_text(sock: socket.socket, text: str) -> None:
    payload = text.encode("utf-8")
    frame = bytearray([0x81])
    length = len(payload)
    if length < 126:
        frame.append(0x80 | length)
    elif length <= 0xFFFF:
        frame.append(0x80 | 126)
        frame.extend(length.to_bytes(2, "big"))
    else:
        frame.append(0x80 | 127)
        frame.extend(length.to_bytes(8, "big"))
    mask = os.urandom(4)
    frame.extend(mask)
    frame.extend(byte ^ mask[index % 4] for index, byte in enumerate(payload))
    sock.sendall(frame)


def recv_exact(sock: socket.socket, size: int) -> bytes:
    data = b""
    while len(data) < size:
        chunk = sock.recv(size - len(data))
        if not chunk:
            raise TestFailure("socket closed while reading frame")
        data += chunk
    return data


def recv_ws_frame(sock: socket.socket) -> tuple[int, bytes]:
    first, second = recv_exact(sock, 2)
    opcode = first & 0x0F
    masked = bool(second & 0x80)
    length = second & 0x7F
    if length == 126:
        length = int.from_bytes(recv_exact(sock, 2), "big")
    elif length == 127:
        length = int.from_bytes(recv_exact(sock, 8), "big")
    mask = recv_exact(sock, 4) if masked else b""
    payload = recv_exact(sock, length) if length else b""
    if masked:
        payload = bytes(byte ^ mask[index % 4] for index, byte in enumerate(payload))
    return opcode, payload


def query(params: dict[str, Any]) -> str:
    return urllib.parse.urlencode(params)


def main() -> int:
    random.seed()
    suffix = unique_suffix()
    password = f"Pass{suffix}123"
    alice_name = f"alice_{suffix}"
    bob_name = f"bob_{suffix}"
    carol_name = f"carol_{suffix}"
    group_id = int(time.time() * 1000) + random.randint(100, 999)
    alice = ApiClient(API_BASE)
    bob = ApiClient(API_BASE)
    carol = ApiClient(API_BASE)

    check("health", lambda: wait_for_api(alice))
    check("ready", lambda: alice.request("GET", "/ready"))
    check("message config", lambda: alice.api("GET", "/api/message/config"))

    alice_user = check(
        "register alice",
        lambda: alice.api(
            "POST",
            "/api/user/register",
            json_body={"username": alice_name, "password": password, "nickname": "Alice"},
        ),
    )
    bob_user = check(
        "register bob",
        lambda: bob.api(
            "POST",
            "/user/register",
            json_body={"username": bob_name, "password": password, "nickname": "Bob"},
        ),
    )
    carol_user = check(
        "register carol",
        lambda: carol.api(
            "POST",
            "/api/user/register",
            json_body={"username": carol_name, "password": password, "nickname": "Carol"},
        ),
    )
    alice_id = int(alice_user["id"])
    bob_id = int(bob_user["id"])
    carol_id = int(carol_user["id"])
    if not all(isinstance(user["id"], str) for user in (alice_user, bob_user, carol_user)):
        raise TestFailure("public user ids must be serialized as strings")

    seed_relationships(alice_id, bob_id, group_id)
    print("PASS seed friend/group data")

    alice_login = check(
        "login alice",
        lambda: alice.api(
            "POST",
            "/api/user/login",
            json_body={"username": alice_name, "password": password},
        ),
    )
    bob_login = check(
        "login bob",
        lambda: bob.api(
            "POST",
            "/user/login",
            json_body={"username": bob_name, "password": password},
        ),
    )
    carol_login = check(
        "login carol",
        lambda: carol.api(
            "POST",
            "/api/user/login",
            json_body={"username": carol_name, "password": password},
        ),
    )
    alice_token = alice_login["token"]
    bob_token = bob_login["token"]
    carol_token = carol_login["token"]
    alice_headers = alice.auth_headers(alice_token)
    bob_headers = bob.auth_headers(bob_token)
    carol_headers = carol.auth_headers(carol_token)
    carol_password = password

    parsed_cookie = check("auth parse cookie", lambda: alice.api("POST", "/auth/parse"))
    if parsed_cookie.get("userId") != str(alice_id):
        raise TestFailure(f"auth parse userId must be exact string: {parsed_cookie}")
    refreshed = check("auth refresh", lambda: alice.api("POST", "/api/auth/refresh"))
    alice_token = refreshed["accessToken"]
    alice_headers = alice.auth_headers(alice_token)

    body_token = alice_token.encode("utf-8")
    check(
        "internal validate token",
        lambda: alice.api(
            "POST",
            "/api/auth/internal/validate-token",
            body=body_token,
            headers=sign_internal("POST", "/api/auth/internal/validate-token", body_token),
            content_type="text/plain",
        ),
    )
    check(
        "internal user resource",
        lambda: alice.api(
            "GET",
            f"/api/auth/internal/user-resource/{alice_id}",
            headers=sign_internal("GET", f"/api/auth/internal/user-resource/{alice_id}"),
        ),
    )
    check(
        "internal introspect",
        lambda: alice.api(
            "POST",
            "/api/auth/internal/introspect",
            body=body_token,
            headers=sign_internal("POST", "/api/auth/internal/introspect", body_token),
            content_type="text/plain",
        ),
    )
    check(
        "internal ws-introspect",
        lambda: alice.api(
            "POST",
            "/api/auth/internal/ws-introspect",
            body=body_token,
            headers=sign_internal("POST", "/api/auth/internal/ws-introspect", body_token),
            content_type="text/plain",
        ),
    )
    permission_body = json.dumps({"userId": alice_id, "permission": "file:read"}).encode()
    check(
        "internal permission check",
        lambda: alice.api(
            "POST",
            "/api/auth/internal/check-permission",
            body=permission_body,
            headers={
                **sign_internal(
                    "POST", "/api/auth/internal/check-permission", permission_body
                ),
                "Content-Type": "application/json",
            },
        ),
    )

    ws_ticket = check("issue ws ticket", lambda: alice.api("POST", "/api/auth/ws-ticket", headers=alice_headers))
    consume_body = json.dumps({"ticket": ws_ticket["ticket"], "userId": alice_id}).encode()
    consumed = check(
        "internal consume ws ticket",
        lambda: alice.api(
            "POST",
            "/api/auth/internal/ws-ticket/consume",
            body=consume_body,
            headers={
                **sign_internal("POST", "/api/auth/internal/ws-ticket/consume", consume_body),
                "Content-Type": "application/json",
            },
        ),
    )
    if not consumed.get("valid"):
        raise TestFailure(f"ws ticket consume failed: {consumed}")

    check(
        "update profile",
        lambda: alice.api(
            "PUT",
            "/api/user/profile",
            headers=alice_headers,
            json_body={"nickname": "Alice API", "email": f"{alice_name}@example.test"},
        ),
    )
    search_result = check(
        "search user",
        lambda: alice.api("GET", f"/user/search?{query({'keyword': bob_name})}"),
    )
    found_bob = next((item for item in search_result if item.get("username") == bob_name), None)
    if not found_bob or found_bob.get("id") != str(bob_id):
        raise TestFailure(f"search returned unsafe or wrong bob id: {search_result}")
    check("settings get", lambda: alice.api("GET", "/api/user/settings", headers=alice_headers))
    check(
        "settings update",
        lambda: alice.api(
            "PUT",
            "/user/settings/general",
            headers=alice_headers,
            json_body={"language": "zh-CN"},
        ),
    )
    check(
        "send phone code",
        lambda: carol.api(
            "POST",
            "/user/phone/code",
            headers=carol_headers,
            json_body={"target": "13800138000"},
        ),
    )
    check(
        "bind phone",
        lambda: carol.api(
            "POST",
            "/api/user/phone/bind",
            headers=carol_headers,
            json_body={"phone": "13800138000", "code": "000000"},
        ),
    )
    check(
        "send email code",
        lambda: carol.api(
            "POST",
            "/api/user/email/code",
            headers=carol_headers,
            json_body={"target": f"{carol_name}@example.test"},
        ),
    )
    check(
        "bind email",
        lambda: carol.api(
            "POST",
            "/user/email/bind",
            headers=carol_headers,
            json_body={"email": f"{carol_name}@example.test", "code": "000000"},
        ),
    )
    carol_password = f"{password}9"
    check(
        "change password",
        lambda: carol.api(
            "PUT",
            "/api/user/password",
            headers=carol_headers,
            json_body={"currentPassword": password, "newPassword": carol_password},
        ),
    )
    check(
        "heartbeat",
        lambda: alice.api(
            "POST",
            "/api/user/heartbeat",
            headers=alice_headers,
            json_body=[bob_id],
        ),
    )
    check(
        "online status",
        lambda: alice.api(
            "POST",
            "/user/online-status",
            headers=alice_headers,
            json_body=[alice_id, bob_id],
        ),
    )
    friend_list = check(
        "friend list",
        lambda: alice.api("GET", "/api/friend/list", headers=alice_headers),
    )
    if str(bob_id) not in {str(item.get("friendId")) for item in friend_list}:
        raise TestFailure("bob missing from alice friend list")
    check(
        "friend requests list",
        lambda: alice.api("GET", "/friend/requests", headers=alice_headers),
    )
    rounded_alice_id = js_number_string(alice_id)
    if rounded_alice_id == str(alice_id):
        raise TestFailure("test id is not large enough to exercise browser rounding")
    check(
        "send friend request using rounded browser id",
        lambda: carol.api(
            "POST",
            "/api/friend/request",
            headers=carol_headers,
            json_body={"targetUserId": rounded_alice_id, "reason": "api-test-rounded-id"},
        ),
    )
    check(
        "send friend request using searched id",
        lambda: carol.api(
            "POST",
            "/api/friend/request",
            headers=carol_headers,
            json_body={"targetUserId": found_bob["id"], "reason": "api-test-search-id"},
        ),
    )
    alice_requests = check(
        "friend request visible",
        lambda: alice.api("GET", "/api/friend/requests", headers=alice_headers),
    )
    pending_request = next(
        (
            item
            for item in alice_requests
            if str(item.get("applicantId")) == str(carol_id)
            and item.get("status") == "PENDING"
        ),
        None,
    )
    if not pending_request:
        raise TestFailure("carol friend request was not visible to alice")
    check(
        "accept friend request",
        lambda: alice.api(
            "POST",
            "/friend/accept",
            headers=alice_headers,
            json_body={"requestId": str(pending_request["id"]), "action": "ACCEPT"},
        ),
    )
    group_list = check(
        "group list",
        lambda: alice.api("GET", f"/api/group/user/{alice_id}", headers=alice_headers),
    )
    if str(group_id) not in {str(item.get("id")) for item in group_list}:
        raise TestFailure("seeded group missing from alice group list")
    members_response = check(
        "group members",
        lambda: alice.api(
            "POST",
            "/group/members/list",
            headers=alice_headers,
            json_body={"groupId": str(group_id)},
        ),
    )
    if str(bob_id) not in {
        str(item.get("userId")) for item in members_response.get("members", [])
    }:
        raise TestFailure("bob missing from seeded group members")
    member_ids_path = f"/api/group/internal/memberIds/{group_id}"
    member_ids = check(
        "internal group member ids",
        lambda: alice.api(
            "GET",
            member_ids_path,
            headers=sign_internal("GET", member_ids_path),
        ),
    )
    if bob_id not in [int(item) for item in member_ids]:
        raise TestFailure("bob missing from internal group member ids")
    created_group = check(
        "create group",
        lambda: alice.api(
            "POST",
            "/api/group/create",
            headers=alice_headers,
            json_body={"groupName": f"api-dynamic-{suffix}", "memberIds": [str(bob_id)]},
        ),
    )
    created_group_id = int(created_group["id"])
    check(
        "update group",
        lambda: alice.api(
            "PUT",
            f"/group/{created_group_id}",
            headers=alice_headers,
            json_body={"groupName": f"api-dynamic-updated-{suffix}"},
        ),
    )
    check(
        "join group",
        lambda: carol.api(
            "POST",
            f"/api/group/{created_group_id}/join",
            headers=carol_headers,
        ),
    )
    check(
        "leave group",
        lambda: carol.api(
            "POST",
            f"/group/{created_group_id}/leave",
            headers=carol_headers,
        ),
    )
    check(
        "dismiss group",
        lambda: alice.api(
            "DELETE",
            f"/api/group/{created_group_id}",
            headers=alice_headers,
        ),
    )

    file_body, file_type = multipart_file(
        "file", "api-test.txt", "text/plain", b"hello from full backend api test\n"
    )
    upload = check(
        "file upload",
        lambda: alice.api(
            "POST",
            "/api/file/upload/file",
            headers=alice_headers,
            body=file_body,
            content_type=file_type,
        ),
    )
    locator = {
        "category": upload["category"],
        "date": upload["uploadDate"],
        "filename": upload["filename"],
    }
    check("file info", lambda: alice.api("POST", "/file/info", headers=alice_headers, json_body=locator))
    download_path = f"/api/file/download?{query(locator)}"
    downloaded = check(
        "file download",
        lambda: alice.request("GET", download_path, headers=alice_headers),
    )
    if b"hello from full backend api test" not in downloaded.body:
        raise TestFailure("downloaded file content mismatch")
    check(
        "file delete",
        lambda: alice.api(
            "DELETE",
            f"/file/delete?{query(locator)}",
            headers=alice_headers,
        ),
    )
    check(
        "file deleted returns 404",
        lambda: alice.request("GET", download_path, headers=alice_headers, expected=(404,)),
    )

    check("issue ws ticket for bob push", lambda: bob.api("POST", "/auth/ws-ticket", headers=bob.auth_headers(bob_token)))
    bob_push_sock = check(
        "open bob websocket for push",
        lambda: open_websocket(ws_url(bob_id), bob_token, bob.cookie_header()),
    )
    private_message = None
    try:
        check("bob websocket heartbeat before push", lambda: websocket_roundtrip_ping(bob_push_sock))
        private_message = check(
            "send private message",
            lambda: alice.api(
                "POST",
                "/api/message/send/private",
                headers=alice_headers,
                json_body={
                    "receiverId": bob_id,
                    "clientMessageId": f"priv-{uuid.uuid4()}",
                    "messageType": "TEXT",
                    "content": "hello bob",
                },
            ),
        )
        pushed_text = check(
            "bob receives private push",
            lambda: read_ws_text_until(
                bob_push_sock,
                lambda text: "MESSAGE" in text and "hello bob" in text,
                "bob did not receive pushed private message",
            ),
        )
        if private_message["id"] not in pushed_text:
            raise TestFailure("pushed private message id mismatch")
    finally:
        bob_push_sock.close()
    if private_message is None:
        raise TestFailure("private message was not sent")
    check(
        "private history",
        lambda: alice.api("GET", f"/message/private/{bob_id}?size=20", headers=alice_headers),
    )
    check("conversations", lambda: alice.api("GET", "/api/message/conversations", headers=alice_headers))
    check(
        "mark private read",
        lambda: bob.api(
            "POST",
            f"/api/message/read/{alice_id}",
            headers=bob_headers,
        ),
    )
    check(
        "recall private message",
        lambda: alice.api(
            "POST",
            f"/message/recall/{private_message['id']}",
            headers=alice_headers,
        ),
    )
    check(
        "delete private message",
        lambda: alice.api(
            "POST",
            f"/api/message/delete/{private_message['id']}",
            headers=alice_headers,
        ),
    )

    group_message = check(
        "send group message",
        lambda: alice.api(
            "POST",
            "/message/send/group",
            headers=alice_headers,
            json_body={
                "groupId": group_id,
                "clientMessageId": f"group-{uuid.uuid4()}",
                "messageType": "TEXT",
                "content": "hello group",
            },
        ),
    )
    check(
        "group history",
        lambda: alice.api("GET", f"/api/message/group/{group_id}?size=20", headers=alice_headers),
    )
    check(
        "mark group read",
        lambda: bob.api(
            "POST",
            f"/message/read/group_{group_id}",
            headers=bob_headers,
        ),
    )
    if not group_message.get("id"):
        raise TestFailure("group message missing id")

    check("issue ws ticket for websocket", lambda: alice.api("POST", "/auth/ws-ticket", headers=alice_headers))
    check(
        "websocket heartbeat",
        lambda: websocket_ping(ws_url(alice_id), alice_token, alice.cookie_header()),
    )
    check(
        "delete account",
        lambda: carol.api(
            "DELETE",
            "/api/user/account",
            headers=carol_headers,
            json_body={"password": carol_password},
        ),
    )

    revoke_body = json.dumps({"token": carol_token, "reason": "api-test"}).encode()
    check(
        "internal revoke token",
        lambda: alice.api(
            "POST",
            "/api/auth/internal/revoke-token",
            body=revoke_body,
            headers={
                **sign_internal("POST", "/api/auth/internal/revoke-token", revoke_body),
                "Content-Type": "application/json",
            },
        ),
    )
    carol_token_body = carol_token.encode()
    check(
        "revoked token rejected internally",
        lambda: carol.request(
            "POST",
            "/api/auth/internal/validate-token",
            body=carol_token_body,
            headers=sign_internal(
                "POST", "/api/auth/internal/validate-token", carol_token_body
            ),
            expected=(401,),
            content_type="text/plain",
        ),
    )
    check(
        "internal revoke user tokens",
        lambda: alice.api(
            "POST",
            f"/api/auth/internal/revoke-user-tokens/{carol_id}",
            body=b"{}",
            headers={
                **sign_internal("POST", f"/api/auth/internal/revoke-user-tokens/{carol_id}", b"{}"),
                "Content-Type": "application/json",
            },
        ),
    )
    check("logout alice", lambda: alice.api("POST", "/api/user/logout"))
    print("ALL BACKEND API TESTS PASSED")
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Exception as exc:
        print(f"FULL BACKEND API TEST FAILED: {exc}", file=sys.stderr)
        raise SystemExit(1)
