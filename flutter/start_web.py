#!/usr/bin/env python3
"""Flutter Web 启动脚本"""

import subprocess
import sys
import os
import signal
import time

PORT = sys.argv[1] if len(sys.argv) > 1 else "3001"
FLUTTER = r"C:\Users\10954\flutter\bin\flutter.bat"
APP_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "apps", "web")


def kill_processes():
    """停止已有的 dart/chrome 进程"""
    print("=== 停止已有进程 ===")
    for proc in ["dart.exe", "chrome.exe"]:
        subprocess.run(["taskkill", "/F", "/IM", proc],
                       capture_output=True, text=True)
    time.sleep(1)


def pub_get():
    """安装依赖"""
    print("=== 安装依赖 ===")
    result = subprocess.run([FLUTTER, "pub", "get"], cwd=APP_DIR)
    if result.returncode != 0:
        print("依赖安装失败")
        sys.exit(1)


def run_web():
    """启动 Flutter Web"""
    print(f"=== 启动 Flutter Web (port: {PORT}) ===")
    try:
        subprocess.run(
            [FLUTTER, "run", "-d", "chrome", "--web-port", PORT],
            cwd=APP_DIR,
        )
    except KeyboardInterrupt:
        print("\n已停止")


if __name__ == "__main__":
    kill_processes()
    pub_get()
    run_web()
