#!/usr/bin/env python3
from __future__ import annotations

from deploy_utils import compose_base_command, load_config, run_command, wait_for_container_healthy


def main() -> None:
    config = load_config()
    command = [
        *compose_base_command(config),
        "up",
        "-d",
        "im-mysql",
        "im-redis",
        "im-files-init",
    ]
    run_command(command, cwd=config.project_dir)
    wait_for_container_healthy(config.mysql_container)
    wait_for_container_healthy(config.redis_container)


if __name__ == "__main__":
    main()
