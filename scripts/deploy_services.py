#!/usr/bin/env python3
from __future__ import annotations

import argparse

from deploy_utils import (
    compose_up_command,
    ensure_docker_environment,
    load_config,
    run_command,
    wait_for_service_ready,
)

SERVICE_ALIASES = {
    "api": "im-api-server",
    "api-server": "im-api-server",
    "im": "im-server",
    "im-server": "im-server",
    "frontend": "im-frontend",
}

APP_SERVICES = ["im-server", "im-api-server", "im-frontend"]
REQUIRED_MIDDLEWARE_SERVICES = ["im-mysql", "im-redis"]


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="Deploy Docker-built Rust backend services and the frontend."
    )
    parser.add_argument(
        "services",
        nargs="*",
        help="Optional services: im-server api-server frontend. Empty means all application services.",
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


def main() -> None:
    args = build_parser().parse_args()
    ensure_docker_environment()
    config = load_config()
    services = normalize_services(args.services)

    if not args.skip_middleware_check:
        for service in REQUIRED_MIDDLEWARE_SERVICES:
            wait_for_service_ready(config, service)

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
