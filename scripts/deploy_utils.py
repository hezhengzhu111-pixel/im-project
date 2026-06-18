from __future__ import annotations

import json
import os
import shutil
import subprocess
import sys
import time
from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path
from typing import NoReturn, Sequence

PROJECT_ROOT = Path(__file__).resolve().parents[1]

SENSITIVE_ENV_MARKERS = ("PASSWORD", "SECRET", "TOKEN", "KEY")
DEFAULT_APP_SERVICES = ("im-server", "im-api-server", "im-frontend")
OPTIONAL_APP_SERVICES = ("im-spring-ai",)
ONE_SHOT_SERVICES = frozenset({"im-files-init", "im-db-migrate"})


@dataclass(frozen=True)
class DeploymentConfig:
    project_dir: Path
    env_file: Path
    compose_file: Path
    backend_root: Path
    rust_root: Path
    frontend_root: Path
    sql_init_file: Path
    sql_migration_file: Path
    mysql_root_password: str
    network_name: str


@dataclass(frozen=True)
class ServiceStatus:
    service: str
    container_id: str
    status: str
    health_status: str | None
    exit_code: int | None
    restart_count: int
    ready: bool
    detail: str


def fatal(message: str) -> NoReturn:
    print(f"ERROR: {message}", file=sys.stderr)
    sys.exit(1)


def resolve_env_file(
    project_dir: Path,
    env_file: str | Path | None = None,
    *,
    require_env_file: bool = True,
) -> Path:
    if env_file is None:
        candidate = project_dir / ".env"
    else:
        candidate = Path(env_file)
        if not candidate.is_absolute():
            candidate = project_dir / candidate
    candidate = candidate.resolve()
    if candidate.is_file():
        return candidate
    if require_env_file:
        if env_file is None:
            fatal("Missing .env. Copy .env.example to .env and configure passwords and ports first.")
        fatal(f"Env file does not exist: {candidate}")
    fallback = project_dir / ".env.example"
    if fallback.is_file():
        return fallback.resolve()
    fatal(f"Env file does not exist: {candidate}")


def load_env_file(env_file: Path, *, override: bool = False) -> None:
    if not env_file.is_file():
        return
    for raw_line in env_file.read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        key = key.strip()
        if not key or (not override and key in os.environ):
            continue
        value = value.strip()
        if len(value) >= 2 and value[0] == value[-1] and value[0] in {"'", '"'}:
            value = value[1:-1]
        os.environ[key] = value


def load_config(
    project_dir: Path | None = None,
    *,
    env_file: str | Path | None = None,
    require_env_file: bool = True,
) -> DeploymentConfig:
    root = (project_dir or PROJECT_ROOT).resolve()
    resolved_env_file = resolve_env_file(root, env_file, require_env_file=require_env_file)
    load_env_file(resolved_env_file, override=False)

    config = DeploymentConfig(
        project_dir=root,
        env_file=resolved_env_file,
        compose_file=root / "deploy" / "sit" / "docker-compose.yml",
        backend_root=root,  # spring-ai 已迁移到根目录
        rust_root=root / "rust",
        frontend_root=root / "flutter" / "apps" / "web",
        sql_init_file=root / "sql" / "mysql8" / "init_all.sql",
        sql_migration_file=root / "sql" / "mysql8" / "e2ee_migration.sql",
        mysql_root_password=os.getenv("MYSQL_ROOT_PASSWORD", "root123"),
        network_name=os.getenv("GLOBAL_DOCKER_NETWORK", "im-sit-network"),
    )
    ensure_project_layout(config)
    return config


