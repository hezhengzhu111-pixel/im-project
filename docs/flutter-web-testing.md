# Flutter Web 测试与调试指南

## 概览

- 测试框架：`flutter_test`（Flutter 官方）
- Mock 策略：手写 Fake 类（`test/helpers/fakes.dart`）
- 覆盖率：lcov，核心路径优先
- Debug 面板：`kDebugMode` 条件渲染，release 不可见

## 目录结构

```
test/
  helpers/
    fakes.dart              — 共享 Fake 类
    pump_app.dart           — widget 测试封装
    test_providers.dart     — ProviderContainer 工厂
  core/
    router/                 — 路由测试
    debug/                  — DebugPanel 测试
  features/
    auth/                   — Auth provider 测试
    chat/                   — Chat provider + widget 测试
    settings/               — Settings widget 测试
integration_test/
  auth_test.dart            — 登录整合测试
  chat_test.dart            — 聊天整合测试
lib/core/debug/
  debug_panel.dart          — DebugPanel widget
  debug_panel_entry.dart    — FAB 入口
```

## 运行测试

```bash
# 单元测试 + widget 测试
melos run test:web

# 覆盖率报告
melos run coverage:web

# 整合测试（需要后端服务）
melos run test:integration

# 代码分析
melos run analyze:web

# 格式检查
melos run format:check
```

## 编写新测试

### 使用 pumpApp()

```dart
import '../helpers/pump_app.dart';

testWidgets('my widget test', (tester) async {
  await pumpApp(
    tester,
    child: MyWidget(),
    overrides: [
      // 覆盖特定 provider
    ],
  );
  expect(find.byType(MyWidget), findsOneWidget);
});
```

### 使用 createTestContainer()

```dart
import '../helpers/test_providers.dart';

test('my provider test', () {
  final container = createTestContainer(overrides: [
    // 覆盖特定 provider
  ]);
  final state = container.read(myStateProvider);
  expect(state, isNotNull);
  container.dispose();
});
```

### 添加新的 Fake 类

在 `test/helpers/fakes.dart` 中添加，遵循现有模式。

## Mock 层

| Fake 类 | 模拟接口 | 用途 |
|---------|---------|------|
| `FakeHttpClientPort` | `HttpClientPort` | HTTP 请求模拟 |
| `FakeWsClientPort` | `WsClientPort` | WebSocket 连接模拟 |
| `FakeSecureStoragePort` | `SecureStoragePort` | 安全存储模拟 |
| `FakeStoragePort` | `StoragePort` | 通用存储模拟 |
| `FakeE2eeManager` | `E2eeManager` | 端到端加密模拟 |
| `FakeAuthRepository` | `AuthRepository` | 认证仓库模拟 |

## DebugPanel

- 仅在 `kDebugMode == true` 时渲染（debug/profile 模式）
- release 模式下完全 tree-shake，零运行时开销
- 显示：Auth 状态、WS 连接、当前路由、活跃会话、会话数量、离线队列
- 右下角 FAB 展开/收起，点击外部区域自动收起

### 挂载方式

在 `MainLayout` 的 `Stack` 中添加：
```dart
const DebugPanelEntry(),
```

## CI 集成

### 当前状态

项目使用 melos 管理 Flutter monorepo，已配置以下脚本：

| 脚本 | 命令 | 说明 |
|------|------|------|
| `test:web` | `melos run test:web` | 运行 Web 单元测试 + widget 测试 |
| `analyze:web` | `melos run analyze:web` | 代码静态分析 |
| `coverage:web` | `melos run coverage:web` | 生成 lcov 覆盖率报告 |
| `test:integration` | `melos run test:integration` | 运行整合测试 |
| `format:check` | `melos run format:check` | 代码格式检查 |

### 后续 GitHub Actions 接入

创建 `.github/workflows/flutter-web-ci.yml`：

```yaml
name: Flutter Web CI

on:
  push:
    branches: [main, master]
  pull_request:
    branches: [main, master]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: subosito/flutter-action@v2
        with:
          flutter-version: '3.27.x'
      - run: flutter pub get
        working-directory: flutter/apps/web
      - run: melos run analyze:web
      - run: melos run test:web
      - run: melos run coverage:web
      - name: Upload coverage
        uses: codecov/codecov-action@v4
        with:
          files: flutter/apps/web/coverage/lcov.info
```

## 对标 Vue Web

| 能力 | Vue Web (Vitest) | Flutter Web (flutter_test) |
|------|-----------------|---------------------------|
| 单元测试 | vitest | flutter test |
| 组件测试 | @vue/test-utils | flutter_test (widget test) |
| Mock | vi.mock() | 手写 Fake 类 |
| Coverage | @vitest/coverage-v8 | flutter test --coverage |
| 路由守卫测试 | router-guard.spec.ts | app_router_test.dart |
| DevTools | Vue Devtools | DebugPanel (kDebugMode) |
| CI | 手动运行 | melos scripts |
