from __future__ import annotations

import os
import shutil
import subprocess
import sys
import time
from dataclasses import dataclass
from pathlib import Path
from typing import NoReturn, Sequence

PROJECT_ROOT = Path(__file__).resolve().parents[1]
@dataclass(frozen=True)
class DeploymentConfig:
    project_dir: Path
    env_file: Path
    compose_file: Path
    backend_root: Path
    frontend_root: Path
    sql_init_file: Path
    mysql_root_password: str
    mysql_container: str
    redis_container: str


def fatal(message: str) -> NoReturn:
    print(f"ERROR: {message}", file=sys.stderr)
    sys.exit(1)


def load_env_file(env_file: Path) -> None:
    if not env_file.is_file():
        return
    for raw_line in env_file.read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        key = key.strip()
        if not key or key in os.environ:
            continue
        value = value.strip()
        if len(value) >= 2 and value[0] == value[-1] and value[0] in {"'", '"'}:
            value = value[1:-1]
        os.environ[key] = value


def load_config(project_dir: Path | None = None) -> DeploymentConfig:
    root = (project_dir or PROJECT_ROOT).resolve()
    env_file = root / ".env"
    load_env_file(env_file)

    config = DeploymentConfig(
        project_dir=root,
        env_file=env_file,
        compose_file=root / "deploy" / "sit" / "docker-compose.yml",
        backend_root=root / "backend",
        frontend_root=root / "frontend",
        sql_init_file=root / "sql" / "mysql8" / "init_all.sql",
        mysql_root_password=os.getenv("MYSQL_ROOT_PASSWORD", "root123"),
        mysql_container=os.getenv("IM_MYSQL_CONTAINER", "sit-im-mysql-1"),
        redis_container=os.getenv("IM_REDIS_CONTAINER", "sit-im-redis-1"),
    )
    ensure_project_layout(config)
    return config


def ensure_project_layout(config: DeploymentConfig) -> None:
    required_files = [
        config.backend_root / "Cargo.toml",
        config.backend_root / "api-server-rs" / "Dockerfile",
        config.backend_root / "im-server-rs" / "Dockerfile",
        config.frontend_root / "package.json",
        config.frontend_root / "Dockerfile",
        config.frontend_root / "nginx.conf",
        config.sql_init_file,
        config.compose_file,
    ]
    missing = [str(path) for path in required_files if not path.is_file()]
    if missing:
        fatal("Project layout is incomplete. Missing files: " + ", ".join(missing))


def resolve_executable(name: str, candidates: Sequence[str]) -> str:
    for candidate in candidates:
        found = shutil.which(candidate)
        if found:
            return found
    fatal(f"Executable not found: {name}")


def resolve_docker_compose_command(docker_cmd: str) -> list[str]:
    result = run_command([docker_cmd, "compose", "version"], capture_output=True, check=False)
    if result.returncode == 0:
        return [docker_cmd, "compose"]
    docker_compose = shutil.which("docker-compose")
    if docker_compose:
        return [docker_compose]
    fatal("Docker Compose was not found. Install the Docker Compose plugin or docker-compose.")


def compose_base_command(config: DeploymentConfig) -> list[str]:
    docker_cmd = resolve_executable("Docker", ["docker"])
    compose_cmd = resolve_docker_compose_command(docker_cmd)
    command = [*compose_cmd]
    if config.env_file.is_file():
        command.extend(["--env-file", str(config.env_file)])
    command.extend(["-f", str(config.compose_file)])
    return command


def run_command(
    command: Sequence[object],
    *,
    cwd: Path | None = None,
    stdin=None,
    capture_output: bool = False,
    check: bool = True,
) -> subprocess.CompletedProcess[str]:
    printable = " ".join(str(part) for part in command)
    print(f"$ {printable}")
    completed = subprocess.run(
        [str(part) for part in command],
        cwd=str(cwd) if cwd else None,
        stdin=stdin,
        text=False if stdin is not None else True,
        capture_output=capture_output,
    )
    if check and completed.returncode != 0:
        fatal(f"Command failed with exit code {completed.returncode}: {printable}")
    return completed


def wait_for_container_healthy(container_name: str, timeout_seconds: int = 180) -> None:
    docker_cmd = resolve_executable("Docker", ["docker"])
    deadline = time.time() + timeout_seconds
    while time.time() < deadline:
        result = run_command(
            [docker_cmd, "inspect", container_name, "--format", "{{json .State}}"],
            capture_output=True,
            check=False,
        )
        if result.returncode != 0 or not result.stdout.strip():
            time.sleep(2)
            continue
        state_text = result.stdout.strip()
        if '"Status":"exited"' in state_text or '"Status":"dead"' in state_text:
            fatal(f"Container failed to start: {container_name}")
        if '"Status":"healthy"' in state_text or ('"Health":' not in state_text and '"Running":true' in state_text):
            print(f"Container is ready: {container_name}")
            return
        time.sleep(2)
    fatal(f"Timed out waiting for container: {container_name}")
