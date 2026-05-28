#!/bin/bash
# Flutter Web 启动脚本
# 用法: bash flutter/start_web.sh [port]

PORT=${1:-3001}
FLUTTER="/c/Users/10954/flutter/bin/flutter"
APP_DIR="$(cd "$(dirname "$0")/apps/web" && pwd)"

echo "=== 停止已有进程 ==="
taskkill //F //IM dart.exe 2>/dev/null
taskkill //F //IM chrome.exe 2>/dev/null
sleep 1

echo "=== 安装依赖 ==="
cd "$APP_DIR"
"$FLUTTER" pub get

echo "=== 启动 Flutter Web (port: $PORT) ==="
"$FLUTTER" run -d chrome --web-port "$PORT"
