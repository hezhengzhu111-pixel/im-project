# AppLogger 敏感信息脱敏实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 加固 AppLogger，确保日志和错误上报不泄露 token、ticket、消息明文、E2EE envelope、邮箱、手机号等敏感信息。

**Architecture:** AppLogger 内部使用 ErrorSanitizer 对异常做脱敏处理，输出 SanitizedError 给 ErrorReporterPort。ErrorSanitizer 按优先级路由：调用点 category hint → DioException 类型匹配 → 通用正则剥离。SanitizedError 是纯数据类，放在 core 包；ErrorSanitizer 放在 web app（依赖 Dio）。

**Tech Stack:** Dart, Flutter, Dio, test (core), flutter_test (web)

---

### 文件结构

**新增文件：**
| 文件 | 职责 |
|---|---|
| `flutter/packages/core/lib/src/logging/sanitized_error.dart` | SanitizedError 纯数据类 |
| `flutter/apps/web/lib/core/logging/error_sanitizer.dart` | ErrorSanitizer 脱敏逻辑 |
| `flutter/packages/core/test/logging/sanitized_error_test.dart` | SanitizedError 单元测试 |
| `flutter/apps/web/test/core/logging/error_sanitizer_test.dart` | ErrorSanitizer 单元测试 |
| `flutter/apps/web/test/core/logging/app_logger_test.dart` | AppLogger 集成测试 |

**修改文件：**
| 文件 | 变更 |
|---|---|
| `flutter/packages/core/lib/core.dart` | 添加 `export 'src/logging/sanitized_error.dart'` |
| `flutter/packages/core/lib/src/services/error_reporter_port.dart` | reportError 改为接收 SanitizedError |
| `flutter/packages/core/lib/src/services/services.dart` | 无需改（已 export error_reporter_port） |
| `flutter/packages/core/test/services/error_reporter_port_test.dart` | 适配新签名 |
| `flutter/apps/web/lib/core/logging/app_logger.dart` | 依赖 sanitizer，改 error() 签名 |
| `flutter/apps/web/lib/features/auth/presentation/auth_provider.dart` | catch (e, st) + category: 'ws' |
| `flutter/apps/web/lib/features/chat/presentation/chat_provider_with_outbox.dart` | catch (e, st) ×8，2 处加 category: 'e2ee' |
| `flutter/apps/web/lib/features/contacts/presentation/contacts_provider.dart` | catch (e, st) |
| `flutter/apps/web/lib/features/chat/data/message_outbox.dart` | catch (e, st) |
| `flutter/apps/web/lib/adapters/web_ws_adapter_web.dart` | catch (e, st) + category: 'ws' |

---

### Task 1: SanitizedError 数据类

**Files:**
- Create: `flutter/packages/core/lib/src/logging/sanitized_error.dart`
- Modify: `flutter/packages/core/lib/core.dart`
- Create: `flutter/packages/core/test/logging/sanitized_error_test.dart`

- [ ] **Step 1: 创建 SanitizedError 数据类**

```dart
// flutter/packages/core/lib/src/logging/sanitized_error.dart

/// Sanitized error representation for safe logging and reporting.
///
/// Contains only non-sensitive information extracted from an original error.
class SanitizedError {
  const SanitizedError({
    required this.errorType,
    required this.category,
    required this.safeMessage,
    this.stackTrace,
  });

  /// Original exception type name, e.g. "DioException".
  final String errorType;

  /// Category tag: http_error / ws_error / e2ee_error / unknown_error.
  final String category;

  /// Error message with sensitive data stripped.
  final String safeMessage;

  /// Stack trace with sensitive-path frames filtered out.
  final StackTrace? stackTrace;
}
```

- [ ] **Step 2: 导出到 core barrel**

在 `flutter/packages/core/lib/core.dart` 添加一行：

```dart
export 'src/logging/sanitized_error.dart';
```

- [ ] **Step 3: 编写 SanitizedError 测试**

