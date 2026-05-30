#!/usr/bin/env python3
from __future__ import annotations

import argparse
import os
from urllib.parse import quote_plus

from deploy_utils import (
    compose_service_container,
    compose_up_command,
    ensure_docker_environment,
    fatal,
    load_config,
    print_service_statuses,
    resolve_executable,
    run_command,
    service_status,
    wait_for_service_completed,
    wait_for_service_ready,
)

SERVICE_ALIASES = {
    "api": "im-api-server",
    "api-server": "im-api-server",
    "im": "im-server",
    "im-server": "im-server",
    "frontend": "im-frontend",
    "ai": "im-spring-ai",
    "spring-ai": "im-spring-ai",
}

APP_SERVICES = ["im-server", "im-api-server", "im-frontend", "im-spring-ai"]


def _hot_urls(host_prefix: str, env_key: str, password: str) -> str:
    count = int(os.getenv(env_key, "4"))
    encoded_pw = quote_plus(password)
    urls = []
    for i in range(1, count + 1):
        suffix = f"-{i}" if i > 1 else ""
        urls.append(f"redis://:{encoded_pw}@{host_prefix}{suffix}:6379/0")
    return ",".join(urls)


def middleware_services() -> list[str]:
    services = ["im-mysql", "im-redis"]
    count = int(os.getenv("IM_PRIVATE_HOT_SHARDS", "4"))
    services.append("im-redis-private-hot")
    for i in range(2, count + 1):
        services.append(f"im-redis-private-hot-{i}")
    count = int(os.getenv("IM_GROUP_HOT_SHARDS", "4"))
    services.append("im-redis-group-hot")
    for i in range(2, count + 1):
        services.append(f"im-redis-group-hot-{i}")
    services.append("im-files-init")
    return services


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="Deploy Docker-built Rust backend services, Spring AI, and the Flutter frontend."
    )
    parser.add_argument(
        "services",
        nargs="*",
        help="Optional services: api im frontend ai. Empty means all application services.",
    )
    parser.add_argument(
        "--no-build",
        action="store_true",
        help="Skip image builds and use existing local images.",
    )
    parser.add_argument("--pull", action="store_true", help="Pull base images during deployment.")
    parser.add_argument(
        "--no-deps",
        action="store_true",
        help="Compatibility option. Service deployment already skips dependent middleware by default.",
    )
    parser.add_argument(
        "--with-deps",
        action="store_true",
        help="Allow Docker Compose to start dependent services automatically.",
    )
    parser.add_argument(
        "--skip-middleware-check",
        action="store_true",
        help="Skip MySQL and Redis readiness checks before service deployment.",
    )
    parser.add_argument(
        "--no-wait",
        action="store_true",
        help="Do not wait for application services to become ready after startup.",
    )
    return parser


def normalize_services(raw_services: list[str]) -> list[str]:
    if not raw_services:
        return APP_SERVICES
    services: list[str] = []
    for raw in raw_services:
        key = raw.strip().lower()
        service = SERVICE_ALIASES.get(key, raw)
        if service not in APP_SERVICES:
            raise SystemExit(f"Unknown service: {raw}")
        if service not in services:
            services.append(service)
    return services


def ensure_middleware_ready(config) -> None:
    one_shot_services = {"im-files-init"}
    statuses = [
        service_status(config, service, one_shot=service in one_shot_services)
        for service in middleware_services()
    ]
    print_service_statuses(statuses)
    missing = [status.service for status in statuses if status.status == "missing"]
    if missing:
        fatal(
            "Missing middleware containers: "
            + ", ".join(missing)
            + ". Run scripts/deploy_middleware.py first."
        )
    for status in statuses:
        if status.service in one_shot_services:
            wait_for_service_completed(config, status.service)
        else:
            wait_for_service_ready(config, status.service)


def apply_database_migrations(config) -> None:
    docker_cmd = resolve_executable("Docker", ["docker"])
    mysql_container = compose_service_container(config, "im-mysql")
    print(f"Applying database migrations: {config.sql_migration_file}")
    with config.sql_migration_file.open("rb") as sql_stream:
        run_command(
            [
                docker_cmd,
                "exec",
                "-i",
                mysql_container,
                "mysql",
                "-uroot",
                f"-p{config.mysql_root_password}",
                "--default-character-set=utf8mb4",
            ],
            stdin=sql_stream,
        )


def main() -> None:
    args = build_parser().parse_args()
    ensure_docker_environment()
    config = load_config()
    services = normalize_services(args.services)

    # Generate dynamic Redis URLs for api-server
    password = os.getenv("REDIS_PASSWORD", "root123")
    os.environ.setdefault("IM_PRIVATE_HOT_REDIS_URLS",
                          _hot_urls("im-redis-private-hot", "IM_PRIVATE_HOT_SHARDS", password))
    os.environ.setdefault("IM_GROUP_HOT_REDIS_URLS",
                          _hot_urls("im-redis-group-hot", "IM_GROUP_HOT_SHARDS", password))

    if not args.skip_middleware_check:
        ensure_middleware_ready(config)

    if "im-api-server" in services:
        apply_database_migrations(config)

    command = compose_up_command(
        config,
        services,
        build=not args.no_build,
        pull=args.pull,
        no_deps=not args.with_deps or args.no_deps,
    )

    run_command(command, cwd=config.project_dir)
    if not args.no_wait:
        for service in services:
            wait_for_service_ready(config, service)
    print("Deployment complete: " + ", ".join(services))


if __name__ == "__main__":
    main()
