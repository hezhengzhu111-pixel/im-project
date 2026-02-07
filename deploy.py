import os
import subprocess
import sys
import time
import socket
import shutil
from pathlib import Path

ROOT = Path(__file__).resolve().parent
BACKEND_DIR = ROOT / "backend"
SQL_FILE = ROOT / "backend" / "sql" / "mysql8" / "init_all.sql"
TEST_SCRIPT = ROOT / "test_im_complete.py"
MAVEN_IMAGE = "maven:3.9-eclipse-temurin-21"
MYSQL_CONTAINER = "im-mysql"
MYSQL_USER = "root"
MYSQL_PASSWORD = "root123"
DROP_DATABASES = [
    "service_user_service_db",
    "service_group_service_db",
    "service_message_service_db",
]
INFRA_SERVICES = ["mysql", "redis", "kafka"]
APP_SERVICES = [
    "im-auth",
    "im-user",
    "im-group",
    "im-message",
    "im-file",
    "im-gateway",
    "im-server",
    "im-frontend",
]


def run_command(cmd, cwd=None, check=True, input_data=None, env=None):
    if isinstance(cmd, list):
        display = " ".join(cmd)
    else:
        display = cmd
    print(f"执行命令: {display}")
    result = subprocess.run(
        cmd, cwd=cwd, shell=isinstance(cmd, str), text=True, input=input_data, env=env
    )
    if check and result.returncode != 0:
        sys.exit(result.returncode)
    return result


def env_bool(name: str, default: bool = False) -> bool:
    raw = os.environ.get(name)
    if raw is None:
        return default
    value = raw.strip().lower()
    if value in {"1", "true", "yes", "y", "on"}:
        return True
    if value in {"0", "false", "no", "n", "off"}:
        return False
    return default


def get_ids(cmd):
    result = subprocess.run(cmd, capture_output=True, text=True)
    if result.returncode != 0:
        return []
    return [value for value in result.stdout.split() if value]


def remove_app_containers():
    run_command(["docker", "compose", "rm", "-sf", *APP_SERVICES], cwd=str(ROOT), check=False)


def maven_package():
    cpu_count = os.cpu_count() or 4
    threads = max(cpu_count, 4)
    threads_flag = str(threads)
    do_clean = env_bool("IM_MVN_CLEAN", default=False)
    common_args = [
        "-DskipTests",
        "-T",
        threads_flag,
        f"-Dmaven.artifact.threads={threads_flag}",
        "-Daether.dependencyCollector.impl=bf",
    ]
    if not docker_image_exists(MAVEN_IMAGE):
        if not docker_pull_with_retry(MAVEN_IMAGE, retries=3, delay_seconds=8):
            mvn_path = shutil.which("mvn")
            if not mvn_path:
                print("无法拉取 Maven 镜像且本机未找到 mvn，可先手动拉取镜像或安装 Maven。")
                sys.exit(1)
            run_command(
                ["mvn", *(["clean"] if do_clean else []), "package", *common_args],
                cwd=str(BACKEND_DIR),
            )
            return
    maven_cmd = [
        "docker",
        "run",
        "--rm",
        "-v",
        f"{BACKEND_DIR}:/project",
        "-v",
        f"{Path.home()}/.m2:/root/.m2",
        "-w",
        "/project",
        MAVEN_IMAGE,
        "mvn",
        *(["clean"] if do_clean else []),
        "package",
        *common_args,
    ]
    run_command(maven_cmd)


def build_images():
    build_env = os.environ.copy()
    build_env["DOCKER_BUILDKIT"] = "1"
    build_env["COMPOSE_DOCKER_CLI_BUILD"] = "1"
    build_env["COMPOSE_PARALLEL_LIMIT"] = str(os.cpu_count() or 4)
    no_cache = env_bool("IM_DOCKER_NO_CACHE", default=False)
    cache_bust = env_bool("IM_DOCKER_CACHE_BUST", default=True)
    if cache_bust:
        build_env["IM_BUILD_NONCE"] = str(time.time_ns())
    build_cmd = ["docker", "compose", "build"]
    if no_cache:
        build_cmd.append("--no-cache")
    build_cmd.append("--parallel")
    result = run_command(
        build_cmd,
        cwd=str(ROOT),
        check=False,
        env=build_env,
    )
    if result.returncode != 0:
        fallback_cmd = ["docker", "compose", "build", "--no-cache", "--parallel"]
        run_command(fallback_cmd, cwd=str(ROOT), env=build_env)


