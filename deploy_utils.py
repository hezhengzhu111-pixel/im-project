from __future__ import annotations

import json
import os
import shlex
import shutil
import subprocess
import sys
import time
from dataclasses import dataclass
from pathlib import Path
from typing import IO, Any, Mapping, NoReturn, Sequence

from dotenv import load_dotenv

MYSQL_CONTAINER_NAME = "im-mysql"
REDIS_CONTAINER_NAME = "im-redis"
NACOS_CONTAINER_NAME = "im-nacos"
ZOOKEEPER_CONTAINER_NAME = "im-zookeeper"
KAFKA_CONTAINER_NAME = "im-kafka"
ELASTICSEARCH_CONTAINER_NAME = "admin-es"

MYSQL_INTERNAL_PORT = 3306
REDIS_INTERNAL_PORT = 6379
NACOS_INTERNAL_PORT = 8848
ZOOKEEPER_INTERNAL_PORT = 2181
KAFKA_INTERNAL_PORT = 29092
KAFKA_EXTERNAL_PORT = 9092
ELASTICSEARCH_INTERNAL_PORT = 9200


@dataclass(frozen=True)
class DeploymentConfig:
    project_dir: Path
    env_file: Path
    global_docker_network: str
    git_repo_url: str
    git_branch: str
    backend_code_root: Path
    mysql_port: int
    redis_port: int
    nacos_port: int
    kafka_port: int
    elasticsearch_port: int
    mysql_root_password: str
    redis_password: str
    nacos_username: str
    nacos_password: str
    kafka_password: str
    elasticsearch_password: str
    gateway_port: int
    auth_service_port: int
    user_service_port: int
    group_service_port: int
    message_service_port: int
    im_server_port: int
    file_service_port: int
    log_service_port: int
    registry_monitor_port: int
    frontend_port: int
    jwt_secret: str
    auth_refresh_secret: str
    im_internal_secret: str
    im_gateway_auth_secret: str

    @property
    def repo_root(self) -> Path:
        return self.backend_code_root.parent

    @property
    def frontend_root(self) -> Path:
        return self.repo_root / "frontend"

    @property
    def middleware_dir(self) -> Path:
        return self.project_dir / "im-middleware"

    @property
    def sql_init_file(self) -> Path:
        return self.backend_code_root / "sql" / "mysql8" / "init_all.sql"

    @property
    def file_service_volume_name(self) -> str:
        return "im-file-service-data"


def fatal(message: str) -> NoReturn:
    print(f"ERROR: {message}", file=sys.stderr)
    sys.exit(1)


def load_config(base_dir: Path | None = None) -> DeploymentConfig:
    project_dir = (base_dir or Path.cwd()).resolve()
    env_file = project_dir / ".env"
    if not env_file.is_file():
        fatal(
            f"未找到环境文件: {env_file}\n"
            "请先基于 .env.example 创建 .env，并填写所有必需配置。"
        )

    load_dotenv(env_file, override=True)

    return DeploymentConfig(
        project_dir=project_dir,
        env_file=env_file,
        global_docker_network=_get_optional_env("GLOBAL_DOCKER_NETWORK", "im-network"),
        git_repo_url=_get_required_env("GIT_REPO_URL"),
        git_branch=_get_required_env("GIT_BRANCH"),
        backend_code_root=_resolve_path(_get_required_env("BACKEND_CODE_ROOT"), project_dir),
        mysql_port=_get_required_int_env("MYSQL_PORT"),
        redis_port=_get_required_int_env("REDIS_PORT"),
        nacos_port=_get_required_int_env("NACOS_PORT"),
        kafka_port=_get_required_int_env("KAFKA_PORT"),
        elasticsearch_port=_get_required_int_env("ELASTICSEARCH_PORT"),
        mysql_root_password=_get_required_env("MYSQL_ROOT_PASSWORD"),
        redis_password=_get_required_env("REDIS_PASSWORD"),
        nacos_username=_get_required_env("NACOS_USERNAME"),
        nacos_password=_get_required_env("NACOS_PASSWORD"),
        kafka_password=_get_required_env("KAFKA_PASSWORD"),
        elasticsearch_password=_get_required_env("ELASTICSEARCH_PASSWORD"),
        gateway_port=_get_required_int_env("GATEWAY_PORT"),
        auth_service_port=_get_required_int_env("AUTH_SERVICE_PORT"),
        user_service_port=_get_required_int_env("USER_SERVICE_PORT"),
        group_service_port=_get_required_int_env("GROUP_SERVICE_PORT"),
        message_service_port=_get_required_int_env("MESSAGE_SERVICE_PORT"),
        im_server_port=_get_required_int_env("IM_SERVER_PORT"),
        file_service_port=_get_required_int_env("FILE_SERVICE_PORT"),
        log_service_port=_get_required_int_env("LOG_SERVICE_PORT"),
        registry_monitor_port=_get_required_int_env("REGISTRY_MONITOR_PORT"),
        frontend_port=_get_required_int_env("FRONTEND_PORT"),
        jwt_secret=_get_required_env("JWT_SECRET"),
        auth_refresh_secret=_get_required_env("AUTH_REFRESH_SECRET"),
        im_internal_secret=_get_required_env("IM_INTERNAL_SECRET"),
        im_gateway_auth_secret=_get_required_env("IM_GATEWAY_AUTH_SECRET"),
    )


