#!/usr/bin/env python3
from __future__ import annotations

import argparse

from deploy_utils import (
    ONE_SHOT_SERVICES,
    DeploymentConfig,
    compose_up_command,
    ensure_docker_environment,
    ensure_docker_network_exists,
    load_config,
    middleware_services,
    print_service_statuses,
    run_command,
    service_status,
    validate_compose_services,
    wait_for_service_completed,
    wait_for_service_ready,
)


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="Deploy middleware required by the IM stack: MySQL, Redis shards, and local file volume initialization."
    )
    parser.add_argument(
        "--env-file",
        help="Path to the deployment env file. Defaults to build/runtime/env/local.env.",
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
    parser.add_argument(
        "--timeout",
        type=int,
        default=180,
        help="Seconds to wait for each long-running middleware service.",
    )
    return parser


def deploy_middleware(
    config: DeploymentConfig,
    *,
    pull: bool = False,
    force_recreate: bool = False,
    no_wait: bool = False,
    status_only: bool = False,
    timeout_seconds: int = 180,
) -> None:
    services = middleware_services()
    validate_compose_services(config, services)

    statuses = [
        service_status(config, service, one_shot=service in ONE_SHOT_SERVICES)
        for service in services
    ]
    print_service_statuses(statuses)

    targets = [
        status.service
        for status in statuses
        if force_recreate or not status.ready
    ]
    if status_only:
        return
    if not targets:
        ensure_docker_network_exists(config)
        print("Middleware is already ready; nothing to deploy.")
        return

    recreate_unready = any(status.container_id and not status.ready for status in statuses)
    print("Deploying middleware: " + ", ".join(targets))
    command = compose_up_command(
        config,
        targets,
        pull=pull,
        force_recreate=force_recreate or recreate_unready,
    )
    run_command(command, cwd=config.project_dir)
    ensure_docker_network_exists(config)

    if not no_wait:
        for service in targets:
            if service in ONE_SHOT_SERVICES:
                wait_for_service_completed(config, service, timeout_seconds=min(timeout_seconds, 120))
            else:
                wait_for_service_ready(config, service, timeout_seconds=timeout_seconds)
    print("Middleware deployment complete: " + ", ".join(targets))


def main() -> None:
    args = build_parser().parse_args()
    ensure_docker_environment()
    config = load_config(env_file=args.env_file)
    deploy_middleware(
        config,
        pull=args.pull,
        force_recreate=args.force_recreate,
        no_wait=args.no_wait,
        status_only=args.status_only,
        timeout_seconds=args.timeout,
    )


if __name__ == "__main__":
    main()
