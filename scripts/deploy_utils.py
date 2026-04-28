from __future__ import annotations

import json
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
    if not env_file.is_file():
        env_file = root / ".env.example"
    load_env_file(env_file)

    config = DeploymentConfig(
        project_dir=root,
        env_file=env_file,
        compose_file=root / "deploy" / "sit" / "docker-compose.yml",
        backend_root=root / "backend",
        frontend_root=root / "frontend",
        sql_init_file=root / "sql" / "mysql8" / "init_all.sql",
        mysql_root_password=os.getenv("MYSQL_ROOT_PASSWORD", "root123"),
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


def ensure_docker_environment() -> None:
    docker_cmd = resolve_executable("Docker", ["docker"])
    run_command([docker_cmd, "version"], capture_output=True)
    resolve_docker_compose_command(docker_cmd)


def compose_base_command(config: DeploymentConfig) -> list[str]:
    docker_cmd = resolve_executable("Docker", ["docker"])
    compose_cmd = resolve_docker_compose_command(docker_cmd)
    command = [*compose_cmd]
    if config.env_file.is_file():
        command.extend(["--env-file", str(config.env_file)])
    command.extend(["-f", str(config.compose_file)])
    return command


def compose_up_command(
    config: DeploymentConfig,
    services: Sequence[str],
    *,
    build: bool = False,
    pull: bool = False,
    no_deps: bool = False,
    force_recreate: bool = False,
) -> list[str]:
    command = [*compose_base_command(config), "up", "-d"]
    if build:
        command.append("--build")
    if pull:
        command.extend(["--pull", "always"])
    if no_deps:
        command.append("--no-deps")
    if force_recreate:
        command.append("--force-recreate")
    command.extend(services)
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


def compose_service_container(config: DeploymentConfig, service: str) -> str:
    result = run_command(
        [*compose_base_command(config), "ps", "-q", service],
        cwd=config.project_dir,
        capture_output=True,
        check=False,
    )
    container_id = result.stdout.strip()
    if not container_id:
        fatal(f"Compose service is not running: {service}")
    return container_id.splitlines()[0]


def inspect_container_state(container_id: str) -> dict:
    docker_cmd = resolve_executable("Docker", ["docker"])
    result = run_command(
        [docker_cmd, "inspect", container_id, "--format", "{{json .State}}"],
        capture_output=True,
        check=False,
    )
    if result.returncode != 0 or not result.stdout.strip():
        return {}
    try:
        return json.loads(result.stdout.strip())
    except json.JSONDecodeError:
        return {}


def wait_for_service_ready(
    config: DeploymentConfig,
    service: str,
    timeout_seconds: int = 180,
) -> None:
    deadline = time.time() + timeout_seconds
    while time.time() < deadline:
        result = run_command(
            [*compose_base_command(config), "ps", "-q", service],
            cwd=config.project_dir,
            capture_output=True,
            check=False,
        )
        container_id = result.stdout.strip().splitlines()[0] if result.stdout.strip() else ""
        if not container_id:
            time.sleep(2)
            continue

        state = inspect_container_state(container_id)
        status = state.get("Status")
        health_status = (state.get("Health") or {}).get("Status")
        if status in {"exited", "dead"}:
            fatal(f"Container failed to start: {service}")
        if health_status == "healthy" or (health_status is None and state.get("Running") is True):
            print(f"Service is ready: {service}")
            return
        time.sleep(2)
    fatal(f"Timed out waiting for service: {service}")


def wait_for_service_completed(
    config: DeploymentConfig,
    service: str,
    timeout_seconds: int = 120,
) -> None:
    deadline = time.time() + timeout_seconds
    while time.time() < deadline:
        container_id = compose_service_container(config, service)
        state = inspect_container_state(container_id)
        status = state.get("Status")
        exit_code = state.get("ExitCode")
        if status == "exited" and exit_code == 0:
            print(f"Service completed: {service}")
            return
        if status in {"exited", "dead"}:
            fatal(f"Service failed: {service}")
        time.sleep(2)
    fatal(f"Timed out waiting for service completion: {service}")
