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
- 显示：Auth 状态、WS 连接、当前路由、活跃会话、会话数量
- 右下角 FAB 展开/收起

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
