#!/usr/bin/env python3
from __future__ import annotations

import argparse

from deploy_utils import (
    compose_base_command,
    load_config,
    resolve_executable,
    run_command,
    wait_for_container_healthy,
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
    config = load_config()
    docker_cmd = resolve_executable("Docker", ["docker"])

    run_command([*compose_base_command(config), "up", "-d", "im-mysql"], cwd=config.project_dir)
    wait_for_container_healthy(config.mysql_container)

    if not args.full:
        print(f"SQL file check passed: {config.sql_init_file}")
        return

    print(f"Importing SQL: {config.sql_init_file}")
    with config.sql_init_file.open("rb") as sql_stream:
        run_command(
            [
                docker_cmd,
                "exec",
                "-i",
                config.mysql_container,
                "mysql",
                "-uroot",
                f"-p{config.mysql_root_password}",
            ],
            stdin=sql_stream,
        )
    print("Database initialization complete.")


if __name__ == "__main__":
    main()
