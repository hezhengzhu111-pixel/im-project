#!/bin/bash
# 设置 Rust 编译产物输出目录
# 用法: source scripts/set-build-env.sh
#
# 设置后所有 cargo build 的产物会输出到项目根目录的 build/rust/ 下
# 适用于 backend workspace 和 flutter/native/rust

export CARGO_TARGET_DIR="$(git rev-parse --show-toplevel)/build/rust"
echo "CARGO_TARGET_DIR=$CARGO_TARGET_DIR"
