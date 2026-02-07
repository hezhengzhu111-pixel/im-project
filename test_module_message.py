import io
import sys
import time
import json
from urllib.parse import urlparse

import requests
import websocket

from pytestsuite import ANY, ApiClient, Reporter, RunContext, TypeIs
from pytestsuite.reporting import AssertionRecord, CaseRecord, utc_now_iso


def _ws_url(base_url: str, user_id: str, token: str) -> str:
    u = urlparse(base_url)
    scheme = "wss" if u.scheme == "https" else "ws"
    host = u.netloc
    return f"{scheme}://{host}/websocket/{user_id}?token={token}"


def _record_ws_case(
    reporter: Reporter,
    *,
    name: str,
    ok: bool,
    duration_ms: int,
    request: dict,
    response: dict,
    assertions: list[AssertionRecord],
    error_category: str | None = None,
    error_message: str | None = None,
    exception: dict | None = None,
) -> None:
    case = CaseRecord(
        case_id=reporter.new_case_id(),
        module=reporter.module,
        name=name,
        started_at=utc_now_iso(),
        finished_at=utc_now_iso(),
        duration_ms=duration_ms,
        request=request,
        response=response,
        assertions=assertions,
        ok=ok,
        error_category=error_category,
        error_message=error_message,
        exception=exception,
    )
    reporter.record_case(case)


def _ws_recv_until(ws, *, predicate, timeout_s: float = 6.0):
    deadline = time.time() + timeout_s
    last = None
    while time.time() < deadline:
        left = max(0.1, deadline - time.time())
        ws.settimeout(left)
        raw = ws.recv()
        last = raw
        try:
            obj = json.loads(raw)
        except Exception:
            continue
        if predicate(obj):
            return obj, raw
    raise TimeoutError(f"ws timeout, last={str(last)[:200]}")


if sys.platform == "win32":
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")
    sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding="utf-8", errors="replace")