```dart
// flutter/packages/core/test/logging/sanitized_error_test.dart
import 'package:test/test.dart';
import 'package:im_core/src/logging/sanitized_error.dart';

void main() {
  group('SanitizedError', () {
    test('stores all required fields', () {
      final st = StackTrace.current;
      final error = SanitizedError(
        errorType: 'DioException',
        category: 'http_error',
        safeMessage: 'Request failed with status 401',
        stackTrace: st,
      );

      expect(error.errorType, 'DioException');
      expect(error.category, 'http_error');
      expect(error.safeMessage, 'Request failed with status 401');
      expect(error.stackTrace, same(st));
    });

    test('stackTrace is optional', () {
      final error = SanitizedError(
        errorType: 'Exception',
        category: 'unknown_error',
        safeMessage: 'something failed',
      );

      expect(error.stackTrace, isNull);
    });
  });
}
```

- [ ] **Step 4: 运行测试确认通过**

```bash
cd flutter/packages/core && dart test test/logging/sanitized_error_test.dart
```

Expected: PASS

- [ ] **Step 5: 提交**

```bash
git add flutter/packages/core/lib/src/logging/sanitized_error.dart \
        flutter/packages/core/lib/core.dart \
        flutter/packages/core/test/logging/sanitized_error_test.dart
git commit -m "feat(core): add SanitizedError data class"
```

---

### Task 2: ErrorReporterPort 接口变更

**Files:**
- Modify: `flutter/packages/core/lib/src/services/error_reporter_port.dart`
- Modify: `flutter/packages/core/test/services/error_reporter_port_test.dart`

- [ ] **Step 1: 修改 ErrorReporterPort 接口**

```dart
// flutter/packages/core/lib/src/services/error_reporter_port.dart

import 'package:im_core/src/logging/sanitized_error.dart';

/// Abstract port for error/crash reporting services.
///
/// Implementations should send errors to providers like Sentry, Bugsnag, or Crashlytics.
/// Never include sensitive data (tokens, PII) in reports.
abstract class ErrorReporterPort {
  /// Report a sanitized error with no sensitive data.
  void reportError(SanitizedError error);

  /// Report a non-exception message (e.g., warning, info).
  void reportMessage(String message, {String? level});
}

/// Noop implementation that discards all reports.
class NoopErrorReporterPort implements ErrorReporterPort {
  @override
  void reportError(SanitizedError error) {}

  @override
  void reportMessage(String message, {String? level}) {}
}
```

- [ ] **Step 2: 更新测试适配新签名**

```dart
// flutter/packages/core/test/services/error_reporter_port_test.dart
import 'package:test/test.dart';
import 'package:im_core/src/services/error_reporter_port.dart';
import 'package:im_core/src/logging/sanitized_error.dart';

class _TestErrorReporterAdapter implements ErrorReporterPort {
  final List<SanitizedError> errors = [];
  final List<String> messages = [];

  @override
  void reportError(SanitizedError error) {
    errors.add(error);
  }

  @override
  void reportMessage(String message, {String? level}) {
    messages.add(message);
  }
}

void main() {
  group('ErrorReporterPort', () {
    test('accepts SanitizedError', () {
      final adapter = _TestErrorReporterAdapter();
      final sanitized = SanitizedError(
        errorType: 'Exception',
        category: 'unknown_error',
        safeMessage: 'test error',
      );
      adapter.reportError(sanitized);

      expect(adapter.errors.length, 1);
      expect(adapter.errors[0].errorType, 'Exception');
      expect(adapter.errors[0].category, 'unknown_error');
    });

    test('NoopErrorReporterPort accepts SanitizedError', () {
      final noop = NoopErrorReporterPort();
      noop.reportError(SanitizedError(
        errorType: 'Exception',
        category: 'unknown_error',
        safeMessage: 'test',
      ));
      noop.reportMessage('info', level: 'info');
      // no exception = pass
    });
  });
}
```

- [ ] **Step 3: 运行测试确认通过**

```bash
cd flutter/packages/core && dart test test/services/error_reporter_port_test.dart
```

Expected: PASS

