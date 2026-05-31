# Mobile Setup Guide

## Prerequisites

- Flutter SDK 3.3.0+
- Android Studio / Xcode
- Android SDK / iOS SDK

## 开发环境搭建

### 1. 安装依赖

```bash
cd flutter
flutter pub get
```

### 2. 运行移动端

```bash
cd apps/mobile
flutter run  # 连接设备或启动模拟器
```

## 构建发布版本

### Android
```bash
flutter build apk
# 或
flutter build appbundle
```

### iOS
```bash
flutter build ios
```