def ensure_project_layout(config: DeploymentConfig) -> None:
    required_files = [
        config.rust_root / "Cargo.toml",
        config.rust_root / "apps" / "api-server" / "Dockerfile",
        config.rust_root / "apps" / "im-server" / "Dockerfile",
        config.backend_root / "spring-ai" / "Dockerfile",
        config.frontend_root / "pubspec.yaml",
        config.frontend_root / "Dockerfile",
        config.frontend_root / "nginx.conf",
        config.sql_init_file,
        config.sql_migration_file,
        config.compose_file,
    ]
    missing = [relative(path) for path in required_files if not path.is_file()]
    if missing:
        fatal("Project layout is incomplete. Missing files: " + ", ".join(missing))


def read_int_env(name: str, default: int, *, minimum: int = 1) -> int:
    raw_value = os.getenv(name, str(default)).strip()
    try:
        value = int(raw_value)
    except ValueError:
        fatal(f"Environment variable {name} must be an integer, got: {raw_value}")
    if value < minimum:
        fatal(f"Environment variable {name} must be >= {minimum}, got: {value}")
    return value


def hot_redis_services(prefix: str, env_key: str) -> list[str]:
    count = read_int_env(env_key, 1)
    services = [prefix]
    for index in range(2, count + 1):
        services.append(f"{prefix}-{index}")
    return services


def middleware_services() -> list[str]:
    services = ["im-mysql", "im-redis"]
    services.extend(hot_redis_services("im-redis-private-hot", "IM_PRIVATE_HOT_SHARDS"))
    services.extend(hot_redis_services("im-redis-group-hot", "IM_GROUP_HOT_SHARDS"))
    services.append("im-files-init")
    return services


def known_application_services(*, include_optional: bool = True) -> list[str]:
    services = list(DEFAULT_APP_SERVICES)
    if include_optional:
        services.extend(OPTIONAL_APP_SERVICES)
    return services


def resolve_executable(name: str, candidates: Sequence[str]) -> str:
    for candidate in candidates:
        found = shutil.which(candidate)
        if found:
            return found
    fatal(f"Executable not found: {name}")


@lru_cache(maxsize=4)
def resolve_docker_compose_command(docker_cmd: str) -> tuple[str, ...]:
    result = run_command([docker_cmd, "compose", "version"], capture_output=True, check=False)
    if result.returncode == 0:
        return (docker_cmd, "compose")
    docker_compose = shutil.which("docker-compose")
    if docker_compose:
        return (docker_compose,)
    fatal("Docker Compose was not found. Install the Docker Compose plugin or docker-compose.")


def ensure_docker_environment() -> None:
    docker_cmd = resolve_executable("Docker", ["docker"])
    result = run_command([docker_cmd, "info"], capture_output=True, check=False)
    if result.returncode != 0:
        details = command_failure_details(result)
        fatal("Docker is not reachable. Start Docker Desktop or the Docker daemon first." + details)
    resolve_docker_compose_command(docker_cmd)


def compose_base_command(config: DeploymentConfig) -> list[str]:
    docker_cmd = resolve_executable("Docker", ["docker"])
    compose_cmd = list(resolve_docker_compose_command(docker_cmd))
    command = [*compose_cmd, "--env-file", str(config.env_file), "-f", str(config.compose_file)]
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
) -> subprocess.CompletedProcess:
    printable = format_command(command)
    print(f"$ {printable}")
    kwargs: dict[str, object] = {
        "cwd": str(cwd) if cwd else None,
        "stdin": stdin,
        "capture_output": capture_output,
    }
    if stdin is None:
        kwargs.update({"text": True, "encoding": "utf-8", "errors": "replace"})
    else:
        kwargs.update({"text": False})
    completed = subprocess.run([str(part) for part in command], **kwargs)
    if check and completed.returncode != 0:
        details = command_failure_details(completed)
        fatal(f"Command failed with exit code {completed.returncode}: {printable}{details}")
    return completed