- [ ] **Step 4: 提交**

```bash
git add flutter/packages/core/lib/src/services/error_reporter_port.dart \
        flutter/packages/core/test/services/error_reporter_port_test.dart
git commit -m "feat(core): update ErrorReporterPort to accept SanitizedError"
```

---

### Task 3: ErrorSanitizer — 通用敏感模式剥离

**Files:**
- Create: `flutter/apps/web/lib/core/logging/error_sanitizer.dart`
- Create: `flutter/apps/web/test/core/logging/error_sanitizer_test.dart`

- [ ] **Step 1: 编写通用剥离正则测试（TDD）**

```dart
// flutter/apps/web/test/core/logging/error_sanitizer_test.dart
import 'package:flutter_test/flutter_test.dart';
import 'package:im_web/core/logging/error_sanitizer.dart';

void main() {
  group('ErrorSanitizer - generic sanitization', () {
    late ErrorSanitizer sanitizer;

    setUp(() {
      sanitizer = ErrorSanitizer();
    });

    test('strips token= from message', () {
      final result = sanitizer.sanitize(
        Exception('request failed token=abc123def'),
        null,
      );
      expect(result.safeMessage, isNot(contains('abc123def')));
      expect(result.safeMessage, contains('token=***'));
    });

    test('strips Bearer token', () {
      final result = sanitizer.sanitize(
        Exception('auth failed Bearer eyJhbGciOiJIUzI1NiJ9.payload.sig'),
        null,
      );
      expect(result.safeMessage, isNot(contains('eyJhbGciOiJIUzI1NiJ9')));
      expect(result.safeMessage, contains('Bearer ***'));
    });

    test('strips email address', () {
      final result = sanitizer.sanitize(
        Exception('user test@example.com not found'),
        null,
      );
      expect(result.safeMessage, isNot(contains('test@example.com')));
      expect(result.safeMessage, contains('***@***'));
    });

    test('strips phone number (11 digits)', () {
      final result = sanitizer.sanitize(
        Exception('call 13812345678 failed'),
        null,
      );
      expect(result.safeMessage, isNot(contains('13812345678')));
      expect(result.safeMessage, contains('***'));
    });

    test('strips JWT in token= parameter', () {
      final result = sanitizer.sanitize(
        Exception('token=eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.signature'),
        null,
      );
      expect(result.safeMessage, isNot(contains('eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9')));
      expect(result.safeMessage, contains('token=***'));
    });

    test('sets category to unknown_error for generic exceptions', () {
      final result = sanitizer.sanitize(Exception('test'), null);
      expect(result.category, 'unknown_error');
    });

    test('preserves errorType as runtimeType name', () {
      final result = sanitizer.sanitize(Exception('test'), null);
      expect(result.errorType, 'Exception');
    });
  });
}
```

- [ ] **Step 2: 运行测试确认失败**

```bash
cd flutter/apps/web && flutter test test/core/logging/error_sanitizer_test.dart
```

Expected: FAIL — `ErrorSanitizer` 不存在

- [ ] **Step 3: 实现 ErrorSanitizer 通用剥离**