def _get_required_env(name: str) -> str:
    value = os.getenv(name, "").strip()
    if not value:
        fatal(f".env 中缺少必填项或值为空: {name}")
    return value


def _get_optional_env(name: str, default: str) -> str:
    value = os.getenv(name, "").strip()
    return value or default


def _get_required_int_env(name: str) -> int:
    raw_value = _get_required_env(name)
    try:
        value = int(raw_value)
    except ValueError as exc:
        fatal(f".env 中的 {name} 必须是整数，当前值: {raw_value}")
        raise exc

    if value <= 0 or value > 65535:
        fatal(f".env 中的 {name} 超出有效端口范围: {value}")
    return value


def _resolve_path(raw_path: str, base_dir: Path) -> Path:
    path = Path(raw_path)
    if not path.is_absolute():
        path = (base_dir / path).resolve()
    else:
        path = path.resolve()
    return path


def resolve_executable(display_name: str, candidates: Sequence[str]) -> str:
    for candidate in candidates:
        resolved = shutil.which(candidate)
        if resolved:
            return resolved
    fatal(f"未找到 {display_name} 命令，请确认它已经安装并且在 PATH 中可用。")


def resolve_docker_compose_command(docker_cmd: str) -> list[str]:
    docker_compose_check = subprocess.run(
        [docker_cmd, "compose", "version"],
        capture_output=True,
        text=True,
        check=False,
    )
    if docker_compose_check.returncode == 0:
        return [docker_cmd, "compose"]

    if shutil.which("docker-compose"):
        docker_compose_binary_check = subprocess.run(
            ["docker-compose", "version"],
            capture_output=True,
            text=True,
            check=False,
        )
        if docker_compose_binary_check.returncode == 0:
            return ["docker-compose"]

    fatal("未找到可用的 docker compose 命令，请安装 Docker Compose 插件或 docker-compose。")


def run_command(
    command: Sequence[str | Path],
    *,
    cwd: Path | None = None,
    env: Mapping[str, str] | None = None,
    capture_output: bool = False,
    stdin: IO[Any] | None = None,
    check: bool = True,
) -> subprocess.CompletedProcess[Any]:
    command_parts = [str(part) for part in command]
    printable_command = " ".join(shlex.quote(part) for part in command_parts)
    if cwd is not None:
        print(f"\n>>> {printable_command}    [cwd={cwd}]")
    else:
        print(f"\n>>> {printable_command}")

    completed = subprocess.run(
        command_parts,
        cwd=str(cwd) if cwd else None,
        env={**os.environ, **env} if env else None,
        stdin=stdin,
        capture_output=capture_output,
        text=capture_output,
        check=False,
    )

    if check and completed.returncode != 0:
        if capture_output:
            if completed.stdout:
                print(completed.stdout, file=sys.stderr)
            if completed.stderr:
                print(completed.stderr, file=sys.stderr)
        fatal(f"命令执行失败，退出码 {completed.returncode}: {printable_command}")

    return completed


