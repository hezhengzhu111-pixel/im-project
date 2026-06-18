from __future__ import annotations

from pathlib import Path


PROJECT_ROOT = Path(__file__).resolve().parents[1]
BUILD_DIR = PROJECT_ROOT / "build"

RUNTIME_DIR = BUILD_DIR / "runtime"
RUNTIME_ENV_DIR = RUNTIME_DIR / "env"
RUNTIME_COMPOSE_DIR = RUNTIME_DIR / "compose"
RUNTIME_MYSQL_DIR = RUNTIME_DIR / "mysql"
RUNTIME_REDIS_DIR = RUNTIME_DIR / "redis"
RUNTIME_FILES_DIR = RUNTIME_DIR / "files"
RUNTIME_LOGS_DIR = RUNTIME_DIR / "logs"

GENERATED_COMPOSE_FILE = RUNTIME_COMPOSE_DIR / "docker-compose.generated.yml"
DEFAULT_RUNTIME_ENV_FILE = RUNTIME_ENV_DIR / "local.env"
SOURCE_COMPOSE_TEMPLATE = PROJECT_ROOT / "deploy" / "sit" / "docker-compose.yml"
ENV_TEMPLATE_FILE = PROJECT_ROOT / ".env.example"


def relative(path: Path) -> str:
    try:
        return path.resolve().relative_to(PROJECT_ROOT).as_posix()
    except ValueError:
        return path.as_posix()


def docker_path(path: Path) -> str:
    return path.resolve().as_posix()
