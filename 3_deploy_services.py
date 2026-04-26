from __future__ import annotations

import argparse
import os
from dataclasses import dataclass, field
from pathlib import Path
from typing import Optional

from deploy_utils import (
    ELASTICSEARCH_CONTAINER_NAME,
    KAFKA_CONTAINER_NAME,
    KAFKA_INTERNAL_PORT,
    MAVEN_SETTINGS_FILE,
    MYSQL_CONTAINER_NAME,
    NACOS_CONTAINER_NAME,
    REDIS_CONTAINER_NAME,
    REDIS_INTERNAL_PORT,
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
    native_image_name: Optional[str] = None
    native_binary_name: Optional[str] = None


SERVICE_ORDER: list[ServiceDefinition] = [
    ServiceDefinition(
        key="auth-service",
        host_port_field="auth_service_port",
        container_port=8084,
        container_name="im-auth-service",
        image_name="im-project/auth-service:latest",
        kind="rust-backend",
        module_dir="auth-rs",
        required_containers=(REDIS_CONTAINER_NAME,),
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
        native_image_name="im-user-service-native:latest",
        native_binary_name="im-user-service",
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
        native_image_name="im-group-service-native:latest",
        native_binary_name="im-group-service",
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
        native_image_name="im-message-service-native:latest",
        native_binary_name="im-message-service",
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
        native_image_name="im-file-service-native:latest",
        native_binary_name="im-file-service",
    ),
    ServiceDefinition(
        key="im-server",
        host_port_field="im_server_port",
        container_port=8083,
        container_name="im-server",
        image_name="im-project/im-server:latest",
        kind="rust-backend",
        module_dir="im-server-rs",
        required_containers=(REDIS_CONTAINER_NAME, KAFKA_CONTAINER_NAME, "im-auth-service", "im-group-service"),
        extra_env={
            "IM_SERVER_RS_PORT": "8083",
            "IM_INSTANCE_ID": "im-server:8083",
            "IM_AUTH_SERVICE_URL": "http://im-auth-service:8084",
            "IM_GROUP_SERVICE_URL": "http://im-group-service:8086",
            "IM_KAFKA_BOOTSTRAP_SERVERS": f"{KAFKA_CONTAINER_NAME}:{KAFKA_INTERNAL_PORT}",
        },
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
        native_image_name="im-log-service-native:latest",
        native_binary_name="log-service",
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
        native_image_name="im-registry-monitor-native:latest",
        native_binary_name="im-registry-monitor",
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
            "IM_AUTH_ROUTE_URI": "http://im-auth-service:8084",
            "IM_ROUTE_AUTH_HOST": "im-auth-service",
            "IM_ROUTE_USER_HOST": "im-user-service",
            "IM_ROUTE_GROUP_HOST": "im-group-service",
            "IM_ROUTE_MESSAGE_HOST": "im-message-service",
            "IM_ROUTE_FILE_HOST": "im-file-service",
            "IM_ROUTE_IM_SERVER_HOST": "im-server",
            "IM_SERVER_ROUTE_URI": "http://im-server:8083",
            "IM_SERVER_WS_ROUTE_URI": "ws://im-server:8083",
        },
        native_image_name="im-gateway-native:latest",
        native_binary_name="im-gateway",
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
    parser = argparse.ArgumentParser(description="Deploy IM Project services.")
    parser.add_argument(
        "--native-services",
        default=os.getenv("IM_NATIVE_SERVICES", ""),
        help=(
            "Comma-separated Java backend service keys to build and run as GraalVM native images. "
            "Example: --native-services registry-monitor,gateway"
        ),
    )
    for definition in SERVICE_ORDER:
        dest = definition.key.replace("-", "_")
        parser.add_argument(
            f"-{definition.key}",
            f"--{definition.key}",
            dest=dest,
            action="store_true",
            help=f"Only deploy {definition.key}",
        )
    return parser


def selected_services(args: argparse.Namespace) -> list[ServiceDefinition]:
    explicit_selection = [
        definition
        for definition in SERVICE_ORDER
        if getattr(args, definition.key.replace("-", "_"))
    ]
    return explicit_selection or SERVICE_ORDER


def parse_native_services(raw: str) -> set[str]:
    return {item.strip() for item in raw.split(",") if item.strip()}


def resolve_native_services(args: argparse.Namespace) -> set[str]:
    requested = parse_native_services(args.native_services)
    if not requested:
        return set()

    definitions_by_key = {definition.key: definition for definition in SERVICE_ORDER}
    unknown = requested - definitions_by_key.keys()
    if unknown:
        fatal(f"Unknown native services: {', '.join(sorted(unknown))}")

    invalid = {
        key
        for key in requested
        if (
            definitions_by_key[key].kind != "backend"
            or definitions_by_key[key].native_image_name is None
            or definitions_by_key[key].native_binary_name is None
        )
    }
    if invalid:
        fatal(f"Services do not support GraalVM native build: {', '.join(sorted(invalid))}")

    return requested


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


def build_backend_env(
    config: DeploymentConfig,
    definition: ServiceDefinition,
    *,
    native: bool = False,
) -> dict[str, str]:
    if definition.kind == "rust-backend":
        environment = {
            "TZ": "Asia/Shanghai",
            "REDIS_URL": f"redis://:{config.redis_password}@{REDIS_CONTAINER_NAME}:{REDIS_INTERNAL_PORT}/0",
            "IM_INTERNAL_SECRET": config.im_internal_secret,
            "IM_GATEWAY_AUTH_SECRET": config.im_gateway_auth_secret,
        }
        if definition.key == "auth-service":
            environment.update(
                {
                    "AUTH_RS_PORT": str(definition.container_port),
                    "JWT_SECRET": config.jwt_secret,
                    "AUTH_REFRESH_SECRET": config.auth_refresh_secret,
                }
            )
        elif definition.key == "im-server":
            environment.update(
                {
                    "IM_SERVER_RS_PORT": str(definition.container_port),
                    "IM_AUTH_SERVICE_URL": "http://im-auth-service:8084",
                    "IM_GROUP_SERVICE_URL": "http://im-group-service:8086",
                    "IM_KAFKA_BOOTSTRAP_SERVERS": f"{KAFKA_CONTAINER_NAME}:{KAFKA_INTERNAL_PORT}",
                    "IM_INSTANCE_ID": "im-server:8083",
                }
            )
        environment.update(definition.extra_env)
        return environment

    environment = build_common_backend_environment(config)
    if native:
        environment.update(
            {
                "SPRING_PROFILES_ACTIVE": "sit,native",
                "SPRING_CLOUD_REFRESH_ENABLED": "false",
                "SPRING_CLOUD_OPENFEIGN_LAZY_ATTRIBUTES_RESOLUTION": "false",
                "SPRING_CLOUD_OPENFEIGN_CLIENT_REFRESH_ENABLED": "false",
            }
        )
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


def resolved_image_name(definition: ServiceDefinition, native: bool) -> str:
    if native:
        if definition.native_image_name is None:
            fatal(f"Service does not define a native image name: {definition.key}")
        return definition.native_image_name
    return definition.image_name


def build_java_backend_image(
    config: DeploymentConfig,
    mvn_cmd: str,
    docker_cmd: str,
    definition: ServiceDefinition,
    image_name: str,
    *,
    native: bool,
) -> None:
    if native:
        assert definition.native_binary_name is not None
        run_command(
            [
                docker_cmd,
                "build",
                "-f",
                config.backend_code_root / "Dockerfile.native",
                "--build-arg",
                f"MODULE_DIR={definition.module_dir}",
                "--build-arg",
                f"NATIVE_BINARY={definition.native_binary_name}",
                "-t",
                image_name,
                ".",
            ],
            cwd=config.backend_code_root,
            env={"DOCKER_BUILDKIT": "1"},
        )
        return

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
        [docker_cmd, "build", "-t", image_name, "."],
        cwd=config.backend_code_root / definition.module_dir,
    )


def deploy_backend_service(
    config: DeploymentConfig,
    docker_cmd: str,
    mvn_cmd: str,
    definition: ServiceDefinition,
    native_services: set[str],
) -> None:
    assert definition.module_dir is not None

    service_root = config.backend_code_root / definition.module_dir
    ensure_module_layout(service_root, definition)
    assert_required_containers_running(docker_cmd, definition)
    native = definition.key in native_services
    image_name = resolved_image_name(definition, native)

    print(f"\n===== 部署后端服务: {definition.key} =====")
    if native:
        print(f"Using GraalVM native image build for {definition.key}: {image_name}")
    stop_container_if_running(docker_cmd, definition.container_name)
    remove_container_if_exists(docker_cmd, definition.container_name)
    remove_image_if_exists(docker_cmd, image_name)

    if definition.kind == "backend":
        build_java_backend_image(
            config,
            mvn_cmd,
            docker_cmd,
            definition,
            image_name,
            native=native,
        )
    elif definition.kind == "rust-backend":
        run_command(
            [docker_cmd, "build", "-t", image_name, "."],
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
    docker_run_command.extend(env_to_docker_args(build_backend_env(config, definition, native=native)))

    if definition.volume_name and definition.volume_target:
        ensure_docker_volume(docker_cmd, definition.volume_name)
        docker_run_command.extend(["-v", f"{definition.volume_name}:{definition.volume_target}"])

    docker_run_command.append(image_name)

    run_command(docker_run_command)
    wait_for_container(docker_cmd, definition.container_name, timeout_seconds=180)


def deploy_frontend(
    config: DeploymentConfig,
    docker_cmd: str,
    definition: ServiceDefinition,
) -> None:
    frontend_root = config.frontend_root
    ensure_frontend_layout(config)

    print(f"\n===== 部署前端服务: {definition.key} =====")
    stop_container_if_running(docker_cmd, definition.container_name)
    remove_container_if_exists(docker_cmd, definition.container_name)
    remove_image_if_exists(docker_cmd, definition.image_name)

    print("前端将通过 Dockerfile 的 Node builder 阶段完成依赖安装和构建，宿主机无需 npm。")
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
    native_services = resolve_native_services(args)
    selected_keys = {definition.key for definition in definitions}
    native_not_selected = native_services - selected_keys
    if native_not_selected:
        fatal(f"Native services must also be selected for deployment: {', '.join(sorted(native_not_selected))}")
    needs_backend_layout = any(definition.kind in {"backend", "rust-backend"} for definition in definitions)
    needs_maven = any(definition.kind == "backend" for definition in definitions)

    config = load_config()
    docker_cmd = resolve_executable("Docker", ["docker"])
    git_cmd = resolve_executable("Git", ["git"])
    mvn_cmd = ensure_maven_ready() if needs_maven else ""

    synchronize_repository(config, git_cmd)
    if needs_backend_layout:
        ensure_backend_layout(config)
    ensure_frontend_layout(config)
    ensure_docker_network(docker_cmd, config.global_docker_network)
    print("本次部署目标:")
    for definition in definitions:
        suffix = " (native)" if definition.key in native_services else ""
        print(f"  - {definition.key}{suffix}")

    for definition in definitions:
        if definition.kind in {"backend", "rust-backend"}:
            deploy_backend_service(config, docker_cmd, mvn_cmd, definition, native_services)
        else:
            deploy_frontend(config, docker_cmd, definition)

    print("\n服务部署完成。")


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        fatal("操作已取消。")
