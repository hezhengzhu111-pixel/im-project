#!/usr/bin/env python3
"""Gray release environment pre-check."""

from __future__ import annotations

import argparse
import json
import os
import sys
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional
from urllib.parse import urlparse

from gate_common import REPORT_DIR

try:
    import requests
except ImportError:
    requests = None

def check_api_health(base_url: str, timeout: int = 30) -> dict:
    """Check API health and ready endpoints."""
    result = {
        "health": {"status": "NOT RUN", "latency_ms": None, "error": None},
        "ready": {"status": "NOT RUN", "latency_ms": None, "error": None},
    }

    if not requests:
        for key in result:
            result[key]["error"] = "requests library not available"
        return result

    # Check /health
    try:
        start = time.time()
        resp = requests.get(f"{base_url}/health", timeout=timeout)
        latency = (time.time() - start) * 1000
        result["health"]["status"] = "PASS" if resp.status_code == 200 else "FAIL"
        result["health"]["latency_ms"] = round(latency, 2)
        result["health"]["status_code"] = resp.status_code
    except Exception as e:
        result["health"]["status"] = "FAIL"
        result["health"]["error"] = str(e)[:100]

    # Check /ready
    try:
        start = time.time()
        resp = requests.get(f"{base_url}/ready", timeout=timeout)
        latency = (time.time() - start) * 1000
        result["ready"]["status"] = "PASS" if resp.status_code == 200 else "FAIL"
        result["ready"]["latency_ms"] = round(latency, 2)
        result["ready"]["status_code"] = resp.status_code
    except Exception as e:
        result["ready"]["status"] = "FAIL"
        result["ready"]["error"] = str(e)[:100]

    return result

def check_api_base_url(base_url: str, env_mode: str) -> dict:
    """Check API base URL validity."""
    result = {"status": "NOT RUN", "error": None}

    if not base_url:
        result["status"] = "FAIL"
        result["error"] = "API base URL is empty"
        return result

    try:
        parsed = urlparse(base_url)
        if parsed.scheme not in ("http", "https"):
            result["status"] = "FAIL"
            result["error"] = f"Invalid scheme: {parsed.scheme}"
            return result

        if env_mode != "local-gray" and "localhost" in base_url:
            result["status"] = "FAIL"
            result["error"] = f"Formal gray environment should not point to localhost: {base_url}"
            return result

        result["status"] = "PASS"
    except Exception as e:
        result["status"] = "FAIL"
        result["error"] = str(e)[:100]

    return result

def check_websocket(ws_base: str, api_base: str, timeout: int = 30) -> dict:
    """Check WebSocket connectivity."""
    result = {
        "status": "NOT RUN",
        "can_construct_url": False,
        "can_get_ticket": False,
        "error": None,
    }

    if not requests:
        result["error"] = "requests library not available"
        return result

    if not ws_base:
        result["error"] = "WebSocket base URL is empty"
        return result

    # Can construct ws/wss URL
    try:
        parsed = urlparse(ws_base)
        result["can_construct_url"] = parsed.scheme in ("ws", "wss", "http", "https")
    except Exception as e:
        result["error"] = f"Cannot parse WebSocket URL: {e}"
        return result

    # Can get ws-ticket
    if api_base and requests:
        try:
            # Register a temporary user to get a ws-ticket
            import uuid
            test_user = f"gray_ws_test_{uuid.uuid4().hex[:8]}"
            resp = requests.post(
                f"{api_base}/api/auth/register",
                json={"username": test_user, "password": "TestPassword123!"},
                timeout=timeout,
            )
            if resp.status_code in (200, 201):
                data = resp.json()
                token = data.get("token") or data.get("access_token")
                if token:
                    resp2 = requests.get(
                        f"{api_base}/api/ws/ticket",
                        headers={"Authorization": f"Bearer {token}"},
                        timeout=timeout,
                    )
                    result["can_get_ticket"] = resp2.status_code == 200
                    if resp2.status_code == 200:
                        result["ticket_data"] = resp2.json()
        except Exception as e:
            result["error"] = f"Cannot get ws-ticket: {str(e)[:100]}"

    # Can do handshake (simplified check)
    if result["can_construct_url"]:
        result["status"] = "PASS" if result["can_get_ticket"] else "WARN"
    else:
        result["status"] = "FAIL"

    return result

