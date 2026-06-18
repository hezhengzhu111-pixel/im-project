from __future__ import annotations

import hashlib
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
from . import paths

DATABASE_DECLARATION_PATTERN = re.compile(
    r"^\s*CREATE\s+DATABASE\s+IF\s+NOT\s+EXISTS\s+`?([A-Za-z0-9_]+)`?",
    re.IGNORECASE,
)

SCHEMA_MIGRATIONS_TABLE = "schema_migrations"


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


def discover_migration_files() -> list[Path]:
    """Discover all migration files in the migrations directory."""
    migrations_dir = paths.MIGRATIONS_DIR
    if not migrations_dir.exists():
        return []

    migration_files = sorted(migrations_dir.glob("*.sql"))
    return migration_files


def calculate_checksum(file_path: Path) -> str:
    """Calculate SHA256 checksum of a file."""
    sha256 = hashlib.sha256()
    with open(file_path, 'rb') as f:
        for chunk in iter(lambda: f.read(8192), b''):
            sha256.update(chunk)
    return sha256.hexdigest()


def ensure_schema_migrations_table(config: DeploymentConfig) -> None:
    """Create schema_migrations table if it doesn't exist."""
    # Get first declared database name to use
    declared = declared_database_names(config.sql_init_file)
    if not declared:
        fatal("No databases declared in init SQL file")

    db_name = declared[0]

    # Create table in the first database
    create_table_sql = f"""
    CREATE TABLE IF NOT EXISTS {db_name}.{SCHEMA_MIGRATIONS_TABLE} (
        version VARCHAR(128) PRIMARY KEY,
        checksum VARCHAR(64) NOT NULL,
        applied_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    """
    mysql_exec(config, sql=create_table_sql)


def applied_migrations(config: DeploymentConfig) -> dict[str, str]:
    """Get all applied migrations with their checksums."""
    ensure_schema_migrations_table(config)

    # Get database name
    declared = declared_database_names(config.sql_init_file)
    db_name = declared[0] if declared else None

    if not db_name:
        return {}

    result = mysql_exec(
        config,
        sql=f"SELECT version, checksum FROM {db_name}.{SCHEMA_MIGRATIONS_TABLE};",
        capture_output=True,
    )

    migrations = {}
    lines = [line.strip() for line in (result.stdout or "").splitlines() if line.strip()]

    # Skip header line
    for line in lines[1:]:
        parts = line.split('\t')
        if len(parts) == 2:
            version, checksum = parts
            migrations[version] = checksum

    return migrations


def mark_migration_applied(config: DeploymentConfig, version: str, checksum: str) -> None:
    """Mark a migration as applied."""
    declared = declared_database_names(config.sql_init_file)
    db_name = declared[0] if declared else None

    if not db_name:
        fatal("Cannot mark migration: no database available")

    mysql_exec(
        config,
        sql=f"INSERT INTO {db_name}.{SCHEMA_MIGRATIONS_TABLE} (version, checksum) VALUES ('{version}', '{checksum}');",
    )


def apply_pending_migrations(config: DeploymentConfig) -> int:
    """Apply all pending migrations and return count of applied migrations."""
    ensure_schema_migrations_table(config)

    migration_files = discover_migration_files()
    if not migration_files:
        print("[DB] No migration files found")
        return 0

    applied = applied_migrations(config)
    applied_count = 0

    for migration_file in migration_files:
        version = migration_file.stem
        current_checksum = calculate_checksum(migration_file)

        if version in applied:
            # Verify checksum
            stored_checksum = applied[version]
            if stored_checksum != current_checksum:
                fatal(
                    f"Migration checksum mismatch for {version}!\n"
                    f"  Stored:  {stored_checksum}\n"
                    f"  Current: {current_checksum}\n"
                    f"Applied migrations cannot be modified. Create a new migration instead."
                )
            continue

        # Apply migration
        print(f"[DB] Applying migration: {version}")
        import_sql(config, migration_file)
        mark_migration_applied(config, version, current_checksum)
        applied_count += 1

    if applied_count > 0:
        print(f"[DB] Applied {applied_count} migration(s)")
    else:
        print("[DB] All migrations already applied")

    return applied_count


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