def ensure_directory(path: Path) -> None:
    path.mkdir(parents=True, exist_ok=True)


def write_text_file(path: Path, content: str) -> None:
    ensure_directory(path.parent)
    path.write_text(content, encoding="utf-8")


def ensure_backend_layout(config: DeploymentConfig) -> None:
    pom_file = config.backend_code_root / "pom.xml"
    if not pom_file.is_file():
        fatal(
            "后端代码根路径无效，未找到 backend/pom.xml。\n"
            f"BACKEND_CODE_ROOT={config.backend_code_root}"
        )


def ensure_frontend_layout(config: DeploymentConfig) -> None:
    package_json = config.frontend_root / "package.json"
    dockerfile = config.frontend_root / "Dockerfile"
    nginx_conf = config.frontend_root / "nginx.conf"
    missing_files = [
        str(path) for path in (package_json, dockerfile, nginx_conf) if not path.is_file()
    ]
    if missing_files:
        fatal(f"前端目录结构不完整，缺少文件: {', '.join(missing_files)}")


def ensure_docker_network(docker_cmd: str, network_name: str) -> None:
    if docker_network_exists(docker_cmd, network_name):
        print(f"Docker 网络已存在: {network_name}")
        return

    run_command([docker_cmd, "network", "create", network_name])
    print(f"Docker 网络已创建: {network_name}")


def docker_network_exists(docker_cmd: str, network_name: str) -> bool:
    completed = run_command(
        [docker_cmd, "network", "inspect", network_name],
        capture_output=True,
        check=False,
    )
    return completed.returncode == 0


def docker_volume_exists(docker_cmd: str, volume_name: str) -> bool:
    completed = run_command(
        [docker_cmd, "volume", "inspect", volume_name],
        capture_output=True,
        check=False,
    )
    return completed.returncode == 0


def ensure_docker_volume(docker_cmd: str, volume_name: str) -> None:
    if docker_volume_exists(docker_cmd, volume_name):
        print(f"Docker 卷已存在: {volume_name}")
        return

    run_command([docker_cmd, "volume", "create", volume_name])
    print(f"Docker 卷已创建: {volume_name}")


def docker_container_exists(docker_cmd: str, container_name: str) -> bool:
    return get_container_state(docker_cmd, container_name) is not None


def docker_container_running(docker_cmd: str, container_name: str) -> bool:
    state = get_container_state(docker_cmd, container_name)
    return bool(state and state.get("Running"))


def assert_container_running(docker_cmd: str, container_name: str) -> None:
    if not docker_container_exists(docker_cmd, container_name):
        fatal(f"未找到容器: {container_name}")
    if not docker_container_running(docker_cmd, container_name):
        fatal(f"容器未处于运行状态: {container_name}")


def get_container_state(docker_cmd: str, container_name: str) -> dict[str, Any] | None:
    completed = run_command(
        [docker_cmd, "inspect", container_name, "--format", "{{json .State}}"],
        capture_output=True,
        check=False,
    )
    if completed.returncode != 0:
        return None

    stdout = completed.stdout.strip()
    if not stdout:
        return None

    return json.loads(stdout)


def wait_for_container(
    docker_cmd: str,
    container_name: str,
    *,
    timeout_seconds: int = 180,
    poll_interval_seconds: int = 3,
) -> None:
    deadline = time.time() + timeout_seconds
    while time.time() < deadline:
        state = get_container_state(docker_cmd, container_name)
        if state is None:
            time.sleep(poll_interval_seconds)
            continue

        if state.get("Status") in {"exited", "dead"}:
            fatal(f"容器启动失败，状态为 {state.get('Status')}: {container_name}")

        health = state.get("Health")
        if health:
            if health.get("Status") == "healthy":
                print(f"容器健康检查通过: {container_name}")
                return
            if health.get("Status") == "unhealthy":
                fatal(f"容器健康检查失败: {container_name}")
        elif state.get("Running"):
            print(f"容器已启动: {container_name}")
            return

        time.sleep(poll_interval_seconds)

    fatal(f"等待容器就绪超时: {container_name}")


