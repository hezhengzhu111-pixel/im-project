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
import shutil
import sys
from pathlib import Path

# 确保 scripts/ 目录在 Python 路径中
SCRIPTS_DIR = Path(__file__).resolve().parent
sys.path.insert(0, str(SCRIPTS_DIR))

from runtime_paths import DEFAULT_RUNTIME_ENV_FILE, RUNTIME_DIR, relative


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
        "--runtime-only",
        action="store_true",
        help="仅创建 build/runtime 目录、runtime env 和 runtime compose，不启动 Docker。"
    )
    parser.add_argument(
        "--middleware-only",
        action="store_true",
        help="仅准备 runtime 并初始化中间件。"
    )
    parser.add_argument(
        "--db-only",
        action="store_true",
        help="仅准备 runtime 并检查数据库。"
    )
    parser.add_argument(
        "--clean-runtime",
        action="store_true",
        help="删除 build/runtime 下的本地 MySQL、Redis、files、logs、env 和 compose 数据。必须配合 --yes。"
    )
    parser.add_argument(
        "--yes",
        action="store_true",
        help="确认 destructive 操作，例如 --clean-runtime。"
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
        help=f"指定部署环境文件路径，默认为 {relative(DEFAULT_RUNTIME_ENV_FILE)}。"
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

    all_ok = True

    # 检查 Docker
    from deploy_utils import run_command
    try:
        result = run_command(["docker", "--version"], check=False, capture_output=True)
        if result.returncode == 0:
            print(f"  [OK] Docker: {result.stdout.strip()}")
        else:
            print("  [FAIL] Docker 未安装或未启动")
            all_ok = False
    except FileNotFoundError:
        print("  [FAIL] Docker 命令未找到")
        all_ok = False

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
                all_ok = False
    except FileNotFoundError:
        print("  [FAIL] Docker Compose 命令未找到")
        all_ok = False

    # 检查 Rust 工具链
    try:
        result = run_command(["cargo", "--version"], check=False, capture_output=True)
        if result.returncode == 0:
            print(f"  [OK] Cargo: {result.stdout.strip()}")
        else:
            print("  [WARN] Cargo 未安装（Rust 构建将失败）")
    except FileNotFoundError:
        print("  [WARN] Cargo 命令未找到（Rust 构建将失败）")

    # 检查 Flutter
    try:
        result = run_command(["flutter", "--version"], check=False, capture_output=True)
        if result.returncode == 0:
            # Flutter 输出多行，只取第一行
            version_line = result.stdout.strip().split("\n")[0] if result.stdout else "unknown"
            print(f"  [OK] Flutter: {version_line}")
        else:
            print("  [WARN] Flutter 未安装（Flutter 构建将失败）")
    except FileNotFoundError:
        print("  [WARN] Flutter 命令未找到（Flutter 构建将失败）")

    # 检查 Java
    try:
        result = run_command(["java", "--version"], check=False, capture_output=True)
        if result.returncode == 0:
            version_line = result.stdout.strip().split("\n")[0] if result.stdout else "unknown"
            print(f"  [OK] Java: {version_line}")
        else:
            # 尝试旧版本 -version
            result = run_command(["java", "-version"], check=False, capture_output=True)
            if result.returncode == 0:
                version_line = result.stderr.strip().split("\n")[0] if result.stderr else "unknown"
                print(f"  [OK] Java: {version_line}")
            else:
                print("  [WARN] Java 未安装（Spring AI 构建将失败）")
    except FileNotFoundError:
        print("  [WARN] Java 命令未找到（Spring AI 构建将失败）")

    # 检查 Maven 或 mvnw
    spring_ai_dir = Path(__file__).resolve().parents[1] / "spring-ai"
    mvnw_path = spring_ai_dir / "mvnw"
    if mvnw_path.exists():
        try:
            result = run_command([str(mvnw_path), "--version"], check=False, capture_output=True, cwd=spring_ai_dir)
            if result.returncode == 0:
                version_line = result.stdout.strip().split("\n")[0] if result.stdout else "unknown"
                print(f"  [OK] Maven (mvnw): {version_line}")
            else:
                print("  [WARN] mvnw 执行失败")
        except Exception:
            print("  [WARN] mvnw 无法执行")
    else:
        try:
            result = run_command(["mvn", "--version"], check=False, capture_output=True)
            if result.returncode == 0:
                version_line = result.stdout.strip().split("\n")[0] if result.stdout else "unknown"
                print(f"  [OK] Maven: {version_line}")
            else:
                print("  [WARN] Maven 未安装（Spring AI 构建将失败）")
        except FileNotFoundError:
            print("  [WARN] Maven 命令未找到（Spring AI 构建将失败）")

    # 检查 wasm-pack
    try:
        result = run_command(["wasm-pack", "--version"], check=False, capture_output=True)
        if result.returncode == 0:
            print(f"  [OK] wasm-pack: {result.stdout.strip()}")
        else:
            print("  [WARN] wasm-pack 未安装（E2EE WASM 构建将失败）")
    except FileNotFoundError:
        print("  [WARN] wasm-pack 命令未找到（E2EE WASM 构建将失败）")

    if all_ok:
        print("  [OK] 核心环境检查通过")
    else:
        print("  [FAIL] 核心环境检查失败")

    return all_ok


def init_build_directories(env_file: str | None = None) -> bool:
    """初始化 build/ 标准目录结构。"""
    print("\n[INIT] 初始化 build/ 目录结构...")

    from deploy_utils import (
        BUILD_DIR,
        RUNTIME_DIRECTORIES,
        ensure_runtime_env_file,
        generate_runtime_compose,
    )

    subdirs = [
        BUILD_DIR / "cache" / "cargo-home",
        BUILD_DIR / "cache" / "rust-target",
        BUILD_DIR / "cache" / "pub-cache",
        BUILD_DIR / "cache" / "maven-repo",
        BUILD_DIR / "cache" / "docker",
        BUILD_DIR / "cache" / "tools",
        BUILD_DIR / "work" / "flutter",
        BUILD_DIR / "work" / "rust",
        BUILD_DIR / "work" / "spring-ai",
        BUILD_DIR / "work" / "sql",
        BUILD_DIR / "dist" / "frontend",
        BUILD_DIR / "dist" / "rust",
        BUILD_DIR / "dist" / "spring-ai",
        BUILD_DIR / "dist" / "images",
        *RUNTIME_DIRECTORIES,
        BUILD_DIR / "reports" / "test",
        BUILD_DIR / "reports" / "coverage",
        BUILD_DIR / "reports" / "gates",
        BUILD_DIR / "reports" / "manifest",
        BUILD_DIR / "logs",
    ]

    try:
        for dir_path in subdirs:
            dir_path.mkdir(parents=True, exist_ok=True)
            print(f"  [OK] {relative(dir_path)}")
        ensure_runtime_env_file(env_file=env_file)
        generate_runtime_compose()

        print("  [OK] build/ 和 runtime 目录结构初始化完成")
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


def clean_runtime(assume_yes: bool) -> bool:
    if not assume_yes:
        print(
            "[FAIL] --clean-runtime 会删除 build/runtime 下的 MySQL、Redis、files、logs、env 和 compose 数据。"
        )
        print("       如确认要清空本地 runtime 状态，请重新执行：python scripts/init.py --clean-runtime --yes")
        return False
    target = RUNTIME_DIR.resolve()
    build_root = RUNTIME_DIR.parent.resolve()
    if build_root not in target.parents:
        print(f"[FAIL] 拒绝删除异常 runtime 路径: {target}")
        return False
    if target.exists():
        shutil.rmtree(target)
        print(f"[OK] 已删除 {relative(RUNTIME_DIR)}")
    else:
        print(f"[OK] {relative(RUNTIME_DIR)} 不存在，无需清理")
    return True


def main() -> None:
    parser = build_parser()
    args = parser.parse_args()

    print("[INIT] IM Project 初始化")
    print("=" * 60)

    if args.clean_runtime:
        if not clean_runtime(args.yes):
            sys.exit(1)
        if args.runtime_only:
            if not init_build_directories(args.env_file):
                sys.exit(1)
        return

    if args.db_only:
        args.skip_middleware = True
    if args.middleware_only:
        args.skip_db = True
    if args.runtime_only:
        if not init_build_directories(args.env_file):
            print("\n[FAIL] runtime 初始化失败。")
            sys.exit(1)
        print("\n[OK] runtime 初始化完成。")
        return

    # 1. 环境检查
    if not check_environment():
        print("\n[FAIL] 环境检查失败，请先安装必要的依赖。")
        sys.exit(1)

    if args.check_only:
        print("\n[OK] 环境检查完成（仅检查模式）。")
        return

    # 2. 初始化 build/ 目录结构
    if not args.skip_build_dirs:
        if not init_build_directories(args.env_file):
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
