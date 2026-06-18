from __future__ import annotations

import argparse
import shutil
import sys
from pathlib import Path

from runtime_paths import DEFAULT_RUNTIME_ENV_FILE, RUNTIME_DIR, relative
from deploy_utils import prepare_runtime_files
from .builder import BuildOptions, build_all
from .core import ensure_runtime, load_runtime
from .database import check_database, ensure_database, migrate_database, reset_database
from .middleware import down_middleware, middleware_status, up_middleware
from .services import (
    down_services,
    normalize_services,
    restart_app_services,
    service_logs,
    status_services,
    up_services,
)


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Unified deployment controller for IM Project.")
    parser.add_argument("--env-file", help=f"Runtime env file. Defaults to {relative(DEFAULT_RUNTIME_ENV_FILE)}.")
    sub = parser.add_subparsers(dest="command")

    up = sub.add_parser("up", help="Prepare runtime, middleware, database, and application services.")
    up.add_argument("services", nargs="*", help="Service names or groups: default, all, backend, api, im, web, ai.")
    up.add_argument("--include-ai", action="store_true", help="Include im-spring-ai when no explicit target is given.")
    up.add_argument("--build", action="store_true", help="Build Docker images through docker compose before starting.")
    up.add_argument("--pull", action="store_true", help="Pull images before starting.")
    up.add_argument("--force-recreate", action="store_true", help="Force container recreation.")
    up.add_argument("--with-deps", action="store_true", help="Let Compose start dependencies automatically.")
    up.add_argument("--skip-middleware", action="store_true", help="Skip middleware readiness and startup.")
    up.add_argument("--skip-db", action="store_true", help="Skip database bootstrap.")
    up.add_argument("--skip-migrations", action="store_true", help="Skip SQL migrations.")
    up.add_argument("--no-wait", action="store_true", help="Do not wait for service readiness.")
    up.add_argument("--timeout", type=int, default=240, help="Readiness timeout in seconds.")

    init = sub.add_parser("init", help="Prepare runtime, middleware, and database.")
    init.add_argument("--pull", action="store_true")
    init.add_argument("--force-recreate", action="store_true")
    init.add_argument("--skip-middleware", action="store_true")
    init.add_argument("--skip-db", action="store_true")
    init.add_argument("--timeout", type=int, default=180)

    runtime = sub.add_parser("runtime", help="Manage generated runtime files.")
    runtime_sub = runtime.add_subparsers(dest="runtime_command")
    runtime_sub.add_parser("ensure", help="Create build/runtime env and compose files.")

    middleware = sub.add_parser("middleware", help="Manage MySQL, Redis, and local file initialization.")
    middleware_sub = middleware.add_subparsers(dest="middleware_command")
    mw_up = middleware_sub.add_parser("up")
    mw_up.add_argument("--pull", action="store_true")
    mw_up.add_argument("--force-recreate", action="store_true")
    mw_up.add_argument("--no-wait", action="store_true")
    mw_up.add_argument("--timeout", type=int, default=180)
    middleware_sub.add_parser("status")
    middleware_sub.add_parser("down")

    db = sub.add_parser("db", help="Manage MySQL schema initialization and migrations.")
    db_sub = db.add_subparsers(dest="db_command")
    db_ensure = db_sub.add_parser("ensure")
    db_ensure.add_argument("--skip-migrations", action="store_true")
    db_ensure.add_argument("--timeout", type=int, default=180)
    db_reset = db_sub.add_parser("reset")
    db_reset.add_argument("--yes", action="store_true")
    db_reset.add_argument("--timeout", type=int, default=180)
    db_migrate = db_sub.add_parser("migrate")
    db_migrate.add_argument("--timeout", type=int, default=180)
    db_check = db_sub.add_parser("check")
    db_check.add_argument("--timeout", type=int, default=180)

    build = sub.add_parser("build", help="Incrementally build artifacts and optional Docker images.")
    build.add_argument("--profile", choices=["release", "debug"], default="release")
    build.add_argument("--clean", action="store_true", help="Clean work/dist/logs before building.")
    build.add_argument("--skip-rust", action="store_true")
    build.add_argument("--skip-web", action="store_true")
    build.add_argument("--skip-spring-ai", action="store_true")
    build.add_argument("--docker", action="store_true", help="Build Docker images with Compose parallel build.")
    build.add_argument("--package-images", action="store_true", help="Save built Docker images as tar files.")
    build.add_argument("--no-parallel", action="store_true", help="Disable parallel build stages.")

    down = sub.add_parser("down", help="Stop application services.")
    down.add_argument("services", nargs="*")

    restart = sub.add_parser("restart", help="Restart application services.")
    restart.add_argument("services", nargs="*")
    restart.add_argument("--include-ai", action="store_true")
    restart.add_argument("--no-wait", action="store_true")
    restart.add_argument("--timeout", type=int, default=240)

    status = sub.add_parser("status", help="Show compose service status.")
    status.add_argument("services", nargs="*")

    logs = sub.add_parser("logs", help="Show service logs.")
    logs.add_argument("service")
    logs.add_argument("--tail", type=int, default=100)
    logs.add_argument("-f", "--follow", action="store_true")

    clean = sub.add_parser("clean", help="Clean generated runtime/build state.")
    clean.add_argument("target", choices=["runtime", "work", "dist", "logs", "cache", "all"])
    clean.add_argument("--yes", action="store_true")

    sub.add_parser("doctor", help="Check Docker and generate runtime files.")

    return parser


