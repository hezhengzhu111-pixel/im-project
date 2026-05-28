# AppLogger 统一日志设计

**日期：** 2026-05-28
**状态：** 已批准
**范围：** 清理 12 处 print() + 3 处 debugPrint()，建立统一安全日志封装

## 背景

验收报告指出 Flutter Web 生产代码中存在 22 处 print()（实际审计为 12 处 print + 3 处 debugPrint），部分会输出异常对象完整内容（`$e`），可能泄露 token、消息明文、E2EE envelope、用户信息或接口错误详情。项目中已有 `ErrorReporterPort`（noop 适配器）但从未被调用。Vue 端有成熟的 logger 实现可对标。

## 目标

1. 新增 `AppLogger` 统一日志工具，对齐 Vue logger 行为
2. 替换所有生产代码中的 `print()` 和 `debugPrint()`
3. catch 块只输出 `error.runtimeType`，不输出 `e.toString()`
4. `error` 级别同时调用 `ErrorReporterPort`（结构化上报）
5. analytics 事件中不带消息 content、token、ticket、envelope、device id（已确认清洁）
6. 新增测试覆盖 logger 脱敏行为
7. 不修改旧 `chat_provider.dart`（3 行 re-export shim，任务 3 会删除）

## 约束

- 不改变业务逻辑
- 不吞掉 UI 层错误状态（state.error / l10n 不受影响）
- `kDebugMode` 仅控制 debug/info 级别输出，warn/error 始终输出
- release 模式下 `debugPrint` 自动剥离，`AppLogger` 的 debug/info 也使用 `debugPrint`
- 不引入第三方日志包

---

## Section 1：AppLogger 实现

### 1.1 文件位置

`flutter/apps/web/lib/core/logging/app_logger.dart`

### 1.2 API 设计

```dart
import 'package:flutter/foundation.dart';
import 'package:im_core/core.dart';

class AppLogger {
  AppLogger._(this._errorReporter);

  final ErrorReporterPort? _errorReporter;
  static AppLogger? _instance;

  static AppLogger get instance => _instance ??= AppLogger._(null);

  /// 初始化 logger，注入 ErrorReporterPort（可选）
  static void init({ErrorReporterPort? errorReporter}) {
    _instance = AppLogger._(errorReporter);
  }

  /// Debug 级别：仅 kDebugMode 输出
  void debug(String message) {
    if (!kDebugMode) return;
    debugPrint('[im:debug] $message');
  }

  /// Info 级别：仅 kDebugMode 输出
  void info(String message) {
    if (!kDebugMode) return;
    debugPrint('[im:info] $message');
  }

  /// Warn 级别：始终输出
  void warn(String message) {
    debugPrint('[im:warn] $message');
  }

  /// Error 级别：始终输出 + 调用 ErrorReporterPort
  /// 只输出 error.runtimeType，不输出 e.toString()
  void error(String message, Object error) {
    final typeName = error.runtimeType.toString();
    debugPrint('[im:error] $message (type: $typeName)');
    _errorReporter?.reportError(
      error,
      null,
      extra: {'error_type': typeName},
    );
  }
}
```

### 1.3 行为矩阵

| 级别 | kDebugMode=true | kDebugMode=false (release) | ErrorReporterPort |
|------|----------------|---------------------------|-------------------|
| debug | console.debug 输出 | 不输出 | 不调用 |
| info | console.info 输出 | 不输出 | 不调用 |
| warn | console.warn 输出 | console.warn 输出 | 不调用 |
| error | console.error 输出 | console.error 输出 | 调用 reportError |

### 1.4 输出格式

```
[im:debug] WS connected
[im:info] Session restored
[im:warn] WS send dropped: not connected
[im:error] WS ticket fetch failed (type: SocketException)
```

### 1.5 与 ErrorReporterPort 的关系

- `AppLogger` 是 console 输出层（面向开发者调试）
- `ErrorReporterPort` 是结构化上报层（面向 Sentry/Bugsnag 等）
- 仅 `error` 级别桥接两者
- `ErrorReporterPort` 当前为 noop，不影响行为
- 未来接入 Sentry 时只需替换 `NoopErrorReporterAdapter`

---

## Section 2：替换清单

### 2.1 print() 替换（12 处 → 0 处）

