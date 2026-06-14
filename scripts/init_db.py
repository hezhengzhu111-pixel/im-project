#!/usr/bin/env python3
from __future__ import annotations

import argparse
import sys
import re
from pathlib import Path

from deploy_utils import (
    DEFAULT_APP_SERVICES,
    OPTIONAL_APP_SERVICES,
    DeploymentConfig,
    compose_base_command,
    compose_service_container,
    compose_up_command,
    ensure_docker_environment,
    existing_compose_services,
    fatal,
    load_config,
    resolve_executable,
    run_command,
    validate_compose_services,
    wait_for_service_ready,
)

DATABASE_DECLARATION_PATTERN = re.compile(
    r"^\s*CREATE\s+DATABASE\s+IF\s+NOT\s+EXISTS\s+`?([A-Za-z0-9_]+)`?",
    re.IGNORECASE,
)


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Check or initialize the Rust IM MySQL database.")
    parser.add_argument(
        "mode",
        nargs="?",
        choices=["check", "full"],
        default="check",
        help="Use 'full' to drop and re-import all declared databases. Defaults to check.",
    )
    parser.add_argument("--env-file", help="Path to the deployment env file. Defaults to .env.")
    parser.add_argument(
        "--full",
        action="store_true",
        help="Alias for mode=full. Drops declared databases and imports sql/mysql8/init_all.sql.",
    )
    parser.add_argument(
        "--yes",
        action="store_true",
        help="Confirm destructive full database initialization without prompting.",
    )
    parser.add_argument(
        "--timeout",
        type=int,
        default=180,
        help="Seconds to wait for MySQL readiness.",
    )
    return parser


def declared_database_names(sql_file: Path) -> list[str]:
    names: list[str] = []
    seen: set[str] = set()
    for line in sql_file.read_text(encoding="utf-8").splitlines():
        match = DATABASE_DECLARATION_PATTERN.match(line)
        if match is None:
            continue
        name = match.group(1)
        if name not in seen:
            names.append(name)
            seen.add(name)
    if not names:
        fatal(f"No CREATE DATABASE declarations found in SQL file: {sql_file}")
    return names


def confirm_full_reset(database_names: list[str], *, assume_yes: bool) -> None:
    if assume_yes:
        return
    message = (
        "Full database initialization will drop and re-import: "
        + ", ".join(database_names)
        + ". Type RESET to continue: "
    )
    if not sys.stdin.isatty():
        fatal("Full database initialization is destructive. Re-run with --yes to confirm.")
    answer = input(message).strip()
    if answer != "RESET":
        fatal("Database initialization cancelled.")


def reset_declared_databases(
    docker_cmd: str,
    mysql_container: str,
    mysql_root_password: str,
    database_names: list[str],
) -> None:
    drop_sql = "\n".join(
        f"DROP DATABASE IF EXISTS `{database_name}`;" for database_name in database_names
    )
    print("Dropping databases before full SQL import: " + ", ".join(database_names))
    run_command(
        [
            docker_cmd,
            "exec",
            "-i",
            mysql_container,
            "mysql",
            "-uroot",
            f"-p{mysql_root_password}",
            "--default-character-set=utf8mb4",
            "-e",
            drop_sql,
        ]
    )


def stop_application_services(config: DeploymentConfig) -> None:
    services = existing_compose_services(config, [*DEFAULT_APP_SERVICES, *OPTIONAL_APP_SERVICES])
    if not services:
        print("No application services are defined in docker-compose.yml; skip stop before database reset.")
        return
    print("Stopping application services before full database reset: " + ", ".join(services))
    run_command(
        [*compose_base_command(config), "stop", *services],
        cwd=config.project_dir,
        check=False,
    )


def initialize_database(
    config: DeploymentConfig,
    *,
    full_import: bool = False,
    assume_yes: bool = False,
    timeout_seconds: int = 180,
) -> None:
    validate_compose_services(config, ["im-mysql"])
    database_names = declared_database_names(config.sql_init_file)
    if full_import:
        confirm_full_reset(database_names, assume_yes=assume_yes)
    docker_cmd = resolve_executable("Docker", ["docker"])

    run_command(compose_up_command(config, ["im-mysql"], pull=False), cwd=config.project_dir)
    wait_for_service_ready(config, "im-mysql", timeout_seconds=timeout_seconds)

    if not full_import:
        print(f"SQL file check passed: {config.sql_init_file}")
        print("Declared databases: " + ", ".join(database_names))
        return

    mysql_container = compose_service_container(config, "im-mysql")
    stop_application_services(config)
    reset_declared_databases(
        docker_cmd,
        mysql_container,
        config.mysql_root_password,
        database_names,
    )
    print(f"Importing SQL: {config.sql_init_file}")
    with config.sql_init_file.open("rb") as sql_stream:
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
    print(
        "Database initialization complete. Application services are stopped; "
        "run scripts/deploy_services.py to start them."
    )


def main() -> None:
    args = build_parser().parse_args()
    full_import = args.full or args.mode == "full"
    ensure_docker_environment()
    config = load_config(env_file=args.env_file)
    initialize_database(
        config,
        full_import=full_import,
        assume_yes=args.yes,
        timeout_seconds=args.timeout,
    )


if __name__ == "__main__":
    main()
