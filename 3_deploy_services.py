from __future__ import annotations

import argparse
from dataclasses import dataclass, field
from pathlib import Path
from typing import Optional

from deploy_utils import (
    ELASTICSEARCH_CONTAINER_NAME,
    KAFKA_CONTAINER_NAME,
    MAVEN_SETTINGS_FILE,
    MYSQL_CONTAINER_NAME,
    NACOS_CONTAINER_NAME,
    REDIS_CONTAINER_NAME,
    DeploymentConfig,
    build_common_backend_environment,
    ensure_backend_layout,
    ensure_docker_network,
    ensure_docker_volume,
    ensure_frontend_layout,
    ensure_maven_ready,
    fatal,
    load_config,
    remove_container_if_exists,
    remove_image_if_exists,
    resolve_executable,
    run_command,
    stop_container_if_running,
    synchronize_repository,
    wait_for_container,
)


@dataclass(frozen=True)
class ServiceDefinition:
    key: str
    host_port_field: str
    container_port: int
    container_name: str
    image_name: str
    kind: str
    module_dir: Optional[str] = None
    required_containers: tuple[str, ...] = ()
    extra_env: dict[str, str] = field(default_factory=dict)
    volume_name: Optional[str] = None
    volume_target: Optional[str] = None


SERVICE_ORDER: list[ServiceDefinition] = [
    ServiceDefinition(
        key="auth-service",
        host_port_field="auth_service_port",
        container_port=8084,
        container_name="im-auth-service",
        image_name="im-project/auth-service:latest",
        kind="backend",
        module_dir="auth-service",
        required_containers=(MYSQL_CONTAINER_NAME, REDIS_CONTAINER_NAME, NACOS_CONTAINER_NAME, KAFKA_CONTAINER_NAME),
    ),
    ServiceDefinition(
        key="user-service",
        host_port_field="user_service_port",
        container_port=8085,
        container_name="im-user-service",
        image_name="im-project/user-service:latest",
        kind="backend",
        module_dir="user-service",
        required_containers=(MYSQL_CONTAINER_NAME, REDIS_CONTAINER_NAME, NACOS_CONTAINER_NAME, KAFKA_CONTAINER_NAME),
    ),
    ServiceDefinition(
        key="group-service",
        host_port_field="group_service_port",
        container_port=8086,
        container_name="im-group-service",
        image_name="im-project/group-service:latest",
        kind="backend",
        module_dir="group-service",
        required_containers=(MYSQL_CONTAINER_NAME, REDIS_CONTAINER_NAME, NACOS_CONTAINER_NAME, KAFKA_CONTAINER_NAME),
    ),
    ServiceDefinition(
        key="message-service",
        host_port_field="message_service_port",
        container_port=8087,
        container_name="im-message-service",
        image_name="im-project/message-service:latest",
        kind="backend",
        module_dir="message-service",
        required_containers=(MYSQL_CONTAINER_NAME, REDIS_CONTAINER_NAME, NACOS_CONTAINER_NAME),
    ),
    ServiceDefinition(
        key="file-service",
        host_port_field="file_service_port",
        container_port=8088,
        container_name="im-file-service",
        image_name="im-project/file-service:latest",
        kind="backend",
        module_dir="file-service",
        required_containers=(MYSQL_CONTAINER_NAME, REDIS_CONTAINER_NAME, NACOS_CONTAINER_NAME, KAFKA_CONTAINER_NAME),
        volume_name="im-file-service-data",
        volume_target="/data/im-files",
    ),
    ServiceDefinition(
        key="im-server",
        host_port_field="im_server_port",
        container_port=8083,
        container_name="im-server",
        image_name="im-project/im-server:latest",
        kind="backend",
        module_dir="im-server",
        required_containers=(MYSQL_CONTAINER_NAME, REDIS_CONTAINER_NAME, NACOS_CONTAINER_NAME),
        extra_env={"IM_SELF_URL": "http://im-server:8083"},
    ),
    ServiceDefinition(
        key="log-service",
        host_port_field="log_service_port",
        container_port=8091,
        container_name="im-log-service",
        image_name="im-project/log-service:latest",
        kind="backend",
        module_dir="log-service",
        required_containers=(
            MYSQL_CONTAINER_NAME,
            REDIS_CONTAINER_NAME,
            NACOS_CONTAINER_NAME,
            KAFKA_CONTAINER_NAME,
            ELASTICSEARCH_CONTAINER_NAME,
        ),
        extra_env={"IM_ES_URIS": "http://admin-es:9200"},
    ),
    ServiceDefinition(
        key="registry-monitor",
        host_port_field="registry_monitor_port",
        container_port=8090,
        container_name="im-registry-monitor",
        image_name="im-project/registry-monitor:latest",
        kind="backend",
        module_dir="registry-monitor",
        required_containers=(MYSQL_CONTAINER_NAME, REDIS_CONTAINER_NAME, NACOS_CONTAINER_NAME, KAFKA_CONTAINER_NAME),
        extra_env={"IM_REGISTRY_MONITOR_NACOS_BASE_URL": "http://im-nacos:8848/nacos"},
    ),
    ServiceDefinition(
        key="gateway",
        host_port_field="gateway_port",
        container_port=8082,
        container_name="im-gateway",
        image_name="im-project/gateway:latest",
        kind="backend",
        module_dir="gateway",
        required_containers=(MYSQL_CONTAINER_NAME, REDIS_CONTAINER_NAME, NACOS_CONTAINER_NAME, KAFKA_CONTAINER_NAME),
        extra_env={
            "IM_GATEWAY_AUTH_SERVICE_URL": "http://im-auth-service:8084",
            "IM_ROUTE_AUTH_HOST": "im-auth-service",
            "IM_ROUTE_USER_HOST": "im-user-service",
            "IM_ROUTE_GROUP_HOST": "im-group-service",
            "IM_ROUTE_MESSAGE_HOST": "im-message-service",
            "IM_ROUTE_FILE_HOST": "im-file-service",
            "IM_ROUTE_IM_SERVER_HOST": "im-server",
        },
    ),
    ServiceDefinition(
        key="frontend",
        host_port_field="frontend_port",
        container_port=80,
        container_name="im-frontend",
        image_name="im-project/frontend:latest",
        kind="frontend",
    ),
]


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="部署 IM Project 微服务与前端容器。")
    for definition in SERVICE_ORDER:
        dest = definition.key.replace("-", "_")
        parser.add_argument(
            f"-{definition.key}",
            f"--{definition.key}",
            dest=dest,
            action="store_true",
            help=f"仅部署 {definition.key}",
        )
    return parser


