import io
import sys
import time
import base64
import os

import requests

from pytestsuite import ANY, ApiClient, Reporter, RunContext, TypeIs


if sys.platform == "win32":
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")
    sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding="utf-8", errors="replace")


def main() -> int:
    ctx = RunContext.from_env("im")
    reporter = Reporter(module="im", base_url=ctx.base_url, run_id=ctx.run_id, root_dir=ctx.output_dir)

    bootstrap = requests.Session()
    bootstrap.headers.update({"Authorization": "Bearer bootstrap"})
    c0 = ApiClient(reporter, bootstrap)

    suffix = str(int(time.time()))
    a_user = f"test_im_{suffix}_a"
    b_user = f"test_im_{suffix}_b"
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
    user_id_a = str(((login_a or {}).get("user") or {}).get("id")) if isinstance(login_a, dict) else None
    user_id_b = str(((login_b or {}).get("user") or {}).get("id")) if isinstance(login_b, dict) else None
    if not token_a or not user_id_a or not user_id_b:
        ok_all = False

    c_noauth = ApiClient(reporter, requests.Session())
    ok_all &= c_noauth.call(
        "im.online.noauth",
        "POST",
        f"/api/im/online/{user_id_a or 1}",
        expected_http=(200,),
        expected_json_subset={"code": 200, "data": "用户上线成功"},
    )[0]

    s = requests.Session()
    s.headers.update({"Authorization": f"Bearer {token_a}"})
    c = ApiClient(reporter, s)

    ok_all &= c.call(
        "im-server.health",
        "GET",
        "/im-server/health",
        expected_http=(200,),
        expected_json_subset={"status": "UP"},
    )[0]
    ok_all &= c.call(
        "im-server.ready",
        "GET",
        "/im-server/ready",
        expected_http=(200,),
        expected_json_subset={"status": "READY"},
    )[0]

    ok_all &= c.call(
        "im.online",
        "POST",
        f"/api/im/online/{user_id_a}",
        expected_http=(200,),
        expected_json_subset={"code": 200},
    )[0]

    ok_all &= c.call(
        "im.heartbeat",
        "POST",
        "/api/im/heartbeat",
        expected_http=(200,),
        expected_json_subset={"code": 200},
        json_body=[user_id_a, user_id_b],
    )[0]

    ok_all &= c.call(
        "im-server.proxy.heartbeat",
        "POST",
        "/im-server/api/im/heartbeat",
        expected_http=(200,),
        expected_json_subset={"code": 200},
        json_body=[user_id_a, user_id_b],
    )[0]

    ok_all &= c.call(
        "im.sendMessage.private",
        "POST",
        "/api/im/sendMessage",
        expected_http=(200,),
        expected_json_subset={"code": 200},
        json_body={"senderId": int(user_id_a), "receiverId": int(user_id_b), "messageType": "TEXT", "content": f"IM消息_{int(time.time())}", "isGroup": False},
    )[0]

    ws_key = base64.b64encode(os.urandom(16)).decode("ascii")
    ok_all &= c_noauth.call(
        "im.websocket.handshake",
        "GET",
        f"/websocket/{user_id_a}?token={token_a}",
        expected_http=(101,),
        headers={
            "Connection": "Upgrade",
            "Upgrade": "websocket",
            "Sec-WebSocket-Version": "13",
            "Sec-WebSocket-Key": ws_key,
        },
    )[0]

    ok_all &= c.call(
        "im.offline",
        "POST",
        f"/api/im/offline/{user_id_a}",
        expected_http=(200,),
        expected_json_subset={"code": 200},
    )[0]

    reporter.finalize()
    return 0 if ok_all else 1


if __name__ == "__main__":
    raise SystemExit(main())
