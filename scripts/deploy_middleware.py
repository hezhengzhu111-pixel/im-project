#!/usr/bin/env python3
from __future__ import annotations

import argparse
import os

from deploy_utils import (
    compose_up_command,
    ensure_docker_environment,
    load_config,
    print_service_statuses,
    run_command,
    service_status,
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
    parser.add_argument(
        "--status-only",
        action="store_true",
        help="Only print middleware status; do not start missing containers.",
    )
    return parser


def main() -> None:
    args = build_parser().parse_args()
    ensure_docker_environment()
    config = load_config()
    services = middleware_services()
    one_shot_services = {"im-files-init"}
    statuses = [
        service_status(config, service, one_shot=service in one_shot_services)
        for service in services
    ]
    print_service_statuses(statuses)
    missing_services = [
        status.service for status in statuses if not status.ready or args.force_recreate
    ]
    if args.status_only:
        return
    if not missing_services:
        print("Middleware is already ready; nothing to deploy.")
        return

    recreate_unready = any(
        status.container_id and not status.ready for status in statuses
    )
    print("Deploying missing/unready middleware: " + ", ".join(missing_services))
    command = compose_up_command(
        config,
        missing_services,
        pull=args.pull,
        force_recreate=args.force_recreate or recreate_unready,
    )
    run_command(command, cwd=config.project_dir)
    if not args.no_wait:
        for service in missing_services:
            if service in one_shot_services:
                wait_for_service_completed(config, service)
            else:
                wait_for_service_ready(config, service)
    print("Middleware deployment complete: " + ", ".join(missing_services))


if __name__ == "__main__":
    main()
