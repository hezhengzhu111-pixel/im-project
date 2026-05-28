# AppLogger 统一日志 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace all `print()`/`debugPrint()` in production code with a unified `AppLogger`, ensuring no sensitive data leaks to console in release builds.

**Architecture:** Create `AppLogger` singleton in `core/logging/` that mirrors Vue's logger pattern: `debug`/`info` gated by `kDebugMode`, `warn`/`error` always output. `error` bridges to `ErrorReporterPort` with `runtimeType` only. All 13 callsites replaced.

**Tech Stack:** Flutter, `kDebugMode` from `package:flutter/foundation.dart`, existing `ErrorReporterPort` from `im_core`

---

## File Structure

| Action | File | Responsibility |
|--------|------|---------------|
| Create | `flutter/apps/web/lib/core/logging/app_logger.dart` | Singleton logger with level gating + ErrorReporterPort bridge |
| Modify | `flutter/apps/web/lib/features/auth/presentation/auth_provider.dart:158` | Replace 1 `print()` |
| Modify | `flutter/apps/web/lib/features/chat/presentation/chat_provider_with_outbox.dart` | Replace 8 `print()` |
| Modify | `flutter/apps/web/lib/features/contacts/presentation/contacts_provider.dart:69` | Replace 1 `print()` |
| Modify | `flutter/apps/web/lib/adapters/web_ws_adapter_web.dart:112,132` | Replace 2 `print()` |
| Modify | `flutter/apps/web/lib/features/chat/data/message_outbox.dart:376` | Replace 1 `debugPrint()` |
| Modify | `flutter/apps/web/lib/app.dart` | Initialize `AppLogger` with `ErrorReporterPort` |
| Create | `flutter/apps/web/test/core/logging/app_logger_test.dart` | Logger behavior tests |

---

### Task 1: Create AppLogger

**Files:**
- Create: `flutter/apps/web/lib/core/logging/app_logger.dart`

- [ ] **Step 1: Create the logging directory and AppLogger class**

```dart
import 'package:flutter/foundation.dart';
import 'package:im_core/core.dart';

/// Unified logger for the Flutter Web app.
///
/// - `debug`/`info` only output in debug mode (kDebugMode).
/// - `warn`/`error` always output.
/// - `error` also reports to [ErrorReporterPort] with `runtimeType` only.
class AppLogger {
  AppLogger._(this._errorReporter);

  final ErrorReporterPort? _errorReporter;
  static AppLogger? _instance;

  static AppLogger get instance => _instance ??= AppLogger._(null);

  /// Initialize with an [ErrorReporterPort] for structured error capture.
  static void init({ErrorReporterPort? errorReporter}) {
    _instance = AppLogger._(errorReporter);
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

- [ ] **Step 2: Verify compilation**

Run: `cd flutter/apps/web && flutter analyze lib/core/logging/app_logger.dart`
Expected: No errors

---

### Task 2: AppLogger Tests

**Files:**
- Create: `flutter/apps/web/test/core/logging/app_logger_test.dart`

- [ ] **Step 1: Write all logger tests**

```dart
import 'package:flutter/foundation.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:im_core/core.dart';
import 'package:im_web/core/logging/app_logger.dart';

void Function(String?, {int? wrapWidth}) _originalDebugPrint = debugPrint;

/// Mock ErrorReporterPort for testing
class MockErrorReporterPort implements ErrorReporterPort {
  final List<Map<String, dynamic>> reports = [];

  @override
  void reportError(Object error, StackTrace? stackTrace,
      {Map<String, dynamic>? extra}) {
    reports.add({
      'error': error,
      'stackTrace': stackTrace,
      'extra': extra,
    });
  }

  @override
  void reportMessage(String message, {String? level}) {}
}