def _require_yes(args, message: str) -> None:
    if args.yes:
        return
    print(message)
    raise SystemExit("Re-run with --yes to confirm.")


def _clean(target: str, *, yes: bool) -> None:
    import build as legacy_build

    destructive = target in {"runtime", "all"}
    if destructive and not yes:
        raise SystemExit("This operation deletes runtime state. Re-run with --yes.")
    targets = []
    if target in {"runtime", "all"}:
        targets.append(RUNTIME_DIR)
    if target in {"work", "all"}:
        targets.append(legacy_build.WORK_DIR)
    if target in {"dist", "all"}:
        targets.append(legacy_build.DIST_DIR)
    if target in {"logs", "all"}:
        targets.append(legacy_build.LOGS_DIR)
    if target in {"cache", "all"}:
        targets.append(legacy_build.CACHE_DIR)
    for path in targets:
        if path.exists():
            shutil.rmtree(path)
            print(f"[CLEAN] removed {relative(path)}")
        else:
            print(f"[CLEAN] absent {relative(path)}")


def _move_global_options(argv: list[str]) -> list[str]:
    """Allow --env-file before or after subcommands for legacy compatibility."""
    normalized = list(argv)
    extracted: list[str] = []
    index = 0
    while index < len(normalized):
        arg = normalized[index]
        if arg == "--env-file":
            if index + 1 >= len(normalized):
                raise SystemExit("--env-file requires a value")
            extracted.extend([arg, normalized[index + 1]])
            del normalized[index : index + 2]
            continue
        if arg.startswith("--env-file="):
            extracted.append(arg)
            del normalized[index]
            continue
        index += 1
    return [*extracted, *normalized]


def main(argv: list[str] | None = None) -> None:
    parser = build_parser()
    effective_argv = _move_global_options(sys.argv[1:] if argv is None else argv)
    args = parser.parse_args(effective_argv)

    if args.command is None:
        parser.print_help()
        raise SystemExit(1)

    env_file = args.env_file

    if args.command == "runtime":
        if args.runtime_command in {None, "ensure"}:
            prepare_runtime_files(env_file=env_file)
            print("[RUNTIME] ready")
            return

    if args.command == "doctor":
        runtime = ensure_runtime(env_file)
        print(f"[DOCTOR] runtime compose: {relative(runtime.config.compose_file)}")
        print("[DOCTOR] Docker is reachable")
        return

    if args.command == "clean":
        _clean(args.target, yes=args.yes)
        return

    if args.command == "build":
        runtime = ensure_runtime(env_file)
        options = BuildOptions(
            profile=args.profile,
            clean=args.clean,
            skip_rust=args.skip_rust,
            skip_web=args.skip_web,
            skip_spring_ai=args.skip_spring_ai,
            docker=args.docker,
            package_images=args.package_images,
            parallel=not args.no_parallel,
        )
        build_all(runtime.config, options)
        return

    runtime = ensure_runtime(env_file)
    config = runtime.config

    if args.command == "init":
        if not args.skip_middleware:
            up_middleware(
                config,
                pull=args.pull,
                force_recreate=args.force_recreate,
                timeout_seconds=args.timeout,
            )
        if not args.skip_db:
            ensure_database(config, migrate=True, timeout_seconds=args.timeout)
        print("[INIT] complete")
        return

    if args.command == "middleware":
        if args.middleware_command in {None, "status"}:
            middleware_status(config)
        elif args.middleware_command == "up":
            up_middleware(
                config,
                pull=args.pull,
                force_recreate=args.force_recreate,
                no_wait=args.no_wait,
                timeout_seconds=args.timeout,
            )
        elif args.middleware_command == "down":
            down_middleware(config)
        return

    if args.command == "db":
        if args.db_command in {None, "check"}:
            check_database(config, timeout_seconds=args.timeout)
        elif args.db_command == "ensure":
            ensure_database(config, migrate=not args.skip_migrations, timeout_seconds=args.timeout)
        elif args.db_command == "reset":
            reset_database(config, assume_yes=args.yes, timeout_seconds=args.timeout)
        elif args.db_command == "migrate":
            migrate_database(config, timeout_seconds=args.timeout)
        return

    if args.command == "up":
        services = normalize_services(args.services, include_ai=args.include_ai)
        up_services(
            config,
            services,
            build=args.build,
            pull=args.pull,
            force_recreate=args.force_recreate,
            no_deps=not args.with_deps,
            include_ai=args.include_ai,
            skip_middleware=args.skip_middleware,
            skip_db=args.skip_db,
            skip_migrations=args.skip_migrations,
            no_wait=args.no_wait,
            timeout_seconds=args.timeout,
        )
        return

    if args.command == "down":
        services = normalize_services(args.services, include_ai=True) if args.services else None
        down_services(config, services)
        return

    if args.command == "restart":
        services = normalize_services(args.services, include_ai=args.include_ai)
        restart_app_services(config, services, no_wait=args.no_wait, timeout_seconds=args.timeout)
        return

    if args.command == "status":
        services = normalize_services(args.services, include_ai=True) if args.services else None
        status_services(config, services)
        return

    if args.command == "logs":
        service = normalize_services([args.service], include_ai=True)[0]
        service_logs(config, service, tail=args.tail, follow=args.follow)
        return

    parser.print_help()
    raise SystemExit(1)
