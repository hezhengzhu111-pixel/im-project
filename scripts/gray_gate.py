#!/usr/bin/env python3
"""Layered PR/Main/Gray release gates."""

from __future__ import annotations

import argparse
import os
import shutil
import sys
from pathlib import Path

from gate_common import ROOT, run_step, skip_step, write_gate_reports


PYTHON = sys.executable
RUST_ROOT = ROOT / "rust"
FLUTTER_ROOT = ROOT / "flutter"
RUST_PACKAGES = [
    ("api-server", "apps/api-server"),
    ("im-server", "apps/im-server"),
    ("im-common", "crates/im-common"),
    ("im-e2ee-core", "crates/im-e2ee-core"),
    ("im-e2ee-ffi", "crates/im-e2ee-ffi"),
    ("im-flutter-bridge", "crates/im-flutter-bridge"),
    ("im-e2ee-wasm", "crates/im-e2ee-wasm"),
]
FLUTTER_TARGETS = [
    ("core", "packages/core"),
    ("core_flutter", "packages/core_flutter"),
    ("shared_features", "packages/shared_features"),
    ("web", "apps/web"),
    ("mobile", "apps/mobile"),
    ("desktop", "apps/desktop"),
]


def rust_fast() -> list:
    results = [
        run_step("Rust fmt", ["cargo", "fmt", "--check"], cwd=RUST_ROOT, timeout=300),
        run_step("Rust check", ["cargo", "check", "--workspace"], cwd=RUST_ROOT, timeout=900),
        run_step("Rust unit tests", ["cargo", "test", "--workspace"], cwd=RUST_ROOT, timeout=1200),
    ]
    for package, rel in RUST_PACKAGES:
        package_path = RUST_ROOT / rel
        if not package_path.exists():
            results.append(skip_step(f"Rust clippy {package}", f"missing package path {package_path}", critical=True))
            continue
        results.append(
            run_step(
                f"Rust clippy {package}",
                ["cargo", "clippy", "-p", package, "--all-targets", "--", "-D", "warnings"],
                cwd=RUST_ROOT,
                timeout=900,
            )
        )
    return results


def flutter_fast() -> list:
    results = []
    for name, rel in FLUTTER_TARGETS:
        target = FLUTTER_ROOT / rel
        if not target.exists():
            results.append(skip_step(f"Flutter {name}", f"missing target path {target}", critical=True))
            continue
        results.extend(
            [
                run_step(f"Flutter pub get {name}", ["flutter", "pub", "get"], cwd=target, timeout=600),
                run_step(f"Flutter analyze {name}", ["flutter", "analyze"], cwd=target, timeout=600),
                run_step(f"Flutter test {name}", ["flutter", "test"], cwd=target, timeout=1200),
            ]
        )
    return results


def manifest_fast() -> list:
    return [
        run_step(
            "Manifest completeness",
            [PYTHON, str(ROOT / "scripts" / "check_test_manifest.py")],
            cwd=ROOT,
            timeout=300,
        ),
        run_step(
            "Known failures policy",
            [PYTHON, str(ROOT / "scripts" / "check_known_failures.py")],
            cwd=ROOT,
            timeout=120,
        ),
    ]


def main_full_dependency_env() -> dict[str, str]:
    mysql_port = os.environ.get("IM_MAIN_FULL_MYSQL_PORT", "13306")
    redis_port = os.environ.get("IM_MAIN_FULL_REDIS_PORT", "16379")
    mysql_password = os.environ.get("MYSQL_ROOT_PASSWORD", "root123")
    redis_password = os.environ.get("REDIS_PASSWORD", "root123")
    mysql_url = f"mysql://root:{mysql_password}@127.0.0.1:{mysql_port}/service_message_service_db"
    redis_url = f"redis://:{redis_password}@127.0.0.1:{redis_port}/0"
    return {
        "COMPOSE_PROJECT_NAME": os.environ.get("IM_MAIN_FULL_COMPOSE_PROJECT", "im-main-full-gate"),
        "MYSQL_PORT": mysql_port,
        "REDIS_PORT": redis_port,
        "MYSQL_ROOT_PASSWORD": mysql_password,
        "REDIS_PASSWORD": redis_password,
        "DATABASE_URL": mysql_url,
        "MYSQL_URL": mysql_url,
        "REDIS_URL": redis_url,
        "IM_CACHE_REDIS_URL": redis_url,
        "IM_HOT_REDIS_URL": redis_url,
        "IM_PRIVATE_HOT_REDIS_URL": redis_url,
        "IM_PRIVATE_HOT_REDIS_URLS": redis_url,
        "IM_GROUP_HOT_REDIS_URL": redis_url,
        "IM_GROUP_HOT_REDIS_URLS": redis_url,
        "IM_PRIVATE_EVENT_REDIS_URL": redis_url,
        "IM_GROUP_EVENT_REDIS_URL": redis_url,
        "IM_ROUTE_REDIS_URL": redis_url,
    }


