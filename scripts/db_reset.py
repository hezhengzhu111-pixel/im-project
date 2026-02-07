import io
import os
import sys
import time
import traceback
from pathlib import Path
import subprocess


if sys.platform == "win32":
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")
    sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding="utf-8", errors="replace")


ROOT = Path(__file__).resolve().parents[1]
SCHEMA_SQL = ROOT / "backend" / "sql" / "mysql8" / "init_all.sql"
SEED_SQL = ROOT / "test" / "fixtures" / "seed.sql"


def env(name: str, default: str) -> str:
    value = os.environ.get(name)
    return default if value is None or value.strip() == "" else value.strip()


def mask(s: str) -> str:
    if not s:
        return ""
    if len(s) <= 6:
        return "*" * len(s)
    return s[:2] + "..." + s[-2:]


def display_cmd(cmd: list[str]) -> str:
    rendered: list[str] = []
    for part in cmd:
        if part.startswith("-p") and len(part) > 2:
            rendered.append("-p" + mask(part[2:]))
        else:
            rendered.append(part)
    return " ".join(rendered)


def run(cmd: list[str], input_bytes: bytes | None = None) -> subprocess.CompletedProcess:
    return subprocess.run(cmd, input=input_bytes, capture_output=True)


def docker_container_running(name: str) -> bool:
    result = run(["docker", "inspect", "-f", "{{.State.Running}}", name])
    return result.returncode == 0 and result.stdout.strip() == b"true"


def main() -> int:
    db_host = env("DB_HOST", "127.0.0.1")
    db_port = env("DB_PORT", "3306")
    db_user = env("DB_USER", "root")
    db_password = env("DB_PASSWORD", "root123")

    mysql_container = env("MYSQL_CONTAINER", "im-mysql")
    use_docker = env("DB_RESET_USE_DOCKER", "1").lower() in {"1", "true", "yes", "y", "on"}
    lock_name = env("DB_RESET_LOCK", "im_test_reset_lock")
    lock_timeout = env("DB_RESET_LOCK_TIMEOUT", "60")

    if not SCHEMA_SQL.exists():
        print(f"schema 文件不存在: {SCHEMA_SQL}")
        return 1
    if not SEED_SQL.exists():
        print(f"seed 文件不存在: {SEED_SQL}")
        return 1

    try:
        schema_bytes = SCHEMA_SQL.read_bytes()
        seed_bytes = SEED_SQL.read_bytes()
    except Exception as e:
        print("读取 SQL 文件失败")
        print("".join(traceback.format_exception(type(e), e, e.__traceback__)))
        return 1

    drop_sql = (
        "SET NAMES utf8mb4;\n"
        "SET FOREIGN_KEY_CHECKS = 0;\n"
        f"SELECT GET_LOCK('{lock_name}', {lock_timeout});\n"
        "DROP DATABASE IF EXISTS service_user_service_db;\n"
        "DROP DATABASE IF EXISTS service_group_service_db;\n"
        "DROP DATABASE IF EXISTS service_message_service_db;\n"
        "SET FOREIGN_KEY_CHECKS = 1;\n"
    ).encode("utf-8")

    unlock_sql = f"\nSELECT RELEASE_LOCK('{lock_name}');\n".encode("utf-8")
    sql_stream = drop_sql + schema_bytes + b"\n" + seed_bytes + unlock_sql

    mysql_cmd = [
        "mysql",
        "-h",
        db_host,
        "-P",
        db_port,
        "-u",
        db_user,
        f"-p{db_password}",
        "--protocol=tcp",
        "--default-character-set=utf8mb4",
    ]

    if use_docker:
        if not shutil_which("docker"):
            print("未找到 docker，无法使用容器内 mysql 客户端执行重置")
            return 1
        if not docker_container_running(mysql_container):
            print(f"MySQL 容器未运行: {mysql_container}")
            return 1
        cmd = ["docker", "exec", "-i", mysql_container, *mysql_cmd]
    else:
        if not shutil_which("mysql"):
            print("未找到 mysql 客户端，请安装 mysql client 或设置 DB_RESET_USE_DOCKER=1")
            return 1
        cmd = mysql_cmd

    started = time.time()
    result = run(cmd, input_bytes=sql_stream)
    elapsed_ms = int((time.time() - started) * 1000)

    if result.returncode != 0:
        print("数据库重置失败")
        print(f"DB_HOST={db_host} DB_PORT={db_port} DB_USER={db_user} DB_PASSWORD={mask(db_password)}")
        print(f"command: {display_cmd(cmd)}")
        if result.stdout:
            print("stdout:")
            print(result.stdout.decode("utf-8", errors="replace"))
        if result.stderr:
            print("stderr:")
            print(result.stderr.decode("utf-8", errors="replace"))
        return 1

    if result.stderr:
        stderr_text = result.stderr.decode("utf-8", errors="replace").strip()
        if stderr_text:
            print("mysql stderr:")
            print(stderr_text)

    print(f"RESET_OK ({elapsed_ms}ms)")
    return 0


def shutil_which(cmd: str) -> str | None:
    paths = os.environ.get("PATH", "").split(os.pathsep)
    exts = [""]
    if sys.platform == "win32":
        exts = [".exe", ".cmd", ".bat", ""]
    for p in paths:
        p = p.strip('"')
        for ext in exts:
            candidate = Path(p) / (cmd + ext)
            if candidate.exists():
                return str(candidate)
    return None


if __name__ == "__main__":
    raise SystemExit(main())
