from __future__ import annotations

import json
import subprocess
import sys
from concurrent.futures import ThreadPoolExecutor, as_completed
from dataclasses import dataclass
from pathlib import Path
from typing import Callable, Iterable, Sequence

from deploy_utils import (
    DEFAULT_APP_SERVICES,
    OPTIONAL_APP_SERVICES,
    ONE_SHOT_SERVICES,
    DeploymentConfig,
    command_failure_details,
    compose_base_command,
    compose_service_container_id,
    compose_up_command,
    ensure_docker_environment,
    fatal,
    load_config,
    prepare_runtime_files,
    print_service_statuses,
    relative,
    run_command,
    service_status,
    validate_compose_services,
    wait_for_service_completed,
    wait_for_service_ready,
)
from runtime_paths import GENERATED_COMPOSE_FILE, PROJECT_ROOT


@dataclass(frozen=True)
class Runtime:
    config: DeploymentConfig


def ensure_runtime(env_file: str | Path | None = None) -> Runtime:
    """Create runtime env/compose files and return a loaded deployment config."""
    prepare_runtime_files(env_file=env_file)
    ensure_docker_environment()
    return Runtime(load_config(env_file=env_file))


def load_runtime(env_file: str | Path | None = None) -> Runtime:
    """Load an existing runtime config without generating files."""
    ensure_docker_environment()
    return Runtime(load_config(env_file=env_file))


def run_compose(config: DeploymentConfig, args: Sequence[object], *, check: bool = True, capture_output: bool = False):
    return run_command(
        [*compose_base_command(config), *args],
        cwd=config.project_dir,
        check=check,
        capture_output=capture_output,
    )


def compose_up(
    config: DeploymentConfig,
    services: Sequence[str],
    *,
    build: bool = False,
    pull: bool = False,
    no_deps: bool = False,
    force_recreate: bool = False,
) -> None:
    validate_compose_services(config, services)
    run_command(
        compose_up_command(
            config,
            services,
            build=build,
            pull=pull,
            no_deps=no_deps,
            force_recreate=force_recreate,
        ),
        cwd=config.project_dir,
    )


def print_status(config: DeploymentConfig, services: Sequence[str] | None = None) -> None:
    cmd = ["ps", "--format", "table"]
    if services:
        cmd.extend(services)
    run_compose(config, cmd, check=False)


def stop_services(config: DeploymentConfig, services: Sequence[str] | None = None) -> None:
    cmd = ["stop"]
    if services:
        cmd.extend(services)
    run_compose(config, cmd, check=False)


def restart_services(config: DeploymentConfig, services: Sequence[str]) -> None:
    cmd = ["restart", *services]
    run_compose(config, cmd, check=False)


def logs(config: DeploymentConfig, service: str, *, tail: int = 100, follow: bool = False) -> None:
    cmd = ["logs", "--tail", str(tail)]
    if follow:
        cmd.append("--follow")
    cmd.append(service)
    run_compose(config, cmd, check=False)


def wait_parallel(
    config: DeploymentConfig,
    services: Sequence[str],
    *,
    timeout_seconds: int,
    completed_services: Iterable[str] = (),
) -> None:
    """Wait for services concurrently while preserving fatal error messages."""
    services = list(dict.fromkeys(services))
    completed = set(completed_services)
    if not services:
        return

    def wait_one(service: str) -> str:
        try:
            if service in completed:
                wait_for_service_completed(config, service, timeout_seconds=min(timeout_seconds, 120))
            else:
                wait_for_service_ready(config, service, timeout_seconds=timeout_seconds)
            return service
        except SystemExit as exc:
            raise RuntimeError(f"{service} readiness check failed with exit code {exc.code}") from exc

    max_workers = min(len(services), max(1, len(services)))
    failures: list[str] = []
    with ThreadPoolExecutor(max_workers=max_workers) as pool:
        future_map = {pool.submit(wait_one, service): service for service in services}
        for future in as_completed(future_map):
            service = future_map[future]
            try:
                future.result()
            except Exception as exc:  # noqa: BLE001 - show all readiness failures
                failures.append(f"{service}: {exc}")
    if failures:
        fatal("Service readiness failed:\n" + "\n".join(f"  - {item}" for item in failures))


def services_ready(config: DeploymentConfig, services: Sequence[str]) -> bool:
    statuses = [
        service_status(config, service, one_shot=service in ONE_SHOT_SERVICES)
        for service in services
    ]
    print_service_statuses(statuses)
    return all(status.ready for status in statuses)


def image_exists_locally(image_name: str) -> bool:
    result = subprocess.run(
        ["docker", "image", "inspect", image_name],
        capture_output=True,
        text=True,
        encoding="utf-8",
        errors="replace",
    )
    return result.returncode == 0


def load_images_from_manifest(*, parallel: bool = True) -> None:
    manifest_path = PROJECT_ROOT / "build" / "manifest.json"
    if not manifest_path.is_file():
        return
    try:
        manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    except (json.JSONDecodeError, OSError):
        return

    image_names: dict[str, str] = manifest.get("docker_image_names", {})
    tar_paths: dict[str, str] = manifest.get("docker_image_tar_paths", {})
    tasks: list[tuple[str, str, Path]] = []
    for service, image_name in image_names.items():
        if image_exists_locally(image_name):
            continue
        tar_rel = tar_paths.get(service)
        if not tar_rel:
            continue
        tar_path = PROJECT_ROOT / tar_rel
        if tar_path.is_file():
            tasks.append((service, image_name, tar_path))

    if not tasks:
        return

    def load_one(task: tuple[str, str, Path]) -> str:
        service, image_name, tar_path = task
        print(f"[IMAGE] loading {image_name} from {relative(tar_path)}")
        result = subprocess.run(
            ["docker", "load", "-i", str(tar_path)],
            capture_output=True,
            text=True,
            encoding="utf-8",
            errors="replace",
        )
        if result.returncode != 0:
            details = command_failure_details(result)
            raise RuntimeError(f"docker load failed for {service}: {details}")
        if not image_exists_locally(image_name):
            raise RuntimeError(f"docker load finished but image is still missing: {image_name}")
        return service

    if not parallel or len(tasks) == 1:
        for task in tasks:
            load_one(task)
        return

    failures: list[str] = []
    with ThreadPoolExecutor(max_workers=min(len(tasks), 4)) as pool:
        future_map = {pool.submit(load_one, task): task[0] for task in tasks}
        for future in as_completed(future_map):
            service = future_map[future]
            try:
                future.result()
            except Exception as exc:  # noqa: BLE001
                failures.append(f"{service}: {exc}")
    if failures:
        fatal("Docker image loading failed:\n" + "\n".join(f"  - {item}" for item in failures))


def app_services(include_ai: bool = False) -> list[str]:
    services = list(DEFAULT_APP_SERVICES)
    if include_ai:
        services.extend(OPTIONAL_APP_SERVICES)
    return services


def require_generated_compose() -> None:
    if not GENERATED_COMPOSE_FILE.is_file():
        fatal(
            f"Runtime compose file is missing: {relative(GENERATED_COMPOSE_FILE)}. "
            "Run `python scripts/imctl.py runtime ensure` first."
        )
