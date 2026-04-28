#!/usr/bin/env python3
from __future__ import annotations

import argparse

from deploy_utils import compose_base_command, load_config, run_command

SERVICE_ALIASES = {
    "mysql": "im-mysql",
    "redis": "im-redis",
    "api": "im-api-server",
    "api-server": "im-api-server",
    "im": "im-server",
    "im-server": "im-server",
    "frontend": "im-frontend",
}

CORE_SERVICES = ["im-redis", "im-mysql", "im-files-init", "im-server", "im-api-server", "im-frontend"]


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Deploy the Rust IM backend and frontend.")
    parser.add_argument(
        "services",
        nargs="*",
        help="Optional services: mysql redis im-server api-server frontend. Empty means all core services.",
    )
    parser.add_argument("--build", action="store_true", help="Rebuild images before deployment.")
    parser.add_argument("--pull", action="store_true", help="Pull base images during deployment.")
    return parser


def normalize_services(raw_services: list[str]) -> list[str]:
    if not raw_services:
        return CORE_SERVICES
    services: list[str] = []
    for raw in raw_services:
        key = raw.strip().lower()
        service = SERVICE_ALIASES.get(key, raw)
        if service not in CORE_SERVICES:
            raise SystemExit(f"Unknown service: {raw}")
        if service not in services:
            services.append(service)
    return services


def main() -> None:
    args = build_parser().parse_args()
    config = load_config()
    services = normalize_services(args.services)

    command = [*compose_base_command(config), "up", "-d"]
    if args.build:
        command.append("--build")
    if args.pull:
        command.extend(["--pull", "always"])
    command.extend(services)

    run_command(command, cwd=config.project_dir)
    print("Deployment complete: " + ", ".join(services))


if __name__ == "__main__":
    main()