def command_failure_details(completed: subprocess.CompletedProcess) -> str:
    details: list[str] = []
    stdout = completed.stdout
    stderr = completed.stderr
    if isinstance(stdout, bytes):
        stdout = stdout.decode("utf-8", "replace")
    if isinstance(stderr, bytes):
        stderr = stderr.decode("utf-8", "replace")
    if isinstance(stdout, str) and stdout.strip():
        details.append("stdout:\n" + redact_text(stdout.strip()))
    if isinstance(stderr, str) and stderr.strip():
        details.append("stderr:\n" + redact_text(stderr.strip()))
    if not details:
        return ""
    return "\n" + "\n".join(details)


def format_command(command: Sequence[object]) -> str:
    return " ".join(redact_command_part(str(part)) for part in command)


def redact_command_part(value: str) -> str:
    if value.startswith("-p") and len(value) > 2:
        return "-p***"
    if "=" in value:
        key, _, raw_value = value.partition("=")
        if is_sensitive_name(key) and raw_value:
            return f"{key}=***"
    return redact_text(value)


def is_sensitive_name(name: str) -> bool:
    upper_name = name.upper()
    return any(marker in upper_name for marker in SENSITIVE_ENV_MARKERS)


def sensitive_env_values() -> list[str]:
    values: list[str] = []
    for key, value in os.environ.items():
        if is_sensitive_name(key) and len(value) >= 6:
            values.append(value)
    return sorted(set(values), key=len, reverse=True)


def redact_text(text: str) -> str:
    redacted = text
    for value in sensitive_env_values():
        redacted = redacted.replace(value, "***")
    return redacted


def compose_config_services(config: DeploymentConfig) -> list[str]:
    result = run_command(
        [*compose_base_command(config), "config", "--services"],
        cwd=config.project_dir,
        capture_output=True,
        check=False,
    )
    if result.returncode != 0:
        fatal("Docker Compose configuration is invalid." + command_failure_details(result))
    services = [line.strip() for line in result.stdout.splitlines() if line.strip()]
    if not services:
        fatal("Docker Compose configuration did not define any services.")
    return services


def validate_compose_services(config: DeploymentConfig, services: Sequence[str]) -> None:
    available = set(compose_config_services(config))
    missing = [service for service in services if service not in available]
    if missing:
        fatal(
            "Services are not defined in docker-compose.yml: "
            + ", ".join(missing)
            + ". Available services: "
            + ", ".join(sorted(available))
        )


def existing_compose_services(config: DeploymentConfig, services: Sequence[str]) -> list[str]:
    available = set(compose_config_services(config))
    return [service for service in services if service in available]


def ensure_docker_network_exists(config: DeploymentConfig) -> None:
    docker_cmd = resolve_executable("Docker", ["docker"])
    result = run_command(
        [docker_cmd, "network", "inspect", config.network_name],
        capture_output=True,
        check=False,
    )
    if result.returncode != 0:
        fatal(f"Docker network was not created: {config.network_name}")


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


def compose_service_container_id(config: DeploymentConfig, service: str) -> str:
    result = run_command(
        [*compose_base_command(config), "ps", "-a", "-q", service],
        cwd=config.project_dir,
        capture_output=True,
        check=False,
    )
    return result.stdout.strip().splitlines()[0] if result.stdout.strip() else ""


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


def service_status(
    config: DeploymentConfig,
    service: str,
    *,
    one_shot: bool = False,
) -> ServiceStatus:
    container_id = compose_service_container_id(config, service)
    if not container_id:
        return ServiceStatus(
            service=service,
            container_id="",
            status="missing",
            health_status=None,
            exit_code=None,
            restart_count=0,
            ready=False,
            detail="container missing",
        )

    state = inspect_container_state(container_id)
    status = str(state.get("Status") or "unknown")
    health_status = (state.get("Health") or {}).get("Status")
    exit_code = state.get("ExitCode")
    restart_count = int(state.get("RestartCount") or 0)
    running = state.get("Running") is True
    if one_shot:
        ready = status == "exited" and exit_code == 0
    else:
        ready = health_status == "healthy" or (health_status is None and running)
    details = [status]
    if health_status:
        details.append(f"health={health_status}")
    if status == "exited":
        details.append(f"exit={exit_code}")
    if restart_count:
        details.append(f"restarts={restart_count}")
    return ServiceStatus(
        service=service,
        container_id=container_id,
        status=status,
        health_status=health_status,
        exit_code=exit_code if isinstance(exit_code, int) else None,
        restart_count=restart_count,
        ready=ready,
        detail=", ".join(details),
    )


