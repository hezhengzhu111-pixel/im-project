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
import json
import subprocess
import sys
from pathlib import Path

# 确保 scripts/ 目录在 Python 路径中
SCRIPTS_DIR = Path(__file__).resolve().parent
sys.path.insert(0, str(SCRIPTS_DIR))

from runtime_paths import DEFAULT_RUNTIME_ENV_FILE, GENERATED_COMPOSE_FILE, PROJECT_ROOT, relative


def _load_manifest() -> dict | None:
    manifest_path = PROJECT_ROOT / "build" / "manifest.json"
    if not manifest_path.is_file():
        return None
    try:
        return json.loads(manifest_path.read_text(encoding="utf-8"))
    except (json.JSONDecodeError, OSError):
        return None


def _image_exists_locally(image_name: str) -> bool:
    result = subprocess.run(
        ["docker", "image", "inspect", image_name],
        capture_output=True,
        text=True,
        encoding="utf-8",
        errors="replace",
    )
    return result.returncode == 0


def load_images_from_manifest() -> None:
    """Load Docker images from build/dist/images/*.tar if not present locally.

    Raises RuntimeError on any failure so callers (start/restart) can abort.
    """
    _BUILD_HINT = "请先运行: python scripts/build.py --docker"

    manifest = _load_manifest()
    if manifest is None:
        raise RuntimeError(f"build/manifest.json 不存在，无法确认镜像状态。{_BUILD_HINT}")

    image_names: dict[str, str] = manifest.get("docker_image_names", {})
    tar_paths: dict[str, str] = manifest.get("docker_image_tar_paths", {})

    if not image_names:
        raise RuntimeError(f"manifest.json 中未记录 Docker 镜像名。{_BUILD_HINT}")

    for service, image_name in image_names.items():
        if _image_exists_locally(image_name):
            continue

        tar_rel = tar_paths.get(service)
        if not tar_rel:
            raise RuntimeError(
                f"镜像 {image_name} 本地不存在，且 manifest 中无 tar 路径记录。{_BUILD_HINT}"
            )

        tar_path = PROJECT_ROOT / tar_rel
        if not tar_path.is_file():
            raise RuntimeError(
                f"镜像 {image_name} 本地不存在，tar 文件也缺失: {relative(tar_path)}。{_BUILD_HINT}"
            )

        print(f"[INFO] 正在加载镜像 {image_name} 从 {relative(tar_path)} ...")
        load_result = subprocess.run(
            ["docker", "load", "-i", str(tar_path)],
            capture_output=True,
            text=True,
            encoding="utf-8",
            errors="replace",
        )
        if load_result.returncode != 0:
            stderr = (load_result.stderr or "").strip()
            raise RuntimeError(f"docker load 失败 ({image_name}): {stderr}")

        if not _image_exists_locally(image_name):
            raise RuntimeError(
                f"docker load 完成但镜像 {image_name} 仍不可用。{_BUILD_HINT}"
            )

        print(f"[OK] 镜像 {image_name} 已加载。")


def add_env_file_argument(parser: argparse.ArgumentParser) -> None:
    parser.add_argument(
        "--env-file",
        help=f"指定部署环境文件路径，默认为 {relative(DEFAULT_RUNTIME_ENV_FILE)}。"
    )


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
    add_env_file_argument(start_parser)
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
    add_env_file_argument(stop_parser)

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
    add_env_file_argument(restart_parser)
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
    add_env_file_argument(status_parser)

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
    add_env_file_argument(logs_parser)

    return parser


def ensure_runtime_ready_hint() -> None:
    if not GENERATED_COMPOSE_FILE.is_file():
        raise RuntimeError(
            f"运行时 compose 不存在：{relative(GENERATED_COMPOSE_FILE)}。"
            "请先运行 `python scripts/init.py --runtime-only` 或 `python scripts/init.py`。"
        )


def cmd_start(args) -> None:
    """启动服务。"""
    print("🚀 启动服务...")
    ensure_runtime_ready_hint()
    load_images_from_manifest()

    try:
        from deploy_services import main as services_main

        # 构造参数
        cmd_args = ["start", "--no-build"]
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
    ensure_runtime_ready_hint()

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
    ensure_runtime_ready_hint()
    load_images_from_manifest()

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
        from deploy_utils import compose_base_command, load_config, run_command

        ensure_runtime_ready_hint()

        # 加载配置
        config = load_config(env_file=args.env_file)

        # 构造 docker compose ps 命令
        cmd = [*compose_base_command(config), "ps", "--format", "table"]

        # 执行命令
        run_command(cmd, check=False)
    except Exception as e:
        print(f"[FAIL] 获取状态失败: {e}")
        sys.exit(1)


def cmd_logs(args) -> None:
    """查看服务日志。"""
    try:
        from deploy_utils import compose_base_command, load_config, run_command

        ensure_runtime_ready_hint()

        # 加载配置
        config = load_config(env_file=args.env_file)

        # 构造 docker compose logs 命令
        cmd = [*compose_base_command(config), "logs", "--tail", str(args.tail)]

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
