#!/usr/bin/env python3
from __future__ import annotations

import argparse
import os

from deploy_utils import (
    compose_up_command,
    ensure_docker_environment,
    load_config,
    run_command,
    wait_for_service_completed,
    wait_for_service_ready,
)

def _hot_services(prefix: str, env_key: str) -> list[str]:
    count = int(os.getenv(env_key, "4"))
    services = [prefix]
    for i in range(2, count + 1):
        services.append(f"{prefix}-{i}")
    return services

def middleware_services() -> list[str]:
    services = ["im-mysql", "im-redis"]
    services.extend(_hot_services("im-redis-private-hot", "IM_PRIVATE_HOT_SHARDS"))
    services.extend(_hot_services("im-redis-group-hot", "IM_GROUP_HOT_SHARDS"))
    services.append("im-files-init")
    return services


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="Deploy middleware required by the IM stack: MySQL, Redis, and local file volume initialization."
    )
    parser.add_argument("--pull", action="store_true", help="Pull middleware images before startup.")
    parser.add_argument(
        "--force-recreate",
        action="store_true",
        help="Recreate middleware containers even if they already exist.",
    )
    parser.add_argument(
        "--no-wait",
        action="store_true",
        help="Do not wait for middleware readiness after starting containers.",
    )
    return parser


def main() -> None:
    args = build_parser().parse_args()
    ensure_docker_environment()
    config = load_config()
    services = middleware_services()
    command = compose_up_command(
        config,
        services,
        pull=args.pull,
        force_recreate=args.force_recreate,
    )
    run_command(command, cwd=config.project_dir)
    if not args.no_wait:
        for service in services:
            if service == "im-files-init":
                wait_for_service_completed(config, service)
            else:
                wait_for_service_ready(config, service)
    print("Middleware deployment complete: " + ", ".join(services))


if __name__ == "__main__":
    main()