def print_service_statuses(statuses: Sequence[ServiceStatus]) -> None:
    if not statuses:
        return
    print("Service status:")
    for status in statuses:
        marker = "ready" if status.ready else "pending"
        print(f"  {status.service}: {marker} ({status.detail})")


def service_recent_logs(config: DeploymentConfig, service: str, *, tail: int = 40) -> str:
    result = run_command(
        [*compose_base_command(config), "logs", "--tail", str(tail), service],
        cwd=config.project_dir,
        capture_output=True,
        check=False,
    )
    parts: list[str] = []
    if result.stdout:
        parts.append(result.stdout.strip())
    if result.stderr:
        parts.append(result.stderr.strip())
    return redact_text("\n".join(part for part in parts if part))


def fail_service(config: DeploymentConfig, service: str, reason: str) -> NoReturn:
    logs = service_recent_logs(config, service)
    if logs:
        fatal(f"{reason}\nRecent {service} logs:\n{logs}")
    fatal(reason)


def wait_for_service_ready(
    config: DeploymentConfig,
    service: str,
    timeout_seconds: int = 180,
) -> None:
    deadline = time.time() + timeout_seconds
    prev_restart_count = -1
    consecutive_restarts = 0
    while time.time() < deadline:
        container_id = compose_service_container_id(config, service)
        if not container_id:
            time.sleep(2)
            continue

        state = inspect_container_state(container_id)
        status = state.get("Status")
        health_status = (state.get("Health") or {}).get("Status")
        if status in {"exited", "dead"}:
            fail_service(config, service, f"Container failed to start: {service}")
        if status == "restarting":
            restart_count = state.get("RestartCount", 0)
            if restart_count == prev_restart_count:
                consecutive_restarts += 1
            else:
                consecutive_restarts = 1
                prev_restart_count = restart_count
            if consecutive_restarts >= 5:
                fail_service(
                    config,
                    service,
                    f"Container {service} is stuck in a restart loop (restart count: {restart_count}).",
                )
            time.sleep(2)
            continue
        consecutive_restarts = 0
        prev_restart_count = -1
        if health_status == "healthy" or (health_status is None and state.get("Running") is True):
            print(f"Service is ready: {service}")
            return
        time.sleep(2)
    fail_service(config, service, f"Timed out waiting for service: {service}")


def wait_for_service_completed(
    config: DeploymentConfig,
    service: str,
    timeout_seconds: int = 120,
) -> None:
    deadline = time.time() + timeout_seconds
    while time.time() < deadline:
        container_id = compose_service_container_id(config, service)
        if not container_id:
            time.sleep(2)
            continue
        state = inspect_container_state(container_id)
        status = state.get("Status")
        exit_code = state.get("ExitCode")
        if status == "exited" and exit_code == 0:
            print(f"Service completed: {service}")
            return
        if status in {"exited", "dead"}:
            fail_service(config, service, f"Service failed: {service}")
        time.sleep(2)
    fail_service(config, service, f"Timed out waiting for service completion: {service}")


def print_compose_status(config: DeploymentConfig) -> None:
    result = run_command(
        [*compose_base_command(config), "ps"],
        cwd=config.project_dir,
        capture_output=True,
        check=False,
    )
    if result.stdout.strip():
        print(redact_text(result.stdout.strip()))
    if result.stderr.strip():
        print(redact_text(result.stderr.strip()), file=sys.stderr)


def relative(path: Path) -> str:
    try:
        return path.resolve().relative_to(PROJECT_ROOT).as_posix()
    except ValueError:
        return str(path)
