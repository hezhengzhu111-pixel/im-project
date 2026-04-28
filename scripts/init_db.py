#!/usr/bin/env python3
from __future__ import annotations

import argparse
import re
from pathlib import Path

from deploy_utils import (
    compose_base_command,
    compose_service_container,
    compose_up_command,
    ensure_docker_environment,
    fatal,
    load_config,
    resolve_executable,
    run_command,
    wait_for_service_ready,
)

DATABASE_DECLARATION_PATTERN = re.compile(
    r"^\s*CREATE\s+DATABASE\s+IF\s+NOT\s+EXISTS\s+`?([A-Za-z0-9_]+)`?",
    re.IGNORECASE,
)
APPLICATION_SERVICES = ["im-frontend", "im-api-server", "im-server"]


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Initialize the Rust IM MySQL database.")
    parser.add_argument(
        "--full",
        action="store_true",
        help=(
            "Drop databases declared by sql/mysql8/init_all.sql and import that full SQL file. "
            "Without this flag, only checks MySQL and the SQL file."
        ),
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


def reset_declared_databases(
    docker_cmd: str,
    mysql_container: str,
    mysql_root_password: str,
    sql_file: Path,
) -> None:
    database_names = declared_database_names(sql_file)
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


def stop_application_services(config) -> None:
    print("Stopping application services before full database reset: " + ", ".join(APPLICATION_SERVICES))
    run_command(
        [*compose_base_command(config), "stop", *APPLICATION_SERVICES],
        cwd=config.project_dir,
        check=False,
    )


def main() -> None:
    args = build_parser().parse_args()
    ensure_docker_environment()
    config = load_config()
    docker_cmd = resolve_executable("Docker", ["docker"])

    run_command(compose_up_command(config, ["im-mysql"], pull=False), cwd=config.project_dir)
    wait_for_service_ready(config, "im-mysql")

    if not args.full:
        print(f"SQL file check passed: {config.sql_init_file}")
        return

    mysql_container = compose_service_container(config, "im-mysql")
    stop_application_services(config)
    reset_declared_databases(
        docker_cmd,
        mysql_container,
        config.mysql_root_password,
        config.sql_init_file,
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
        "run deploy_services.py to start them."
    )


if __name__ == "__main__":
    main()
