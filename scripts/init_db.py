#!/usr/bin/env python3
from __future__ import annotations

import argparse

from deploy_utils import (
    compose_service_container,
    compose_up_command,
    ensure_docker_environment,
    load_config,
    resolve_executable,
    run_command,
    wait_for_service_ready,
)


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Initialize the Rust IM MySQL database.")
    parser.add_argument(
        "--full",
        action="store_true",
        help="Import sql/mysql8/init_all.sql. Without this flag, only checks MySQL and the SQL file.",
    )
    return parser


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

    print(f"Importing SQL: {config.sql_init_file}")
    mysql_container = compose_service_container(config, "im-mysql")
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
            ],
            stdin=sql_stream,
        )
    print("Database initialization complete.")


if __name__ == "__main__":
    main()
