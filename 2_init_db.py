from __future__ import annotations

import argparse

from deploy_utils import (
    MYSQL_CONTAINER_NAME,
    assert_container_running,
    ensure_backend_layout,
    fatal,
    load_config,
    resolve_executable,
    run_command,
)


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="初始化 IM Project MySQL 数据库。")
    parser.add_argument(
        "--full",
        action="store_true",
        help="执行完整数据库导入，将 backend/sql/mysql8/init_all.sql 导入到 MySQL 容器。",
    )
    return parser


def main() -> None:
    args = build_parser().parse_args()
    config = load_config()
    docker_cmd = resolve_executable("Docker", ["docker"])

    ensure_backend_layout(config)
    sql_file = config.sql_init_file
    if not sql_file.is_file():
        fatal(f"未找到数据库初始化文件: {sql_file}")

    assert_container_running(docker_cmd, MYSQL_CONTAINER_NAME)

    run_command(
        [
            docker_cmd,
            "exec",
            MYSQL_CONTAINER_NAME,
            "mysqladmin",
            "ping",
            "-h",
            "127.0.0.1",
            "-uroot",
            f"-p{config.mysql_root_password}",
            "--silent",
        ]
    )

    if not args.full:
        print("MySQL 容器与 SQL 文件检查通过。未指定 --full，跳过实际导入。")
        return

    print(f"开始导入 SQL 文件: {sql_file}")
    with sql_file.open("rb") as sql_stream:
        run_command(
            [
                docker_cmd,
                "exec",
                "-i",
                MYSQL_CONTAINER_NAME,
                "mysql",
                "-uroot",
                f"-p{config.mysql_root_password}",
            ],
            stdin=sql_stream,
        )

    print("数据库初始化完成。")


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        fatal("操作已取消。")