| # | 文件 | 行 | 原代码 | 替换为 |
|---|------|-----|--------|--------|
| 1 | `auth_provider.dart` | 158 | `print('WS ticket fetch failed, connecting without ticket: $e')` | `AppLogger.instance.error('WS ticket fetch failed, connecting without ticket', e)` |
| 2 | `chat_provider_with_outbox.dart` | 233 | `print('Failed to handle incoming message: $e')` | `AppLogger.instance.error('Failed to handle incoming message', e)` |
| 3 | `chat_provider_with_outbox.dart` | 268 | `print('E2EE decrypt failed: $e')` | `AppLogger.instance.error('E2EE decrypt failed', e)` |
| 4 | `chat_provider_with_outbox.dart` | 303 | `print('Failed to handle message status change: $e')` | `AppLogger.instance.error('Failed to handle message status change', e)` |
| 5 | `chat_provider_with_outbox.dart` | 332 | `print('Failed to handle read receipt: $e')` | `AppLogger.instance.error('Failed to handle read receipt', e)` |
| 6 | `chat_provider_with_outbox.dart` | 343 | `print('Failed to handle system message: $e')` | `AppLogger.instance.error('Failed to handle system message', e)` |
| 7 | `chat_provider_with_outbox.dart` | 380 | `print('Failed to handle E2EE negotiation: $e')` | `AppLogger.instance.error('Failed to handle E2EE negotiation', e)` |
| 8 | `chat_provider_with_outbox.dart` | 507 | `print('Send message failed, adding to outbox: $e')` | `AppLogger.instance.error('Send message failed, adding to outbox', e)` |
| 9 | `chat_provider_with_outbox.dart` | 558 | `print('Send group message failed, adding to outbox: $e')` | `AppLogger.instance.error('Send group message failed, adding to outbox', e)` |
| 10 | `web_ws_adapter_web.dart` | 112 | `print('WS send dropped: not connected')` | `_logger.warn('WS send dropped: not connected')` |
| 11 | `web_ws_adapter_web.dart` | 132 | `print('WS parse error: $e')` | `_logger.error('WS parse error', e)` |
| 12 | `contacts_provider.dart` | 69 | `print('Failed to handle online status: $e')` | `AppLogger.instance.error('Failed to handle online status', e)` |

### 2.2 debugPrint() 替换（1 处 → 0 处）

| # | 文件 | 行 | 原代码 | 替换为 |
|---|------|-----|--------|--------|
| 13 | `message_outbox.dart` | 376 | `debugPrint('Outbox retry failed: $e')` | `AppLogger.instance.error('Outbox retry failed', e)` |

### 2.3 保留不动的 debugPrint（2 处）

`app_provider_observer.dart` 的 2 处 `debugPrint` 已有 `_isDevelopment` 守卫和敏感名过滤，无需替换。

### 2.4 web_ws_adapter_web.dart 无需构造函数变更

`WebWsClient` 通过 `network_providers.dart` 的 Riverpod provider 创建。由于 `AppLogger` 是单例（`AppLogger.instance`），`WebWsClient` 内部直接使用 `AppLogger.instance` 即可，无需修改构造函数或 provider。

---

## Section 3：ErrorReporterPort 初始化

在 `app.dart` 的 `ProviderScope` 初始化后调用：

```dart
// app.dart
AppLogger.init(errorReporter: ref.read(errorReporterProvider));
```

确保 `AppLogger` 在应用启动时获得 `ErrorReporterPort` 实例。当前为 noop，不影响行为。

---

## Section 4：测试策略

### 4.1 新增测试文件

`flutter/apps/web/test/core/logging/app_logger_test.dart`

### 4.2 测试用例

| 测试 | 验证点 |
|------|--------|
| `debug 仅在 kDebugMode 输出` | kDebugMode=false 时 debug() 不调用 debugPrint |
| `info 仅在 kDebugMode 输出` | kDebugMode=false 时 info() 不调用 debugPrint |
| `warn 始终输出` | 任何模式下 warn() 都调用 debugPrint |
| `error 始终输出` | 任何模式下 error() 都调用 debugPrint |
| `error 调用 ErrorReporterPort` | error() 传入 runtimeType 到 reportError |
| `error 不输出 e.toString()` | 输出中不含异常消息文本 |
| `init 注入 ErrorReporterPort` | init 后 error() 调用注入的 reporter |
| `未 init 时不崩溃` | 无 ErrorReporterPort 时 error() 正常输出 |

### 4.3 编译验证

- `flutter analyze` 无 error
- `flutter build web` 成功
- `grep -r "print(" lib/` 确认无残留 print

### 4.4 现有测试

- `flutter test` 全量通过

---

## Section 5：Analytics 审查

当前 analytics 事件已确认清洁：

| 事件 | 属性 | 安全？ |
|------|------|--------|
| `app_start` | `platform: 'web'` | 安全 |
| `login_success` | `method: 'password'` | 安全 |
| `login_failed` | `error_type: 'auth'` | 安全 |
| `register_success` | 无 | 安全 |
| `register_failed` | `error_type: 'auth'` | 安全 |
| `message_send` | `type`, `encrypted` | 安全 |
| `message_send_failed` | 无 | 安全 |
| `file_upload_start/failed` | `file_type`, `file_size` | 安全 |

无需修改。在代码审查中确认即可。

---

## 不做的事

- 不改业务逻辑
- 不改 analytics 事件（已清洁）
- 不修改 `app_provider_observer.dart`（已有守卫）
- 不修改旧 `chat_provider.dart`（3 行 re-export shim）
- 不引入第三方日志包（如 logger package）
- 不添加日志文件持久化（console only）
- 不添加日志远程收集（ErrorReporterPort 保留给未来 Sentry）