def gray_release_env(base_url: str, db_url: str) -> dict[str, str]:
    mysql_port = os.environ.get("IM_GRAY_MYSQL_PORT", "13307")
    redis_port = os.environ.get("IM_GRAY_REDIS_PORT", "16380")
    api_port = os.environ.get("IM_GRAY_API_PORT", "18082")
    mysql_password = os.environ.get("IM_GRAY_MYSQL_ROOT_PASSWORD", "root123")
    redis_password = os.environ.get("IM_GRAY_REDIS_PASSWORD", "root123")
    internal_secret = os.environ.get(
        "IM_GRAY_INTERNAL_SECRET",
        "im-internal-secret-im-internal-secret-im-internal-secret-im",
    )
    resolved_base_url = os.environ.get("IM_GRAY_API_BASE", base_url)
    if resolved_base_url == "http://localhost:8082":
        resolved_base_url = f"http://localhost:{api_port}"
    resolved_db_url = os.environ.get(
        "IM_GRAY_DB_URL",
        db_url
        if "127.0.0.1:3306" not in db_url and "localhost:3306" not in db_url
        else f"mysql://root:{mysql_password}@127.0.0.1:{mysql_port}/service_message_service_db",
    )
    redis_url = f"redis://:{redis_password}@127.0.0.1:{redis_port}/0"
    return {
        "COMPOSE_PROJECT_NAME": os.environ.get("IM_GRAY_COMPOSE_PROJECT", "im-gray-release-gate"),
        "MYSQL_PORT": mysql_port,
        "REDIS_PORT": redis_port,
        "API_SERVER_PORT": api_port,
        "MYSQL_ROOT_PASSWORD": mysql_password,
        "REDIS_PASSWORD": redis_password,
        "IM_INTERNAL_SECRET": internal_secret,
        "IM_MYSQL_CONTAINER": f"{os.environ.get('IM_GRAY_COMPOSE_PROJECT', 'im-gray-release-gate')}-mysql-1",
        "IM_API_BASE": resolved_base_url,
        "IM_DB_URL": resolved_db_url,
        "MYSQL_URL": resolved_db_url,
        "DATABASE_URL": resolved_db_url,
        "REDIS_URL": redis_url,
        "IM_CACHE_REDIS_URL": redis_url,
        "IM_HOT_REDIS_URL": redis_url,
        "IM_PRIVATE_HOT_REDIS_URL": redis_url,
        "IM_PRIVATE_HOT_REDIS_URLS": redis_url,
        "IM_GROUP_HOT_REDIS_URL": redis_url,
        "IM_GROUP_HOT_REDIS_URLS": redis_url,
        "IM_PRIVATE_EVENT_REDIS_URL": redis_url,
        "IM_GROUP_EVENT_REDIS_URL": redis_url,
        "IM_ROUTE_REDIS_URL": redis_url,
    }


