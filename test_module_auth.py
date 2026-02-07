import io
import sys
import time

import requests

from pytestsuite import ANY, ApiClient, Reporter, RunContext, TypeIs


if sys.platform == "win32":
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")
    sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding="utf-8", errors="replace")


def main() -> int:
    ctx = RunContext.from_env("auth")
    reporter = Reporter(module="auth", base_url=ctx.base_url, run_id=ctx.run_id, root_dir=ctx.output_dir)

    bootstrap = requests.Session()
    bootstrap.headers.update({"Authorization": "Bearer bootstrap"})
    c0 = ApiClient(reporter, bootstrap)

    suffix = str(int(time.time()))
    username = f"test_auth_{suffix}"
    password = "password123"

    ok_all = True

    ok_all &= c0.call(
        f"user.register {username}",
        "POST",
        "/api/user/register",
        expected_http=(200,),
        expected_json_subset={"code": 200, "data": {"username": username}},
        json_body={"username": username, "password": password, "nickname": username},
    )[0]

    ok_all &= c0.call(
        "user.register.duplicate",
        "POST",
        "/api/user/register",
        expected_http=(400,),
        expected_json_subset={"code": 400, "message": "用户名已存在"},
        json_body={"username": username, "password": password, "nickname": username},
    )[0]

    ok_login, _, login_payload = c0.call(
        f"user.login {username}",
        "POST",
        "/api/user/login",
        expected_http=(200,),
        expected_json_subset={"success": True, "token": TypeIs(str), "refreshToken": TypeIs(str), "user": {"id": ANY}},
        json_body={"username": username, "password": password},
    )
    ok_all &= ok_login

    ok_all &= c0.call(
        "user.login.wrong_password",
        "POST",
        "/api/user/login",
        expected_http=(400,),
        expected_json_subset={"code": 400, "message": "密码错误"},
        json_body={"username": username, "password": "wrong"},
    )[0]

    token = (login_payload or {}).get("token") if isinstance(login_payload, dict) else None
    refresh_token = (login_payload or {}).get("refreshToken") if isinstance(login_payload, dict) else None
    user_id = str(((login_payload or {}).get("user") or {}).get("id")) if isinstance(login_payload, dict) else ""
    if not token or not refresh_token or not user_id:
        ok_all = False

    authed = requests.Session()
    authed.headers.update({"Authorization": f"Bearer {token}"})
    c1 = ApiClient(reporter, authed)

    ok_all &= c1.call(
        "auth.parse.valid",
        "POST",
        "/api/auth/parse",
        expected_http=(200,),
        expected_json_subset={"code": 200, "data": {"valid": True, "userId": TypeIs(int)}},
        json_body={"token": token, "allowExpired": False},
    )[0]

    ok_all &= c1.call(
        "auth.parse.invalid",
        "POST",
        "/api/auth/parse",
        expected_http=(200,),
        expected_json_subset={"code": 200, "data": {"valid": False, "error": "token无效"}},
        json_body={"token": "invalid", "allowExpired": False},
    )[0]

    ok_all &= c1.call(
        "auth.refresh.valid",
        "POST",
        "/api/auth/refresh",
        expected_http=(200,),
        expected_json_subset={"code": 200, "data": {"accessToken": TypeIs(str)}},
        json_body={"refreshToken": refresh_token},
    )[0]

    ok_all &= c0.call(
        "auth.refresh.invalid",
        "POST",
        "/api/auth/refresh",
        expected_http=(403,),
        expected_json_subset={"code": 403, "message": "token无效"},
        json_body={"refreshToken": "invalid"},
    )[0]

    ok_all &= c0.call(
        "auth.internal.issueToken.missing_secret",
        "POST",
        "/api/auth/internal/token",
        expected_http=(403,),
        json_body={"userId": 1, "username": "u", "nickname": "u"},
    )[0]

    ok_issue, _, token_pair = c1.call(
        "auth.internal.issueToken",
        "POST",
        "/api/auth/internal/token",
        expected_http=(200,),
        expected_json_subset={"accessToken": TypeIs(str), "refreshToken": TypeIs(str)},
        headers={"X-Internal-Secret": ctx.internal_secret},
        json_body={"userId": int(user_id), "username": username, "nickname": username},
    )
    ok_all &= ok_issue

    ok_all &= c1.call(
        "auth.internal.userResource",
        "GET",
        f"/api/auth/internal/user-resource/{user_id}",
        expected_http=(200,),
        expected_json_subset={"userId": int(user_id)},
        headers={"X-Internal-Secret": ctx.internal_secret},
    )[0]

    ok_all &= c1.call(
        "auth.internal.validateToken",
        "POST",
        "/api/auth/internal/validate-token",
        expected_http=(200,),
        expected_json_subset={"valid": True},
        headers={"X-Internal-Secret": ctx.internal_secret, "Content-Type": "text/plain"},
        data=token,
        allow_empty_body=False,
    )[0]

    ok_all &= c1.call(
        "auth.internal.checkPermission",
        "POST",
        "/api/auth/internal/check-permission",
        expected_http=(200,),
        expected_json_subset={"granted": TypeIs(bool)},
        headers={"X-Internal-Secret": ctx.internal_secret},
        json_body={"userId": int(user_id), "permission": "user:read", "resource": "profile", "action": "read"},
    )[0]

    if ok_issue and isinstance(token_pair, dict):
        ok_all &= c1.call(
            "auth.internal.revokeToken",
            "POST",
            "/api/auth/internal/revoke-token",
            expected_http=(200,),
            expected_json_subset={"success": True},
            headers={"X-Internal-Secret": ctx.internal_secret},
            json_body={"token": token_pair.get("accessToken"), "reason": "自动化测试"},
        )[0]

    ok_all &= c1.call(
        "auth.internal.revokeUserTokens",
        "POST",
        f"/api/auth/internal/revoke-user-tokens/{user_id}",
        expected_http=(200, 204),
        headers={"X-Internal-Secret": ctx.internal_secret},
    )[0]

    reporter.finalize()
    return 0 if ok_all else 1


if __name__ == "__main__":
    raise SystemExit(main())
