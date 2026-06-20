from __future__ import annotations

from pathlib import Path

# Project root
PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent

# Build directory structure
BUILD_DIR = PROJECT_ROOT / "build"
CACHE_DIR = BUILD_DIR / "cache"
DIST_DIR = BUILD_DIR / "dist"
LOGS_DIR = BUILD_DIR / "logs"
REPORTS_DIR = BUILD_DIR / "reports"
RUNTIME_DIR = BUILD_DIR / "runtime"
WORK_DIR = BUILD_DIR / "work"

# Cache subdirectories
CARGO_HOME = CACHE_DIR / "cargo-home"
CARGO_TARGET = CACHE_DIR / "cargo-target"
PUB_CACHE = CACHE_DIR / "pub"
MAVEN_REPO = CACHE_DIR / "maven"
DOCKER_CACHE = CACHE_DIR / "docker"

# Runtime subdirectories
COMPOSE_DIR = RUNTIME_DIR / "compose"
ENV_DIR = RUNTIME_DIR / "env"
MYSQL_DATA = RUNTIME_DIR / "mysql"
REDIS_DATA = RUNTIME_DIR / "redis"
FILES_DATA = RUNTIME_DIR / "files"
RUNTIME_LOGS = RUNTIME_DIR / "logs"
NGINX_DATA = RUNTIME_DIR / "nginx"
NGINX_CONF_DATA = NGINX_DATA / "conf"
NGINX_SSL_DATA = NGINX_DATA / "ssl"

# Generated files
GENERATED_COMPOSE_FILE = COMPOSE_DIR / "docker-compose.generated.yml"
DEFAULT_RUNTIME_ENV_FILE = ENV_DIR / "local.env"

# Manifest
MANIFEST_FILE = BUILD_DIR / "manifest.json"

# Source directories (read-only)
RUST_SOURCE = PROJECT_ROOT / "rust"
FLUTTER_SOURCE = PROJECT_ROOT / "flutter"
SPRING_AI_SOURCE = PROJECT_ROOT / "spring-ai"
SQL_SOURCE = PROJECT_ROOT / "sql"

# Work directories (writable, isolated from source)
RUST_WORK = WORK_DIR / "rust"
FLUTTER_WORK = WORK_DIR / "flutter"
SPRING_AI_WORK = WORK_DIR / "spring-ai"

# Database
SQL_DIR = PROJECT_ROOT / "sql" / "mysql8"
INIT_SQL = SQL_DIR / "init_all.sql"
MIGRATIONS_DIR = SQL_DIR / "migrations"


def relative(path: Path) -> str:
    """Return path relative to project root for display."""
    try:
        return path.relative_to(PROJECT_ROOT).as_posix()
    except ValueError:
        return path.as_posix()


def ensure_directory(path: Path) -> Path:
    """Ensure directory exists and return it."""
    path.mkdir(parents=True, exist_ok=True)
    return path


def ensure_build_structure() -> None:
    """Ensure all build directories exist."""
    for directory in [
        BUILD_DIR,
        CACHE_DIR,
        DIST_DIR,
        LOGS_DIR,
        REPORTS_DIR,
        RUNTIME_DIR,
        WORK_DIR,
        CARGO_HOME,
        CARGO_TARGET,
        PUB_CACHE,
        MAVEN_REPO,
        DOCKER_CACHE,
        COMPOSE_DIR,
        ENV_DIR,
        MYSQL_DATA,
        REDIS_DATA,
        FILES_DATA,
        RUNTIME_LOGS,
        NGINX_DATA,
        NGINX_CONF_DATA,
        NGINX_SSL_DATA,
    ]:
        ensure_directory(directory)
