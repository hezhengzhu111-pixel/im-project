from __future__ import annotations

from pathlib import Path

# Import from new paths module
from deploy_system.paths import (
    PROJECT_ROOT,
    BUILD_DIR,
    RUNTIME_DIR,
    COMPOSE_DIR as RUNTIME_COMPOSE_DIR,
    ENV_DIR as RUNTIME_ENV_DIR,
    MYSQL_DATA as RUNTIME_MYSQL_DIR,
    REDIS_DATA as RUNTIME_REDIS_DIR,
    FILES_DATA as RUNTIME_FILES_DIR,
    RUNTIME_LOGS as RUNTIME_LOGS_DIR,
    NGINX_DATA as RUNTIME_NGINX_DIR,
    NGINX_CONF_DATA as RUNTIME_NGINX_CONF_DIR,
    NGINX_SSL_DATA as RUNTIME_NGINX_SSL_DIR,
    GENERATED_COMPOSE_FILE,
    DEFAULT_RUNTIME_ENV_FILE,
)

# Legacy aliases
SOURCE_COMPOSE_TEMPLATE = PROJECT_ROOT / "scripts" / "templates" / "docker-compose.runtime.yml"
ENV_TEMPLATE_FILE = PROJECT_ROOT / ".env.example"


def relative(path: Path) -> str:
    try:
        return path.resolve().relative_to(PROJECT_ROOT).as_posix()
    except ValueError:
        return path.as_posix()


def docker_path(path: Path) -> str:
    return path.resolve().as_posix()