void main() {
  late List<String> logs;
  late MockErrorReporterPort mockReporter;

  setUp(() {
    logs = [];
    mockReporter = MockErrorReporterPort();
    _originalDebugPrint = debugPrint;
    debugPrint = (String? message, {int? wrapWidth}) {
      if (message != null) logs.add(message);
    };
  });

  tearDown(() {
    debugPrint = _originalDebugPrint;
    // Reset singleton for test isolation
    AppLogger.init(errorReporter: null);
  });

  group('AppLogger', () {
    test('debug outputs in debug mode', () {
      // kDebugMode is true in test environment
      final logger = AppLogger.instance;
      logger.debug('test message');
      expect(logs, contains('[im:debug] test message'));
    });

    test('info outputs in debug mode', () {
      final logger = AppLogger.instance;
      logger.info('test info');
      expect(logs, contains('[im:info] test info'));
    });

    test('warn always outputs', () {
      final logger = AppLogger.instance;
      logger.warn('test warning');
      expect(logs, contains('[im:warn] test warning'));
    });

    test('error always outputs with runtimeType', () {
      final logger = AppLogger.instance;
      logger.error('something failed', Exception('secret details'));
      expect(logs.length, 1);
      expect(logs[0], contains('[im:error] something failed'));
      expect(logs[0], contains('(type: Exception)'));
      // Must NOT contain the exception message
      expect(logs[0], isNot(contains('secret details')));
    });

    test('error calls ErrorReporterPort with runtimeType', () {
      AppLogger.init(errorReporter: mockReporter);
      final logger = AppLogger.instance;
      final error = FormatException('bad input');
      logger.error('parse failed', error);

      expect(mockReporter.reports.length, 1);
      expect(mockReporter.reports[0]['error'], same(error));
      expect(mockReporter.reports[0]['extra'], {'error_type': 'FormatException'});
    });

    test('error without init does not crash', () {
      // No init call — _errorReporter is null
      final logger = AppLogger.instance;
      logger.error('test', StateError('oops'));
      expect(logs.length, 1);
      expect(logs[0], contains('(type: StateError)'));
    });

    test('init replaces singleton with new ErrorReporterPort', () {
      final reporter1 = MockErrorReporterPort();
      final reporter2 = MockErrorReporterPort();

      AppLogger.init(errorReporter: reporter1);
      AppLogger.instance.error('test', Exception('e'));
      expect(reporter1.reports.length, 1);

      AppLogger.init(errorReporter: reporter2);
      AppLogger.instance.error('test', Exception('e'));
      expect(reporter2.reports.length, 1);
      expect(reporter1.reports.length, 1); // Not called again
    });
  });
}
```

- [ ] **Step 2: Run tests to verify they pass**

Run: `cd flutter/apps/web && flutter test test/core/logging/app_logger_test.dart`
Expected: All 7 tests PASS

- [ ] **Step 3: Commit**

```bash
git add flutter/apps/web/lib/core/logging/app_logger.dart flutter/apps/web/test/core/logging/app_logger_test.dart
git commit -m "feat(logging): add AppLogger with level gating and ErrorReporterPort bridge"
```

---

### Task 3: Replace print() in auth_provider.dart

**Files:**
- Modify: `flutter/apps/web/lib/features/auth/presentation/auth_provider.dart:158`

- [ ] **Step 1: Add AppLogger import**

At the top of `auth_provider.dart`, after the existing imports (line 2), add:

```dart
import '../../../core/logging/app_logger.dart';
```

- [ ] **Step 2: Replace print at line 158**

Find:
```dart
      print('WS ticket fetch failed, connecting without ticket: $e');
```

Replace with:
```dart
      AppLogger.instance.error('WS ticket fetch failed, connecting without ticket', e);
