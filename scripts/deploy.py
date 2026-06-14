#!/usr/bin/env python3
from __future__ import annotations

import argparse

from deploy_middleware import deploy_middleware
from deploy_services import deploy_services, normalize_services
from deploy_utils import (
    ensure_docker_environment,
    load_config,
    print_compose_status,
)
from init_db import initialize_database


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="Run the IM deployment workflow end to end or by selected phases."
    )
    parser.add_argument(
        "services",
        nargs="*",
        help="Optional service targets for the service phase: all, backend, api, im, frontend, ai.",
    )
    parser.add_argument("--env-file", help="Path to the deployment env file. Defaults to .env.")
    parser.add_argument(
        "--status-only",
        action="store_true",
        help="Print Docker Compose status and exit.",
    )
    parser.add_argument(
        "--middleware-only",
        action="store_true",
        help="Run only the middleware phase.",
    )
    parser.add_argument(
        "--services-only",
        action="store_true",
        help="Run only the application service phase.",
    )
    parser.add_argument(
        "--skip-middleware",
        action="store_true",
        help="Skip the middleware phase.",
    )
    parser.add_argument(
        "--skip-middleware-check",
        action="store_true",
        help="Skip middleware readiness checks in the service phase.",
    )
    parser.add_argument(
        "--skip-services",
        action="store_true",
        help="Skip the application service phase.",
    )
    parser.add_argument(
        "--init-db",
        choices=["check", "skip", "full"],
        default="check",
        help="Database phase: check MySQL/SQL only, skip, or destructive full import.",
    )
    parser.add_argument(
        "--yes",
        action="store_true",
        help="Confirm destructive actions such as --init-db full.",
    )
    parser.add_argument("--pull", action="store_true", help="Pull images during deployment.")
    parser.add_argument(
        "--force-recreate-middleware",
        action="store_true",
        help="Force recreate middleware containers.",
    )
    parser.add_argument(
        "--include-ai",
        action="store_true",
        help="Include im-spring-ai when no explicit service target is provided.",
    )
    parser.add_argument("--no-build", action="store_true", help="Skip application image builds.")
    parser.add_argument(
        "--with-deps",
        action="store_true",
        help="Allow Docker Compose to start dependent services in the service phase.",
    )
    parser.add_argument(
        "--no-deps",
        action="store_true",
        help="Force --no-deps in the service phase. This is the default.",
    )
    parser.add_argument(
        "--skip-migrations",
        action="store_true",
        help="Skip SQL migrations before api-server deployment.",
    )
    parser.add_argument("--no-wait", action="store_true", help="Do not wait for started services.")
    parser.add_argument(
        "--timeout",
        type=int,
        default=240,
        help="Seconds to wait for each long-running service.",
    )
    return parser


def parse_args() -> argparse.Namespace:
    parser = build_parser()
    args = parser.parse_args()
    if args.middleware_only and args.services_only:
        parser.error("--middleware-only and --services-only cannot be used together.")
    return args


def main() -> None:
    args = parse_args()
    ensure_docker_environment()
    config = load_config(env_file=args.env_file)

    if args.status_only:
        print_compose_status(config)
        return

    skip_middleware = args.skip_middleware or args.services_only
    skip_services = args.skip_services or args.middleware_only
    init_db_mode = "skip" if args.middleware_only or args.services_only else args.init_db
    middleware_phase_ran = False

    if not skip_middleware:
        deploy_middleware(
            config,
            pull=args.pull,
            force_recreate=args.force_recreate_middleware,
            no_wait=args.no_wait,
            timeout_seconds=args.timeout,
        )
        middleware_phase_ran = True

    if init_db_mode != "skip":
        initialize_database(
            config,
            full_import=init_db_mode == "full",
            assume_yes=args.yes,
            timeout_seconds=args.timeout,
        )

    if not skip_services:
        services = normalize_services(args.services, include_ai=args.include_ai)
        skip_service_middleware_check = (
            args.skip_middleware_check or (middleware_phase_ran and not args.no_wait)
        )
        deploy_services(
            config,
            services,
            no_build=args.no_build,
            pull=args.pull,
            no_deps=not args.with_deps or args.no_deps,
            skip_middleware_check=skip_service_middleware_check,
            skip_migrations=args.skip_migrations,
            no_wait=args.no_wait,
            timeout_seconds=args.timeout,
        )

    print_compose_status(config)
    print("Deployment workflow finished.")


if __name__ == "__main__":
    main()