```dart
// flutter/apps/web/lib/core/logging/error_sanitizer.dart

import 'package:im_core/core.dart';

/// Sanitizes error objects to remove sensitive information before logging/reporting.
///
/// Detection priority:
/// 1. Caller-provided category hint
/// 2. DioException type matching
/// 3. Generic pattern stripping
class ErrorSanitizer {
  /// Matches token=VALUE patterns
  static final _tokenPattern = RegExp(r'token=[^\s&]+');

  /// Matches Bearer TOKEN patterns
  static final _bearerPattern = RegExp(r'Bearer\s+[A-Za-z0-9\-._~+/]+=*');

  /// Matches email addresses
  static final _emailPattern = RegExp(r'[^\s@]+@[^\s@]+\.[^\s@]+');

  /// Matches 11-digit phone numbers (Chinese mobile)
  static final _phonePattern = RegExp(r'\b1[3-9]\d{9}\b');

  /// Matches URL query strings
  static final _queryPattern = RegExp(r'\?[^#"\s]*');

  /// Sensitive path keywords for stack trace filtering
  static const _sensitivePathKeywords = [
    '.env',
    'credentials',
    'secret',
    'token',
    'key',
  ];

  /// Sanitize an error, removing sensitive information.
  ///
  /// [category] is an optional hint from the caller (e.g. 'e2ee', 'ws', 'http').
  SanitizedError sanitize(Object error, StackTrace? stackTrace, {String? category}) {
    final errorType = error.runtimeType.toString();
    final resolvedCategory = _resolveCategory(error, category);
    final safeMessage = _sanitizeMessage(error, category);
    final safeStack = _filterStackTrace(stackTrace);

    return SanitizedError(
      errorType: errorType,
      category: resolvedCategory,
      safeMessage: safeMessage,
      stackTrace: safeStack,
    );
  }

  String _resolveCategory(Object error, String? categoryHint) {
    if (categoryHint != null) {
      return switch (categoryHint) {
        'e2ee' => 'e2ee_error',
        'ws' => 'ws_error',
        'http' => 'http_error',
        _ => 'unknown_error',
      };
    }
    // DioException check would go here (added in next step)
    return 'unknown_error';
  }

  String _sanitizeMessage(Object error, String? category) {
    final raw = error.toString();
    var sanitized = _stripGenericPatterns(raw);

    if (category == 'e2ee') {
      sanitized = _stripE2eePatterns(sanitized);
    } else if (category == 'ws') {
      sanitized = _stripWsPatterns(sanitized);
    }

    return sanitized;
  }

  String _stripGenericPatterns(String input) {
    var result = input;
    result = result.replaceAll(_tokenPattern, 'token=***');
    result = result.replaceAll(_bearerPattern, 'Bearer ***');
    result = result.replaceAll(_emailPattern, '***@***');
    result = result.replaceAll(_phonePattern, '***');
    result = result.replaceAll(_queryPattern, '?***');
    return result;
  }

  String _stripE2eePatterns(String input) {
    // Strip envelope=VALUE, session=VALUE, deviceId=VALUE patterns
    var result = input;
    result = result.replaceAll(RegExp(r'envelope=[^\s&]+'), 'envelope=***');
    result = result.replaceAll(RegExp(r'session=[^\s&]+'), 'session=***');
    result = result.replaceAll(RegExp(r'deviceId=[^\s&]+'), 'deviceId=***');
    result = result.replaceAll(RegExp(r'device_id=[^\s&]+'), 'device_id=***');
    return result;
  }

  String _stripWsPatterns(String input) {
    // Strip ticket=VALUE patterns
    return input.replaceAll(RegExp(r'ticket=[^\s&]+'), 'ticket=***');
  }

  StackTrace? _filterStackTrace(StackTrace? stackTrace) {
    if (stackTrace == null) return null;
    final lines = stackTrace.toString().split('\n');
    final filtered = lines.where((line) {
      final lower = line.toLowerCase();
      return !_sensitivePathKeywords.any((kw) => lower.contains(kw));
    });
    return StackTrace.fromString(filtered.join('\n'));
  }
}
```

- [ ] **Step 4: 运行测试确认通过**

```bash
cd flutter/apps/web && flutter test test/core/logging/error_sanitizer_test.dart
```

Expected: PASS

- [ ] **Step 5: 提交**

```bash
git add flutter/apps/web/lib/core/logging/error_sanitizer.dart \
        flutter/apps/web/test/core/logging/error_sanitizer_test.dart
git commit -m "feat(web): add ErrorSanitizer with generic pattern stripping"
```

---

### Task 4: ErrorSanitizer — DioException 处理

**Files:**
- Modify: `flutter/apps/web/lib/core/logging/error_sanitizer.dart`
- Modify: `flutter/apps/web/test/core/logging/error_sanitizer_test.dart`

- [ ] **Step 1: 编写 DioException 测试（TDD）**

