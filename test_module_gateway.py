import io
import sys

import requests

from pytestsuite import ApiClient, Reporter, RunContext


if sys.platform == "win32":
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")
    sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding="utf-8", errors="replace")


def main() -> int:
    ctx = RunContext.from_env("gateway")
    reporter = Reporter(module="gateway", base_url=ctx.base_url, run_id=ctx.run_id, root_dir=ctx.output_dir)
    s = requests.Session()
    s.headers.update({"Authorization": "Bearer bootstrap"})
    client = ApiClient(reporter, s)

    ok_all = True
    ok_all &= client.call(
        "gateway.health",
        "GET",
        "/actuator/health",
        expected_http=(200,),
        expected_json_subset={"status": "UP"},
    )[0]
    ok_all &= client.call(
        "gateway.info",
        "GET",
        "/actuator/info",
        expected_http=(200, 404),
    )[0]
    ok_all &= client.call(
        "gateway.route_header.required",
        "POST",
        "/api/user/login",
        expected_http=(400,),
        json_body={"username": "gw_test_user", "password": "gw_test_pass"},
        headers={"X-Gateway-Route": "", "X-Trace-Id": "gw-test-missing-route"},
        expected_response_headers={"X-Trace-Id": "gw-test-missing-route"},
    )[0]
    ok_all &= client.call(
        "gateway.trace_id.echo",
        "POST",
        "/api/user/login",
        expected_http=(400,),
        json_body={"username": "gw_test_user", "password": "gw_test_pass"},
        headers={"X-Gateway-Route": "true", "X-Trace-Id": "gw-test-echo"},
        expected_response_headers={"X-Trace-Id": "gw-test-echo"},
    )[0]
    ok_all &= client.call(
        "gateway.notfound",
        "GET",
        "/__not_exists__",
        expected_http=(404,),
    )[0]

    reporter.finalize()
    return 0 if ok_all else 1


if __name__ == "__main__":
    raise SystemExit(main())