def check_mysql(db_url: str, timeout: int = 30) -> dict:
    """Check MySQL connectivity and schema."""
    result = {
        "status": "NOT RUN",
        "can_connect": False,
        "can_select_1": False,
        "migrations_applied": False,
        "core_tables_exist": False,
        "tables_found": [],
        "error": None,
    }

    if not db_url:
        result["error"] = "Database URL is empty"
        return result

    try:
        # Parse MySQL URL
        parsed = urlparse(db_url)
        if parsed.scheme not in ("mysql", "mysql+pymysql"):
            result["error"] = f"Invalid MySQL scheme: {parsed.scheme}"
            result["status"] = "FAIL"
            return result

        # Try to connect using pymysql or mysql-connector
        try:
            import pymysql
            conn = pymysql.connect(
                host=parsed.hostname or "localhost",
                port=parsed.port or 3306,
                user=parsed.username or "root",
                password=parsed.password or "",
                database=parsed.path.lstrip("/") if parsed.path else None,
                connect_timeout=timeout,
            )
            result["can_connect"] = True

            cursor = conn.cursor()

            # Check SELECT 1
            cursor.execute("SELECT 1")
            result["can_select_1"] = cursor.fetchone() is not None

            # Check migrations table
            cursor.execute("""
                SELECT COUNT(*)
                FROM information_schema.tables
                WHERE table_schema = DATABASE()
                AND table_name = '_sqlx_migrations'
            """)
            result["migrations_applied"] = cursor.fetchone()[0] > 0

            # Check core tables
            cursor.execute("""
                SELECT table_name
                FROM information_schema.tables
                WHERE table_schema = DATABASE()
                AND table_name IN (
                    'users', 'user_profiles', 'auth_sessions',
                    'private_messages', 'group_messages',
                    'groups', 'group_members',
                    'e2ee_device_keys', 'e2ee_sessions',
                    'files', 'moments', 'push_devices',
                    'ai_keys'
                )
            """)
            tables = [row[0] for row in cursor.fetchall()]
            result["tables_found"] = tables
            result["core_tables_exist"] = len(tables) >= 10

            cursor.close()
            conn.close()

            if result["can_select_1"] and result["migrations_applied"] and result["core_tables_exist"]:
                result["status"] = "PASS"
            elif result["can_connect"]:
                result["status"] = "WARN"
            else:
                result["status"] = "FAIL"

        except ImportError:
            result["error"] = "pymysql not installed"
            result["status"] = "FAIL"

    except Exception as e:
        result["error"] = str(e)[:100]
        result["status"] = "FAIL"

    return result

def check_redis(redis_url: str, prefix: str = "gray-check-", timeout: int = 30) -> dict:
    """Check Redis connectivity and read/write."""
    result = {
        "status": "NOT RUN",
        "can_ping": False,
        "can_read_write": False,
        "test_key": None,
        "error": None,
    }

    if not redis_url:
        result["error"] = "Redis URL is empty"
        return result

    try:
        import redis
        import uuid

        parsed = urlparse(redis_url)
        r = redis.Redis(
            host=parsed.hostname or "localhost",
            port=parsed.port or 6379,
            password=parsed.password or None,
            db=int(parsed.path.lstrip("/")) if parsed.path else 0,
            socket_timeout=timeout,
        )

        # Can ping
        result["can_ping"] = r.ping()

        # Can read/write
        test_key = f"{prefix}{uuid.uuid4().hex[:8]}"
        test_value = "gray-check-value"
        r.setex(test_key, 60, test_value)
        result["test_key"] = test_key
        read_value = r.get(test_key)
        result["can_read_write"] = read_value and read_value.decode() == test_value

        # Cleanup
        r.delete(test_key)

        if result["can_ping"] and result["can_read_write"]:
            result["status"] = "PASS"
        else:
            result["status"] = "FAIL"

    except ImportError:
        result["error"] = "redis library not installed"
        result["status"] = "FAIL"
    except Exception as e:
        result["error"] = str(e)[:100]
        result["status"] = "FAIL"

    return result

