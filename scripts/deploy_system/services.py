from __future__ import annotations

import os
from urllib.parse import quote_plus

from deploy_utils import (
    DEFAULT_APP_SERVICES,
    OPTIONAL_APP_SERVICES,
    DeploymentConfig,
    read_int_env,
    validate_compose_services,
)
from .core import (
    app_services,
    compose_up,
    load_images_from_manifest,
    logs,
    print_status,
    restart_services,
    stop_services,
    wait_parallel,
)
from .database import ensure_database
from .middleware import up_middleware

SERVICE_ALIASES = {
    "api": "im-api-server",
    "api-server": "im-api-server",
    "gateway": "im-api-server",
    "im": "im-server",
    "im-server": "im-server",
    "chat": "im-server",
    "frontend": "im-frontend",
    "front": "im-frontend",
    "web": "im-frontend",
    "ai": "im-spring-ai",
    "spring-ai": "im-spring-ai",
    "im-spring-ai": "im-spring-ai",
}

SERVICE_GROUPS = {
    "all": [*DEFAULT_APP_SERVICES, *OPTIONAL_APP_SERVICES],
    "default": list(DEFAULT_APP_SERVICES),
    "backend": ["im-server", "im-api-server"],
    "core": ["im-server", "im-api-server"],
}


def normalize_services(raw_services: list[str] | tuple[str, ...], *, include_ai: bool = False) -> list[str]:
    if not raw_services:
        return app_services(include_ai=include_ai)

    services: list[str] = []
    allowed = {*DEFAULT_APP_SERVICES, *OPTIONAL_APP_SERVICES}
    for raw in raw_services:
        key = raw.strip().lower()
        if key in SERVICE_GROUPS:
            targets = list(SERVICE_GROUPS[key])
            if key in {"all"} and not include_ai and "im-spring-ai" in targets:
                targets.remove("im-spring-ai")
        else:
            targets = [SERVICE_ALIASES.get(key, raw)]
        for service in targets:
            if service not in allowed:
                raise SystemExit(f"Unknown service: {raw}")
            if service not in services:
                services.append(service)
    return services


def _hot_urls(host_prefix: str, env_key: str, password: str) -> str:
    count = read_int_env(env_key, 1)
    encoded_pw = quote_plus(password)
    urls = []
    for index in range(1, count + 1):
        suffix = f"-{index}" if index > 1 else ""
        urls.append(f"redis://:{encoded_pw}@{host_prefix}{suffix}:6379/0")
    return ",".join(urls)


def configure_dynamic_redis_urls() -> None:
    password = os.getenv("REDIS_PASSWORD")
    if not password:
        from deploy_utils import fatal
        fatal("REDIS_PASSWORD environment variable is not set. Please configure it in your env file.")
    os.environ.setdefault(
        "IM_PRIVATE_HOT_REDIS_URLS",
        _hot_urls("im-redis-private-hot", "IM_PRIVATE_HOT_SHARDS", password),
    )
    os.environ.setdefault(
        "IM_GROUP_HOT_REDIS_URLS",
        _hot_urls("im-redis-group-hot", "IM_GROUP_HOT_SHARDS", password),
    )


def up_services(
    config: DeploymentConfig,
    services: list[str],
    *,
    build: bool = False,
    pull: bool = False,
    force_recreate: bool = False,
    no_deps: bool = True,
    include_ai: bool = False,
    skip_middleware: bool = False,
    skip_db: bool = False,
    skip_migrations: bool = False,
    no_wait: bool = False,
    timeout_seconds: int = 240,
) -> None:
    validate_compose_services(config, services)
    configure_dynamic_redis_urls()

    if not build:
        load_images_from_manifest(parallel=True)

    if not skip_middleware:
        up_middleware(config, pull=pull, force_recreate=False, no_wait=False, timeout_seconds=timeout_seconds)

    if "im-api-server" in services and not skip_db:
        ensure_database(config, migrate=not skip_migrations, timeout_seconds=timeout_seconds)

    compose_up(
        config,
        services,
        build=build,
        pull=pull,
        no_deps=no_deps,
        force_recreate=force_recreate,
    )

    if not no_wait:
        wait_parallel(config, services, timeout_seconds=timeout_seconds)
    print("[SERVICES] ready: " + ", ".join(services))


def down_services(config: DeploymentConfig, services: list[str] | None = None) -> None:
    stop_services(config, services)


def restart_app_services(
    config: DeploymentConfig,
    services: list[str],
    *,
    no_wait: bool = False,
    timeout_seconds: int = 240,
) -> None:
    restart_services(config, services)
    if not no_wait:
        wait_parallel(config, services, timeout_seconds=timeout_seconds)


def status_services(config: DeploymentConfig, services: list[str] | None = None) -> None:
    print_status(config, services)


def service_logs(config: DeploymentConfig, service: str, *, tail: int = 100, follow: bool = False) -> None:
    logs(config, service, tail=tail, follow=follow)