在 `error_sanitizer_test.dart` 中添加新 group：

```dart
import 'package:dio/dio.dart';

// ... 在 main() 中添加：

group('ErrorSanitizer - DioException', () {
  late ErrorSanitizer sanitizer;

  setUp(() {
    sanitizer = ErrorSanitizer();
  });

  test('sets category to http_error for DioException', () {
    final dioError = DioException(
      requestOptions: RequestOptions(path: '/api/test'),
      response: Response(
        statusCode: 401,
        requestOptions: RequestOptions(path: '/api/test'),
      ),
    );
    final result = sanitizer.sanitize(dioError, null);
    expect(result.category, 'http_error');
  });

  test('strips query parameters from DioException URI', () {
    final dioError = DioException(
      requestOptions: RequestOptions(path: '/api?token=secret123&user=admin'),
    );
    final result = sanitizer.sanitize(dioError, null);
    expect(result.safeMessage, isNot(contains('secret123')));
  });

  test('strips Authorization header from DioException', () {
    final dioError = DioException(
      requestOptions: RequestOptions(
        path: '/api',
        headers: {'Authorization': 'Bearer eyJhbGciOiJSUzI1NiJ9.payload.sig'},
      ),
    );
    final result = sanitizer.sanitize(dioError, null);
    expect(result.safeMessage, isNot(contains('eyJhbGciOiJSUzI1NiJ9')));
  });

  test('preserves statusCode in safeMessage', () {
    final dioError = DioException(
      requestOptions: RequestOptions(path: '/api'),
      response: Response(
        statusCode: 404,
        requestOptions: RequestOptions(path: '/api'),
      ),
    );
    final result = sanitizer.sanitize(dioError, null);
    expect(result.safeMessage, contains('404'));
  });

  test('strips response body from DioException', () {
    final dioError = DioException(
      requestOptions: RequestOptions(path: '/api'),
      response: Response(
        statusCode: 500,
        data: '{"error":"internal details with token=abc123"}',
        requestOptions: RequestOptions(path: '/api'),
      ),
    );
    final result = sanitizer.sanitize(dioError, null);
    expect(result.safeMessage, isNot(contains('abc123')));
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

```bash
cd flutter/apps/web && flutter test test/core/logging/error_sanitizer_test.dart
```

Expected: FAIL — DioException 分支未实现

- [ ] **Step 3: 在 ErrorSanitizer 中添加 DioException 处理**

在 `error_sanitizer.dart` 的 `_resolveCategory` 方法中添加 DioException 检查：

```dart
import 'package:dio/dio.dart';

// 在 _resolveCategory 方法中，categoryHint 检查之后添加：
  String _resolveCategory(Object error, String? categoryHint) {
    if (categoryHint != null) {
      return switch (categoryHint) {
        'e2ee' => 'e2ee_error',
        'ws' => 'ws_error',
        'http' => 'http_error',
        _ => 'unknown_error',
      };
    }
    if (error is DioException) {
      return 'http_error';
    }
    return 'unknown_error';
  }
```

在 `_sanitizeMessage` 方法中添加 DioException 分支：

```dart
  String _sanitizeMessage(Object error, String? category) {
    if (error is DioException) {
      return _sanitizeDio(error);
    }
    final raw = error.toString();
    var sanitized = _stripGenericPatterns(raw);

    if (category == 'e2ee') {
      sanitized = _stripE2eePatterns(sanitized);
    } else if (category == 'ws') {
      sanitized = _stripWsPatterns(sanitized);
    }

    return sanitized;
  }

  String _sanitizeDio(DioException error) {
    final parts = <String>[];

    // Status code (safe)
    final statusCode = error.response?.statusCode;
    if (statusCode != null) {
      parts.add('status=$statusCode');
    }

    // Dio error type (safe)
    parts.add('type=${error.type}');

    // Message without sensitive details
    final message = error.message;
    if (message != null) {
      parts.add('message=${_stripGenericPatterns(message)}');
    }

    // URI path without query params
    final path = error.requestOptions.uri.path;
    if (path.isNotEmpty) {
      parts.add('path=$path');
    }

    return parts.join(', ');
  }
