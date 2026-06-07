# IM Desktop

Flutter 桌面端即时通讯应用。

## 功能特性

- ✅ 用户认证（登录/注册）
- ✅ 实时聊天（单聊/群聊）
- ✅ 联系人管理
- ✅ 群组管理
- ✅ 朋友圈
- ✅ 端到端加密（E2EE）
- ✅ 文件传输
- ✅ 语音消息
- ✅ 系统通知

## 技术栈

- Flutter 3.x
- Dart
- Rust (通过 Flutter Rust Bridge)
- Riverpod (状态管理)
- GoRouter (路由)

## 开发环境

### 前置要求

- Flutter SDK 3.3.0+
- Rust toolchain
- Visual Studio (Windows) / Xcode (macOS)

### 安装依赖

```bash
cd flutter
flutter pub get
cd ../rust
cargo build -p im-flutter-bridge --release
```

### 生成 FRB 绑定

```bash
cd flutter
flutter_rust_bridge_codegen generate
```

生成配置位于 `flutter/flutter_rust_bridge.yaml`。native 运行时加载
`rust/target/release/im_rust_bridge.dll`、`libim_rust_bridge.so` 或
`libim_rust_bridge.dylib`，因此本地运行前需要先执行上面的 release build。
也可以从 `flutter/` 执行：

```bash
dart run melos run rust-bridge:smoke
```

### 运行应用

```bash
cd apps/desktop
flutter run -d windows  # Windows
flutter run -d macos    # macOS
flutter run -d linux    # Linux
```

### 构建发布版本

```bash
flutter build windows
flutter build macos
flutter build linux
```

## 项目结构

```
flutter/apps/desktop/
├── lib/
│   ├── main.dart                    # 应用入口
│   ├── app.dart                     # MaterialApp 配置
│   ├── adapters/                    # 平台适配器
│   ├── core/                        # 核心基础设施
│   │   ├── di/                      # 依赖注入
│   │   ├── router/                  # 路由配置
│   │   ├── shell/                   # 主界面 Shell
│   │   ├── theme/                   # 主题配置
│   │   └── logging/                 # 日志
│   └── features/                    # 业务模块
│       ├── auth/                    # 认证模块
│       ├── chat/                    # 聊天模块
│       ├── contacts/                # 联系人模块
│       ├── group/                   # 群组模块
│       ├── moments/                 # 朋友圈模块
│       ├── settings/                # 设置模块
│       └── e2ee/                    # E2EE 模块
├── pubspec.yaml
└── README.md
```

## 环境变量

| 变量 | 说明 | 默认值 |
|------|------|--------|
| `API_BASE_URL` | API 服务器地址 | http://localhost:8082 |
| `WS_BASE_URL` | WebSocket 服务器地址 | ws://localhost:8082 |
| `APP_ENV` | 应用环境 | development |

## 许可证

MIT License
