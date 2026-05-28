# Flutter Web 测试与调试体系设计

## 背景

Flutter Web 端引入了 flutter_test、mockito、very_good_analysis，但测试覆盖严重不足：
- 仅 7 个测试文件，覆盖 auth/chat 两个 feature
- mock 全部手写且重复（auth_provider_test 和 chat_provider_test 各自实现了 MockWsClientPort）
- 无共享测试辅助层、无 coverage 配置、无 debug panel、无 CI 脚本
- contacts/group/moments/settings/e2ee/router/widget 层零覆盖

对标 Vue Web（Vitest + 53 个测试文件 + v8 coverage），补齐 Flutter Web 的测试与调试体系。

## 设计决策

### Mock 策略：手写 Fake 类（集中式）

所有共享 Fake 类集中在 `test/helpers/fakes.dart`，按接口分组。

理由：
- 与现有手写 mock 风格一致，团队熟悉
- 无需 build_runner 代码生成，测试运行更快
- 集中管理避免重复定义（当前 MockWsClientPort 在两个文件中各写一遍）
- 项目只有 3-4 个 port 接口，集中管理最高效

### DebugPanel：kDebugMode 条件渲染

用 `kDebugMode` 包裹，release 下 tree-shake 掉，零运行时开销。Flutter 官方推荐方式。

### Coverage：核心路径 lcov

使用 Flutter 内置 `flutter test --coverage` 生成 lcov.info，不设硬阈值。先跑通流程。

### CI：仅 melos 脚本

更新 melos.yaml 增加 test:web / analyze:web / coverage:web 脚本，不创建 GitHub Actions。

## 目录结构

```
flutter/apps/web/
├── lib/
│   └── core/
│       └── debug/
│           ├── debug_panel.dart          — DebugPanel widget
│           └── debug_panel_entry.dart    — 入口按钮 + 展开/收起逻辑
├── test/
│   ├── helpers/
│   │   ├── fakes.dart                    — 所有共享 Fake 类
│   │   ├── pump_app.dart                 — pumpApp() widget 测试封装
│   │   └── test_providers.dart           — ProviderContainer 工厂
│   ├── core/
│   │   └── router/
│   │       └── app_router_test.dart      — 路由 redirect 测试
│   ├── features/
│   │   ├── auth/
│   │   │   ├── auth_provider_test.dart   — 整理现有测试
│   │   │   └── presentation/
│   │   │       └── widgets/
│   │   │           ├── auth_card_test.dart       — 保留
│   │   │           └── gradient_button_test.dart — 保留
│   │   ├── chat/
│   │   │   ├── chat_provider_test.dart   — 整理现有测试
│   │   │   ├── chat_page_test.dart       — ChatPage widget 测试
│   │   │   ├── message_input_test.dart   — MessageInput widget 测试
│   │   │   └── message_outbox_test.dart  — 保留
│   │   └── settings/
│   │       └── settings_page_test.dart   — Settings 语言/主题测试
│   └── core/
│       └── debug/
│           └── debug_panel_test.dart     — DebugPanel 渲染测试
├── integration_test/
│   ├── auth_test.dart                    — 整合现有 stub
│   └── chat_test.dart                    — 新增整合测试
```

## Mock 设计（helpers/fakes.dart）

### FakeHttpClientPort
- 模拟 `HttpClientPort` 接口
- 可配置 get/post/put/delete 的返回值或异常
- 记录调用参数和次数（`List<(String method, String path, dynamic body)> requests`）

### FakeWsClientPort
- 模拟 `WsClientPort` 接口
- `StreamController<WsEvent>` 模拟事件流
- `StreamController<WsConnectionState>` 模拟连接状态
- `connect()` / `disconnect()` / `send()` 可控
- 支持模拟断连重连场景

### FakeSecureStoragePort
- 内存 `Map<String, String?>` 实现
- 支持 `read()` / `write()` / `delete()` / `clear()` / `containsKey()`
- 可预置数据（`seed` 构造参数）

### FakeStoragePort
- 同 FakeSecureStoragePort 模式，用于通用存储

### FakeE2eeManager
- 模拟 `E2eeManager` 核心方法
- 可配置 encrypt/decrypt 返回值
- 默认空操作（不抛异常）

### helpers/pump_app.dart

```dart
Future<void> pumpApp(
  WidgetTester tester, {
  required Widget child,
  List<Override> overrides = const [],
  String initialLocation = '/chat',
}) async {
  await tester.pumpWidget(
    UncontrolledProviderScope(
      container: createTestContainer(overrides: overrides),
      child: MaterialApp.router(
        routerConfig: GoRouter(
          initialLocation: initialLocation,
          routes: [...], // 复用 app_router 路由定义
        ),
        home: child,
      ),
    ),
  );
}
```

### helpers/test_providers.dart

```dart
ProviderContainer createTestContainer({
  List<Override> overrides = const [],
}) {
  return ProviderContainer(overrides: [
    httpClientProvider.overrideWithValue(FakeHttpClientPort()),
    wsClientProvider.overrideWithValue(FakeWsClientPort()),
    secureStorageProvider.overrideWithValue(FakeSecureStoragePort()),
    storageProvider.overrideWithValue(FakeStoragePort()),
    e2eeManagerProvider.overrideWithValue(FakeE2eeManager()),
    ...overrides,
  ]);
}
```

## 测试用例规划

### core/router — 路由 redirect 测试

| 测试场景 | 验证内容 |
|---|---|
| 未登录访问 /chat | 重定向到 /login |
| 已登录访问 /login | 重定向到 /chat |
| 已登录访问 /settings | 正常渲染 |
| 无效路径 | 重定向到 /chat 或 404 |