def dependency_steps(env: dict[str, str]) -> list:
    if shutil.which("docker") is None:
        return [
            skip_step(
                "Main Full dependencies",
                "docker is not available; api-server integration dependencies were not started",
                critical=True,
            )
        ]
    compose = ["docker", "compose", "-f", str(ROOT / "docker-compose.sit.yml")]
    return [
        run_step(
            "Main Full dependencies up",
            [*compose, "up", "-d", "mysql", "redis"],
            cwd=ROOT,
            timeout=600,
            env=env,
        ),
        run_step(
            "Main Full mysql bootstrap",
            [PYTHON, str(ROOT / "scripts" / "sit_mysql_bootstrap.py")],
            cwd=ROOT,
            timeout=180,
            env=env,
        ),
        run_step(
            "Main Full migrations",
            [*compose, "run", "--rm", "migrate"],
            cwd=ROOT,
            timeout=300,
            env=env,
        ),
    ]


def pr_fast() -> list:
    return rust_fast() + flutter_fast() + manifest_fast()


def main_full() -> list:
    results = pr_fast()
    dep_env = main_full_dependency_env()
    results.extend(dependency_steps(dep_env))
    results.append(
        run_step(
            "api-server integration tests",
            [
                "cargo",
                "test",
                "-p",
                "api-server",
                "--features",
                "integration-tests",
                "--tests",
                "--",
                "--test-threads=1",
            ],
            cwd=RUST_ROOT,
            timeout=1800,
            env=dep_env,
        )
    )
    results.append(
        run_step(
            "Coverage gate",
            [PYTHON, str(ROOT / "scripts" / "coverage_gate.py")],
            cwd=ROOT,
            timeout=7200,
        )
    )
    return results


def gray_release(base_url: str, db_url: str) -> list:
    results = main_full()
    gray_env = gray_release_env(base_url, db_url)
    gray_base_url = gray_env["IM_API_BASE"]
    gray_db_url = gray_env["IM_DB_URL"]
    if shutil.which("docker") is None:
        results.append(skip_step("Docker compose SIT", "docker is not available; gray-release critical step NOT RUN", critical=True))
        return results
    results.append(
        run_step(
            "P1 SIT gate",
            [
                PYTHON,
                str(ROOT / "scripts" / "p1_sit_gate.py"),
                "--base-url",
                gray_base_url,
                "--db-url",
                gray_db_url,
            ],
            cwd=ROOT,
            timeout=7200,
            env=gray_env,
        )
    )
    results.append(
        run_step(
            "Backend full API SIT",
            [
                PYTHON,
                str(ROOT / "scripts" / "sit_backend_api.py"),
                "--api-base",
                gray_base_url,
                "--internal-secret",
                gray_env["IM_INTERNAL_SECRET"],
                "--mysql-root-password",
                gray_env["MYSQL_ROOT_PASSWORD"],
            ],
            cwd=ROOT,
            timeout=3600,
            env=gray_env,
        )
    )
    return results


