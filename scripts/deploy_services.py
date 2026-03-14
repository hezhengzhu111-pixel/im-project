from __future__ import annotations

import argparse
import subprocess
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
INFRA_COMPOSE = ROOT / "deploy" / "middleware" / "docker-compose.yml"
SERVICE_COMPOSE = ROOT / "deploy" / "services" / "docker-compose.yml"
INIT_SQL = ROOT / "backend" / "sql" / "mysql8" / "init_all.sql"
PROJECT_CONTAINERS = [
    "im-mysql",
    "im-redis",
    "im-kafka",
    "im-gateway",
    "im-auth",
    "im-user",
    "im-group",
    "im-message",
    "im-file",
    "im-server",
    "im-frontend",
]


def run(command: list[str], cwd: Path | None = None) -> None:
    result = subprocess.run(command, cwd=str(cwd) if cwd else None)
    if result.returncode != 0:
        raise SystemExit(result.returncode)


def output(command: list[str], cwd: Path | None = None) -> str:
    result = subprocess.run(command, cwd=str(cwd) if cwd else None, capture_output=True, text=True)
    if result.returncode != 0:
        raise SystemExit(result.returncode)
    return result.stdout


def cleanup_all() -> None:
    run(["docker", "compose", "-f", str(SERVICE_COMPOSE), "down", "--remove-orphans"], cwd=ROOT)
    run(["docker", "compose", "-f", str(INFRA_COMPOSE), "down", "--remove-orphans"], cwd=ROOT)
    for container in PROJECT_CONTAINERS:
        subprocess.run(["docker", "rm", "-f", container], check=False)

    images = output(["docker", "images", "--format", "{{.Repository}}:{{.Tag}}"]).splitlines()
    for image in images:
        if image.startswith("new-im-project-") or image.startswith("services-"):
            subprocess.run(["docker", "rmi", "-f", image], check=False)

    dangling = output(["docker", "images", "-f", "dangling=true", "-q"]).splitlines()
    for image_id in dangling:
        if image_id.strip():
            subprocess.run(["docker", "rmi", "-f", image_id.strip()], check=False)


def git_pull() -> None:
    run(["git", "reset", "--hard", "HEAD"], cwd=ROOT)
    run(["git", "clean", "-fd"], cwd=ROOT)
    run(["git", "pull", "--rebase"], cwd=ROOT)


def build_backend() -> None:
    run(["cmd", "/c", "mvn -f backend/pom.xml clean package -DskipTests"], cwd=ROOT)


def deploy_compose() -> None:
    run(["docker", "compose", "-f", str(INFRA_COMPOSE), "up", "-d"], cwd=ROOT)
    run(["docker", "compose", "-f", str(SERVICE_COMPOSE), "up", "-d", "--build"], cwd=ROOT)


def init_database() -> None:
    run(["docker", "cp", str(INIT_SQL), "im-mysql:/tmp/init_all.sql"], cwd=ROOT)
    run(
        [
            "docker",
            "exec",
            "im-mysql",
            "sh",
            "-lc",
            "mysql -h'127.0.0.1' -P3306 -uroot -proot123 < /tmp/init_all.sql",
        ],
        cwd=ROOT,
    )


def verify() -> None:
    run(["docker", "compose", "-f", str(INFRA_COMPOSE), "ps"], cwd=ROOT)
    run(["docker", "compose", "-f", str(SERVICE_COMPOSE), "ps"], cwd=ROOT)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="部署服务，支持按参数初始化数据库")
    parser.add_argument("--init-db", action="store_true", help="部署后执行数据库初始化")
    parser.add_argument("--skip-git-pull", action="store_true", help="跳过 git 拉取")
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    cleanup_all()
    if not args.skip_git_pull:
        git_pull()
    build_backend()
    deploy_compose()
    if args.init_db:
        init_database()
    verify()


if __name__ == "__main__":
    main()
