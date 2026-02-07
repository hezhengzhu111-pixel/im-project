import io
import sys
import time

import requests

from pytestsuite import ANY, ApiClient, Reporter, RunContext, TypeIs


if sys.platform == "win32":
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")
    sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding="utf-8", errors="replace")


def main() -> int:
    ctx = RunContext.from_env("group")
    reporter = Reporter(module="group", base_url=ctx.base_url, run_id=ctx.run_id, root_dir=ctx.output_dir)

    bootstrap = requests.Session()
    bootstrap.headers.update({"Authorization": "Bearer bootstrap"})
    c0 = ApiClient(reporter, bootstrap)

    suffix = str(int(time.time()))
    owner_u = f"test_group_{suffix}_owner"
    member_u = f"test_group_{suffix}_member"
    password = "password123"

    ok_all = True

    ok_all &= c0.call(
        f"user.register {owner_u}",
        "POST",
        "/api/user/register",
        expected_http=(200,),
        expected_json_subset={"code": 200, "data": {"username": owner_u}},
        json_body={"username": owner_u, "password": password, "nickname": owner_u},
    )[0]

    ok_owner_login, _, owner_login = c0.call(
        f"user.login {owner_u}",
        "POST",
        "/api/user/login",
        expected_http=(200,),
        expected_json_subset={"success": True, "token": TypeIs(str), "user": {"id": ANY}},
        json_body={"username": owner_u, "password": password},
    )
    ok_all &= ok_owner_login

    c0.call(
        f"user.register {member_u}",
        "POST",
        "/api/user/register",
        expected_http=(200,),
        expected_json_subset={"code": 200, "data": {"username": member_u}},
        json_body={"username": member_u, "password": password, "nickname": member_u},
    )
    ok_member_login, _, member_login = c0.call(
        f"user.login {member_u}",
        "POST",
        "/api/user/login",
        expected_http=(200,),
        expected_json_subset={"success": True, "token": TypeIs(str), "user": {"id": ANY}},
        json_body={"username": member_u, "password": password},
    )
    ok_all &= ok_member_login

    owner_token = (owner_login or {}).get("token") if isinstance(owner_login, dict) else None
    owner_id = str(((owner_login or {}).get("user") or {}).get("id")) if isinstance(owner_login, dict) else None
    member_token = (member_login or {}).get("token") if isinstance(member_login, dict) else None
    member_id = str(((member_login or {}).get("user") or {}).get("id")) if isinstance(member_login, dict) else None
    if not owner_token or not owner_id or not member_token or not member_id:
        ok_all = False

    s_owner = requests.Session()
    s_owner.headers.update({"Authorization": f"Bearer {owner_token}"})
    s_member = requests.Session()
    s_member.headers.update({"Authorization": f"Bearer {member_token}"})
    c_owner = ApiClient(reporter, s_owner)
    c_member = ApiClient(reporter, s_member)

    group_name = f"测试群组_{int(time.time())}"
    ok_create, _, create_payload = c_owner.call(
        "group.create",
        "POST",
        "/api/group/create",
        expected_http=(200,),
        expected_json_subset={"code": 200, "data": TypeIs(dict)},
        json_body={"name": group_name, "type": 1, "announcement": "自动化测试创建群组"},
    )
    ok_all &= ok_create
    group_id = None
    if isinstance(create_payload, dict):
        group_id = ((create_payload.get("data") or {}).get("id"))
    if group_id is None:
        ok_all = False
        reporter.finalize()
        return 1

    ok_all &= c_owner.call(
        "group.internal.exists.missing_secret",
        "GET",
        f"/api/group/internal/exists/{group_id}",
        expected_http=(403,),
    )[0]

    ok_all &= c_owner.call(
        "group.internal.exists",
        "GET",
        f"/api/group/internal/exists/{group_id}",
        expected_http=(200,),
        headers={"X-Internal-Secret": ctx.internal_secret},
        expected_json_subset=TypeIs(bool),
    )[0]
    ok_all &= c_owner.call(
        "group.internal.listUserGroups",
        "GET",
        f"/api/group/internal/list/{owner_id}",
        expected_http=(200,),
        headers={"X-Internal-Secret": ctx.internal_secret},
        expected_json_subset=TypeIs(list),
    )[0]
    ok_all &= c_owner.call(
        "group.internal.isMember",
        "GET",
        f"/api/group/internal/isMember/{group_id}/{owner_id}",
        expected_http=(200,),
        headers={"X-Internal-Secret": ctx.internal_secret},
        expected_json_subset=TypeIs(bool),
    )[0]
    ok_all &= c_owner.call(
        "group.internal.memberIds",
        "GET",
        f"/api/group/internal/memberIds/{group_id}",
        expected_http=(200,),
        headers={"X-Internal-Secret": ctx.internal_secret},
        expected_json_subset=TypeIs(list),
    )[0]

    ok_all &= c_owner.call(
        "group.info",
        "GET",
        f"/api/group/{group_id}/info",
        expected_http=(200,),
        expected_json_subset={"code": 200},
    )[0]

    ok_all &= c_owner.call(
        "group.update",
        "PUT",
        f"/api/group/{group_id}",
        expected_http=(200,),
        expected_json_subset={"code": 200},
        json_body={"groupId": int(group_id), "operatorId": int(owner_id), "groupName": f"群名_{int(time.time())}", "description": "自动化测试更新公告"},
    )[0]

    ok_all &= c_owner.call(
        "group.userGroups",
        "GET",
        f"/api/group/user/{owner_id}",
        expected_http=(200,),
        expected_json_subset={"code": 200, "data": TypeIs(list)},
    )[0]

    ok_all &= c_owner.call(
        "group.members.add",
        "POST",
        f"/api/group/{group_id}/members",
        expected_http=(200,),
        expected_json_subset={"code": 200},
        json_body={"groupId": int(group_id), "operatorId": int(owner_id), "memberIds": [int(member_id)]},
    )[0]

    ok_all &= c_owner.call(
        "group.members.list",
        "POST",
        "/api/group/members/list",
        expected_http=(200,),
        expected_json_subset={"code": 200, "data": TypeIs(dict)},
        json_body={"groupId": int(group_id), "cursor": None, "limit": 20},
    )[0]

    ok_all &= c_member.call(
        "group.leave",
        "POST",
        f"/api/group/{group_id}/leave",
        expected_http=(200,),
        expected_json_subset={"code": 200},
    )[0]
    ok_all &= c_member.call(
        "group.join",
        "POST",
        f"/api/group/{group_id}/join",
        expected_http=(200,),
        expected_json_subset={"code": 200},
    )[0]

    ok_all &= c_owner.call(
        "group.setAdmin.True",
        "PUT",
        f"/api/group/{group_id}/admin",
        expected_http=(200,),
        expected_json_subset={"code": 200},
        json_body={"groupId": int(group_id), "operatorId": int(owner_id), "userId": int(member_id), "isAdmin": True},
    )[0]

    ok_all &= c_owner.call(
        "group.userRole",
        "POST",
        "/api/group/role/get",
        expected_http=(200,),
        expected_json_subset={"code": 200},
        json_body={"groupId": int(group_id), "userId": int(member_id)},
    )[0]

    ok_all &= c_owner.call(
        "group.setAdmin.False",
        "PUT",
        f"/api/group/{group_id}/admin",
        expected_http=(200,),
        expected_json_subset={"code": 200},
        json_body={"groupId": int(group_id), "operatorId": int(owner_id), "userId": int(member_id), "isAdmin": False},
    )[0]

    ok_all &= c_owner.call(
        "group.member.remove",
        "DELETE",
        f"/api/group/{group_id}/members/{member_id}",
        expected_http=(200,),
        expected_json_subset={"code": 200},
    )[0]

    ok_all &= c_owner.call(
        "group.dismiss",
        "DELETE",
        f"/api/group/{group_id}",
        expected_http=(200,),
        expected_json_subset={"code": 200},
    )[0]

    reporter.finalize()
    return 0 if ok_all else 1


if __name__ == "__main__":
    raise SystemExit(main())
