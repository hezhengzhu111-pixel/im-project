#!/usr/bin/env python3
from __future__ import annotations

import argparse
import os
from urllib.parse import quote_plus

from deploy_utils import (
    DEFAULT_APP_SERVICES,
    ONE_SHOT_SERVICES,
    OPTIONAL_APP_SERVICES,
    DeploymentConfig,
    compose_service_container,
    compose_up_command,
    ensure_docker_environment,
    fatal,
    load_config,
    middleware_services,
    print_service_statuses,
    read_int_env,
    resolve_executable,
    run_command,
    service_status,
    validate_compose_services,
    wait_for_service_completed,
    wait_for_service_ready,
)

SERVICE_ALIASES = {
    "api": "im-api-server",
    "api-server": "im-api-server",
    "gateway": "im-api-server",
    "im": "im-server",
    "im-server": "im-server",
    "chat": "im-server",
    "frontend": "im-frontend",
    "front": "im-frontend",
    "web": "im-frontend",
    "ai": "im-spring-ai",
    "spring-ai": "im-spring-ai",
    "im-spring-ai": "im-spring-ai",
}
SERVICE_GROUPS = {
    "all": list(DEFAULT_APP_SERVICES),
    "backend": ["im-server", "im-api-server"],
    "core": ["im-server", "im-api-server"],
}
APP_SERVICES = list(DEFAULT_APP_SERVICES)


def _hot_urls(host_prefix: str, env_key: str, password: str) -> str:
    count = read_int_env(env_key, 1)
    encoded_pw = quote_plus(password)
    urls = []
    for index in range(1, count + 1):
        suffix = f"-{index}" if index > 1 else ""
        urls.append(f"redis://:{encoded_pw}@{host_prefix}{suffix}:6379/0")
    return ",".join(urls)


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="Deploy Docker-built Rust backend services, optional Spring AI, and the Flutter frontend."
    )
    parser.add_argument(
        "services",
        nargs="*",
        help=(
            "Optional targets: all, backend, api, im, frontend, ai. "
            "Empty means core app services without ai."
        ),
    )
    parser.add_argument(
        "--env-file",
        help="Path to the deployment env file. Defaults to build/runtime/env/local.env.",
    )
    parser.add_argument(
        "--include-ai",
        action="store_true",
        help="Include im-spring-ai when no explicit service target is provided.",
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
        help="Compatibility option. Service deployment skips dependent middleware by default.",
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
        "--skip-migrations",
        action="store_true",
        help="Skip sql/mysql8/e2ee_migration.sql before api-server deployment.",
    )
    parser.add_argument(
        "--no-wait",
        action="store_true",
        help="Do not wait for application services to become ready after startup.",
    )
    parser.add_argument(
        "--timeout",
        type=int,
        default=240,
        help="Seconds to wait for each application service.",
    )
    return parser


def normalize_services(raw_services: list[str], *, include_ai: bool = False) -> list[str]:
    if not raw_services:
        services = list(DEFAULT_APP_SERVICES)
        if include_ai:
            services.extend(OPTIONAL_APP_SERVICES)
        return services

    services: list[str] = []
    for raw in raw_services:
        key = raw.strip().lower()
        if key in SERVICE_GROUPS:
            targets = list(SERVICE_GROUPS[key])
            if key == "all" and include_ai:
                targets.extend(OPTIONAL_APP_SERVICES)
        else:
            targets = [SERVICE_ALIASES.get(key, raw)]
        for service in targets:
            if service not in (*DEFAULT_APP_SERVICES, *OPTIONAL_APP_SERVICES):
                raise SystemExit(f"Unknown service: {raw}")
            if service not in services:
                services.append(service)
    return services


def ensure_middleware_ready(config: DeploymentConfig, *, timeout_seconds: int = 180) -> None:
    services = middleware_services()
    validate_compose_services(config, services)
    statuses = [
        service_status(config, service, one_shot=service in ONE_SHOT_SERVICES)
        for service in services
    ]
    print_service_statuses(statuses)
    missing = [status.service for status in statuses if status.status == "missing"]
    if missing:
        fatal(
            "Missing middleware containers: "
            + ", ".join(missing)
            + ". Run python scripts/init.py or scripts/deploy_middleware.py first."
        )
    for status in statuses:
        if status.service in ONE_SHOT_SERVICES:
            wait_for_service_completed(config, status.service, timeout_seconds=min(timeout_seconds, 120))
        else:
            wait_for_service_ready(config, status.service, timeout_seconds=timeout_seconds)


def apply_database_migrations(config: DeploymentConfig) -> None:
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


def configure_dynamic_redis_urls() -> None:
    password = os.getenv("REDIS_PASSWORD", "root123")
    os.environ.setdefault(
        "IM_PRIVATE_HOT_REDIS_URLS",
        _hot_urls("im-redis-private-hot", "IM_PRIVATE_HOT_SHARDS", password),
    )
    os.environ.setdefault(
        "IM_GROUP_HOT_REDIS_URLS",
        _hot_urls("im-redis-group-hot", "IM_GROUP_HOT_SHARDS", password),
    )


def deploy_services(
    config: DeploymentConfig,
    services: list[str],
    *,
    no_build: bool = False,
    pull: bool = False,
    no_deps: bool = True,
    skip_middleware_check: bool = False,
    skip_migrations: bool = False,
    no_wait: bool = False,
    timeout_seconds: int = 240,
) -> None:
    validate_compose_services(config, services)
    configure_dynamic_redis_urls()

    if not skip_middleware_check:
        ensure_middleware_ready(config, timeout_seconds=timeout_seconds)

    if "im-api-server" in services and not skip_migrations:
        apply_database_migrations(config)

    command = compose_up_command(
        config,
        services,
        build=not no_build,
        pull=pull,
        no_deps=no_deps,
    )
    run_command(command, cwd=config.project_dir)

    if not no_wait:
        for service in services:
            wait_for_service_ready(config, service, timeout_seconds=timeout_seconds)
    print("Deployment complete: " + ", ".join(services))


def main() -> None:
    args = build_parser().parse_args()
    ensure_docker_environment()
    config = load_config(env_file=args.env_file)
    services = normalize_services(args.services, include_ai=args.include_ai)
    deploy_services(
        config,
        services,
        no_build=args.no_build,
        pull=args.pull,
        no_deps=not args.with_deps or args.no_deps,
        skip_middleware_check=args.skip_middleware_check,
        skip_migrations=args.skip_migrations,
        no_wait=args.no_wait,
        timeout_seconds=args.timeout,
    )


if __name__ == "__main__":
    main()
