# Network Status Web 真实检测设计

**日期**：2026-05-28
**状态**：已批准
**方案**：方案 A — 最小改动

---

## 问题陈述

Flutter Web 的 `networkStatusProvider` 默认使用 `_StubNetworkDataSource`，永远报告 online。`initWebNetworkStatus()` 从未被调用，导致 outbox 的离线检测和恢复重试在生产环境中不可用。

仓库还存在两套并行的网络状态抽象（核心端口层 + Web 应用层），其中核心端口层是空壳，从未被使用。

---

## 目标

1. Web 环境使用真实浏览器 online/offline 事件 + health check
2. 测试环境仍可注入 fake/stub
3. 删除未使用的核心端口层
4. 确保 outbox 在断网→恢复时正确重试
5. `limited` 状态有明确行为规则

---

## 非目标

- 重构 `NetworkStatusNotifier` 的 singleton 模式（当前够用）
- 实现核心端口层的 hexagonal 架构（无其他平台消费方）
- 添加 WebSocket 级别的连接检测

---

## 设计

### 1. 条件导入层

新建三个文件在 `apps/web/lib/core/network/`：

**`network_status_initializer.dart`** — 条件导入入口：
```dart
export 'network_status_initializer_stub.dart'
    if (dart.library.html) 'network_status_initializer_web.dart';
```

**`network_status_initializer_stub.dart`** — 非 Web 平台空实现：
```dart
void initNetworkStatus() {
  // 非 Web 平台：NetworkStatusNotifier 使用 _StubNetworkDataSource
}
```

**`network_status_initializer_web.dart`** — Web 平台调用真实初始化：
```dart
import 'network_status_web_init.dart';
void initNetworkStatus() => initWebNetworkStatus();
```

### 2. main.dart 初始化

```dart
import 'core/network/network_status_initializer.dart';

void main() {
  WidgetsFlutterBinding.ensureInitialized();
  initNetworkStatus();
  const env = String.fromEnvironment('APP_ENV', defaultValue: 'development');
  runApp(ProviderScope(
    observers: [AppProviderObserver(env: env)],
    child: const App(),
  ));
}
```

### 3. 删除死代码

| 文件/位置 | 操作 |
|-----------|------|
| `packages/core/lib/src/ports/network_status_port.dart` | 删除 |
| `packages/core/lib/src/ports/ports.dart` 中相关 export | 删除 |
| `packages/core/lib/core.dart` 中 `NetworkStatusPort` export | 删除 |
| `apps/web/lib/adapters/web_network_status_adapter.dart` | 删除 |
| `apps/web/lib/core/di/platform_providers.dart` 中 `networkStatusPortProvider` | 删除该 provider |
| `apps/web/test/ports/network_status_port_test.dart` | 删除 |
| `apps/web/test/mocks/mock_network_status_adapter.dart` | 删除 |

已 grep 确认：`NetworkStatusPort`、`WebNetworkStatusAdapter`、`networkStatusPortProvider` 仅在上述文件中引用。

### 4. 清理 MessageOutbox 冗余参数

删除 `MessageOutbox` 构造函数中的 `onNetworkRestored` 参数（从未被传入）。保留 `onNetworkAvailable()` 方法，由 `outbox_provider.dart` 通过 `ref.listen` 调用。

### 5. Outbox 联动链路

```
Browser online/offline events
  → WebNetworkStatusDataSource (stream)
  → NetworkStatusNotifier (state update)
  → outbox_provider.dart ref.listen
  → outbox.onNetworkAvailable()
  → _processPendingMessages()
```

现有 `outbox_provider.dart` 中的监听逻辑已正确实现：
```dart
ref.listen(networkStatusProvider, (prev, next) {
  if (prev != null && !prev.isOnline && next.isOnline) {
    outbox.onNetworkAvailable();
  }
});
```

激活 `initWebNetworkStatus()` 后此链路自动生效。

### 6. limited 状态行为规则

**定义**：浏览器 `navigator.onLine` 为 `true`，但 `/api/health` 请求失败。

| 场景 | 行为 |
|------|------|
| 新消息发送 | `isOnline` 返回 `false`，消息进入 outbox |
| 已有 pending 消息 | 不触发重试 |
| `limited → online` | 触发 `onNetworkAvailable()`，重试所有 pending |
| `online → limited` | UI 显示"连接受限"提示 |
| `offline → limited` | `isOnline` 保持 `false`，不触发重试 |
| `limited → offline` | 保持不重试 |

Health check 周期保持现有 1 分钟一次。

---

## 测试计划

### 单元测试

使用 `FakeNetworkStatusDataSource`，通过 Riverpod `ProviderScope(overrides: [...])` 注入。

| 测试用例 | 验证点 |
|----------|--------|
| offline 时发送消息 → 进入 outbox | `isOnline` 为 `false`，消息状态变为 `PENDING` |
| offline → online → 触发 retry | `onNetworkAvailable()` 被调用，pending 消息被重试 |
| online → limited → 不清空 outbox | `isOnline` 变 `false`，不触发 `onNetworkAvailable` |
| limited → online → 触发一次 retry | 只触发一次，不重复 |
| offline → limited → 不触发 retry | `isOnline` 保持 `false`，无额外副作用 |
| 连续 offline → online 只触发一次 retry | 防抖验证 |

### 手动回归

写入 `docs/network-status-regression.md`：

1. DevTools → Network → Offline
2. 发送私聊消息 → 预期 PENDING + 显示断线
3. 恢复 online → 预期自动重试，消息变 SENT
4. （可选）Slow 3G → health check 超时 → 预期显示"连接受限"

---

## 文件变更清单

| 操作 | 文件 |
|------|------|
| 新建 | `apps/web/lib/core/network/network_status_initializer.dart` |
| 新建 | `apps/web/lib/core/network/network_status_initializer_stub.dart` |
| 新建 | `apps/web/lib/core/network/network_status_initializer_web.dart` |
| 修改 | `apps/web/lib/main.dart` — 添加 `initNetworkStatus()` 调用 |
| 删除 | `packages/core/lib/src/ports/network_status_port.dart` |
| 删除 | `packages/core/lib/src/ports/ports.dart` 中相关 export |
| 修改 | `packages/core/lib/core.dart` — 删除 `NetworkStatusPort` export |
| 删除 | `apps/web/lib/adapters/web_network_status_adapter.dart` |
| 修改 | `apps/web/lib/core/di/platform_providers.dart` — 删除 `networkStatusPortProvider` |
| 删除 | `apps/web/test/ports/network_status_port_test.dart` |
| 删除 | `apps/web/test/mocks/mock_network_status_adapter.dart` |
| 修改 | `apps/web/lib/features/chat/data/message_outbox.dart` — 删除 `onNetworkRestored` 参数 |
| 新建 | `apps/web/test/core/network/network_status_provider_test.dart` |
| 新建 | `docs/network-status-regression.md` |