def ensure_database(
    config: DeploymentConfig,
    *,
    migrate: bool = True,
    timeout_seconds: int = 180,
) -> None:
    """Ensure database is initialized and optionally run migrations."""
    ensure_mysql_running(config, timeout_seconds=timeout_seconds)

    needs_bootstrap, missing, tables = database_needs_bootstrap(config)
    if needs_bootstrap:
        reason = "missing databases: " + ", ".join(missing) if missing else "no application tables found"
        print(f"[DB] bootstrap required ({reason})")
        import_sql(config, config.sql_init_file)
    else:
        print(f"[DB] schema already present ({tables} tables)")

    if migrate:
        apply_pending_migrations(config)


def migrate_database(config: DeploymentConfig, *, timeout_seconds: int = 180) -> None:
    """Run pending database migrations."""
    ensure_mysql_running(config, timeout_seconds=timeout_seconds)
    apply_pending_migrations(config)


def reset_database(
    config: DeploymentConfig,
    *,
    assume_yes: bool = False,
    timeout_seconds: int = 180,
) -> None:
    """Reset database by dropping and re-importing."""
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

    # Drop databases
    drop_sql = "\n".join(f"DROP DATABASE IF EXISTS `{name}`;" for name in database_names)
    print("[DB] dropping databases: " + ", ".join(database_names))
    mysql_exec(config, sql=drop_sql)

    # Re-import init SQL
    import_sql(config, config.sql_init_file)

    # Clear migration tracking and re-apply all migrations
    ensure_schema_migrations_table(config)

    # Get database name
    declared = declared_database_names(config.sql_init_file)
    db_name = declared[0] if declared else None
    if db_name:
        mysql_exec(config, sql=f"TRUNCATE TABLE {db_name}.{SCHEMA_MIGRATIONS_TABLE};")

    apply_pending_migrations(config)

    print("[DB] reset complete")


def check_database(config: DeploymentConfig, *, timeout_seconds: int = 180) -> None:
    """Check database status and report findings."""
    ensure_mysql_running(config, timeout_seconds=timeout_seconds)

    # Check declared databases
    declared = declared_database_names(config.sql_init_file)
    existing = existing_databases(config, declared)
    missing = [name for name in declared if name not in existing]
    tables = table_count(config, declared)

    print("[DB] Database Status:")
    print(f"  Declared databases: {', '.join(declared)}")
    if missing:
        print(f"  Missing databases: {', '.join(missing)}")
    else:
        print("  All databases present")
    print(f"  Application table count: {tables}")

    # Check migrations
    migration_files = discover_migration_files()
    print(f"\n[DB] Migrations:")
    print(f"  Migration files found: {len(migration_files)}")

    if migration_files:
        try:
            applied = applied_migrations(config)
            print(f"  Applied migrations: {len(applied)}")

            pending_count = 0
            for migration_file in migration_files:
                version = migration_file.stem
                if version not in applied:
                    pending_count += 1

            print(f"  Pending migrations: {pending_count}")

            # Check for checksum mismatches
            for migration_file in migration_files:
                version = migration_file.stem
                if version in applied:
                    current_checksum = calculate_checksum(migration_file)
                    if applied[version] != current_checksum:
                        print(f"  [ERROR] Checksum mismatch for {version}!")
                        fatal("Migration checksum verification failed.")

        except Exception:
            print("  [INFO] Could not read migration status (table may not exist yet)")

    # Overall status
    if missing or tables == 0:
        print("\n[DB] Status: NOT INITIALIZED")
        print("  Run: python scripts/imctl.py up")
    else:
        print("\n[DB] Status: OK")
