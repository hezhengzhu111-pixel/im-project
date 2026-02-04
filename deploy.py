import subprocess
import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parent
COMPOSE_FILE = ROOT / "docker-compose.yml"
INIT_SQL = ROOT / "backend" / "sql" / "mysql8" / "init_all.sql"
TEST_SCRIPT = ROOT / "test_im_complete.py"
MYSQL_CONTAINER = "im-mysql"
MYSQL_USER = "root"
MYSQL_PASSWORD = "root123"
DROP_DATABASES = [
    "service_user_service_db",
    "service_group_service_db",
    "service_message_service_db",
]


def run(cmd, input_data=None, check=True):
    print(">>> " + " ".join(cmd))
    result = subprocess.run(cmd, input=input_data, text=True)
    if check and result.returncode != 0:
        sys.exit(result.returncode)
    return result


def get_ids(cmd):
    result = subprocess.run(cmd, capture_output=True, text=True)
    if result.returncode != 0:
        return []
    return [value for value in result.stdout.split() if value]


def stop_all_containers():
    running = get_ids(["docker", "ps", "-q"])
    if running:
        run(["docker", "stop", *running], check=False)
    all_ids = get_ids(["docker", "ps", "-aq"])
    if all_ids:
        run(["docker", "rm", "-f", *all_ids], check=False)


def prune_docker():
    run(["docker", "system", "prune", "-af", "--volumes"], check=False)
    run(["docker", "builder", "prune", "-af"], check=False)


def build_and_up():
    run(["docker-compose", "-f", str(COMPOSE_FILE), "build"])
    run(["docker-compose", "-f", str(COMPOSE_FILE), "up", "-d"])


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


def reset_databases():
    drop_sql = "; ".join([f"DROP DATABASE IF EXISTS {db}" for db in DROP_DATABASES]) + ";"
    run(
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
    sql_content = INIT_SQL.read_text(encoding="utf-8")
    run(
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


def wait_before_tests(seconds=60):
    print(f"等待 {seconds} 秒")
    time.sleep(seconds)


def run_tests():
    return run(
        [sys.executable, str(TEST_SCRIPT), "--mode", "gateway", "--service", "all"],
        check=False,
    )


def main():
    if not COMPOSE_FILE.exists():
        print("未找到 docker-compose.yml")
        return 1
    if not INIT_SQL.exists():
        print("未找到初始化 SQL")
        return 1
    stop_all_containers()
    prune_docker()
    build_and_up()
    if not wait_for_mysql():
        print("MySQL 未就绪")
        return 1
    reset_databases()
    wait_before_tests(60)
    result = run_tests()
    return result.returncode if hasattr(result, "returncode") else 0


if __name__ == "__main__":
    sys.exit(main())
