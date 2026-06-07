# Desktop Setup Guide

## Prerequisites

- Flutter SDK 3.3.0+
- Rust toolchain
- Windows/macOS/Linux 开发环境

## 开发环境搭建

### 1. 安装依赖

```bash
cd flutter
flutter pub get
cd ../rust
cargo build -p im-flutter-bridge --release
```

### 2. 生成 FRB 绑定

```bash
cd flutter
flutter_rust_bridge_codegen generate
```

The generated Dart loader uses the `im_rust_bridge` native library stem and
loads from `rust/target/release/`. Run `dart run melos run rust-bridge:smoke`
from `flutter/` to build the release library and verify native initialization.

### 3. 运行桌面端

```bash
cd apps/desktop
flutter run -d windows  # 或 macos/linux
```

## 构建发布版本

### Windows
```bash
flutter build windows
```

### macOS
```bash
flutter build macos
```

### Linux
```bash
flutter build linux
```