```

- [ ] **Step 4: 运行测试确认通过**

```bash
cd flutter/apps/web && flutter test test/core/logging/error_sanitizer_test.dart
```

Expected: PASS

- [ ] **Step 5: 提交**

```bash
git add flutter/apps/web/lib/core/logging/error_sanitizer.dart \
        flutter/apps/web/test/core/logging/error_sanitizer_test.dart
git commit -m "feat(web): add DioException sanitization to ErrorSanitizer"
```

---

### Task 5: ErrorSanitizer — StackTrace 过滤

**Files:**
- Modify: `flutter/apps/web/test/core/logging/error_sanitizer_test.dart`

- [ ] **Step 1: 编写 StackTrace 过滤测试**

在 `error_sanitizer_test.dart` 中添加新 group：

```dart
group('ErrorSanitizer - StackTrace filtering', () {
  late ErrorSanitizer sanitizer;

  setUp(() {
    sanitizer = ErrorSanitizer();
  });

  test('filters frames containing .env', () {
    final stack = StackTrace.fromString('''
#0      main (file:///project/.env.dart:10:5)
#1      main (file:///project/lib/main.dart:20:3)
''');
    final result = sanitizer.sanitize(Exception('test'), stack);
    expect(result.stackTrace.toString(), isNot(contains('.env')));
    expect(result.stackTrace.toString(), contains('main.dart'));
  });

  test('filters frames containing credentials', () {
    final stack = StackTrace.fromString('''
#0      loadCredentials (file:///project/credentials.dart:10:5)
#1      main (file:///project/lib/main.dart:20:3)
''');
    final result = sanitizer.sanitize(Exception('test'), stack);
    expect(result.stackTrace.toString(), isNot(contains('credentials')));
    expect(result.stackTrace.toString(), contains('main.dart'));
  });

  test('preserves normal frames', () {
    final stack = StackTrace.fromString('''
#0      main (file:///project/lib/main.dart:10:5)
#1      run (file:///project/lib/app.dart:20:3)
''');
    final result = sanitizer.sanitize(Exception('test'), stack);
    expect(result.stackTrace.toString(), contains('main.dart'));
    expect(result.stackTrace.toString(), contains('app.dart'));
  });

  test('returns null stackTrace when input is null', () {
    final result = sanitizer.sanitize(Exception('test'), null);
    expect(result.stackTrace, isNull);
  });
});
```

- [ ] **Step 2: 运行测试确认通过（已在 Task 3 中实现）**

```bash
cd flutter/apps/web && flutter test test/core/logging/error_sanitizer_test.dart
```

Expected: PASS（`_filterStackTrace` 已在 Task 3 实现）

- [ ] **Step 3: 提交（如有额外修改才提交）**

如果测试全部通过且无需额外修改，跳过此步骤。

---

### Task 6: AppLogger 集成

**Files:**
- Modify: `flutter/apps/web/lib/core/logging/app_logger.dart`
- Create: `flutter/apps/web/test/core/logging/app_logger_test.dart`

- [ ] **Step 1: 编写 AppLogger 集成测试（TDD）**

```dart
// flutter/apps/web/test/core/logging/app_logger_test.dart
import 'package:flutter_test/flutter_test.dart';
import 'package:im_core/core.dart';
import 'package:im_web/core/logging/app_logger.dart';
import 'package:im_web/core/logging/error_sanitizer.dart';

class _MockErrorReporter implements ErrorReporterPort {
  final List<SanitizedError> errors = [];
  final List<String> messages = [];

  @override
  void reportError(SanitizedError error) {
    errors.add(error);
  }

  @override
  void reportMessage(String message, {String? level}) {
    messages.add(message);
  }
}