def selected_services(args: argparse.Namespace) -> list[ServiceDefinition]:
    explicit_selection = [
        definition
        for definition in SERVICE_ORDER
        if getattr(args, definition.key.replace("-", "_"))
    ]
    return explicit_selection or SERVICE_ORDER


def assert_required_containers_running(docker_cmd: str, definition: ServiceDefinition) -> None:
    for container_name in definition.required_containers:
        inspect_result = run_command(
            [docker_cmd, "inspect", container_name, "--format", "{{.State.Running}}"],
            capture_output=True,
            check=False,
        )
        if inspect_result.returncode != 0:
            fatal(f"部署 {definition.key} 前缺少依赖容器: {container_name}")

        if inspect_result.stdout.strip().lower() != "true":
            fatal(f"部署 {definition.key} 前依赖容器未运行: {container_name}")


def build_backend_env(config: DeploymentConfig, definition: ServiceDefinition) -> dict[str, str]:
    environment = build_common_backend_environment(config)
    environment.update(definition.extra_env)
    return environment


def env_to_docker_args(environment: dict[str, str]) -> list[str]:
    args: list[str] = []
    for key in sorted(environment):
        args.extend(["--env", f"{key}={environment[key]}"])
    return args


def ensure_module_layout(service_root: Path, definition: ServiceDefinition) -> None:
    dockerfile = service_root / "Dockerfile"
    if not dockerfile.is_file():
        fatal(f"服务 {definition.key} 缺少 Dockerfile: {dockerfile}")


