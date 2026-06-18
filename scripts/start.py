#!/usr/bin/env python3
"""项目启动入口脚本。

负责：
- 启动所有服务或指定服务
- 查看服务状态
- 停止服务
- 重启服务
- 查看服务日志

不负责：
- 编译业务代码（由 build.py 负责）
- 环境初始化（由 init.py 负责）
"""
from __future__ import annotations

import argparse
import sys
from pathlib import Path

# 确保 scripts/ 目录在 Python 路径中
SCRIPTS_DIR = Path(__file__).resolve().parent
sys.path.insert(0, str(SCRIPTS_DIR))


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="管理 IM Project 服务生命周期。"
    )
    subparsers = parser.add_subparsers(
        dest="command",
        help="可用命令"
    )

    # start 命令
    start_parser = subparsers.add_parser(
        "start",
        help="启动服务"
    )
    start_parser.add_argument(
        "services",
        nargs="*",
        help="要启动的服务名称（默认启动所有服务）。"
    )
    start_parser.add_argument(
        "--env-file",
        help="指定部署环境文件路径。"
    )
    start_parser.add_argument(
        "--pull",
        action="store_true",
        help="启动前拉取最新镜像。"
    )
    start_parser.add_argument(
        "--force-recreate",
        action="store_true",
        help="强制重建容器。"
    )
    start_parser.add_argument(
        "--no-wait",
        action="store_true",
        help="不等待服务就绪。"
    )

    # stop 命令
    stop_parser = subparsers.add_parser(
        "stop",
        help="停止服务"
    )
    stop_parser.add_argument(
        "services",
        nargs="*",
        help="要停止的服务名称（默认停止所有服务）。"
    )
    stop_parser.add_argument(
        "--env-file",
        help="指定部署环境文件路径。"
    )

    # restart 命令
    restart_parser = subparsers.add_parser(
        "restart",
        help="重启服务"
    )
    restart_parser.add_argument(
        "services",
        nargs="*",
        help="要重启的服务名称（默认重启所有服务）。"
    )
    restart_parser.add_argument(
        "--env-file",
        help="指定部署环境文件路径。"
    )
    restart_parser.add_argument(
        "--no-wait",
        action="store_true",
        help="不等待服务就绪。"
    )

    # status 命令
    status_parser = subparsers.add_parser(
        "status",
        help="查看服务状态"
    )
    status_parser.add_argument(
        "services",
        nargs="*",
        help="要查看的服务名称（默认查看所有服务）。"
    )
    status_parser.add_argument(
        "--env-file",
        help="指定部署环境文件路径。"
    )

    # logs 命令
    logs_parser = subparsers.add_parser(
        "logs",
        help="查看服务日志"
    )
    logs_parser.add_argument(
        "service",
        help="要查看日志的服务名称。"
    )
    logs_parser.add_argument(
        "--tail",
        type=int,
        default=100,
        help="显示最后 N 行日志（默认 100）。"
    )
    logs_parser.add_argument(
        "--follow",
        "-f",
        action="store_true",
        help="实时跟踪日志输出。"
    )
    logs_parser.add_argument(
        "--env-file",
        help="指定部署环境文件路径。"
    )

    return parser


def cmd_start(args) -> None:
    """启动服务。"""
    print("🚀 启动服务...")

    try:
        from deploy_services import main as services_main

        # 构造参数
        cmd_args = ["start"]
        if args.services:
            cmd_args.extend(args.services)
        if args.env_file:
            cmd_args.extend(["--env-file", args.env_file])
        if args.pull:
            cmd_args.append("--pull")
        if args.force_recreate:
            cmd_args.append("--force-recreate")
        if args.no_wait:
            cmd_args.append("--no-wait")

        # 临时修改 sys.argv 以传递参数
        original_argv = sys.argv
        sys.argv = ["deploy_services.py"] + cmd_args

        try:
            services_main()
        finally:
            sys.argv = original_argv
    except Exception as e:
        print(f"[FAIL] 启动失败: {e}")
        sys.exit(1)


def cmd_stop(args) -> None:
    """停止服务。"""
    print("[STOP] 停止服务...")

    try:
        from deploy_services import main as services_main

        # 构造参数
        cmd_args = ["stop"]
        if args.services:
            cmd_args.extend(args.services)
        if args.env_file:
            cmd_args.extend(["--env-file", args.env_file])

        # 临时修改 sys.argv 以传递参数
        original_argv = sys.argv
        sys.argv = ["deploy_services.py"] + cmd_args

        try:
            services_main()
        finally:
            sys.argv = original_argv
    except Exception as e:
        print(f"[FAIL] 停止失败: {e}")
        sys.exit(1)


def cmd_restart(args) -> None:
    """重启服务。"""
    print("[RESTART] 重启服务...")

    try:
        from deploy_services import main as services_main

        # 构造参数
        cmd_args = ["restart"]
        if args.services:
            cmd_args.extend(args.services)
        if args.env_file:
            cmd_args.extend(["--env-file", args.env_file])
        if args.no_wait:
            cmd_args.append("--no-wait")

        # 临时修改 sys.argv 以传递参数
        original_argv = sys.argv
        sys.argv = ["deploy_services.py"] + cmd_args

        try:
            services_main()
        finally:
            sys.argv = original_argv
    except Exception as e:
        print(f"❌ 重启失败: {e}")
        sys.exit(1)


def cmd_status(args) -> None:
    """查看服务状态。"""
    try:
        from deploy_utils import load_config, run_command

        # 加载配置
        config = load_config(args.env_file)

        # 构造 docker compose ps 命令
        cmd = [
            "docker", "compose",
            "-f", str(config.compose_file),
            "ps",
            "--format", "table",
        ]

        # 执行命令
        run_command(cmd, check=False)
    except Exception as e:
        print(f"[FAIL] 获取状态失败: {e}")
        sys.exit(1)


def cmd_logs(args) -> None:
    """查看服务日志。"""
    try:
        from deploy_utils import load_config, run_command

        # 加载配置
        config = load_config(args.env_file)

        # 构造 docker compose logs 命令
        cmd = [
            "docker", "compose",
            "-f", str(config.compose_file),
            "--project-name", config.project_name,
            "logs",
            "--tail", str(args.tail),
        ]

        if args.follow:
            cmd.append("--follow")

        cmd.append(args.service)

        # 执行命令
        run_command(cmd, check=False)
    except KeyboardInterrupt:
        print("\n⏹️  停止日志跟踪")
    except Exception as e:
        print(f"❌ 获取日志失败: {e}")
        sys.exit(1)


def main() -> None:
    parser = build_parser()
    args = parser.parse_args()

    if not args.command:
        parser.print_help()
        print("\n示例：")
        print("  python scripts/start.py start           # 启动所有服务")
        print("  python scripts/start.py start im-server  # 启动指定服务")
        print("  python scripts/start.py status           # 查看服务状态")
        print("  python scripts/start.py stop             # 停止所有服务")
        print("  python scripts/start.py restart          # 重启所有服务")
        print("  python scripts/start.py logs im-server   # 查看服务日志")
        sys.exit(1)

    if args.command == "start":
        cmd_start(args)
    elif args.command == "stop":
        cmd_stop(args)
    elif args.command == "restart":
        cmd_restart(args)
    elif args.command == "status":
        cmd_status(args)
    elif args.command == "logs":
        cmd_logs(args)
    else:
        parser.print_help()
        sys.exit(1)


if __name__ == "__main__":
    main()
