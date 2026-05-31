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
cd native/rust
cargo build
```

### 2. 生成 FRB 绑定

```bash
cd flutter
flutter_rust_bridge_codegen generate
```

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