def gray_signoff(
    env: str,
    api_base: str,
    ws_base: str,
    db_url: str,
    redis_url: str,
    operator: str,
    continue_on_error: bool = False,
) -> list:
    """Run full gray release signoff process."""
    results = []

    # Step 1: Generate build info
    results.append(
        run_step(
            "Build info generation",
            [
                PYTHON,
                str(ROOT / "scripts" / "gray_report.py"),
                "build-info",
                "--env", env,
                "--api-base", api_base,
                "--ws-base", ws_base,
                "--db-url", db_url,
                "--operator", operator,
            ],
            cwd=ROOT,
            timeout=120,
        )
    )

    # Step 2: Environment check
    results.append(
        run_step(
            "Environment pre-check",
            [
                PYTHON,
                str(ROOT / "scripts" / "gray_env_check.py"),
                "--env", env,
                "--api-base", api_base,
                "--ws-base", ws_base,
                "--db-url", db_url,
                "--redis-url", redis_url,
            ],
            cwd=ROOT,
            timeout=300,
        )
    )

    # Step 3: Manifest check
    results.append(
        run_step(
            "Manifest completeness",
            [PYTHON, str(ROOT / "scripts" / "check_test_manifest.py")],
            cwd=ROOT,
            timeout=300,
        )
    )

    # Step 4: PR Fast gate
    results.append(
        run_step(
            "PR Fast gate",
            [PYTHON, str(ROOT / "scripts" / "gray_gate.py"), "--mode", "pr-fast"],
            cwd=ROOT,
            timeout=1800,
        )
    )

    # Step 5: Coverage gate
    results.append(
        run_step(
            "Coverage gate",
            [PYTHON, str(ROOT / "scripts" / "coverage_gate.py")],
            cwd=ROOT,
            timeout=7200,
        )
    )

    # Step 6: Main Full gate
    results.append(
        run_step(
            "Main Full gate",
            [PYTHON, str(ROOT / "scripts" / "gray_gate.py"), "--mode", "main-full"],
            cwd=ROOT,
            timeout=7200,
        )
    )

    # Step 7: Gray Release gate (if environment supports it)
    if shutil.which("docker") is not None:
        results.append(
            run_step(
                "Gray Release gate",
                [
                    PYTHON,
                    str(ROOT / "scripts" / "gray_gate.py"),
                    "--mode", "gray-release",
                    "--base-url", api_base,
                    "--db-url", db_url,
                ],
                cwd=ROOT,
                timeout=7200,
            )
        )
    else:
        results.append(skip_step("Gray Release gate", "docker not available", critical=True))

    # Step 8: Smoke tests
    results.append(
        run_step(
            "Gray smoke tests",
            [
                PYTHON,
                str(ROOT / "scripts" / "gray_smoke.py"),
                "--env", env,
                "--api-base", api_base,
                "--ws-base", ws_base,
                "--db-url", db_url,
            ],
            cwd=ROOT,
            timeout=600,
        )
    )

    # Step 9: Generate final report
    results.append(
        run_step(
            "Generate final report",
            [
                PYTHON,
                str(ROOT / "scripts" / "gray_report.py"),
                "finalize",
                "--build-info", str(REPORT_DIR / "gray-build-info.json"),
                "--env-check", str(REPORT_DIR / "gray-env-check.json"),
                "--gate-summary", str(REPORT_DIR / "gray-gate-report.json"),
                "--smoke", str(REPORT_DIR / "gray-smoke.json"),
                "--coverage", str(REPORT_DIR / "coverage-summary.json"),
                "--manifest", str(REPORT_DIR / "test-manifest-check.json"),
                "--out", str(REPORT_DIR / "gray-release-report.md"),
            ],
            cwd=ROOT,
            timeout=120,
        )
    )

    return results


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--mode", choices=["pr-fast", "main-full", "gray-release", "gray-signoff"], required=True)
    parser.add_argument("--write-report", default=str(ROOT / "build" / "reports" / "gray-gate-report.md"))
    parser.add_argument("--base-url", default=os.environ.get("IM_API_BASE", "http://localhost:8082"))
    parser.add_argument(
        "--db-url",
        default=os.environ.get(
            "IM_DB_URL",
            "mysql://root:root123@127.0.0.1:3306/service_message_service_db",
        ),
    )
    parser.add_argument("--env", default="local-gray", help="Gray environment name")
    parser.add_argument("--ws-base", default=os.environ.get("IM_WS_BASE", ""), help="WebSocket base URL")
    parser.add_argument("--redis-url", default=os.environ.get("REDIS_URL", ""), help="Redis URL")
    parser.add_argument("--operator", default=os.environ.get("USER", "unknown"), help="Operator name")
    parser.add_argument("--continue-on-error", action="store_true", help="Continue on error")
    args = parser.parse_args()

    if args.mode == "pr-fast":
        results = pr_fast()
    elif args.mode == "main-full":
        results = main_full()
    elif args.mode == "gray-release":
        results = gray_release(args.base_url, args.db_url)
    elif args.mode == "gray-signoff":
        results = gray_signoff(
            env=args.env,
            api_base=args.base_url,
            ws_base=args.ws_base,
            db_url=args.db_url,
            redis_url=args.redis_url,
            operator=args.operator,
            continue_on_error=args.continue_on_error,
        )
    else:
        parser.print_help()
        return 1

    report_md = Path(args.write_report)
    report_base = report_md.with_suffix("")
    return write_gate_reports("gray-gate-report", args.mode, results, report_base=report_base)


if __name__ == "__main__":
    raise SystemExit(main())
