#!/usr/bin/env python3
"""项目初始化入口脚本。

负责：
- 环境检查（Docker、Docker Compose、必要工具）
- build/ 标准目录结构初始化
- 中间件准备入口（调用 deploy_middleware）
- 数据库初始化或检查入口（调用 init_db）

不负责：
- 编译业务代码（由 build.py 负责）
- 启动完整业务项目（由 start.py 负责）
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
        description="初始化项目环境和基础设施。"
    )
    parser.add_argument(
        "--check-only",
        action="store_true",
        help="仅检查环境，不执行初始化操作。"
    )
    parser.add_argument(
        "--skip-middleware",
        action="store_true",
        help="跳过中间件初始化。"
    )
    parser.add_argument(
        "--skip-db",
        action="store_true",
        help="跳过数据库初始化检查。"
    )
    parser.add_argument(
        "--skip-build-dirs",
        action="store_true",
        help="跳过 build/ 目录结构初始化。"
    )
    parser.add_argument(
        "--env-file",
        help="指定部署环境文件路径，默认为 .env。"
    )
    parser.add_argument(
        "--pull",
        action="store_true",
        help="在启动中间件前拉取镜像。"
    )
    parser.add_argument(
        "--force-recreate",
        action="store_true",
        help="强制重建中间件容器。"
    )
    return parser


def check_environment() -> bool:
    """检查必要的环境依赖。"""
    print("[CHECK] 检查环境依赖...")

    # 检查 Docker
    from deploy_utils import run_command
    try:
        result = run_command(["docker", "--version"], check=False, capture_output=True)
        if result.returncode == 0:
            print(f"  [OK] Docker: {result.stdout.strip()}")
        else:
            print("  [FAIL] Docker 未安装或未启动")
            return False
    except FileNotFoundError:
        print("  [FAIL] Docker 命令未找到")
        return False

    # 检查 Docker Compose
    try:
        result = run_command(["docker", "compose", "version"], check=False, capture_output=True)
        if result.returncode == 0:
            print(f"  [OK] Docker Compose: {result.stdout.strip()}")
        else:
            # 尝试旧版本 docker-compose
            result = run_command(["docker-compose", "--version"], check=False, capture_output=True)
            if result.returncode == 0:
                print(f"  [OK] Docker Compose (legacy): {result.stdout.strip()}")
            else:
                print("  [FAIL] Docker Compose 未安装")
                return False
    except FileNotFoundError:
        print("  [FAIL] Docker Compose 命令未找到")
        return False

    print("  [OK] 环境检查通过")
    return True


def init_build_directories() -> bool:
    """初始化 build/ 标准目录结构。"""
    print("\n[INIT] 初始化 build/ 目录结构...")

    build_dir = Path("build")
    subdirs = [
        "cache/cargo",
        "cache/flutter",
        "cache/maven",
        "cache/docker",
        "cache/tools",
        "work/rust",
        "work/flutter",
        "work/spring-ai",
        "dist/rust",
        "dist/flutter",
        "dist/spring-ai",
        "dist/docker",
        "dist/release",
        "runtime/docker-compose",
        "runtime/redis",
        "runtime/postgres",
        "runtime/mq",
        "runtime/config",
        "reports/test",
        "reports/coverage",
        "reports/gate",
        "reports/manifest",
        "logs/scripts",
        "logs/build",
        "logs/deploy",
    ]

    try:
        for subdir in subdirs:
            dir_path = build_dir / subdir
            dir_path.mkdir(parents=True, exist_ok=True)
            print(f"  [OK] {dir_path}")

        # 创建 .gitkeep 文件以保留空目录
        for subdir in subdirs:
            gitkeep = build_dir / subdir / ".gitkeep"
            if not gitkeep.exists():
                gitkeep.touch()

        print("  [OK] build/ 目录结构初始化完成")
        return True
    except Exception as e:
        print(f"  [FAIL] 初始化失败: {e}")
        return False


def init_middleware(env_file: str = None, pull: bool = False, force_recreate: bool = False) -> bool:
    """初始化中间件（MySQL、Redis 等）。"""
    print("\n[INIT] 初始化中间件...")

    try:
        from deploy_middleware import main as middleware_main

        # 构造参数
        args = []
        if env_file:
            args.extend(["--env-file", env_file])
        if pull:
            args.append("--pull")
        if force_recreate:
            args.append("--force-recreate")

        # 临时修改 sys.argv 以传递参数
        original_argv = sys.argv
        sys.argv = ["deploy_middleware.py"] + args

        try:
            middleware_main()
            print("  [OK] 中间件初始化完成")
            return True
        finally:
            sys.argv = original_argv
    except Exception as e:
        print(f"  [FAIL] 中间件初始化失败: {e}")
        return False


def init_database(env_file: str = None) -> bool:
    """检查或初始化数据库。"""
    print("\n[CHECK] 检查数据库...")

    try:
        from init_db import main as db_main

        # 构造参数（默认为 check 模式）
        args = ["check"]
        if env_file:
            args.extend(["--env-file", env_file])

        # 临时修改 sys.argv 以传递参数
        original_argv = sys.argv
        sys.argv = ["init_db.py"] + args

        try:
            db_main()
            print("  [OK] 数据库检查完成")
            return True
        finally:
            sys.argv = original_argv
    except Exception as e:
        print(f"  [FAIL] 数据库检查失败: {e}")
        return False


def main() -> None:
    parser = build_parser()
    args = parser.parse_args()

    print("[INIT] IM Project 初始化")
    print("=" * 60)

    # 1. 环境检查
    if not check_environment():
        print("\n[FAIL] 环境检查失败，请先安装必要的依赖。")
        sys.exit(1)

    if args.check_only:
        print("\n[OK] 环境检查完成（仅检查模式）。")
        return

    # 2. 初始化 build/ 目录结构
    if not args.skip_build_dirs:
        if not init_build_directories():
            print("\n[FAIL] build/ 目录初始化失败。")
            sys.exit(1)

    # 3. 初始化中间件
    if not args.skip_middleware:
        if not init_middleware(args.env_file, args.pull, args.force_recreate):
            print("\n[FAIL] 中间件初始化失败。")
            sys.exit(1)

    # 4. 检查数据库
    if not args.skip_db:
        if not init_database(args.env_file):
            print("\n[FAIL] 数据库检查失败。")
            sys.exit(1)

    print("\n" + "=" * 60)
    print("[OK] 初始化完成！")
    print("\n后续步骤：")
    print("  1. 编译项目: python scripts/build.py")
    print("  2. 启动服务: python scripts/start.py")


if __name__ == "__main__":
    main()
