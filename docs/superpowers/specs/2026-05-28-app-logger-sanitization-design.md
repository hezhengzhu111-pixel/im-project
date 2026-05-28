# AppLogger 敏感信息脱敏设计

## 目标

加固 AppLogger，确保日志打印、错误上报和业务错误状态都不泄露 token、ticket、消息明文、E2EE envelope、device id、邮箱、手机号等敏感信息。

## 当前问题

`AppLogger.error()` 直接将原始 `Object error` 传给 `ErrorReporterPort.reportError()`。将来接入 Sentry/Crashlytics 等真实 reporter 时，原始异常对象可能包含请求 URL、ticket、消息内容、堆栈或后端响应体。

## 设计方案

### 架构概览

```
catch (e, st)
  → AppLogger.error(message, e, st)
    → ErrorSanitizer.sanitize(e, st)
      → 按类型路由：DioException / E2eeException / WebSocketException / Unknown
      → 剥离敏感模式 → 返回 SanitizedError
    → debugPrint(message + errorType)  // 安全
    → ErrorReporterPort.reportError(sanitized)  // 安全
```

### 1. SanitizedError 数据模型

```dart
class SanitizedError {
  final String errorType;    // 原始异常类型名，如 "DioException"
  final String category;     // http_error / ws_error / e2ee_error / unknown_error
  final String safeMessage;  // 剥离敏感信息后的消息
  final StackTrace? stackTrace; // 过滤敏感路径帧后的堆栈

  SanitizedError({
    required this.errorType,
    required this.category,
    required this.safeMessage,
    this.stackTrace,
  });
}
```

- `errorType`：保留原始 `runtimeType.toString()`，用于 debugPrint 和 analytics。
- `category`：分类标签，用于 ErrorReporter 的 extra 字段。
- `safeMessage`：从原始 `e.toString()` 中剥离敏感模式后的文本。
- `stackTrace`：过滤 `.env`、`credentials`、`token`、`secret` 等路径帧后的堆栈。

### 2. ErrorSanitizer 处理逻辑

单 `ErrorSanitizer` 类，按 `error.runtimeType` 做 switch 路由：

```dart
class ErrorSanitizer {
  SanitizedError sanitize(Object error, StackTrace? stackTrace) {
    return switch (error) {
      DioException() => _sanitizeDio(error, stackTrace),
      E2eeException() => _sanitizeE2ee(error, stackTrace),
      WebSocketException() => _sanitizeWs(error, stackTrace),
      _ => _sanitizeUnknown(error, stackTrace),
    };
  }
}
```

#### 类别映射

| 异常类型 | category |
|---|---|
| `DioException` | `http_error` |
| `E2eeException` | `e2ee_error` |
| `WebSocketException` | `ws_error` |
| 其他 | `unknown_error` |

#### 各分支处理

- **DioException** → `http_error`
  - safeMessage: 保留 `statusCode`、`message`（Dio 的错误消息），剥离 `requestOptions.uri` 中的 query 参数、`headers` 中的 Authorization、`response.data` body。

- **E2eeException** → `e2ee_error`
  - safeMessage: 保留异常类型和通用描述，剥离 envelope、session key、device id 等字段。

- **WebSocketException** → `ws_error`
  - safeMessage: 保留异常类型和通用描述，剥离 ticket 等字段。

- **Unknown** → `unknown_error`
  - safeMessage: 对 `error.toString()` 做通用敏感模式剥离。

#### 通用敏感模式剥离（硬编码正则）

| 模式 | 替换为 |
|---|---|
| `token=[^&\s]+` | `token=***` |
| `Bearer\s+[A-Za-z0-9\-._~+/]+=*` | `Bearer ***` |
| 邮箱（`[^\s@]+@[^\s@]+`） | `***@***` |
| 手机号（连续 11 位数字） | `***` |
| URL query 参数（`?key=value&...`） | 去除或替换 |

#### StackTrace 过滤

过滤帧路径包含以下关键词的帧：`.env`、`credentials`、`secret`、`token`、`key`。

### 3. AppLogger 变更

```dart
class AppLogger {
  AppLogger._(this._errorReporter, this._sanitizer);

  final ErrorReporterPort? _errorReporter;
  final ErrorSanitizer _sanitizer;

  void error(String message, Object error, [StackTrace? stackTrace]) {
    final sanitized = _sanitizer.sanitize(error, stackTrace);
    debugPrint('[im:error] $message (type: ${sanitized.errorType})');
    _errorReporter?.reportError(sanitized);
  }
}
```