def main() -> int:
    ctx = RunContext.from_env("message")
    reporter = Reporter(module="message", base_url=ctx.base_url, run_id=ctx.run_id, root_dir=ctx.output_dir)

    bootstrap = requests.Session()
    bootstrap.headers.update({"Authorization": "Bearer bootstrap"})
    c0 = ApiClient(reporter, bootstrap)

    suffix = str(int(time.time()))
    a_user = f"test_msg_{suffix}_a"
    b_user = f"test_msg_{suffix}_b"
    password = "password123"

    ok_all = True

    c0.call(
        f"user.register {a_user}",
        "POST",
        "/api/user/register",
        expected_http=(200,),
        expected_json_subset={"code": 200, "data": {"username": a_user}},
        json_body={"username": a_user, "password": password, "nickname": a_user},
    )
    ok_a, _, login_a = c0.call(
        f"user.login {a_user}",
        "POST",
        "/api/user/login",
        expected_http=(200,),
        expected_json_subset={"success": True, "token": TypeIs(str), "user": {"id": ANY}},
        json_body={"username": a_user, "password": password},
    )
    ok_all &= ok_a

    c0.call(
        f"user.register {b_user}",
        "POST",
        "/api/user/register",
        expected_http=(200,),
        expected_json_subset={"code": 200, "data": {"username": b_user}},
        json_body={"username": b_user, "password": password, "nickname": b_user},
    )
    ok_b, _, login_b = c0.call(
        f"user.login {b_user}",
        "POST",
        "/api/user/login",
        expected_http=(200,),
        expected_json_subset={"success": True, "token": TypeIs(str), "user": {"id": ANY}},
        json_body={"username": b_user, "password": password},
    )
    ok_all &= ok_b

    token_a = (login_a or {}).get("token") if isinstance(login_a, dict) else None
    token_b = (login_b or {}).get("token") if isinstance(login_b, dict) else None
    user_id_a = str(((login_a or {}).get("user") or {}).get("id")) if isinstance(login_a, dict) else None
    user_id_b = str(((login_b or {}).get("user") or {}).get("id")) if isinstance(login_b, dict) else None
    if not token_a or not token_b or not user_id_a or not user_id_b:
        ok_all = False

    s_a = requests.Session()
    s_a.headers.update({"Authorization": f"Bearer {token_a}"})
    s_b = requests.Session()
    s_b.headers.update({"Authorization": f"Bearer {token_b}"})
    c_a = ApiClient(reporter, s_a)
    c_b = ApiClient(reporter, s_b)

    ok_req, _, req_payload = c_a.call(
        "friend.request(for_message)",
        "POST",
        "/api/friend/request",
        expected_http=(200,),
        expected_json_subset={"code": 200, "data": TypeIs(dict)},
        json_body={"targetUserId": user_id_b, "reason": "自动化测试"},
    )
    ok_all &= ok_req
    req_id = None
    if isinstance(req_payload, dict):
        data = req_payload.get("data") or {}
        req_id = data.get("requestId") or data.get("id") or ((data.get("request") or {}).get("id"))
    if req_id is None:
        ok_all = False

    ok_all &= c_a.call(
        "message.send.private.not_friend",
        "POST",
        "/api/message/send/private",
        expected_http=(200,),
        expected_json_subset={"code": 400},
        json_body={"receiverId": user_id_b, "messageType": "TEXT", "content": f"非好友私聊_{int(time.time())}"},
    )[0]

    if req_id is not None:
        ok_all &= c_b.call(
            "friend.accept(for_message)",
            "POST",
            "/api/friend/accept",
            expected_http=(200,),
            expected_json_subset={"code": 200},
            json_body={"requestId": int(req_id)},
        )[0]

    ws_a = None
    ws_b = None
    try:
        t0 = time.time()
        ws_a = websocket.create_connection(_ws_url(ctx.base_url, user_id_a, token_a), timeout=6)
        ws_a.settimeout(6)
        _record_ws_case(
            reporter,
            name="ws.connect.a",
            ok=True,
            duration_ms=int((time.time() - t0) * 1000),
            request={"type": "ws.connect", "url": _ws_url(ctx.base_url, user_id_a, "TOKEN")},
            response={"status": "connected"},
            assertions=[AssertionRecord(name="ws.connected", ok=True, details={})],
        )
    except Exception as e:
        _record_ws_case(
            reporter,
            name="ws.connect.a",
            ok=False,
            duration_ms=0,
            request={"type": "ws.connect", "url": _ws_url(ctx.base_url, user_id_a, "TOKEN")},
            response={"status": "failed"},
            assertions=[AssertionRecord(name="ws.connected", ok=False, details={"error": str(e)})],
            error_category="ws_connect_error",
            error_message=str(e),
            exception={"type": type(e).__name__, "message": str(e)},
        )
        ok_all = False

    try:
        t0 = time.time()
        ws_b = websocket.create_connection(_ws_url(ctx.base_url, user_id_b, token_b), timeout=6)
        ws_b.settimeout(6)
        _record_ws_case(
            reporter,
            name="ws.connect.b",
            ok=True,
            duration_ms=int((time.time() - t0) * 1000),
            request={"type": "ws.connect", "url": _ws_url(ctx.base_url, user_id_b, "TOKEN")},
            response={"status": "connected"},
            assertions=[AssertionRecord(name="ws.connected", ok=True, details={})],
        )
    except Exception as e:
        _record_ws_case(
            reporter,
            name="ws.connect.b",
            ok=False,
            duration_ms=0,
            request={"type": "ws.connect", "url": _ws_url(ctx.base_url, user_id_b, "TOKEN")},
            response={"status": "failed"},
            assertions=[AssertionRecord(name="ws.connected", ok=False, details={"error": str(e)})],
            error_category="ws_connect_error",
            error_message=str(e),
            exception={"type": type(e).__name__, "message": str(e)},
        )
        ok_all = False

    if ws_a is not None:
        try:
            t0 = time.time()
            ws_a.send(json.dumps({"type": "HEARTBEAT", "data": {"timestamp": int(time.time() * 1000)}, "timestamp": int(time.time() * 1000)}))
            raw = ws_a.recv()
            obj = json.loads(raw)
            ok = obj.get("type") == "HEARTBEAT"
            _record_ws_case(
                reporter,
                name="ws.heartbeat.a",
                ok=ok,
                duration_ms=int((time.time() - t0) * 1000),
                request={"type": "ws.send", "data": {"type": "HEARTBEAT"}},
                response={"raw": raw[:500]},
                assertions=[AssertionRecord(name="ws.type", ok=ok, details={"expected": "HEARTBEAT", "actual": obj.get("type")})],
                error_category=None if ok else "ws_assertion_failed",
                error_message=None if ok else "unexpected ws response type",
            )
            ok_all &= ok
        except Exception as e:
            _record_ws_case(
                reporter,
                name="ws.heartbeat.a",
                ok=False,
                duration_ms=0,
                request={"type": "ws.send", "data": {"type": "HEARTBEAT"}},
                response={"status": "failed"},
                assertions=[AssertionRecord(name="ws.type", ok=False, details={"error": str(e)})],
                error_category="ws_error",
                error_message=str(e),
                exception={"type": type(e).__name__, "message": str(e)},
            )
            ok_all = False

    ok_all &= c_a.call(
        "message.send.private.empty_content",
        "POST",
        "/api/message/send/private",
        expected_http=(200,),
        expected_json_subset={"code": 400},
        json_body={"receiverId": user_id_b, "messageType": "TEXT", "content": "   "},
    )[0]

    ok_text, _, send_text_payload = c_a.call(
        "message.send.private.text",
        "POST",
        "/api/message/send/private",
        expected_http=(200,),
        expected_json_subset={"code": 200, "data": {"id": ANY}},
        json_body={"receiverId": user_id_b, "messageType": "TEXT", "content": f"私聊文本_{int(time.time())}"},
    )
    ok_all &= ok_text
    text_id = None
    if isinstance(send_text_payload, dict):
        text_id = ((send_text_payload.get("data") or {}).get("id"))

    ok_all &= c_a.call(
        "message.send.private.image.missing_mediaUrl",
        "POST",
        "/api/message/send/private",
        expected_http=(200,),
        expected_json_subset={"code": 400},
        json_body={"receiverId": user_id_b, "messageType": "IMAGE"},
    )[0]

    ok_img, _, send_img_payload = c_a.call(
        "message.send.private.image",
        "POST",
        "/api/message/send/private",
        expected_http=(200,),
        expected_json_subset={"code": 200, "data": {"id": ANY}},
        json_body={"receiverId": user_id_b, "messageType": "IMAGE", "mediaUrl": "https://example.com/a.png"},
    )
    ok_all &= ok_img
    img_id = None
    if isinstance(send_img_payload, dict):
        img_id = ((send_img_payload.get("data") or {}).get("id"))

    if ws_b is not None and text_id is not None:
        try:
            t0 = time.time()
            obj, raw = _ws_recv_until(ws_b, predicate=lambda o: o.get("type") == "MESSAGE" and str((o.get("data") or {}).get("id")) == str(text_id), timeout_s=8)
            ok = True
            _record_ws_case(
                reporter,
                name="ws.push.private.text",
                ok=ok,
                duration_ms=int((time.time() - t0) * 1000),
                request={"type": "ws.recv", "expect": {"type": "MESSAGE", "id": str(text_id)}},
                response={"raw": raw[:800], "data_id": ((obj.get("data") or {}).get("id"))},
                assertions=[AssertionRecord(name="ws.message.id", ok=True, details={"id": str(text_id)})],
            )
        except Exception as e:
            _record_ws_case(
                reporter,
                name="ws.push.private.text",
                ok=False,
                duration_ms=0,
                request={"type": "ws.recv", "expect": {"type": "MESSAGE", "id": str(text_id)}},
                response={"status": "timeout"},
                assertions=[AssertionRecord(name="ws.message.id", ok=False, details={"error": str(e)})],
                error_category="ws_timeout",
                error_message=str(e),
                exception={"type": type(e).__name__, "message": str(e)},
            )
            ok_all = False

    if ws_b is not None and img_id is not None:
        try:
            t0 = time.time()
            obj, raw = _ws_recv_until(ws_b, predicate=lambda o: o.get("type") == "MESSAGE" and str((o.get("data") or {}).get("id")) == str(img_id), timeout_s=8)
            ok = True
            _record_ws_case(
                reporter,
                name="ws.push.private.image",
                ok=ok,
                duration_ms=int((time.time() - t0) * 1000),
                request={"type": "ws.recv", "expect": {"type": "MESSAGE", "id": str(img_id)}},
                response={"raw": raw[:800], "data_id": ((obj.get("data") or {}).get("id"))},
                assertions=[AssertionRecord(name="ws.message.id", ok=True, details={"id": str(img_id)})],
            )
        except Exception as e:
            _record_ws_case(
                reporter,
                name="ws.push.private.image",
                ok=False,
                duration_ms=0,
                request={"type": "ws.recv", "expect": {"type": "MESSAGE", "id": str(img_id)}},
                response={"status": "timeout"},
                assertions=[AssertionRecord(name="ws.message.id", ok=False, details={"error": str(e)})],
                error_category="ws_timeout",
                error_message=str(e),
                exception={"type": type(e).__name__, "message": str(e)},
            )
            ok_all = False

    conv_key = user_id_a

    ok_conv_b, _, conv_payload_b = c_b.call(
        "message.conversations.b",
        "GET",
        "/api/message/conversations",
        expected_http=(200,),
        expected_json_subset={"code": 200, "data": TypeIs(list)},
    )
    ok_all &= ok_conv_b
    if ok_conv_b and conv_key and isinstance(conv_payload_b, dict):
        items = conv_payload_b.get("data") or []
        target = next((c for c in items if str(c.get("conversationId")) == conv_key), None)
        if not target:
            ok_all = False
        else:
            unread = target.get("unreadCount")
            if unread is None or int(unread) < 1:
                ok_all = False

    ok_list, _, plist_payload = c_a.call(
        "message.private.list",
        "GET",
        f"/api/message/private/{user_id_b}",
        expected_http=(200,),
        expected_json_subset={"code": 200, "data": TypeIs(list)},
        params={"page": 0, "size": 50},
    )
    ok_all &= ok_list
    msg_id = None
    if isinstance(plist_payload, dict):
        msgs = plist_payload.get("data")
        if isinstance(msgs, list) and msgs:
            msg_id = msgs[0].get("id")
    if text_id is not None:
        msg_id = text_id

    ok_all &= c_a.call(
        "message.private.cursor.latest",
        "GET",
        f"/api/message/private/{user_id_b}/cursor",
        expected_http=(200,),
        expected_json_subset={"code": 200, "data": TypeIs(list)},
        params={"limit": 20},
    )[0]

    if msg_id is not None:
        ok_all &= c_a.call(
            "message.private.cursor.before",
            "GET",
            f"/api/message/private/{user_id_b}/cursor",
            expected_http=(200,),
            expected_json_subset={"code": 200, "data": TypeIs(list)},
            params={"last_message_id": msg_id, "limit": 20},
        )[0]
        ok_all &= c_a.call(
            "message.private.cursor.after",
            "GET",
            f"/api/message/private/{user_id_b}/cursor",
            expected_http=(200,),
            expected_json_subset={"code": 200, "data": TypeIs(list)},
            params={"after_message_id": msg_id, "limit": 20},
        )[0]

    read_target_id = img_id or msg_id

    if msg_id is not None:
        ok_all &= c_b.call(
            "message.recall.forbidden",
            "POST",
            f"/api/message/recall/{msg_id}",
            expected_http=(200,),
            expected_json_subset={"code": 403},
        )[0]

        ok_recall, _, recall_payload = c_a.call(
            "message.recall",
            "POST",
            f"/api/message/recall/{msg_id}",
            expected_http=(200,),
            expected_json_subset={"code": 200, "data": {"id": msg_id, "status": "RECALLED"}},
        )
        ok_all &= ok_recall

        if ws_b is not None:
            try:
                t0 = time.time()
                obj, raw = _ws_recv_until(
                    ws_b,
                    predicate=lambda o: o.get("type") == "MESSAGE"
                    and str((o.get("data") or {}).get("id")) == str(msg_id)
                    and ((o.get("data") or {}).get("status") in ("RECALLED", 4)),
                    timeout_s=8,
                )
                ok = True
                _record_ws_case(
                    reporter,
                    name="ws.push.private.recall",
                    ok=ok,
                    duration_ms=int((time.time() - t0) * 1000),
                    request={"type": "ws.recv", "expect": {"type": "MESSAGE", "id": str(msg_id), "status": "RECALLED"}},
                    response={"raw": raw[:800], "status": ((obj.get("data") or {}).get("status"))},
                    assertions=[AssertionRecord(name="ws.message.status", ok=True, details={"expected": "RECALLED"})],
                )
            except Exception as e:
                _record_ws_case(
                    reporter,
                    name="ws.push.private.recall",
                    ok=False,
                    duration_ms=0,
                    request={"type": "ws.recv", "expect": {"type": "MESSAGE", "id": str(msg_id), "status": "RECALLED"}},
                    response={"status": "timeout"},
                    assertions=[AssertionRecord(name="ws.message.status", ok=False, details={"error": str(e)})],
                    error_category="ws_timeout",
                    error_message=str(e),
                    exception={"type": type(e).__name__, "message": str(e)},
                )
                ok_all = False

        ok_del, _, del_payload = c_a.call(
            "message.delete",
            "POST",
            f"/api/message/delete/{msg_id}",
            expected_http=(200,),
            expected_json_subset={"code": 200, "data": {"id": msg_id, "status": "DELETED"}},
        )
        ok_all &= ok_del

        if ws_b is not None:
            try:
                t0 = time.time()
                obj, raw = _ws_recv_until(
                    ws_b,
                    predicate=lambda o: o.get("type") == "MESSAGE"
                    and str((o.get("data") or {}).get("id")) == str(msg_id)
                    and ((o.get("data") or {}).get("status") in ("DELETED", 5)),
                    timeout_s=8,
                )
                ok = True
                _record_ws_case(
                    reporter,
                    name="ws.push.private.delete",
                    ok=ok,
                    duration_ms=int((time.time() - t0) * 1000),
                    request={"type": "ws.recv", "expect": {"type": "MESSAGE", "id": str(msg_id), "status": "DELETED"}},
                    response={"raw": raw[:800], "status": ((obj.get("data") or {}).get("status"))},
                    assertions=[AssertionRecord(name="ws.message.status", ok=True, details={"expected": "DELETED"})],
                )
            except Exception as e:
                _record_ws_case(
                    reporter,
                    name="ws.push.private.delete",
                    ok=False,
                    duration_ms=0,
                    request={"type": "ws.recv", "expect": {"type": "MESSAGE", "id": str(msg_id), "status": "DELETED"}},
                    response={"status": "timeout"},
                    assertions=[AssertionRecord(name="ws.message.status", ok=False, details={"error": str(e)})],
                    error_category="ws_timeout",
                    error_message=str(e),
                    exception={"type": type(e).__name__, "message": str(e)},
                )
                ok_all = False

    ok_all &= c_a.call(
        "message.conversations",
        "GET",
        "/api/message/conversations",
        expected_http=(200,),
        expected_json_subset={"code": 200, "data": TypeIs(list)},
    )[0]

    ok_all &= c_b.call(
        "message.read.private",
        "POST",
        f"/api/message/read/{user_id_a}_{user_id_b}",
        expected_http=(200,),
        expected_json_subset={"code": 200},
    )[0]

    if read_target_id is not None:
        if ws_a is not None:
            try:
                t0 = time.time()
                obj, raw = _ws_recv_until(
                    ws_a,
                    predicate=lambda o: o.get("type") == "READ_RECEIPT"
                    and str((o.get("data") or {}).get("readerId") or (o.get("data") or {}).get("reader_id")) == str(user_id_b),
                    timeout_s=8,
                )
                _record_ws_case(
                    reporter,
                    name="ws.push.read_receipt",
                    ok=True,
                    duration_ms=int((time.time() - t0) * 1000),
                    request={"type": "ws.recv", "expect": {"type": "READ_RECEIPT", "readerId": str(user_id_b)}},
                    response={"raw": raw[:800], "data": obj.get("data")},
                    assertions=[AssertionRecord(name="ws.type", ok=True, details={"type": "READ_RECEIPT"})],
                )
            except Exception as e:
                _record_ws_case(
                    reporter,
                    name="ws.push.read_receipt",
                    ok=False,
                    duration_ms=0,
                    request={"type": "ws.recv", "expect": {"type": "READ_RECEIPT", "readerId": str(user_id_b)}},
                    response={"status": "timeout"},
                    assertions=[AssertionRecord(name="ws.type", ok=False, details={"error": str(e)})],
                    error_category="ws_timeout",
                    error_message=str(e),
                    exception={"type": type(e).__name__, "message": str(e)},
                )
                ok_all = False

        ok_after, _, plist_after = c_a.call(
            "message.private.list.after_read",
            "GET",
            f"/api/message/private/{user_id_b}",
            expected_http=(200,),
            expected_json_subset={"code": 200, "data": TypeIs(list)},
            params={"page": 0, "size": 50},
        )
        ok_all &= ok_after
        if isinstance(plist_after, dict):
            msgs = plist_after.get("data") or []
            target = next((m for m in msgs if str(m.get("id")) == str(read_target_id)), None)
            if not target:
                ok_all = False
            else:
                if target.get("status") != "READ":
                    ok_all = False
                if target.get("read_status") != 1:
                    ok_all = False
                if not target.get("read_at"):
                    ok_all = False

    ok_group, _, group_payload = c_a.call(
        "group.create(for_message)",
        "POST",
        "/api/group/create",
        expected_http=(200,),
        expected_json_subset={"code": 200, "data": TypeIs(dict)},
        json_body={"name": f"消息群_{int(time.time())}", "type": 1, "announcement": "消息测试群"},
    )
    ok_all &= ok_group
    group_id = None
    if isinstance(group_payload, dict):
        group_id = ((group_payload.get("data") or {}).get("id"))

    if group_id is not None:
        ok_all &= c_a.call(
            "group.members.add(for_message)",
            "POST",
            f"/api/group/{group_id}/members",
            expected_http=(200,),
            expected_json_subset={"code": 200},
            json_body={"groupId": int(group_id), "operatorId": int(user_id_a), "memberIds": [int(user_id_b)]},
        )[0]

        ok_all &= c_a.call(
            "message.send.group",
            "POST",
            "/api/message/send/group",
            expected_http=(200,),
            expected_json_subset={"code": 200},
            json_body={"groupId": str(group_id), "messageType": "TEXT", "content": f"群聊消息_{int(time.time())}"},
        )[0]

        ok_glist, _, glist_payload = c_b.call(
            "message.group.list",
            "GET",
            f"/api/message/group/{group_id}",
            expected_http=(200,),
            expected_json_subset={"code": 200, "data": TypeIs(list)},
            params={"page": 0, "size": 50},
        )
        ok_all &= ok_glist
        gmsg_id = None
        if isinstance(glist_payload, dict):
            msgs = glist_payload.get("data")
            if isinstance(msgs, list) and msgs:
                gmsg_id = msgs[0].get("id")

        ok_all &= c_b.call(
            "message.read.group",
            "POST",
            f"/api/message/read/group_{group_id}",
            expected_http=(200,),
            expected_json_subset={"code": 200},
        )[0]

        if gmsg_id:
            ok_all &= c_a.call(
                "message.retry.group",
                "POST",
                f"/api/message/retry/group/{gmsg_id}",
                expected_http=(200,),
                expected_json_subset={"code": ANY},
            )[0]

        ok_all &= c_a.call(
            "message.retry.group.not_exists",
            "POST",
            f"/api/message/retry/group/{999999999999}",
            expected_http=(200,),
            expected_json_subset={"code": 404},
        )[0]

    if msg_id:
        ok_all &= c_a.call(
            "message.retry.private",
            "POST",
            f"/api/message/retry/private/{msg_id}",
            expected_http=(200,),
            expected_json_subset={"code": ANY},
        )[0]
        ok_all &= c_a.call(
            "message.retry.private.not_exists",
            "POST",
            f"/api/message/retry/private/{999999999999}",
            expected_http=(200,),
            expected_json_subset={"code": 404},
        )[0]

    try:
        if ws_a is not None:
            ws_a.close()
        if ws_b is not None:
            ws_b.close()
    except Exception:
        pass

    reporter.finalize()
    return 0 if ok_all else 1


if __name__ == "__main__":
    raise SystemExit(main())