def docker_image_exists(docker_cmd: str, image_name: str) -> bool:
    completed = run_command(
        [docker_cmd, "image", "inspect", image_name],
        capture_output=True,
        check=False,
    )
    return completed.returncode == 0


def stop_container_if_running(docker_cmd: str, container_name: str) -> None:
    if docker_container_running(docker_cmd, container_name):
        run_command([docker_cmd, "stop", container_name])
        print(f"已停止容器: {container_name}")
    else:
        print(f"容器未运行，跳过停止: {container_name}")


def remove_container_if_exists(docker_cmd: str, container_name: str) -> None:
    if docker_container_exists(docker_cmd, container_name):
        run_command([docker_cmd, "rm", "-f", container_name])
        print(f"已删除容器: {container_name}")
    else:
        print(f"容器不存在，跳过删除: {container_name}")


def remove_image_if_exists(docker_cmd: str, image_name: str) -> None:
    if docker_image_exists(docker_cmd, image_name):
        run_command([docker_cmd, "rmi", "-f", image_name])
        print(f"已删除镜像: {image_name}")
    else:
        print(f"镜像不存在，跳过删除: {image_name}")


def synchronize_repository(config: DeploymentConfig, git_cmd: str) -> None:
    repo_root = config.repo_root
    backend_root = config.backend_code_root
    repo_parent = repo_root.parent

    if not repo_root.exists():
        ensure_directory(repo_parent)
        run_command(
            [
                git_cmd,
                "clone",
                "--branch",
                config.git_branch,
                "--single-branch",
                config.git_repo_url,
                str(repo_root),
            ],
            cwd=repo_parent,
        )
    elif not (repo_root / ".git").is_dir():
        fatal(f"仓库根目录存在但不是 Git 仓库: {repo_root}")

    worktree_status = run_command(
        [git_cmd, "status", "--porcelain"],
        cwd=repo_root,
        capture_output=True,
    ).stdout.strip()
    if worktree_status:
        print("检测到当前工作区存在本地改动，跳过自动 git 同步，继续使用当前代码部署。")
    else:
        print("检测到现有工作区，跳过自动 git 同步，继续使用当前代码部署。")

    if not backend_root.exists():
        fatal(f"后端目录不存在: {backend_root}")

    ensure_backend_layout(config)


def build_common_backend_environment(config: DeploymentConfig) -> dict[str, str]:
    return {
        "TZ": "Asia/Shanghai",
        "SPRING_PROFILES_ACTIVE": "sit",
        "SPRING_CONFIG_ADDITIONAL_LOCATION": "classpath:/sit/",
        "JWT_SECRET": config.jwt_secret,
        "AUTH_REFRESH_SECRET": config.auth_refresh_secret,
        "IM_INTERNAL_SECRET": config.im_internal_secret,
        "IM_GATEWAY_AUTH_SECRET": config.im_gateway_auth_secret,
        "IM_MYSQL_HOST": MYSQL_CONTAINER_NAME,
        "IM_MYSQL_PORT": str(MYSQL_INTERNAL_PORT),
        "IM_MYSQL_USERNAME": "root",
        "IM_MYSQL_PASSWORD": config.mysql_root_password,
        "IM_REDIS_HOST": REDIS_CONTAINER_NAME,
        "IM_REDIS_PORT": str(REDIS_INTERNAL_PORT),
        "SPRING_DATA_REDIS_PASSWORD": config.redis_password,
        "IM_NACOS_SERVER_ADDR": f"{NACOS_CONTAINER_NAME}:{NACOS_INTERNAL_PORT}",
        "IM_KAFKA_BOOTSTRAP_SERVERS": f"{KAFKA_CONTAINER_NAME}:{KAFKA_INTERNAL_PORT}",
    }
