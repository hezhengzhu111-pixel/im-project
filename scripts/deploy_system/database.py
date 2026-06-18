from __future__ import annotations

import re
import sys
from pathlib import Path
from typing import Sequence

from deploy_utils import (
    DeploymentConfig,
    compose_service_container,
    compose_up_command,
    fatal,
    resolve_executable,
    run_command,
    validate_compose_services,
    wait_for_service_ready,
)

DATABASE_DECLARATION_PATTERN = re.compile(
    r"^\s*CREATE\s+DATABASE\s+IF\s+NOT\s+EXISTS\s+`?([A-Za-z0-9_]+)`?",
    re.IGNORECASE,
)


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


def ensure_mysql_running(config: DeploymentConfig, *, timeout_seconds: int) -> None:
    validate_compose_services(config, ["im-mysql"])
    run_command(compose_up_command(config, ["im-mysql"], pull=False), cwd=config.project_dir)
    wait_for_service_ready(config, "im-mysql", timeout_seconds=timeout_seconds)


def mysql_exec(
    config: DeploymentConfig,
    *,
    sql: str | None = None,
    sql_file: Path | None = None,
    capture_output: bool = False,
):
    docker_cmd = resolve_executable("Docker", ["docker"])
    mysql_container = compose_service_container(config, "im-mysql")
    command = [
        docker_cmd,
        "exec",
        "-i",
        mysql_container,
        "mysql",
        "-uroot",
        f"-p{config.mysql_root_password}",
        "--default-character-set=utf8mb4",
    ]
    stdin = None
    if sql is not None:
        command.extend(["-e", sql])
    if sql_file is not None:
        stdin = sql_file.open("rb")
    try:
        return run_command(command, stdin=stdin, capture_output=capture_output)
    finally:
        if stdin is not None:
            stdin.close()


def existing_databases(config: DeploymentConfig, database_names: Sequence[str]) -> set[str]:
    if not database_names:
        return set()
    quoted = ",".join("'" + name.replace("'", "''") + "'" for name in database_names)
    result = mysql_exec(
        config,
        sql=(
            "SELECT SCHEMA_NAME FROM information_schema.SCHEMATA "
            f"WHERE SCHEMA_NAME IN ({quoted});"
        ),
        capture_output=True,
    )
    lines = [line.strip() for line in (result.stdout or "").splitlines() if line.strip()]
    return {line for line in lines if line != "SCHEMA_NAME"}


def table_count(config: DeploymentConfig, database_names: Sequence[str]) -> int:
    if not database_names:
        return 0
    quoted = ",".join("'" + name.replace("'", "''") + "'" for name in database_names)
    result = mysql_exec(
        config,
        sql=(
            "SELECT COUNT(*) AS table_count FROM information_schema.TABLES "
            f"WHERE TABLE_SCHEMA IN ({quoted});"
        ),
        capture_output=True,
    )
    for line in reversed([line.strip() for line in (result.stdout or "").splitlines() if line.strip()]):
        if line.isdigit():
            return int(line)
    return 0


def database_needs_bootstrap(config: DeploymentConfig) -> tuple[bool, list[str], int]:
    declared = declared_database_names(config.sql_init_file)
    existing = existing_databases(config, declared)
    missing = [name for name in declared if name not in existing]
    tables = table_count(config, declared)
    return bool(missing or tables == 0), missing, tables


def import_sql(config: DeploymentConfig, sql_file: Path) -> None:
    if not sql_file.is_file():
        fatal(f"SQL file does not exist: {sql_file}")
    print(f"[DB] importing {sql_file}")
    mysql_exec(config, sql_file=sql_file)


def migrate_database(config: DeploymentConfig, *, timeout_seconds: int = 180) -> None:
    ensure_mysql_running(config, timeout_seconds=timeout_seconds)
    print(f"[DB] applying migration {config.sql_migration_file}")
    import_sql(config, config.sql_migration_file)


def ensure_database(
    config: DeploymentConfig,
    *,
    migrate: bool = True,
    timeout_seconds: int = 180,
) -> None:
    ensure_mysql_running(config, timeout_seconds=timeout_seconds)
    needs_bootstrap, missing, tables = database_needs_bootstrap(config)
    if needs_bootstrap:
        reason = "missing databases: " + ", ".join(missing) if missing else "no application tables found"
        print(f"[DB] bootstrap required ({reason})")
        import_sql(config, config.sql_init_file)
    else:
        print(f"[DB] schema already present ({tables} tables)")
    if migrate:
        import_sql(config, config.sql_migration_file)


def reset_database(
    config: DeploymentConfig,
    *,
    assume_yes: bool = False,
    timeout_seconds: int = 180,
) -> None:
    ensure_mysql_running(config, timeout_seconds=timeout_seconds)
    database_names = declared_database_names(config.sql_init_file)
    if not assume_yes:
        if not sys.stdin.isatty():
            fatal("Database reset is destructive. Re-run with --yes to confirm.")
        answer = input(
            "This will drop and re-import "
            + ", ".join(database_names)
            + ". Type RESET to continue: "
        ).strip()
        if answer != "RESET":
            fatal("Database reset cancelled.")

    drop_sql = "\n".join(f"DROP DATABASE IF EXISTS `{name}`;" for name in database_names)
    print("[DB] dropping databases: " + ", ".join(database_names))
    mysql_exec(config, sql=drop_sql)
    import_sql(config, config.sql_init_file)
    import_sql(config, config.sql_migration_file)
    print("[DB] reset complete")


def check_database(config: DeploymentConfig, *, timeout_seconds: int = 180) -> None:
    ensure_mysql_running(config, timeout_seconds=timeout_seconds)
    declared = declared_database_names(config.sql_init_file)
    existing = existing_databases(config, declared)
    missing = [name for name in declared if name not in existing]
    tables = table_count(config, declared)
    print("[DB] declared databases: " + ", ".join(declared))
    if missing:
        print("[DB] missing databases: " + ", ".join(missing))
    print(f"[DB] application table count: {tables}")
    if missing or tables == 0:
        fatal("Database is not initialized. Run `python scripts/imctl.py db ensure`.")