- `debugPrint` 只输出 `message + errorType`（与当前行为一致）。
- `reportError` 只传 `SanitizedError`，不再传原始 `Object`。
- analytics 事件只记录 `sanitized.errorType`，不记录原始错误。

### 4. ErrorReporterPort 接口变更

```dart
abstract class ErrorReporterPort {
  void reportError(SanitizedError error);
  void reportMessage(String message, {String? level});
}
```

- `reportError` 参数从 `(Object error, StackTrace? stackTrace, {Map<String, dynamic>? extra})` 简化为 `(SanitizedError error)`。
- 实现者（Sentry/Crashlytics adapter）直接读取 `error.category` 和 `error.errorType` 作为 tag，`error.safeMessage` 作为描述。

### 5. 调用点变更

12 处 catch 块全部改为 `catch (e, st)` 并传入 `st`：

```dart
// 之前
} catch (e) {
  AppLogger.instance.error('Failed to handle incoming message', e);
}

// 之后
} catch (e, st) {
  AppLogger.instance.error('Failed to handle incoming message', e, st);
}
```

涉及文件：
- `auth_provider.dart`（1 处）
- `chat_provider_with_outbox.dart`（8 处）
- `contacts_provider.dart`（1 处）
- `message_outbox.dart`（1 处）
- `web_ws_adapter_web.dart`（1 处）

### 6. 测试策略

#### ErrorSanitizer 单元测试

| 测试用例 | 输入 | 期望 safeMessage |
|---|---|---|
| DioException 带 token query | `DioException(requestOptions: RequestOptions(path: '/api?token=abc123'))` | 不含 `abc123`，保留 statusCode |
| DioException 带 Authorization header | `DioException(headers: {'Authorization': 'Bearer eyJhb...'})` | 不含 JWT |
| E2eeException 带 envelope | 自定义 E2eeException 含 envelope 字段 | 不含 envelope 内容 |
| 通用异常含邮箱 | `Exception('user test@example.com failed')` | 邮箱被替换为 `***@***` |
| 通用异常含手机号 | `Exception('call 13812345678 failed')` | 手机号被替换为 `***` |
| 通用异常含 JWT | `Exception('token=eyJhbGciOi...')` | JWT 被替换为 `***` |

#### AppLogger 集成测试

| 测试用例 | 验证点 |
|---|---|
| 传入含 token 的异常 | `debugPrint` 输出不含 token，`reportError` 收到的 `SanitizedError.safeMessage` 不含 token |
| 传入含 message content 的异常 | `safeMessage` 不含消息明文 |
| ErrorReporterPort 收到的对象 | 只包含 `errorType`、`category`、`safeMessage`，无原始错误 |

#### StackTrace 过滤测试

| 测试用例 | 验证点 |
|---|---|
| 堆栈含 `.env` 帧 | 该帧被过滤 |
| 堆栈正常帧 | 保留不变 |

## 文件清单

### 新增文件

| 文件 | 说明 |
|---|---|
| `flutter/packages/core/lib/src/logging/sanitized_error.dart` | SanitizedError 数据类 |
| `flutter/packages/core/lib/src/logging/error_sanitizer.dart` | ErrorSanitizer 处理类 |
| `flutter/packages/core/test/logging/error_sanitizer_test.dart` | sanitizer 单元测试 |
| `flutter/apps/web/test/core/logging/app_logger_test.dart` | logger 集成测试 |

### 修改文件

| 文件 | 变更 |
|---|---|
| `flutter/apps/web/lib/core/logging/app_logger.dart` | 依赖 sanitizer，改 error() 签名 |
| `flutter/packages/core/lib/src/services/error_reporter_port.dart` | reportError 改为接收 SanitizedError |
| `flutter/apps/web/lib/features/auth/presentation/auth_provider.dart` | catch (e, st) |
| `flutter/apps/web/lib/features/chat/presentation/chat_provider_with_outbox.dart` | catch (e, st) ×8 |
| `flutter/apps/web/lib/features/contacts/presentation/contacts_provider.dart` | catch (e, st) |
| `flutter/apps/web/lib/features/chat/data/message_outbox.dart` | catch (e, st) |
| `flutter/apps/web/lib/adapters/web_ws_adapter_web.dart` | catch (e, st) |

## 技术约束

- 不吞 UI 所需错误码。UI 错误码与日志错误码分离。
- 不把 logger 绑定到具体第三方 SDK。
- sanitizer 规则硬编码，当前阶段不需要配置化。
