import io
import sys
import time

import requests

from pytestsuite import ANY, ApiClient, Reporter, RunContext, TypeIs


if sys.platform == "win32":
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")
    sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding="utf-8", errors="replace")


def main() -> int:
    ctx = RunContext.from_env("user")
    reporter = Reporter(module="user", base_url=ctx.base_url, run_id=ctx.run_id, root_dir=ctx.output_dir)

    bootstrap = requests.Session()
    bootstrap.headers.update({"Authorization": "Bearer bootstrap"})
    c0 = ApiClient(reporter, bootstrap)

    suffix = str(int(time.time()))
    a_user = f"test_user_{suffix}_a"
    b_user = f"test_user_{suffix}_b"
    password = "password123"

    ok_all = True

    ok_all &= c0.call(
        f"user.register {a_user}",
        "POST",
        "/api/user/register",
        expected_http=(200,),
        expected_json_subset={"code": 200, "data": {"username": a_user}},
        json_body={"username": a_user, "password": password, "nickname": a_user},
    )[0]
    ok_all &= c0.call(
        f"user.login {a_user}",
        "POST",
        "/api/user/login",
        expected_http=(200,),
        expected_json_subset={"success": True, "token": TypeIs(str), "refreshToken": TypeIs(str), "user": {"id": ANY}},
        json_body={"username": a_user, "password": password},
    )[0]

    ok_all &= c0.call(
        f"user.register {b_user}",
        "POST",
        "/api/user/register",
        expected_http=(200,),
        expected_json_subset={"code": 200, "data": {"username": b_user}},
        json_body={"username": b_user, "password": password, "nickname": b_user},
    )[0]
    ok_login_b, _, login_b = c0.call(
        f"user.login {b_user}",
        "POST",
        "/api/user/login",
        expected_http=(200,),
        expected_json_subset={"success": True, "token": TypeIs(str), "refreshToken": TypeIs(str), "user": {"id": ANY}},
        json_body={"username": b_user, "password": password},
    )
    ok_all &= ok_login_b

    ok_all &= c0.call(
        "user.register.duplicate",
        "POST",
        "/api/user/register",
        expected_http=(400,),
        expected_json_subset={"code": 400, "message": "用户名已存在"},
        json_body={"username": a_user, "password": password, "nickname": a_user},
    )[0]
    ok_all &= c0.call(
        "user.login.wrong_password",
        "POST",
        "/api/user/login",
        expected_http=(400,),
        expected_json_subset={"code": 400, "message": "密码错误"},
        json_body={"username": a_user, "password": "wrong"},
    )[0]

    token_a = None
    user_id_a = None
    login_a = c0.call(
        f"user.login.refresh {a_user}",
        "POST",
        "/api/user/login",
        expected_http=(200,),
        expected_json_subset={"success": True, "token": TypeIs(str), "user": {"id": ANY}},
        json_body={"username": a_user, "password": password},
    )[2]
    if isinstance(login_a, dict):
        token_a = login_a.get("token")
        user_id_a = str(((login_a.get("user") or {}).get("id")))
    token_b = login_b.get("token") if isinstance(login_b, dict) else None
    user_id_b = str(((login_b.get("user") or {}).get("id"))) if isinstance(login_b, dict) else None
    if not token_a or not token_b or not user_id_a or not user_id_b:
        ok_all = False

    c_noauth = ApiClient(reporter, requests.Session())
    ok_all &= c_noauth.call(
        "user.profile.unauthorized",
        "GET",
        "/api/user/profile",
        expected_http=(401,),
    )[0]

    s1 = requests.Session()
    s1.headers.update({"Authorization": f"Bearer {token_a}"})
    c1 = ApiClient(reporter, s1)

    s2 = requests.Session()
    s2.headers.update({"Authorization": f"Bearer {token_b}"})
    c2 = ApiClient(reporter, s2)

    ok_all &= c1.call(
        "user.test.hello",
        "GET",
        "/api/user/test/hello",
        expected_http=(200,),
        expected_json_subset={"message": TypeIs(str)},
    )[0]
    ok_all &= c1.call(
        "user.test.login",
        "POST",
        "/api/user/test/login",
        expected_http=(200,),
        expected_json_subset={"message": TypeIs(str)},
    )[0]

    nickname = f"用户资料_{int(time.time())}"
    email = f"u{int(time.time())}@example.com"
    ok_all &= c1.call(
        "user.profile.update",
        "PUT",
        "/api/user/profile",
        expected_http=(200,),
        expected_json_subset={"code": 200},
        json_body={"nickname": nickname, "email": email},
    )[0]

    ok_all &= c1.call(
        "user.search",
        "GET",
        "/api/user/search",
        expected_http=(200,),
        expected_json_subset={"code": 200, "data": TypeIs(list)},
        params={"type": "username", "keyword": a_user},
    )[0]

    ok_all &= c1.call(
        "user.online",
        "POST",
        "/api/user/online",
        expected_http=(200,),
        expected_json_subset={"code": 200},
    )[0]
    ok_all &= c1.call(
        "user.heartbeat",
        "POST",
        "/api/user/heartbeat",
        expected_http=(200,),
        expected_json_subset={"code": 200},
        json_body=[user_id_a, user_id_b],
    )[0]
    ok_all &= c1.call(
        "user.onlineStatus",
        "POST",
        "/api/user/online-status",
        expected_http=(200,),
        expected_json_subset={"code": 200, "data": TypeIs(dict)},
        json_body=[user_id_a, user_id_b],
    )[0]
    ok_all &= c1.call(
        "user.offline",
        "POST",
        "/api/user/offline",
        expected_http=(200,),
        expected_json_subset={"code": 200},
    )[0]

    ok_all &= c1.call(
        "friend.request.self",
        "POST",
        "/api/friend/request",
        expected_http=(200,),
        expected_json_subset={"code": 400, "message": "不能添加自己为好友"},
        json_body={"targetUserId": user_id_a, "reason": "自动化测试"},
    )[0]

    ok_all &= c1.call(
        "friend.request.target_not_exists",
        "POST",
        "/api/friend/request",
        expected_http=(200,),
        expected_json_subset={"code": 400, "message": "目标用户不存在"},
        json_body={"targetUserId": "999999999999", "reason": "自动化测试"},
    )[0]

    ok_req, _, req_payload = c1.call(
        "friend.request",
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

    ok_all &= c2.call(
        "friend.requests.list",
        "GET",
        "/api/friend/requests",
        expected_http=(200,),
        expected_json_subset={"code": 200, "data": {"content": TypeIs(list), "hasNext": TypeIs(bool)}},
        params={"limit": 10},
    )[0]

    if req_id is not None:
        ok_all &= c2.call(
            "friend.request.accept",
            "POST",
            "/api/friend/accept",
            expected_http=(200,),
            expected_json_subset={"code": 200},
            json_body={"requestId": int(req_id)},
        )[0]

    ok_all &= c1.call(
        "friend.list",
        "GET",
        "/api/friend/list",
        expected_http=(200,),
        expected_json_subset={"code": 200, "data": TypeIs(list)},
    )[0]
    ok_all &= c1.call(
        "friend.relation",
        "GET",
        "/api/friend/relation",
        expected_http=(200,),
        expected_json_subset={"code": 200},
        params={"targetUserId": user_id_b},
    )[0]
    ok_all &= c1.call(
        "friend.remark",
        "PUT",
        "/api/friend/remark",
        expected_http=(200,),
        expected_json_subset={"code": 200},
        params={"friendUserId": user_id_b, "remark": f"备注_{int(time.time())}"},
    )[0]
    ok_all &= c1.call(
        "friend.block",
        "POST",
        "/api/friend/block",
        expected_http=(200,),
        expected_json_subset={"code": 200},
        params={"targetUserId": user_id_b},
    )[0]
    ok_all &= c1.call(
        "friend.blocked.list",
        "GET",
        "/api/friend/blocked",
        expected_http=(200,),
        expected_json_subset={"code": 200, "data": TypeIs(list)},
    )[0]
    ok_all &= c1.call(
        "friend.remove",
        "DELETE",
        "/api/friend/remove",
        expected_http=(200,),
        expected_json_subset={"code": 200},
        params={"friendUserId": user_id_b},
    )[0]

    ok_all &= c1.call(
        "user.internal.exists.missing_secret",
        "GET",
        f"/api/user/internal/exists/{user_id_a}",
        expected_http=(403,),
    )[0]

    ok_all &= c1.call(
        "user.internal.exists",
        "GET",
        f"/api/user/internal/exists/{user_id_a}",
        expected_http=(200,),
        headers={"X-Internal-Secret": ctx.internal_secret},
        expected_json_subset=TypeIs(bool),
    )[0]
    ok_all &= c1.call(
        "user.internal.get",
        "GET",
        f"/api/user/internal/{user_id_a}",
        expected_http=(200,),
        headers={"X-Internal-Secret": ctx.internal_secret},
        expected_json_subset=TypeIs(dict),
    )[0]
    ok_all &= c1.call(
        "user.internal.friend.isFriend",
        "GET",
        f"/api/user/internal/friend/isFriend/{user_id_a}/{user_id_b}",
        expected_http=(200,),
        headers={"X-Internal-Secret": ctx.internal_secret},
        expected_json_subset=TypeIs(bool),
    )[0]
    ok_all &= c1.call(
        "user.internal.friend.list",
        "GET",
        f"/api/user/internal/friend/list/{user_id_a}",
        expected_http=(200,),
        headers={"X-Internal-Secret": ctx.internal_secret},
        expected_json_subset=TypeIs(list),
    )[0]

    reporter.finalize()
    return 0 if ok_all else 1


if __name__ == "__main__":
    raise SystemExit(main())
