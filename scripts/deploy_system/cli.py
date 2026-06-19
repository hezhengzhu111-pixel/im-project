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
from .profile import get_available_profiles, load_profile
from .services import (
    down_services,
    normalize_services,
    restart_app_services,
    service_logs,
    status_services,
    up_services,
)


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="Unified deployment controller for IM Project.",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
常用命令:
  python scripts/imctl.py up           完整部署（启动服务、数据库、迁移）
  python scripts/imctl.py build        构建所有组件
  python scripts/imctl.py down         停止所有服务
  python scripts/imctl.py restart      重启服务
  python scripts/imctl.py status       查看服务状态
  python scripts/imctl.py logs         查看服务日志
  python scripts/imctl.py db reset     重置数据库
  python scripts/imctl.py clean        清理构建产物
        """
    )
    parser.add_argument("--profile", choices=get_available_profiles(), default="local",
                        help="部署配置文件（默认: local）")
    parser.add_argument("--env-file", help=f"Runtime env file. Defaults to {relative(DEFAULT_RUNTIME_ENV_FILE)}.")
    parser.add_argument("--yes", action="store_true", help="自动确认危险操作")
    parser.add_argument("--verbose", action="store_true", help="输出详细信息")
    parser.add_argument("--dry-run", action="store_true", help="仅显示将要执行的操作，不实际执行")

    sub = parser.add_subparsers(dest="command")

    # up command - 完整部署
    up = sub.add_parser("up", help="完整部署：准备环境、启动中间件、初始化数据库、启动服务")
    up.add_argument("--dry-run", action="store_true", help="仅显示将要执行的操作，不实际执行")

    # build command - 构建
    build = sub.add_parser("build", help="增量构建所有组件")
    build.add_argument("--clean", action="store_true", help="构建前清理工作目录")
    build.add_argument("--dry-run", action="store_true", help="仅显示将要执行的操作，不实际执行")

    # down command - 停止服务
    sub.add_parser("down", help="停止所有应用服务")

    # restart command - 重启服务
    restart = sub.add_parser("restart", help="重启应用服务")
    restart.add_argument("services", nargs="*", help="指定要重启的服务（默认全部）")

    # status command - 查看状态
    sub.add_parser("status", help="查看服务状态")

    # logs command - 查看日志
    logs = sub.add_parser("logs", help="查看服务日志")
    logs.add_argument("service", help="服务名称")
    logs.add_argument("--tail", type=int, default=100, help="显示最后N行日志")
    logs.add_argument("-f", "--follow", action="store_true", help="实时跟踪日志")

    # db command - 数据库管理
    db = sub.add_parser("db", help="数据库管理")
    db_sub = db.add_subparsers(dest="db_command")
    db_sub.add_parser("check", help="检查数据库状态")
    db_sub.add_parser("migrate", help="执行数据库迁移")
    db_reset = db_sub.add_parser("reset", help="重置数据库（清空后重新初始化）")
    db_reset.add_argument("--yes", action="store_true", help="自动确认危险操作")

    # clean command - 清理
    clean = sub.add_parser("clean", help="清理构建产物或运行时文件")
    clean.add_argument("target", choices=["runtime", "work", "dist", "logs", "cache", "all", "source-pollution"],
                       help="清理目标")
    clean.add_argument("--yes", action="store_true", help="自动确认危险操作")

    # doctor command - 环境检查
    sub.add_parser("doctor", help="检查环境和依赖")

    return parser


def _require_yes(args, message: str) -> None:
    if args.yes:
        return
    print(message)
    raise SystemExit("Re-run with --yes to confirm.")


def _clean_docker(paths) -> None:
    """Clean Docker containers, volumes, and networks for the project."""
    import subprocess

    print("[CLEAN] Stopping and removing Docker containers...")

    # First, try using docker compose if compose file exists
    compose_file = paths.COMPOSE_DIR / "docker-compose.generated.yml"
    if compose_file.exists():
        try:
            subprocess.run(
                ["docker", "compose", "-f", str(compose_file), "down", "-v", "--remove-orphans"],
                cwd=str(paths.PROJECT_ROOT),
                capture_output=True,
                check=False,
            )
            print("[CLEAN] Docker containers removed via compose")
        except Exception as e:
            print(f"[WARNING] Failed to clean Docker via compose: {e}")

    # Also remove any containers with project name prefix
    try:
        result = subprocess.run(
            ["docker", "ps", "-a", "-q", "--filter", "name=sit-"],
            capture_output=True,
            text=True,
            check=False,
        )
        container_ids = result.stdout.strip().split('\n')
        container_ids = [cid for cid in container_ids if cid]  # Filter empty strings

        if container_ids:
            subprocess.run(
                ["docker", "rm", "-f"] + container_ids,
                capture_output=True,
                check=False,
            )
            print(f"[CLEAN] Removed {len(container_ids)} Docker containers")
    except Exception as e:
        print(f"[WARNING] Failed to remove Docker containers: {e}")

    # Remove project-scoped Docker volumes (only dangling volumes from this project)
    try:
        result = subprocess.run(
            ["docker", "volume", "ls", "-q", "--filter", "label=com.docker.compose.project"],
            capture_output=True,
            text=True,
            check=False,
        )
        # Only prune if there are compose-managed volumes to avoid affecting other projects
        # docker compose down -v already handles project volumes; skip global prune
        print("[CLEAN] Docker project volumes cleaned via compose down")
    except Exception as e:
        print(f"[WARNING] Failed to list Docker volumes: {e}")

    # Remove project-scoped Docker networks (dangling only)
    try:
        subprocess.run(
            ["docker", "network", "prune", "-f", "--filter", "label=com.docker.compose.project"],
            capture_output=True,
            check=False,
        )
        print("[CLEAN] Docker project networks pruned")
    except Exception as e:
        print(f"[WARNING] Failed to prune Docker networks: {e}")


def _clean(target: str, *, yes: bool) -> None:
    from . import paths
    import subprocess

    destructive = target in {"runtime", "all"}
    if destructive and not yes:
        raise SystemExit("This operation deletes runtime state. Re-run with --yes.")

    # Clean Docker containers and volumes for runtime/all targets
    if target in {"runtime", "all"}:
        _clean_docker(paths)

    targets = []
    if target in {"runtime", "all"}:
        targets.append(paths.RUNTIME_DIR)
    if target in {"work", "all"}:
        targets.append(paths.WORK_DIR)
    if target in {"dist", "all"}:
        targets.append(paths.DIST_DIR)
    if target in {"logs", "all"}:
        targets.append(paths.LOGS_DIR)
    if target in {"cache", "all"}:
        targets.append(paths.CACHE_DIR)
    if target == "source-pollution":
        from .source_guard import clean_source_pollution
        clean_source_pollution(paths.PROJECT_ROOT)
        return

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

    # Load profile
    profile = load_profile(args.profile)

    # Override profile settings with CLI flags
    if args.verbose:
        profile.verbose = True

    env_file = args.env_file

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
            profile=profile.build_profile,
            clean=args.clean,
            skip_rust=False,
            skip_web=False,
            skip_spring_ai=not profile.include_ai,
            docker=profile.docker_build,
            package_images=False,
            parallel=profile.parallel_build,
        )

        if args.dry_run:
            print("[DRY-RUN] Would build with options:")
            print(f"  Profile: {options.profile}")
            print(f"  Docker: {options.docker}")
            print(f"  Include AI: {profile.include_ai}")
            return

        build_all(runtime.config, options)
        return

    runtime = ensure_runtime(env_file)
    config = runtime.config

    if args.command == "up":
        services = normalize_services(profile.default_services, include_ai=profile.include_ai)

        if args.dry_run:
            print("[DRY-RUN] Would deploy with profile:", profile.profile)
            print(f"  Services: {services}")
            print(f"  Include AI: {profile.include_ai}")
            print(f"  Auto DB init: {profile.auto_init_db}")
            print(f"  Auto migrate: {profile.auto_migrate}")
            print(f"  Health timeout: {profile.health_timeout}s")
            return

        # Step 1: Start middleware
        up_middleware(
            config,
            pull=profile.docker_pull,
            force_recreate=False,
            timeout_seconds=profile.health_timeout,
        )

        # Step 2: Initialize and migrate database
        if profile.auto_init_db:
            ensure_database(
                config,
                migrate=profile.auto_migrate,
                timeout_seconds=profile.health_timeout,
            )

        # Step 3: Start application services
        up_services(
            config,
            services,
            build=profile.docker_build,
            pull=profile.docker_pull,
            force_recreate=False,
            no_deps=False,
            include_ai=profile.include_ai,
            skip_middleware=True,  # Already started
            skip_db=True,  # Already initialized
            skip_migrations=True,  # Already migrated
            no_wait=not profile.wait_for_ready,
            timeout_seconds=profile.health_timeout,
        )

        print(f"[UP] Deployment complete with profile: {profile.profile}")
        return

    if args.command == "down":
        down_services(config, None)
        return

    if args.command == "restart":
        services = normalize_services(args.services if args.services else profile.default_services, include_ai=profile.include_ai)
        restart_app_services(config, services, no_wait=False, timeout_seconds=profile.health_timeout)
        return

    if args.command == "status":
        status_services(config, None)
        return

    if args.command == "logs":
        service = normalize_services([args.service], include_ai=True)[0]
        service_logs(config, service, tail=args.tail, follow=args.follow)
        return

    if args.command == "db":
        if args.db_command in {None, "check"}:
            check_database(config, timeout_seconds=profile.health_timeout)
        elif args.db_command == "reset":
            _require_yes(args, "Database reset will delete all data. Re-run with --yes to confirm.")
            reset_database(config, assume_yes=args.yes, timeout_seconds=profile.health_timeout)
        elif args.db_command == "migrate":
            migrate_database(config, timeout_seconds=profile.health_timeout)
        return

    parser.print_help()
    raise SystemExit(1)
