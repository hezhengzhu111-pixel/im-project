#!/usr/bin/env python3
"""Prepare the SIT MySQL container for host-side integration tests."""

from __future__ import annotations

import os
import subprocess
import sys
import time
from pathlib import Path


ROOT = Path(__file__).resolve().parent.parent.parent
RUNTIME_COMPOSE = ROOT / "build" / "runtime" / "compose" / "docker-compose.generated.yml"


def run(cmd: list[str], *, env: dict[str, str]) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        cmd,
        cwd=str(ROOT),
        env={**os.environ, **env},
        text=True,
        capture_output=True,
        encoding="utf-8",
        errors="replace",
    )


def mysql_quote(value: str) -> str:
    return value.replace("\\", "\\\\").replace("'", "''")


def main() -> int:
    mysql_root_password = os.environ.get("MYSQL_ROOT_PASSWORD")
    if not mysql_root_password:
        sys.stderr.write("MYSQL_ROOT_PASSWORD environment variable is not set\n")
        return 1
    env = {
        "COMPOSE_PROJECT_NAME": os.environ.get("COMPOSE_PROJECT_NAME", "im-main-full-gate"),
        "MYSQL_ROOT_PASSWORD": mysql_root_password,
    }
    password = env["MYSQL_ROOT_PASSWORD"]
    ps = run(["docker", "compose", "-f", str(RUNTIME_COMPOSE), "ps", "-q", "im-mysql"], env=env)
    container_id = ps.stdout.strip()
    if ps.returncode != 0 or not container_id:
        sys.stderr.write("im-mysql container is not running for runtime compose\n")
        if ps.stderr:
            sys.stderr.write(ps.stderr)
        return 1

    escaped_password = mysql_quote(password)
    grants = ["%", "172.16.0.1", "172.17.0.1", "172.18.0.1", "172.19.0.1", "172.20.0.1", "172.21.0.1"]
    statements: list[str] = []
    for host in grants:
        statements.extend(
            [
                f"CREATE USER IF NOT EXISTS 'root'@'{host}' IDENTIFIED WITH mysql_native_password BY '{escaped_password}'",
                f"ALTER USER 'root'@'{host}' IDENTIFIED WITH mysql_native_password BY '{escaped_password}'",
                f"GRANT ALL PRIVILEGES ON *.* TO 'root'@'{host}' WITH GRANT OPTION",
            ]
        )
    sql = "; ".join(statements + ["FLUSH PRIVILEGES"]) + ";"
    exec_env = {**env, "MYSQL_PWD": password}
    cmd = [
        "docker",
        "exec",
        "-e",
        "MYSQL_PWD",
        container_id,
        "mysql",
        "-uroot",
        "--default-character-set=utf8mb4",
        "-e",
        sql,
    ]
    for attempt in range(1, 31):
        result = run(cmd, env=exec_env)
        if result.returncode == 0:
            print("SIT MySQL remote root grant is ready")
            return 0
        if attempt == 30:
            sys.stderr.write("failed to prepare SIT MySQL remote root grant\n")
            if result.stderr:
                sys.stderr.write(result.stderr)
            return result.returncode
        time.sleep(2)
    return 1


if __name__ == "__main__":
    raise SystemExit(main())
