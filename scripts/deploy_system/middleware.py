from __future__ import annotations

from deploy_utils import (
    ONE_SHOT_SERVICES,
    DeploymentConfig,
    ensure_docker_network_exists,
    middleware_services,
    print_service_statuses,
    service_status,
    validate_compose_services,
)
from .core import compose_up, stop_services, wait_parallel


def middleware_status(config: DeploymentConfig) -> list[str]:
    services = middleware_services()
    validate_compose_services(config, services)
    statuses = [
        service_status(config, service, one_shot=service in ONE_SHOT_SERVICES)
        for service in services
    ]
    print_service_statuses(statuses)
    return services


def up_middleware(
    config: DeploymentConfig,
    *,
    pull: bool = False,
    force_recreate: bool = False,
    no_wait: bool = False,
    timeout_seconds: int = 180,
) -> None:
    services = middleware_services()
    validate_compose_services(config, services)
    statuses = [
        service_status(config, service, one_shot=service in ONE_SHOT_SERVICES)
        for service in services
    ]
    print_service_statuses(statuses)

    targets = [
        status.service
        for status in statuses
        if force_recreate or not status.ready
    ]
    if not targets:
        ensure_docker_network_exists(config)
        print("[MIDDLEWARE] already ready")
        return

    recreate_unready = any(status.container_id and not status.ready for status in statuses)
    print("[MIDDLEWARE] starting: " + ", ".join(targets))
    compose_up(
        config,
        targets,
        pull=pull,
        force_recreate=force_recreate or recreate_unready,
    )
    ensure_docker_network_exists(config)

    if not no_wait:
        wait_parallel(
            config,
            targets,
            timeout_seconds=timeout_seconds,
            completed_services=[service for service in targets if service in ONE_SHOT_SERVICES],
        )
    print("[MIDDLEWARE] ready: " + ", ".join(targets))


def down_middleware(config: DeploymentConfig) -> None:
    stop_services(config, middleware_services())