def compose_up(services, extra_args=None):
    args = ["docker", "compose", "up", "-d"]
    if extra_args:
        args.extend(extra_args)
    args.extend(services)
    run_command(args, cwd=str(ROOT))


def docker_image_exists(image):
    result = subprocess.run(["docker", "images", "-q", image], capture_output=True, text=True)
    if result.returncode != 0:
        return False
    return bool(result.stdout.strip())


def docker_pull_with_retry(image, retries=3, delay_seconds=8):
    for attempt in range(1, retries + 1):
        result = subprocess.run(["docker", "pull", image], text=True)
        if result.returncode == 0:
            return True
        if attempt < retries:
            time.sleep(delay_seconds)
    return False


def get_compose_image_ids(services):
    result = subprocess.run(
        ["docker", "compose", "images", "-q", *services],
        cwd=str(ROOT),
        capture_output=True,
        text=True,
    )
    if result.returncode != 0:
        return []
    return [value for value in result.stdout.split() if value]


def remove_app_images():
    image_ids = get_compose_image_ids(APP_SERVICES)
    if image_ids:
        run_command(["docker", "rmi", "-f", *image_ids], check=False)


def wait_for_mysql(timeout_seconds=120):
    start_time = time.time()
    while True:
        result = subprocess.run(
            [
                "docker",
                "exec",
                MYSQL_CONTAINER,
                "mysqladmin",
                "ping",
                "-h",
                "localhost",
                "-u" + MYSQL_USER,
                "-p" + MYSQL_PASSWORD,
            ],
            capture_output=True,
            text=True,
        )
        if result.returncode == 0:
            return True
        if time.time() - start_time > timeout_seconds:
            return False
        time.sleep(3)


def wait_for_port(host, port, timeout_seconds=60):
    start_time = time.time()
    while True:
        try:
            with socket.create_connection((host, port), timeout=3):
                return True
        except OSError:
            if time.time() - start_time > timeout_seconds:
                return False
            time.sleep(2)


def wait_for_services(services, timeout_seconds=180):
    target = set(services)
    start_time = time.time()
    while True:
        result = subprocess.run(
            ["docker", "compose", "ps", "--status", "running", "--services"],
            cwd=str(ROOT),
            capture_output=True,
            text=True,
        )
        running = set(result.stdout.split()) if result.returncode == 0 else set()
        if target.issubset(running):
            return True
        if time.time() - start_time > timeout_seconds:
            return False
        time.sleep(3)


def reset_mysql():
    drop_sql = "; ".join([f"DROP DATABASE IF EXISTS {db}" for db in DROP_DATABASES]) + ";"
    run_command(
        [
            "docker",
            "exec",
            MYSQL_CONTAINER,
            "mysql",
            "-u" + MYSQL_USER,
            "-p" + MYSQL_PASSWORD,
            "-e",
            drop_sql,
        ]
    )
    sql_content = SQL_FILE.read_text(encoding="utf-8")
    run_command(
        [
            "docker",
            "exec",
            "-i",
            MYSQL_CONTAINER,
            "mysql",
            "-u" + MYSQL_USER,
            "-p" + MYSQL_PASSWORD,
        ],
        input_data=sql_content,
    )


def run_tests():
    run_command([sys.executable, str(TEST_SCRIPT), "--mode", "gateway", "--service", "all"], check=False)


def main():
    if not SQL_FILE.exists():
        sys.exit(1)
    compose_up(INFRA_SERVICES, extra_args=["--no-recreate"])
    maven_package()
    force_rebuild = env_bool("IM_FORCE_REBUILD", default=False)
    if force_rebuild:
        remove_app_containers()
        remove_app_images()
    build_images()
    if not wait_for_mysql():
        sys.exit(1)
    if not wait_for_port("127.0.0.1", 9092, timeout_seconds=90):
        sys.exit(1)
    reset_mysql()
    force_recreate = env_bool("IM_COMPOSE_FORCE_RECREATE", default=True)
    app_up_args = ["--force-recreate"] if force_recreate else None
    compose_up(APP_SERVICES, extra_args=app_up_args)
    if not wait_for_services(APP_SERVICES, timeout_seconds=240):
        sys.exit(1)
    run_tests()


if __name__ == "__main__":
    main()