```

- [ ] **Step 3: Verify no remaining print in file**

Run: `grep -n "print(" flutter/apps/web/lib/features/auth/presentation/auth_provider.dart`
Expected: No output

- [ ] **Step 4: Commit**

```bash
git add flutter/apps/web/lib/features/auth/presentation/auth_provider.dart
git commit -m "refactor(auth): replace print with AppLogger in auth_provider"
```

---

### Task 4: Replace print() in chat_provider_with_outbox.dart

**Files:**
- Modify: `flutter/apps/web/lib/features/chat/presentation/chat_provider_with_outbox.dart`

- [ ] **Step 1: Add AppLogger import**

After the existing imports (line 11, after `import 'chat_state.dart';`), add:

```dart
import '../../../core/logging/app_logger.dart';
```

- [ ] **Step 2: Replace all 8 print() calls**

Each `print('... $e')` in a catch block becomes `AppLogger.instance.error('...', e)`:

| Line | Find | Replace with |
|------|------|-------------|
| 233 | `print('Failed to handle incoming message: $e');` | `AppLogger.instance.error('Failed to handle incoming message', e);` |
| 268 | `print('E2EE decrypt failed: $e');` | `AppLogger.instance.error('E2EE decrypt failed', e);` |
| 303 | `print('Failed to handle message status change: $e');` | `AppLogger.instance.error('Failed to handle message status change', e);` |
| 332 | `print('Failed to handle read receipt: $e');` | `AppLogger.instance.error('Failed to handle read receipt', e);` |
| 343 | `print('Failed to handle system message: $e');` | `AppLogger.instance.error('Failed to handle system message', e);` |
| 380 | `print('Failed to handle E2EE negotiation: $e');` | `AppLogger.instance.error('Failed to handle E2EE negotiation', e);` |
| 507 | `print('Send message failed, adding to outbox: $e');` | `AppLogger.instance.error('Send message failed, adding to outbox', e);` |
| 558 | `print('Send group message failed, adding to outbox: $e');` | `AppLogger.instance.error('Send group message failed, adding to outbox', e);` |

- [ ] **Step 3: Verify no remaining print in file**

Run: `grep -n "print(" flutter/apps/web/lib/features/chat/presentation/chat_provider_with_outbox.dart`
Expected: No output

- [ ] **Step 4: Commit**

```bash
git add flutter/apps/web/lib/features/chat/presentation/chat_provider_with_outbox.dart
git commit -m "refactor(chat): replace 8 print() calls with AppLogger in chat_provider_with_outbox"
```

---

### Task 5: Replace print() in contacts_provider.dart

**Files:**
- Modify: `flutter/apps/web/lib/features/contacts/presentation/contacts_provider.dart:69`

- [ ] **Step 1: Add AppLogger import**

After the existing imports (line 3, after `import 'package:im_core/core.dart';`), add:

```dart
import '../../../core/logging/app_logger.dart';
```

- [ ] **Step 2: Replace print at line 69**

Find:
```dart
      print('Failed to handle online status: $e');
```

Replace with:
```dart
      AppLogger.instance.error('Failed to handle online status', e);
```

- [ ] **Step 3: Verify no remaining print in file**

Run: `grep -n "print(" flutter/apps/web/lib/features/contacts/presentation/contacts_provider.dart`
Expected: No output

- [ ] **Step 4: Commit**

```bash
git add flutter/apps/web/lib/features/contacts/presentation/contacts_provider.dart
git commit -m "refactor(contacts): replace print with AppLogger in contacts_provider"
```

---

### Task 6: Replace print() in web_ws_adapter_web.dart

**Files:**
- Modify: `flutter/apps/web/lib/adapters/web_ws_adapter_web.dart:112,132`

- [ ] **Step 1: Add AppLogger import**

After the existing imports (line 4, after `import 'package:im_core/core.dart';`), add:

```dart
import '../core/logging/app_logger.dart';
```

- [ ] **Step 2: Replace print at line 112 (warn level — no error object)**

Find:
```dart
      print('WS send dropped: not connected');
```

Replace with:
```dart
      AppLogger.instance.warn('WS send dropped: not connected');
```

- [ ] **Step 3: Replace print at line 132 (error level)**

Find:
```dart
      print('WS parse error: $e');
```

Replace with:
```dart
      AppLogger.instance.error('WS parse error', e);