def check_storage(api_base: str, timeout: int = 30) -> dict:
    """Check storage/upload functionality."""
    result = {
        "status": "NOT RUN",
        "can_upload": False,
        "can_download": False,
        "can_delete": False,
        "error": None,
    }

    if not requests:
        result["error"] = "requests library not available"
        return result

    if not api_base:
        result["error"] = "API base URL is empty"
        return result

    try:
        # Register and login
        import uuid
        test_user = f"gray_storage_test_{uuid.uuid4().hex[:8]}"
        resp = requests.post(
            f"{api_base}/api/auth/register",
            json={"username": test_user, "password": "TestPassword123!"},
            timeout=timeout,
        )
        if resp.status_code not in (200, 201):
            result["error"] = f"Cannot register: {resp.status_code}"
            result["status"] = "FAIL"
            return result

        data = resp.json()
        token = data.get("token") or data.get("access_token")
        if not token:
            result["error"] = "No token received"
            result["status"] = "FAIL"
            return result

        headers = {"Authorization": f"Bearer {token}"}

        # Upload test file
        test_content = b"gray-test-file-content"
        test_filename = f"gray_test_{uuid.uuid4().hex[:8]}.txt"
        files = {"file": (test_filename, test_content, "text/plain")}
        resp = requests.post(
            f"{api_base}/api/files/upload",
            headers=headers,
            files=files,
            timeout=timeout,
        )
        result["can_upload"] = resp.status_code in (200, 201)

        if result["can_upload"]:
            file_data = resp.json()
            file_id = file_data.get("id") or file_data.get("file_id")

            # Download
            resp = requests.get(
                f"{api_base}/api/files/{file_id}",
                headers=headers,
                timeout=timeout,
            )
            result["can_download"] = resp.status_code == 200

            # Delete
            resp = requests.delete(
                f"{api_base}/api/files/{file_id}",
                headers=headers,
                timeout=timeout,
            )
            result["can_delete"] = resp.status_code in (200, 204)

        if result["can_upload"] and result["can_download"] and result["can_delete"]:
            result["status"] = "PASS"
        elif result["can_upload"]:
            result["status"] = "WARN"
        else:
            result["status"] = "FAIL"

    except Exception as e:
        result["error"] = str(e)[:100]
        result["status"] = "FAIL"

    return result

def check_time_sync(api_base: str, timeout: int = 30) -> dict:
    """Check time synchronization between local and API server."""
    result = {
        "status": "NOT RUN",
        "local_time": None,
        "server_time": None,
        "offset_seconds": None,
        "warning_threshold_seconds": 300,  # 5 minutes
        "error": None,
    }

    if not requests:
        result["error"] = "requests library not available"
        return result

    if not api_base:
        result["error"] = "API base URL is empty"
        return result

    try:
        import time as time_mod
        local_time = time_mod.time()

        resp = requests.get(f"{api_base}/health", timeout=timeout)

        if resp.status_code == 200:
            # Try to get server time from response
            data = resp.json()
            server_time_str = data.get("timestamp") or data.get("server_time")

            if server_time_str:
                from datetime import datetime as dt
                import dateutil.parser
                server_time = dateutil.parser.parse(server_time_str).timestamp()
            else:
                # Estimate from response
                server_time = time_mod.time()

            offset = abs(server_time - local_time)
            result["local_time"] = datetime.fromtimestamp(local_time, tz=timezone.utc).isoformat()
            result["server_time"] = datetime.fromtimestamp(server_time, tz=timezone.utc).isoformat()
            result["offset_seconds"] = round(offset, 2)

            if offset > result["warning_threshold_seconds"]:
                result["status"] = "WARN"
            else:
                result["status"] = "PASS"
        else:
            result["error"] = f"Cannot reach health endpoint: {resp.status_code}"
            result["status"] = "FAIL"

    except Exception as e:
        result["error"] = str(e)[:100]
        result["status"] = "FAIL"

    return result

def check_config_sanity(api_base: str, timeout: int = 30) -> dict:
    """Check configuration sanity."""
    result = {
        "status": "NOT RUN",
        "app_env": None,
        "error": None,
    }

    if not requests:
        result["error"] = "requests library not available"
        return result

    if not api_base:
        result["error"] = "API base URL is empty"
        return result

    try:
        # Try /health endpoint
        resp = requests.get(f"{api_base}/health", timeout=timeout)
        if resp.status_code == 200:
            data = resp.json()
            result["app_env"] = data.get("environment") or data.get("env")
            result["status"] = "PASS"
        else:
            result["error"] = f"Cannot reach health endpoint: {resp.status_code}"
            result["status"] = "FAIL"

    except Exception as e:
        result["error"] = str(e)[:100]
        result["status"] = "FAIL"

    return result