void main() {
  group('AppLogger.error', () {
    late _MockErrorReporter reporter;

    setUp(() {
      reporter = _MockErrorReporter();
      AppLogger.init(errorReporter: reporter, sanitizer: ErrorSanitizer());
    });

    test('reports sanitized error - no token leakage', () {
      AppLogger.instance.error(
        'Request failed',
        Exception('token=supersecret123'),
      );

      expect(reporter.errors.length, 1);
      expect(reporter.errors[0].safeMessage, isNot(contains('supersecret123')));
      expect(reporter.errors[0].safeMessage, contains('token=***'));
    });

    test('reports sanitized error - no email leakage', () {
      AppLogger.instance.error(
        'User lookup failed',
        Exception('user admin@example.com not found'),
      );

      expect(reporter.errors.length, 1);
      expect(reporter.errors[0].safeMessage, isNot(contains('admin@example.com')));
    });

    test('passes category hint through to sanitized error', () {
      AppLogger.instance.error(
        'E2EE decrypt failed',
        Exception('decrypt failed envelope=abc123'),
        null,
        'e2ee',
      );

      expect(reporter.errors.length, 1);
      expect(reporter.errors[0].category, 'e2ee_error');
      expect(reporter.errors[0].safeMessage, isNot(contains('abc123')));
    });

    test('errorType is runtimeType name', () {
      AppLogger.instance.error('test', Exception('msg'));

      expect(reporter.errors[0].errorType, 'Exception');
    });

    test('reportError receives SanitizedError, not raw Object', () {
      AppLogger.instance.error('test', Exception('raw message'));

      expect(reporter.errors[0], isA<SanitizedError>());
      expect(reporter.errors[0].safeMessage, isNot(equals('raw message')));
    });
  });
}
```

- [ ] **Step 2: 运行测试确认失败**

```bash
cd flutter/apps/web && flutter test test/core/logging/app_logger_test.dart
```

Expected: FAIL — AppLogger 签名不匹配

- [ ] **Step 3: 修改 AppLogger**

```dart
// flutter/apps/web/lib/core/logging/app_logger.dart

import 'package:flutter/foundation.dart';
import 'package:im_core/core.dart';
import 'package:im_web/core/logging/error_sanitizer.dart';

/// Unified logger for the Flutter Web app.
///
/// - `debug`/`info` only output in debug mode (kDebugMode).
/// - `warn`/`error` always output.
/// - `error` sanitizes the error before reporting to [ErrorReporterPort].
class AppLogger {
  AppLogger._(this._errorReporter, this._sanitizer);

  final ErrorReporterPort? _errorReporter;
  final ErrorSanitizer _sanitizer;
  static AppLogger? _instance;

  static AppLogger get instance => _instance ??= AppLogger._(null, ErrorSanitizer());

  /// Initialize with an [ErrorReporterPort] for structured error capture.
  static void init({
    ErrorReporterPort? errorReporter,
    ErrorSanitizer? sanitizer,
  }) {
    _instance = AppLogger._(errorReporter, sanitizer ?? ErrorSanitizer());
  }

  void debug(String message) {
    if (!kDebugMode) return;
    debugPrint('[im:debug] $message');
  }

  void info(String message) {
    if (!kDebugMode) return;
    debugPrint('[im:info] $message');
  }

  void warn(String message) {
    debugPrint('[im:warn] $message');
  }

  void error(String message, Object error, [StackTrace? stackTrace, String? category]) {
    final sanitized = _sanitizer.sanitize(error, stackTrace, category: category);
    debugPrint('[im:error] $message (type: ${sanitized.errorType})');
    _errorReporter?.reportError(sanitized);
  }
}
```

- [ ] **Step 4: 运行测试确认通过**

```bash
cd flutter/apps/web && flutter test test/core/logging/app_logger_test.dart
```

Expected: PASS

- [ ] **Step 5: 提交**

```bash
git add flutter/apps/web/lib/core/logging/app_logger.dart \
        flutter/apps/web/test/core/logging/app_logger_test.dart
