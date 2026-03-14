from __future__ import annotations

import argparse
import subprocess
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
INFRA_COMPOSE = ROOT / "deploy" / "middleware" / "docker-compose.yml"
MIDDLEWARE_CONTAINERS = ["im-mysql", "im-redis", "im-kafka"]
MIDDLEWARE_IMAGES = ["mysql:8.0", "redis:7-alpine", "apache/kafka:3.7.0"]


def run(command: list[str], cwd: Path | None = None) -> None:
    result = subprocess.run(command, cwd=str(cwd) if cwd else None)
    if result.returncode != 0:
        raise SystemExit(result.returncode)


def stop_and_remove_middleware() -> None:
    run(["docker", "compose", "-f", str(INFRA_COMPOSE), "down", "--remove-orphans"], cwd=ROOT)
    for container in MIDDLEWARE_CONTAINERS:
        subprocess.run(["docker", "rm", "-f", container], check=False)


def remove_middleware_images() -> None:
    for image in MIDDLEWARE_IMAGES:
        subprocess.run(["docker", "rmi", "-f", image], check=False)


def deploy_middleware() -> None:
    run(["docker", "compose", "-f", str(INFRA_COMPOSE), "up", "-d"], cwd=ROOT)
    run(["docker", "compose", "-f", str(INFRA_COMPOSE), "ps"], cwd=ROOT)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="部署中间件（MySQL/Redis/Kafka）")
    parser.add_argument("--clean", action="store_true", help="部署前清理中间件容器与镜像")
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    if args.clean:
        stop_and_remove_middleware()
        remove_middleware_images()
    deploy_middleware()


if __name__ == "__main__":
    main()