```

- [ ] **Step 4: Verify no remaining print in file**

Run: `grep -n "print(" flutter/apps/web/lib/adapters/web_ws_adapter_web.dart`
Expected: No output

- [ ] **Step 5: Commit**

```bash
git add flutter/apps/web/lib/adapters/web_ws_adapter_web.dart
git commit -m "refactor(ws): replace print with AppLogger in web_ws_adapter_web"
```

---

### Task 7: Replace debugPrint() in message_outbox.dart

**Files:**
- Modify: `flutter/apps/web/lib/features/chat/data/message_outbox.dart:376`

- [ ] **Step 1: Add AppLogger import**

After the existing imports (line 5, after `import 'package:im_core/core.dart';`), add:

```dart
import '../../../core/logging/app_logger.dart';
```

- [ ] **Step 2: Replace debugPrint at line 376**

Find:
```dart
      debugPrint('Outbox retry failed: $e');
```

Replace with:
```dart
      AppLogger.instance.error('Outbox retry failed', e);
```

- [ ] **Step 3: Remove unused flutter/foundation.dart import if no longer needed**

Check if `debugPrint` or `kDebugMode` is still used elsewhere in the file. If not, remove:
```dart
import 'package:flutter/foundation.dart';
```

- [ ] **Step 4: Verify**

Run: `grep -n "debugPrint\|print(" flutter/apps/web/lib/features/chat/data/message_outbox.dart`
Expected: No output

- [ ] **Step 5: Commit**

```bash
git add flutter/apps/web/lib/features/chat/data/message_outbox.dart
git commit -m "refactor(outbox): replace debugPrint with AppLogger in message_outbox"
```

---

### Task 8: Initialize AppLogger in app.dart

**Files:**
- Modify: `flutter/apps/web/lib/app.dart`

- [ ] **Step 1: Add AppLogger import**

After line 6 (`import 'core/di/providers.dart';`), add:

```dart
import 'core/logging/app_logger.dart';
```

- [ ] **Step 2: Initialize AppLogger in initState**

In `_AppState.initState()`, after `WidgetsBinding.instance.addPostFrameCallback((_) {` (line 26), add as the first line inside the callback:

```dart
      AppLogger.init(errorReporter: ref.read(errorReporterProvider));
```

The full callback becomes:
```dart
    WidgetsBinding.instance.addPostFrameCallback((_) {
      AppLogger.init(errorReporter: ref.read(errorReporterProvider));
      final analytics = ref.read(analyticsProvider);
      analytics.trackEvent('app_start', {'platform': 'web'});
      ref.read(authStateProvider.notifier).checkAuth();
      _webMetaService.apply(appFallbackMeta);
      // ... rest unchanged
```

- [ ] **Step 3: Commit**

```bash
git add flutter/apps/web/lib/app.dart
git commit -m "feat(logging): initialize AppLogger with ErrorReporterPort in app.dart"
```

---

### Task 9: Full Verification

- [ ] **Step 1: Run flutter analyze**

Run: `cd flutter/apps/web && flutter analyze`
Expected: No errors or warnings

- [ ] **Step 2: Run all tests**

Run: `cd flutter/apps/web && flutter test`
Expected: All tests PASS (including new logger tests)

- [ ] **Step 3: Verify zero remaining print/debugPrint in production code**

Run: `grep -rn "print(" flutter/apps/web/lib/ --include="*.dart" | grep -v "debugPrint\|_originalDebugPrint\|app_provider_observer"`
Expected: No output (all print() replaced)

Run: `grep -rn "debugPrint(" flutter/apps/web/lib/ --include="*.dart" | grep -v "app_provider_observer"`
Expected: No output (only app_provider_observer保留, 已有守卫)

- [ ] **Step 4: Build web to verify no compile errors**

Run: `cd flutter/apps/web && flutter build web`
Expected: Build succeeds

- [ ] **Step 5: Final commit (if any fixes needed)**

If analyze or tests revealed issues, fix and commit.