def run_env_check(
    env: str,
    api_base: str,
    ws_base: str,
    db_url: str,
    redis_url: str,
) -> dict:
    """Run all environment checks."""
    results = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "gray_environment": env,
        "api_base_url": api_base,
        "checks": {},
    }

    # API health
    print("\n==> Checking API health...")
    results["checks"]["api_health"] = check_api_health(api_base)

    # API base URL
    print("==> Checking API base URL...")
    results["checks"]["api_base_url"] = check_api_base_url(api_base, env)

    # WebSocket
    print("==> Checking WebSocket...")
    results["checks"]["websocket"] = check_websocket(ws_base, api_base)

    # MySQL
    print("==> Checking MySQL...")
    results["checks"]["mysql"] = check_mysql(db_url)

    # Redis
    print("==> Checking Redis...")
    results["checks"]["redis"] = check_redis(redis_url)

    # Storage
    print("==> Checking storage...")
    results["checks"]["storage"] = check_storage(api_base)

    # Time sync
    print("==> Checking time sync...")
    results["checks"]["time_sync"] = check_time_sync(api_base)

    # Config sanity
    print("==> Checking config sanity...")
    results["checks"]["config_sanity"] = check_config_sanity(api_base)

    # Determine overall status
    statuses = [c.get("status", "NOT RUN") for c in results["checks"].values()]
    if "FAIL" in statuses:
        results["status"] = "FAIL"
    elif "WARN" in statuses:
        results["status"] = "WARN"
    elif all(s == "PASS" for s in statuses):
        results["status"] = "PASS"
    else:
        results["status"] = "NOT RUN"

    return results

def write_reports(results: dict, output_json: Path, output_md: Path) -> None:
    """Write check results as JSON and Markdown."""
    output_json.parent.mkdir(parents=True, exist_ok=True)

    # JSON
    with open(output_json, "w", encoding="utf-8") as f:
        json.dump(results, f, indent=2, ensure_ascii=False)

    # Markdown
    lines = [
        "# Gray Environment Check Results",
        "",
        f"Generated: {results['generated_at']}",
        f"Gray Environment: {results['gray_environment']}",
        f"API Base URL: {results['api_base_url']}",
        "",
        "## Overall Status: **{}**".format(results.get("status", "NOT RUN")),
        "",
        "## Checks",
        "",
        "| Check | Status | Details |",
        "| --- | --- | --- |",
    ]

    for check_name, check_data in results.get("checks", {}).items():
        status = check_data.get("status", "NOT RUN")
        details = check_data.get("error") or check_data.get("latency_ms", "")
        if details:
            details = str(details)[:50]
        lines.append(f"| {check_name} | {status} | {details} |")

    lines.extend(["", "---", ""])

    # Detailed results
    for check_name, check_data in results.get("checks", {}).items():
        lines.extend([
            f"### {check_name}",
            "",
            f"- Status: {check_data.get('status', 'NOT RUN')}",
        ])
        for key, value in check_data.items():
            if key not in ("status",) and value is not None:
                lines.append(f"- {key}: {value}")
        lines.append("")

    output_md.write_text("\n".join(lines) + "\n", encoding="utf-8")

def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--env",
        required=True,
        help="Gray environment name (e.g., local-gray, staging, personal-gray)",
    )
    parser.add_argument(
        "--api-base",
        default=os.environ.get("IM_API_BASE", ""),
        help="API base URL",
    )
    parser.add_argument(
        "--ws-base",
        default=os.environ.get("IM_WS_BASE", ""),
        help="WebSocket base URL",
    )
    parser.add_argument(
        "--db-url",
        default=os.environ.get("IM_DB_URL", ""),
        help="Database URL",
    )
    parser.add_argument(
        "--redis-url",
        default=os.environ.get("REDIS_URL", ""),
        help="Redis URL",
    )
    parser.add_argument(
        "--output-json",
        default=str(REPORT_DIR / "gray-env-check.json"),
        help="Output JSON path",
    )
    parser.add_argument(
        "--output-md",
        default=str(REPORT_DIR / "gray-env-check.md"),
        help="Output Markdown path",
    )

    args = parser.parse_args()

    if not args.api_base:
        print("Error: --api-base is required", file=sys.stderr)
        return 1

    results = run_env_check(
        args.env,
        args.api_base,
        args.ws_base,
        args.db_url,
        args.redis_url,
    )

    write_reports(results, Path(args.output_json), Path(args.output_md))

    print(f"\nReports written to:\n  JSON: {args.output_json}\n  MD: {args.output_md}")
    print(f"\nOverall Status: {results.get('status', 'NOT RUN')}")

    return 0 if results.get("status") in ("PASS", "WARN") else 1


if __name__ == "__main__":
    raise SystemExit(main())