def deploy_backend_service(
    config: DeploymentConfig,
    docker_cmd: str,
    mvn_cmd: str,
    definition: ServiceDefinition,
) -> None:
    assert definition.module_dir is not None

    service_root = config.backend_code_root / definition.module_dir
    ensure_module_layout(service_root, definition)
    assert_required_containers_running(docker_cmd, definition)

    print(f"\n===== 部署后端服务: {definition.key} =====")
    stop_container_if_running(docker_cmd, definition.container_name)
    remove_container_if_exists(docker_cmd, definition.container_name)
    remove_image_if_exists(docker_cmd, definition.image_name)

    run_command(
        [
            mvn_cmd,
            "-s",
            MAVEN_SETTINGS_FILE,
            "-f",
            config.backend_code_root / "pom.xml",
            "clean",
            "package",
            "-pl",
            definition.module_dir,
            "-am",
            "-DskipTests",
        ],
        cwd=config.repo_root,
    )

    run_command(
        [docker_cmd, "build", "-t", definition.image_name, "."],
        cwd=service_root,
    )

    docker_run_command = [
        docker_cmd,
        "run",
        "-d",
        "--restart",
        "unless-stopped",
        "--network",
        config.global_docker_network,
        "--name",
        definition.container_name,
        "-p",
        f"{getattr(config, definition.host_port_field)}:{definition.container_port}",
    ]
    docker_run_command.extend(env_to_docker_args(build_backend_env(config, definition)))

    if definition.volume_name and definition.volume_target:
        ensure_docker_volume(docker_cmd, definition.volume_name)
        docker_run_command.extend(["-v", f"{definition.volume_name}:{definition.volume_target}"])

    docker_run_command.append(definition.image_name)

    run_command(docker_run_command)
    wait_for_container(docker_cmd, definition.container_name, timeout_seconds=180)


def deploy_frontend(
    config: DeploymentConfig,
    docker_cmd: str,
    npm_cmd: str,
    definition: ServiceDefinition,
) -> None:
    frontend_root = config.frontend_root
    ensure_frontend_layout(config)

    print(f"\n===== 部署前端服务: {definition.key} =====")
    stop_container_if_running(docker_cmd, definition.container_name)
    remove_container_if_exists(docker_cmd, definition.container_name)
    remove_image_if_exists(docker_cmd, definition.image_name)

    run_command([npm_cmd, "install"], cwd=frontend_root)
    run_command([npm_cmd, "run", "build:sit"], cwd=frontend_root)
    run_command(
        [
            docker_cmd,
            "build",
            "--build-arg",
            "FRONTEND_BUILD_MODE=sit",
            "-t",
            definition.image_name,
            ".",
        ],
        cwd=frontend_root,
    )

    run_command(
        [
            docker_cmd,
            "run",
            "-d",
            "--restart",
            "unless-stopped",
            "--network",
            config.global_docker_network,
            "--name",
            definition.container_name,
            "--env",
            "TZ=Asia/Shanghai",
            "-p",
            f"{getattr(config, definition.host_port_field)}:{definition.container_port}",
            definition.image_name,
        ]
    )
    wait_for_container(docker_cmd, definition.container_name, timeout_seconds=180)


def main() -> None:
    parser = build_parser()
    args = parser.parse_args()
    definitions = selected_services(args)
    needs_backend = any(definition.kind == "backend" for definition in definitions)
    needs_frontend = any(definition.kind == "frontend" for definition in definitions)

    config = load_config()
    docker_cmd = resolve_executable("Docker", ["docker"])
    git_cmd = resolve_executable("Git", ["git"])
    mvn_cmd = ensure_maven_ready() if needs_backend else ""
    npm_cmd = resolve_executable("npm", ["npm", "npm.cmd"]) if needs_frontend else ""

    synchronize_repository(config, git_cmd)
    ensure_backend_layout(config)
    ensure_frontend_layout(config)
    ensure_docker_network(docker_cmd, config.global_docker_network)
    print("本次部署目标:")
    for definition in definitions:
        print(f"  - {definition.key}")

    for definition in definitions:
        if definition.kind == "backend":
            deploy_backend_service(config, docker_cmd, mvn_cmd, definition)
        else:
            deploy_frontend(config, docker_cmd, npm_cmd, definition)

    print("\n服务部署完成。")


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        fatal("操作已取消。")
