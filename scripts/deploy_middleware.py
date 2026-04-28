#!/usr/bin/env python3
from __future__ import annotations

import argparse

from deploy_utils import (
    compose_up_command,
    ensure_docker_environment,
    load_config,
    run_command,
    wait_for_service_completed,
    wait_for_service_ready,
)

MIDDLEWARE_SERVICES = ["im-mysql", "im-redis", "im-files-init"]


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
    command = compose_up_command(
        config,
        MIDDLEWARE_SERVICES,
        pull=args.pull,
        force_recreate=args.force_recreate,
    )
    run_command(command, cwd=config.project_dir)
    if not args.no_wait:
        wait_for_service_ready(config, "im-mysql")
        wait_for_service_ready(config, "im-redis")
        wait_for_service_completed(config, "im-files-init")
    print("Middleware deployment complete: " + ", ".join(MIDDLEWARE_SERVICES))


if __name__ == "__main__":
    main()