git commit -m "feat(web): integrate ErrorSanitizer into AppLogger"
```

---

### Task 7: 更新调用点 — catch (e, st) + category hints

**Files:**
- Modify: `flutter/apps/web/lib/features/auth/presentation/auth_provider.dart`
- Modify: `flutter/apps/web/lib/features/chat/presentation/chat_provider_with_outbox.dart`
- Modify: `flutter/apps/web/lib/features/contacts/presentation/contacts_provider.dart`
- Modify: `flutter/apps/web/lib/features/chat/data/message_outbox.dart`
- Modify: `flutter/apps/web/lib/adapters/web_ws_adapter_web.dart`

- [ ] **Step 1: auth_provider.dart（1 处，category: 'ws'）**

行 159 附近：
```dart
// 之前
} catch (e) {
  AppLogger.instance.error('WS ticket fetch failed, connecting without ticket', e);
}

// 之后
} catch (e, st) {
  AppLogger.instance.error('WS ticket fetch failed, connecting without ticket', e, st, 'ws');
}
```

- [ ] **Step 2: chat_provider_with_outbox.dart（8 处，2 处 category: 'e2ee'）**

行 234 — 通用：
```dart
} catch (e, st) {
  AppLogger.instance.error('Failed to handle incoming message', e, st);
}
```

行 269 — E2EE：
```dart
} catch (e, st) {
  AppLogger.instance.error('E2EE decrypt failed', e, st, 'e2ee');
```

行 304 — 通用：
```dart
} catch (e, st) {
  AppLogger.instance.error('Failed to handle message status change', e, st);
}
```

行 333 — 通用：
```dart
} catch (e, st) {
  AppLogger.instance.error('Failed to handle read receipt', e, st);
}
```

行 344 — 通用：
```dart
} catch (e, st) {
  AppLogger.instance.error('Failed to handle system message', e, st);
}
```

行 381 — E2EE：
```dart
} catch (e, st) {
  AppLogger.instance.error('Failed to handle E2EE negotiation', e, st, 'e2ee');
}
```

行 508 — 通用：
```dart
} catch (e, st) {
  AppLogger.instance.error('Send message failed, adding to outbox', e, st);
}
```

行 559 — 通用：
```dart
} catch (e, st) {
  AppLogger.instance.error('Send group message failed, adding to outbox', e, st);
}
```

- [ ] **Step 3: contacts_provider.dart（1 处，通用）**

行 70：
```dart
} catch (e, st) {
  AppLogger.instance.error('Failed to handle online status', e, st);
}
```

- [ ] **Step 4: message_outbox.dart（1 处，通用）**

行 402：
```dart
} catch (e, st) {
  AppLogger.instance.error('Outbox retry failed', e, st);
```

- [ ] **Step 5: web_ws_adapter_web.dart（1 处，category: 'ws'）**

行 133：
```dart
} catch (e, st) {
  AppLogger.instance.error('WS parse error', e, st, 'ws');
}
```

- [ ] **Step 6: 运行全量测试确认无回归**

```bash
cd flutter/apps/web && flutter test
```

Expected: PASS

- [ ] **Step 7: 提交**

```bash
git add flutter/apps/web/lib/features/auth/presentation/auth_provider.dart \
        flutter/apps/web/lib/features/chat/presentation/chat_provider_with_outbox.dart \
        flutter/apps/web/lib/features/contacts/presentation/contacts_provider.dart \
        flutter/apps/web/lib/features/chat/data/message_outbox.dart \
        flutter/apps/web/lib/adapters/web_ws_adapter_web.dart
git commit -m "feat(web): update all error call sites with stack traces and category hints"
```

---

### Task 8: 运行全量测试并验证

- [ ] **Step 1: 运行 core 包测试**

```bash
cd flutter/packages/core && dart test
```

Expected: PASS

- [ ] **Step 2: 运行 web app 测试**

```bash
cd flutter/apps/web && flutter test
```

Expected: PASS

- [ ] **Step 3: 验证编译**

```bash
cd flutter/apps/web && flutter build web --no-tree-shake-icons
```

Expected: BUILD SUCCESS

- [ ] **Step 4: 最终提交（如有修复）**

如果有任何修复，提交修复。否则跳过。