### features/auth — Provider 测试（整理现有）

| 测试场景 | 验证内容 |
|---|---|
| checkAuth 成功 | AuthState 从 unauthenticated → authenticated |
| login 成功 | token 存储、状态更新 |
| login 失败 | 错误信息写入 AuthState |
| logout | 清除 token、状态重置为 unauthenticated |

### features/chat — Provider + Widget 测试

| 测试场景 | 验证内容 |
|---|---|
| ChatPage 空状态 | 显示空会话提示 |
| ChatPage 加载中 | 显示 loading indicator |
| ChatPage 有消息列表 | 渲染消息条目 |
| MessageInput 发送 | 调用 sendMessage，清空输入 |
| MessageInput 附件按钮 | 触发文件选择回调 |

### features/settings — Widget 测试

| 测试场景 | 验证内容 |
|---|---|
| 切换语言 | languageProvider 更新 |
| 切换主题 | themeModeProvider 更新 |
| 设置页渲染 | 显示各设置项 |

### core/debug — DebugPanel 测试

| 测试场景 | 验证内容 |
|---|---|
| debug 模式渲染 | 面板可见，显示 auth/ws/route 状态 |
| release 模式隐藏 | 面板不渲染（SizedBox.shrink） |

### integration_test — 整合测试（需后端 stub）

| 测试场景 | 验证内容 |
|---|---|
| 登录流程 | 输入凭证 → 跳转聊天页 |
| 聊天流程 | 发送消息 → 列表更新 |

**总计：** 现有 ~45 个整理后用例 + ~20 个新用例 = ~65 个测试用例

## DebugPanel 设计

### 位置与挂载

`lib/core/debug/` 目录下，两个文件：
- `debug_panel.dart` — 面板 UI widget
- `debug_panel_entry.dart` — 右下角 FAB 入口 + 展开/收起逻辑

挂载在 `MainLayout` 的 `Stack` 中（桌面端）或通过 `MaterialApp.builder` 叠加（移动端）。

### 显示条件

```dart
class DebugPanelEntry extends StatelessWidget {
  @override
  Widget build(BuildContext context) {
    if (!kDebugMode) return const SizedBox.shrink();
    return const _DebugFab();
  }
}
```

release 模式下 `kDebugMode` 为 false，整个 widget tree 被 tree-shake。

### 面板内容

| 区域 | 数据源 | 展示内容 |
|---|---|---|
| Auth State | `authStateProvider` | 状态（authenticated/unauthenticated）、userId、token 前 8 位（脱敏） |
| WS State | `wsStateProvider` | connected/disconnected/connecting、最后心跳时间 |
| Active Route | `GoRouterState` | 当前路径、pathParameters |
| Active Session | `chatStateProvider` | 当前选中会话 ID、会话名称 |
| Offline Queue | `messageOutboxProvider` | 待发送消息数量、队列状态 |

### UI 形态

- 右下角可折叠浮窗（`FloatingActionButton` 展开/收起）
- 展开后显示半透明黑色面板（`Colors.black87`），白色文字
- 点击外部区域自动收起
- 仅占屏幕右下 200x300 区域，不遮挡主内容

## melos.yaml 更新

```yaml
scripts:
  # 现有脚本保留
  test:
    run: melos exec -- flutter test
  analyze:
    run: melos exec -- flutter analyze
  build:web:
    run: melos exec --scope="im_web" -- flutter build web

  # 新增脚本
  test:web:
    run: melos exec --scope="im_web" -- flutter test
    description: 运行 Flutter Web 单元测试和 widget 测试

  analyze:web:
    run: melos exec --scope="im_web" -- flutter analyze
    description: 分析 Flutter Web 代码质量

  coverage:web:
    run: melos exec --scope="im_web" -- flutter test --coverage
    description: 生成 Flutter Web 测试覆盖率报告（lcov）

  test:integration:
    run: melos exec --scope="im_web" -- flutter test integration_test/
    description: 运行 Flutter Web 整合测试

  format:check:
    run: melos exec -- dart format --set-exit-if-changed .
    description: 检查代码格式
```

## 文档：docs/flutter-web-testing.md

### 文档结构

```markdown
# Flutter Web 测试与调试指南

## 概览
- 测试框架：flutter_test
- Mock 策略：手写 Fake 类（helpers/fakes.dart）
- 覆盖率：lcov，核心路径优先

## 目录结构
- test/ 目录布局说明
- integration_test/ 说明

## 运行测试
- melos run test:web
- melos run coverage:web
- melos run test:integration

## 编写测试
- 如何使用 pumpApp()
- 如何使用 createTestContainer()
- 如何添加新的 Fake 类

## Mock 层
- fakes.dart 中各 Fake 类说明
- 如何扩展新的 mock

## DebugPanel
- 使用条件（kDebugMode）
- 显示内容说明
- 如何添加新的调试信息

## CI 集成
- melos 脚本说明
- 后续 GitHub Actions 接入指引

## 对标 Vue Web
- 测试能力对比表
```

## 技术约束

- 不输出敏感 token（DebugPanel 中 token 只显示前 8 位）
- DebugPanel 不能进入 release（非 kDebugMode 时隐藏）
- 先覆盖核心路径，不追求 100% 覆盖率
- 使用 Flutter 官方 flutter_test / integration_test，手写 Fake 实现
- 现有测试文件（auth_provider_test、chat_provider_test 等）保留并整理，不重写
