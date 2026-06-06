# Flutter 前端深度重构实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 消除 Desktop/Mobile 代码重复，将 ~120 个重复文件提取到共享包，apps 只保留平台装配代码。

**Architecture:** 新建 `packages/core_flutter`（Flutter 基础设施）和 `packages/shared_features`（业务 feature 共享层）。apps 通过 shim 过渡层渐进迁移，E2EE 采用接口/实现分离。

**Tech Stack:** Flutter, Dart, Riverpod, go_router, Melos

---

## Phase 0: Baseline Audit

### Task 0.1: 记录当前构建状态

**Files:**
- Create: `docs/design/refactoring-baseline.md`

- [ ] **Step 1: 记录 flutter analyze 状态**

```bash
cd D:/project/new-im-project/flutter
dart run melos exec -- flutter analyze 2>&1 | tee /tmp/analyze-baseline.txt
```

记录结果到 `docs/design/refactoring-baseline.md`。

- [ ] **Step 2: 记录 flutter test 状态**

```bash
cd D:/project/new-im-project/flutter
dart run melos exec -- flutter test 2>&1 | tee /tmp/test-baseline.txt
```

记录结果。

- [ ] **Step 3: 记录 desktop/mobile feature 文件 SHA/diff 分类**

```bash
cd D:/project/new-im-project/flutter
# Desktop/Mobile 文件对比清单
for f in $(find apps/desktop/lib/features -name "*.dart" | sort); do
  mobile_path=$(echo "$f" | sed 's|desktop/lib|mobile/lib|')
  if [ -f "$mobile_path" ]; then
    changed=$(diff --strip-trailing-cr "$f" "$mobile_path" 2>/dev/null | grep "^[<>]" | wc -l)
    if [ "$changed" -eq 0 ]; then
      echo "IDENTICAL | $f"
    elif [ "$changed" -le 4 ]; then
      echo "TRIVIAL ($changed) | $f"
    else
      echo "REAL ($changed) | $f"
    fi
  else
    echo "ONLY_DESKTOP | $f"
  fi
done
```

记录完整清单到 baseline 文档。

- [ ] **Step 4: 新建重构分支**

```bash
cd D:/project/new-im-project
git checkout -b refactor/flutter-shared-features
```

- [ ] **Step 5: 记录当前 router import 和 E2EE provider 依赖**

```bash
# 记录 router import 来源
grep -n "import.*features" apps/desktop/lib/core/router/app_router.dart
grep -n "import.*features" apps/mobile/lib/core/router/app_router.dart

# 记录 E2EE provider 依赖
grep -n "import.*desktop_key_store\|import.*desktop_session_store\|import.*mobile_key_store\|import.*mobile_session_store" apps/*/lib/features/e2ee/data/e2ee_providers.dart
```

记录到 baseline 文档。

- [ ] **Step 6: 提交**

```bash
git add docs/design/refactoring-baseline.md
git commit -m "docs: add baseline audit for Flutter refactoring"
```

---

## Phase 1: im_core_flutter 基础设施

### Task 1.1: 创建 core_flutter 包结构

**Files:**
- Create: `packages/core_flutter/pubspec.yaml`
- Create: `packages/core_flutter/lib/im_core_flutter.dart`
- Create: `packages/core_flutter/lib/src/` (子目录)

- [ ] **Step 1: 创建 pubspec.yaml**

```yaml
# packages/core_flutter/pubspec.yaml
name: im_core_flutter
description: Flutter infrastructure layer for IM app - providers, logger, routing helpers
version: 0.1.0
publish_to: none

environment:
  sdk: '>=3.3.0 <4.0.0'

dependencies:
  flutter:
    sdk: flutter
  flutter_riverpod: ^2.5.1
  go_router: ^14.2.0
  im_core:
    path: ../core
  im_ui:
    path: ../ui

dev_dependencies:
  flutter_test:
    sdk: flutter
  very_good_analysis: ^5.1.0
```

- [ ] **Step 2: 创建 barrel file**

```dart
// packages/core_flutter/lib/im_core_flutter.dart
library im_core_flutter;

export 'src/platform/platform_capability_providers.dart';
export 'src/platform/infrastructure_providers.dart';
export 'src/platform/app_settings_providers.dart';
export 'src/logging/app_logger.dart';
export 'src/logging/error_sanitizer.dart';
export 'src/router/route_names.dart';
export 'src/router/route_meta.dart';
export 'src/router/router_guard.dart';
export 'src/router/router_refresh.dart';
```

- [ ] **Step 3: 创建目录结构**

```bash
mkdir -p packages/core_flutter/lib/src/platform
mkdir -p packages/core_flutter/lib/src/logging
mkdir -p packages/core_flutter/lib/src/router
mkdir -p packages/core_flutter/test
```

- [ ] **Step 4: 运行 pub get 验证**

```bash
cd D:/project/new-im-project/flutter/packages/core_flutter
flutter pub get
```

预期: 成功，无报错。

- [ ] **Step 5: 提交**

```bash
git add packages/core_flutter/
git commit -m "feat(core_flutter): create package structure with pubspec and barrel"
```

### Task 1.2: 迁移 platform_providers（拆分 3 个文件）

**Files:**
- Create: `packages/core_flutter/lib/src/platform/platform_capability_providers.dart`
- Create: `packages/core_flutter/lib/src/platform/infrastructure_providers.dart`
- Create: `packages/core_flutter/lib/src/platform/app_settings_providers.dart`

- [ ] **Step 1: 创建 platform_capability_providers.dart**

```dart
// packages/core_flutter/lib/src/platform/platform_capability_providers.dart
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:im_core/core.dart';

// ---------------------------------------------------------------------------
// Platform Capability Providers
//
// These providers are intentionally left without default implementations to
// keep this file free of platform-specific imports. This allows VM tests to
// import and override these providers without triggering compilation errors.
//
// On each platform, the real adapters are provided via ProviderScope overrides
// in main.dart. Tests provide mocks the same way.
// ---------------------------------------------------------------------------

final filePickerPortProvider = Provider<FilePickerPort>((ref) {
  throw UnimplementedError(
      'filePickerPortProvider must be overridden at app startup');
});

final notificationPortProvider = Provider<NotificationPort>((ref) {
  throw UnimplementedError(
      'notificationPortProvider must be overridden at app startup');
});

final clipboardPortProvider = Provider<ClipboardPort>((ref) {
  throw UnimplementedError(
      'clipboardPortProvider must be overridden at app startup');
});

final sharePortProvider = Provider<SharePort>((ref) {
  throw UnimplementedError(
      'sharePortProvider must be overridden at app startup');
});

final audioRecorderPortProvider = Provider<AudioRecorderPort>((ref) {
  throw UnimplementedError(
      'audioRecorderPortProvider must be overridden at app startup');
});
```

- [ ] **Step 2: 创建 infrastructure_providers.dart**

```dart
// packages/core_flutter/lib/src/platform/infrastructure_providers.dart
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:im_core/core.dart';

// ---------------------------------------------------------------------------
// Network & Storage Providers
// ---------------------------------------------------------------------------

final secureStorageProvider = Provider<SecureStoragePort>((ref) {
  throw UnimplementedError(
      'secureStorageProvider must be overridden at app startup');
});

final storageProvider = Provider<StoragePort>((ref) {
  throw UnimplementedError(
      'storageProvider must be overridden at app startup');
});

final httpClientProvider = Provider<HttpClientPort>((ref) {
  throw UnimplementedError(
      'httpClientProvider must be overridden at app startup');
});

final wsClientProvider = Provider<WsClientPort>((ref) {
  throw UnimplementedError(
      'wsClientProvider must be overridden at app startup');
});

final wsStateProvider = StreamProvider<WsConnectionState>((ref) {
  return ref.watch(wsClientProvider).connectionState;
});

// ---------------------------------------------------------------------------
// E2EE Provider
// ---------------------------------------------------------------------------

final e2eeAdapterProvider = Provider<E2eeBridge>((ref) {
  throw UnimplementedError(
      'e2eeAdapterProvider must be overridden at app startup');
});

// ---------------------------------------------------------------------------
// Analytics & Error Reporting Providers
// ---------------------------------------------------------------------------

final analyticsProvider = Provider<AnalyticsPort>((ref) {
  throw UnimplementedError(
      'analyticsProvider must be overridden at app startup');
});

final errorReporterProvider = Provider<ErrorReporterPort>((ref) {
  throw UnimplementedError(
      'errorReporterProvider must be overridden at app startup');
});

final pushProvider = Provider<PushPort>((ref) {
  throw UnimplementedError('pushProvider must be overridden at app startup');
});
```

- [ ] **Step 3: 创建 app_settings_providers.dart（统一用 StateProvider）**

```dart
// packages/core_flutter/lib/src/platform/app_settings_providers.dart
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

// ---------------------------------------------------------------------------
// App Settings Providers
//
// Unified StateProvider for language and theme mode.
// Uses StateProvider (not StateNotifierProvider) to match mobile convention
// and avoid extra call-site changes.
// ---------------------------------------------------------------------------

final languageProvider = StateProvider<String>((ref) => 'zh');

final themeModeProvider = StateProvider<ThemeMode>((ref) => ThemeMode.system);
```

- [ ] **Step 4: 运行 pub get + analyze**

```bash
cd D:/project/new-im-project/flutter/packages/core_flutter
flutter pub get
flutter analyze
```

预期: 零 warning。

- [ ] **Step 5: 提交**

```bash
git add packages/core_flutter/lib/src/platform/
git commit -m "feat(core_flutter): migrate platform_providers (split into 3 files)"
```

### Task 1.3: 迁移 AppLogger（超集签名 + 参数化 tag）

**Files:**
- Create: `packages/core_flutter/lib/src/logging/app_logger.dart`
- Create: `packages/core_flutter/lib/src/logging/error_sanitizer.dart`

- [ ] **Step 1: 创建 error_sanitizer.dart**

从 `apps/desktop/lib/core/logging/error_sanitizer.dart` 复制（两端已相同）。

```dart
// packages/core_flutter/lib/src/logging/error_sanitizer.dart
import 'package:im_core/core.dart';

/// Sanitizes errors before reporting to [ErrorReporterPort].
class ErrorSanitizer {
  SanitizedError sanitize(
    Object error,
    StackTrace? stackTrace, {
    String? category,
  }) {
    return SanitizedError(
      errorType: error.runtimeType.toString(),
      message: error.toString(),
      stackTrace: stackTrace?.toString(),
      category: category,
    );
  }
}
```

（注意：如果原始文件内容不同，以 desktop 版本为准。）

- [ ] **Step 2: 创建 app_logger.dart（超集签名 + 参数化 tag）**

```dart
// packages/core_flutter/lib/src/logging/app_logger.dart
import 'package:flutter/foundation.dart';
import 'package:im_core/core.dart';
import 'error_sanitizer.dart';

/// Unified logger for IM Flutter apps.
///
/// - `debug`/`info` only output in debug mode (kDebugMode).
/// - `warn`/`error` always output.
/// - `error` sanitizes the error before reporting to [ErrorReporterPort].
///
/// Supports parameterized tag (not hardcoded platform name).
class AppLogger {
  AppLogger._(this._tag, this._errorReporter, this._sanitizer);

  final String _tag;
  final ErrorReporterPort? _errorReporter;
  final ErrorSanitizer _sanitizer;
  static AppLogger? _instance;

  static AppLogger get instance =>
      _instance ??= AppLogger._('im', null, ErrorSanitizer());

  /// Initialize with a custom tag and optional [ErrorReporterPort].
  static void init({
    String tag = 'im',
    ErrorReporterPort? errorReporter,
    ErrorSanitizer? sanitizer,
  }) {
    _instance =
        AppLogger._(tag, errorReporter, sanitizer ?? ErrorSanitizer());
  }

  void debug(String message) {
    if (!kDebugMode) return;
    debugPrint('[$_tag:debug] $message');
  }

  void info(String message) {
    if (!kDebugMode) return;
    debugPrint('[$_tag:info] $message');
  }

  /// Superset signature: accepts optional error and stackTrace.
  void warn(String message, [Object? error, StackTrace? stackTrace]) {
    debugPrint('[$_tag:warn] $message');
    if (error != null) {
      debugPrint('[$_tag:warn] detail: $error');
    }
    if (stackTrace != null) {
      debugPrint('[$_tag:warn] stack: $stackTrace');
    }
  }

  void error(String message, Object error,
      [StackTrace? stackTrace, String? category]) {
    final sanitized =
        _sanitizer.sanitize(error, stackTrace, category: category);
    debugPrint(
        '[$_tag:error] $message (type: ${sanitized.errorType}): $error');
    if (stackTrace != null) {
      debugPrint('[$_tag:error] stack: $stackTrace');
    }
    _errorReporter?.reportError(sanitized);
  }
}
```

- [ ] **Step 3: 更新 barrel file**

```dart
// packages/core_flutter/lib/im_core_flutter.dart
library im_core_flutter;

export 'src/platform/platform_capability_providers.dart';
export 'src/platform/infrastructure_providers.dart';
export 'src/platform/app_settings_providers.dart';
export 'src/logging/app_logger.dart';
export 'src/logging/error_sanitizer.dart';
export 'src/router/route_names.dart';
export 'src/router/route_meta.dart';
export 'src/router/router_guard.dart';
export 'src/router/router_refresh.dart';
```

- [ ] **Step 4: 运行 analyze**

```bash
cd D:/project/new-im-project/flutter/packages/core_flutter
flutter analyze
```

- [ ] **Step 5: 提交**

```bash
git add packages/core_flutter/lib/src/logging/
git commit -m "feat(core_flutter): migrate AppLogger with superset signature + parametric tag"
```

### Task 1.4: 迁移路由辅助模块

**Files:**
- Create: `packages/core_flutter/lib/src/router/route_names.dart`
- Create: `packages/core_flutter/lib/src/router/route_meta.dart`
- Create: `packages/core_flutter/lib/src/router/router_guard.dart`
- Create: `packages/core_flutter/lib/src/router/router_refresh.dart`

- [ ] **Step 1: 创建 route_names.dart**

合并 desktop 和 mobile 的路由常量（mobile 更完整，以 mobile 为基准）：

```dart
// packages/core_flutter/lib/src/router/route_names.dart

/// Centralized route name constants for named navigation.
class RouteNames {
  RouteNames._();

  static const login = 'login';
  static const register = 'register';
  static const chat = 'chat';
  static const chatSession = 'chatSession';
  static const contacts = 'contacts';
  static const contactsAdd = 'contactsAdd';
  static const groups = 'groups';
  static const groupsCreate = 'groupsCreate';
  static const moments = 'moments';
  static const momentsNotifications = 'momentsNotifications';
  static const settings = 'settings';
  static const settingsProfile = 'settingsProfile';
  static const settingsAi = 'settingsAi';
  static const notFound = 'notFound';
}
```

- [ ] **Step 2: 创建 route_meta.dart**

```dart
// packages/core_flutter/lib/src/router/route_meta.dart

/// Route metadata for auth guards and navigation logic.
class RouteMeta {
  const RouteMeta({
    required this.title,
    this.requiresAuth = true,
    this.hideForAuth = false,
    this.permission,
  });

  final String title;
  final bool requiresAuth;
  final bool hideForAuth;
  final String? permission;
}

/// Default route metadata map.
final defaultRouteMetaMap = <String, RouteMeta>{
  '/login': const RouteMeta(
    title: 'Login',
    requiresAuth: false,
    hideForAuth: true,
  ),
  '/register': const RouteMeta(
    title: 'Register',
    requiresAuth: false,
    hideForAuth: true,
  ),
  '/chat': const RouteMeta(title: 'Chat'),
  '/contacts': const RouteMeta(title: 'Contacts'),
  '/contacts/add': const RouteMeta(title: 'Add Friend'),
  '/groups': const RouteMeta(title: 'Groups'),
  '/groups/create': const RouteMeta(title: 'Create Group'),
  '/moments': const RouteMeta(title: 'Moments'),
  '/moments/notifications': const RouteMeta(title: 'Notifications'),
  '/settings': const RouteMeta(title: 'Settings'),
  '/settings/profile': const RouteMeta(title: 'Profile'),
  '/settings/ai': const RouteMeta(title: 'AI Settings'),
};

/// Resolve [RouteMeta] for a given location by longest-prefix match.
RouteMeta? resolveRouteMeta(String location,
    [Map<String, RouteMeta>? metaMap]) {
  final map = metaMap ?? defaultRouteMetaMap;
  if (map.containsKey(location)) {
    return map[location];
  }
  var bestMatch = '';
  for (final key in map.keys) {
    if (location.startsWith(key) &&
        key.length > bestMatch.length &&
        (key.length == location.length || location[key.length] == '/')) {
      bestMatch = key;
    }
  }
  return bestMatch.isEmpty ? null : map[bestMatch];
}
```

- [ ] **Step 3: 创建 router_guard.dart**

```dart
// packages/core_flutter/lib/src/router/router_guard.dart
import 'package:flutter/material.dart';
import 'route_meta.dart';

/// Auth redirect helper for GoRouter.
///
/// Returns a redirect path if the user should be redirected, or null to allow
/// the current route.
String? authGuardRedirect({
  required bool isAuthenticated,
  required bool isLoading,
  required String currentPath,
  List<String> permissions = const [],
  Map<String, RouteMeta>? routeMetaMap,
}) {
  final meta = resolveRouteMeta(currentPath, routeMetaMap);

  // No meta (e.g. 404 catch-all) -- let through
  if (meta == null) return null;

  // During startup, auth restoration is asynchronous.
  if (isLoading) return null;

  // hideForAuth: logged-in user on /login or /register -> /chat
  if (meta.hideForAuth && isAuthenticated) return '/chat';

  // requiresAuth: not logged in -> /login
  if (meta.requiresAuth && !isAuthenticated) {
    return '/login?redirect=${Uri.encodeComponent(currentPath)}';
  }

  // permission: user lacks required permission -> /chat
  if (meta.permission != null && !permissions.contains(meta.permission)) {
    return '/chat';
  }

  return null;
}
```

- [ ] **Step 4: 创建 router_refresh.dart**

```dart
// packages/core_flutter/lib/src/router/router_refresh.dart
import 'package:flutter/foundation.dart';

/// A [ChangeNotifier] that can be manually refreshed to trigger
/// GoRouter re-evaluation.
class RouterRefreshListenable extends ChangeNotifier {
  void refresh() => notifyListeners();
}
```

- [ ] **Step 5: 运行 analyze**

```bash
cd D:/project/new-im-project/flutter/packages/core_flutter
flutter analyze
```

- [ ] **Step 6: 提交**

```bash
git add packages/core_flutter/lib/src/router/
git commit -m "feat(core_flutter): migrate route_names, route_meta, router_guard, router_refresh"
```

### Task 1.5: apps 改用 core_flutter

**Files:**
- Modify: `apps/desktop/pubspec.yaml`
- Modify: `apps/mobile/pubspec.yaml`
- Modify: `apps/desktop/lib/core/di/platform_providers.dart` (删除，替换为 import)
- Modify: `apps/mobile/lib/core/di/platform_providers.dart` (删除，替换为 import)
- Modify: `apps/desktop/lib/core/logging/app_logger.dart` (删除，替换为 import)
- Modify: `apps/mobile/lib/core/logging/app_logger.dart` (删除，替换为 import)

- [ ] **Step 1: 给 desktop pubspec 添加 im_core_flutter 依赖**

```yaml
# apps/desktop/pubspec.yaml - dependencies 段添加
  im_core_flutter:
    path: ../../packages/core_flutter
```

- [ ] **Step 2: 给 mobile pubspec 添加 im_core_flutter 依赖**

```yaml
# apps/mobile/pubspec.yaml - dependencies 段添加
  im_core_flutter:
    path: ../../packages/core_flutter
```

- [ ] **Step 3: desktop 平台_providers.dart 改为 re-export**

将 `apps/desktop/lib/core/di/platform_providers.dart` 内容替换为：

```dart
// Re-export from im_core_flutter.
// Desktop-specific overrides are applied in main.dart via ProviderScope.
export 'package:im_core_flutter/im_core_flutter.dart'
    show
        filePickerPortProvider,
        notificationPortProvider,
        clipboardPortProvider,
        sharePortProvider,
        audioRecorderPortProvider,
        secureStorageProvider,
        storageProvider,
        httpClientProvider,
        wsClientProvider,
        wsStateProvider,
        e2eeAdapterProvider,
        analyticsProvider,
        errorReporterProvider,
        pushProvider,
        languageProvider,
        themeModeProvider;
```

- [ ] **Step 4: mobile platform_providers.dart 改为 re-export**

同上，将 `apps/mobile/lib/core/di/platform_providers.dart` 替换为相同的 re-export。

- [ ] **Step 5: desktop app_logger.dart 改为 re-export**

将 `apps/desktop/lib/core/logging/app_logger.dart` 替换为：

```dart
// Re-export from im_core_flutter.
export 'package:im_core_flutter/src/logging/app_logger.dart';
export 'package:im_core_flutter/src/logging/error_sanitizer.dart';
```

- [ ] **Step 6: mobile app_logger.dart 改为 re-export**

同上。

- [ ] **Step 7: 运行 pub get + analyze**

```bash
cd D:/project/new-im-project/flutter
cd apps/desktop && flutter pub get && flutter analyze
cd ../../apps/mobile && flutter pub get && flutter analyze
```

预期: 零 warning。注意：languageProvider 类型从 `StateNotifierProvider<LanguageNotifier, String>` 变为 `StateProvider<String>`。如果 apps 中有 `.notifier` 调用，需要改为直接 `.state` 赋值。

- [ ] **Step 8: 修复可能的 StateProvider 调用差异**

如果 settings_page.dart 中有 `ref.read(languageProvider.notifier).state = value`，改为 `ref.read(languageProvider.notifier).state = value`（StateProvider 的 notifier 也是 `.state` 赋值，所以实际上调用方式相同，无需修改）。

- [ ] **Step 9: 提交**

```bash
git add apps/desktop/pubspec.yaml apps/mobile/pubspec.yaml
git add apps/desktop/lib/core/di/ apps/mobile/lib/core/di/
git add apps/desktop/lib/core/logging/ apps/mobile/lib/core/logging/
git commit -m "refactor(apps): switch to im_core_flutter for platform_providers and app_logger"
```

### Task 1.6: Phase 1 验证

- [ ] **Step 1: 全量 analyze**

```bash
cd D:/project/new-im-project/flutter
dart run melos exec -- flutter analyze
```

预期: 零 warning。

- [ ] **Step 2: 依赖方向检查**

```bash
grep -R "package:im_shared_features" packages/core_flutter/lib || true
```

预期: 无输出（core_flutter 不依赖 shared_features）。

- [ ] **Step 3: 提交**

```bash
git commit --allow-empty -m "chore: Phase 1 complete - im_core_flutter infrastructure"
```

---

## Phase 2: shared_features 创建 + auth 最小闭环

### Task 2.1: 创建 shared_features 包结构

**Files:**
- Create: `packages/shared_features/pubspec.yaml`
- Create: `packages/shared_features/lib/im_shared_features.dart`

- [ ] **Step 1: 创建 pubspec.yaml**

```yaml
# packages/shared_features/pubspec.yaml
name: im_shared_features
description: Shared business features for IM Desktop and Mobile apps
version: 0.1.0
publish_to: none

environment:
  sdk: '>=3.3.0 <4.0.0'

dependencies:
  flutter:
    sdk: flutter
  flutter_riverpod: ^2.5.1
  go_router: ^14.2.0
  im_core:
    path: ../core
  im_core_flutter:
    path: ../core_flutter
  im_ui:
    path: ../ui

dev_dependencies:
  flutter_test:
    sdk: flutter
  very_good_analysis: ^5.1.0
```

- [ ] **Step 2: 创建 barrel file（初始为空）**

```dart
// packages/shared_features/lib/im_shared_features.dart
library im_shared_features;

// Features will be added in Phase 2/3.
// export 'src/auth/auth.dart';
```

- [ ] **Step 3: 创建目录结构**

```bash
mkdir -p packages/shared_features/lib/src/auth/data
mkdir -p packages/shared_features/lib/src/auth/domain
mkdir -p packages/shared_features/lib/src/auth/presentation
mkdir -p packages/shared_features/test
```

- [ ] **Step 4: 运行 pub get**

```bash
cd D:/project/new-im-project/flutter/packages/shared_features
flutter pub get
```

- [ ] **Step 5: 提交**

```bash
git add packages/shared_features/
git commit -m "feat(shared_features): create package structure"
```

### Task 2.2: 迁移 auth 模块

**Files:**
- Create: `packages/shared_features/lib/src/auth/auth.dart` (barrel)
- Create: `packages/shared_features/lib/src/auth/data/auth_repository_impl.dart`
- Create: `packages/shared_features/lib/src/auth/domain/auth_status.dart`
- Create: `packages/shared_features/lib/src/auth/presentation/auth_provider.dart`
- Create: `packages/shared_features/lib/src/auth/presentation/auth_providers.dart`
- Create: `packages/shared_features/lib/src/auth/presentation/login_page.dart`
- Create: `packages/shared_features/lib/src/auth/presentation/register_page.dart`

- [ ] **Step 1: 复制 auth 文件到 shared_features**

以 desktop 版本为 canonical（desktop 和 mobile 的 auth 文件大部分相同）。

```bash
cp apps/desktop/lib/features/auth/data/auth_repository_impl.dart \
   packages/shared_features/lib/src/auth/data/

cp apps/desktop/lib/features/auth/domain/auth_status.dart \
   packages/shared_features/lib/src/auth/domain/

cp apps/desktop/lib/features/auth/presentation/auth_provider.dart \
   packages/shared_features/lib/src/auth/presentation/

cp apps/desktop/lib/features/auth/presentation/auth_providers.dart \
   packages/shared_features/lib/src/auth/presentation/

cp apps/desktop/lib/features/auth/presentation/login_page.dart \
   packages/shared_features/lib/src/auth/presentation/

cp apps/desktop/lib/features/auth/presentation/register_page.dart \
   packages/shared_features/lib/src/auth/presentation/
```

- [ ] **Step 2: 修正 import 路径**

检查并修正每个文件中的 import：
- `package:im_desktop` → 相对路径或 `package:im_core` / `package:im_core_flutter`
- `package:im_mobile` → 同上
- `../../../core/di/platform_providers.dart` → `package:im_core_flutter/im_core_flutter.dart`

例如 `auth_provider.dart` 中：
```dart
// 旧: import '../../../core/di/platform_providers.dart';
// 新: import 'package:im_core_flutter/im_core_flutter.dart';
```

`login_page.dart` 中如果有硬编码 `'IM Desktop'`，改为参数化：
```dart
// 旧: const Text('IM Desktop')
// 新: const Text('IM')  // 或通过参数传入 appName
```

- [ ] **Step 3: 创建 auth barrel file**

```dart
// packages/shared_features/lib/src/auth/auth.dart
export 'data/auth_repository_impl.dart';
export 'domain/auth_status.dart';
export 'presentation/auth_provider.dart';
export 'presentation/auth_providers.dart';
export 'presentation/login_page.dart';
export 'presentation/register_page.dart';
```

- [ ] **Step 4: 更新 shared_features barrel**

```dart
// packages/shared_features/lib/im_shared_features.dart
library im_shared_features;

export 'src/auth/auth.dart';
```

- [ ] **Step 5: 依赖方向检查**

```bash
grep -R "package:im_desktop" packages/shared_features/lib || true
grep -R "package:im_mobile" packages/shared_features/lib || true
```

预期: 无输出。

- [ ] **Step 6: 运行 analyze**

```bash
cd D:/project/new-im-project/flutter/packages/shared_features
flutter analyze
```

- [ ] **Step 7: 提交**

```bash
git add packages/shared_features/lib/src/auth/
git commit -m "feat(shared_features): migrate auth module from desktop (canonical)"
```

### Task 2.3: apps/auth 改为 export shim

**Files:**
- Modify: `apps/desktop/lib/features/auth/auth.dart`
- Modify: `apps/mobile/lib/features/auth/auth.dart`
- Modify: `apps/desktop/pubspec.yaml`
- Modify: `apps/mobile/pubspec.yaml`

- [ ] **Step 1: 给 apps 添加 im_shared_features 依赖**

desktop pubspec.yaml:
```yaml
  im_shared_features:
    path: ../../packages/shared_features
```

mobile pubspec.yaml:
```yaml
  im_shared_features:
    path: ../../packages/shared_features
```

- [ ] **Step 2: desktop auth.dart 改为 shim**

```dart
// apps/desktop/lib/features/auth/auth.dart
export 'package:im_shared_features/src/auth/auth.dart';
```

- [ ] **Step 3: mobile auth.dart 改为 shim**

```dart
// apps/mobile/lib/features/auth/auth.dart
export 'package:im_shared_features/src/auth/auth.dart';
```

- [ ] **Step 4: 删除 apps 中已迁移的 auth 子文件**

```bash
# Desktop - 删除已迁移到 shared_features 的文件
rm apps/desktop/lib/features/auth/data/auth_repository_impl.dart
rm apps/desktop/lib/features/auth/domain/auth_status.dart
rm apps/desktop/lib/features/auth/presentation/auth_provider.dart
rm apps/desktop/lib/features/auth/presentation/auth_providers.dart
rm apps/desktop/lib/features/auth/presentation/login_page.dart
rm apps/desktop/lib/features/auth/presentation/register_page.dart

# Mobile - 同样删除
rm apps/mobile/lib/features/auth/data/auth_repository_impl.dart
rm apps/mobile/lib/features/auth/domain/auth_status.dart
rm apps/mobile/lib/features/auth/presentation/auth_provider.dart
rm apps/mobile/lib/features/auth/presentation/auth_providers.dart
rm apps/mobile/lib/features/auth/presentation/login_page.dart
rm apps/mobile/lib/features/auth/presentation/register_page.dart
```

- [ ] **Step 5: 运行 pub get + analyze**

```bash
cd D:/project/new-im-project/flutter
cd apps/desktop && flutter pub get && flutter analyze
cd ../../apps/mobile && flutter pub get && flutter analyze
```

预期: 零 warning。router 中 `import 'package:im_desktop/features/auth/auth.dart'` 通过 shim 仍然有效。

- [ ] **Step 6: 提交**

```bash
git add apps/desktop/lib/features/auth/ apps/mobile/lib/features/auth/
git add apps/desktop/pubspec.yaml apps/mobile/pubspec.yaml
git commit -m "refactor(apps): replace auth files with export shims to shared_features"
```

### Task 2.4: Phase 2 验证

- [ ] **Step 1: 全量 analyze**

```bash
cd D:/project/new-im-project/flutter
dart run melos exec -- flutter analyze
```

- [ ] **Step 2: 依赖方向检查**

```bash
grep -R "package:im_desktop" packages/shared_features/lib || true
grep -R "package:im_mobile" packages/shared_features/lib || true
```

- [ ] **Step 3: 提交**

```bash
git commit --allow-empty -m "chore: Phase 2 complete - shared_features + auth migration"
```

---

## Phase 3: 按 feature 批量迁移

### Task 3.1: 迁移 chat 模块

**Files:**
- Create: `packages/shared_features/lib/src/chat/` (15 个文件)
- Modify: `apps/desktop/lib/features/chat/chat.dart` (shim)
- Modify: `apps/mobile/lib/features/chat/chat.dart` (shim)

- [ ] **Step 1: 复制 chat 文件到 shared_features**

```bash
# 创建目录
mkdir -p packages/shared_features/lib/src/chat/data
mkdir -p packages/shared_features/lib/src/chat/presentation/widgets

# 复制 data 层（以 desktop 为 canonical，大部分相同）
for f in apps/desktop/lib/features/chat/data/*.dart; do
  cp "$f" packages/shared_features/lib/src/chat/data/
done

# 复制 presentation 层
for f in apps/desktop/lib/features/chat/presentation/*.dart; do
  cp "$f" packages/shared_features/lib/src/chat/presentation/
done

# 复制 widgets
for f in apps/desktop/lib/features/chat/presentation/widgets/*.dart; do
  cp "$f" packages/shared_features/lib/src/chat/presentation/widgets/
done
```

- [ ] **Step 2: 修正 import 路径**

在所有复制的文件中：
- `package:im_desktop` → 相对路径或 `package:im_core` / `package:im_core_flutter`
- `../../../core/di/platform_providers.dart` → `package:im_core_flutter/im_core_flutter.dart`
- `../../../core/logging/app_logger.dart` → `package:im_core_flutter/src/logging/app_logger.dart`

- [ ] **Step 3: 统一 chat_notifier.dart 错误处理**

将 mobile 版本的 `catch (_) {}` 改为使用 AppLogger：

```dart
// 旧 (mobile):
} catch (_) {}

// 新:
} catch (e, st) {
  AppLogger.instance.warn('Failed to sync offline messages', e, st);
}
```

- [ ] **Step 4: 统一 message_bubble.dart**

以 desktop 版本为准（ConsumerWidget with Riverpod）。mobile 版本当前是 StatelessWidget，迁入 shared_features 后统一为 ConsumerWidget。如果 mobile 的 message_bubble 有额外的 UI 差异（如 Wrap 布局），合并到 desktop 版本中。

- [ ] **Step 5: 创建 chat barrel**

```dart
// packages/shared_features/lib/src/chat/chat.dart
export 'data/file_api.dart';
export 'data/file_providers.dart';
export 'data/message_api.dart';
export 'data/message_api_provider.dart';
export 'data/message_config.dart';
export 'data/message_pipeline.dart';
export 'presentation/chat_notifier.dart';
export 'presentation/chat_page.dart';
export 'presentation/chat_provider.dart';
export 'presentation/chat_providers.dart';
export 'presentation/chat_state.dart';
export 'presentation/widgets/message_bubble.dart';
export 'presentation/widgets/message_input.dart';
export 'presentation/widgets/session_tile.dart';
```

- [ ] **Step 6: 更新 shared_features barrel**

```dart
// packages/shared_features/lib/im_shared_features.dart
library im_shared_features;

export 'src/auth/auth.dart';
export 'src/chat/chat.dart';
```

- [ ] **Step 7: apps/chat.dart 改为 shim**

```dart
// apps/desktop/lib/features/chat/chat.dart
export 'package:im_shared_features/src/chat/chat.dart';
```

```dart
// apps/mobile/lib/features/chat/chat.dart
export 'package:im_shared_features/src/chat/chat.dart';
```

- [ ] **Step 8: 删除 apps 中已迁移的 chat 子文件**

```bash
# Desktop
rm -rf apps/desktop/lib/features/chat/data/
rm -rf apps/desktop/lib/features/chat/presentation/

# Mobile
rm -rf apps/mobile/lib/features/chat/data/
rm -rf apps/mobile/lib/features/chat/presentation/
```

- [ ] **Step 9: 依赖方向检查 + analyze**

```bash
grep -R "package:im_desktop" packages/shared_features/lib || true
grep -R "package:im_mobile" packages/shared_features/lib || true

cd D:/project/new-im-project/flutter
cd apps/desktop && flutter pub get && flutter analyze
cd ../../apps/mobile && flutter pub get && flutter analyze
```

- [ ] **Step 10: 提交**

```bash
git add packages/shared_features/lib/src/chat/
git add apps/desktop/lib/features/chat/ apps/mobile/lib/features/chat/
git commit -m "refactor(shared_features): migrate chat module, apps use export shim"
```

### Task 3.2: 迁移 contacts 模块

**Files:**
- Create: `packages/shared_features/lib/src/contacts/` (6 个文件)
- Modify: `apps/desktop/lib/features/contacts/contacts.dart` (shim)
- Modify: `apps/mobile/lib/features/contacts/contacts.dart` (shim)

- [ ] **Step 1: 复制 contacts 文件（以 desktop 为 canonical）**

```bash
mkdir -p packages/shared_features/lib/src/contacts/data
mkdir -p packages/shared_features/lib/src/contacts/presentation

cp apps/desktop/lib/features/contacts/data/*.dart \
   packages/shared_features/lib/src/contacts/data/
cp apps/desktop/lib/features/contacts/presentation/*.dart \
   packages/shared_features/lib/src/contacts/presentation/
```

- [ ] **Step 2: 修正 import 路径**

同 chat 模式。

- [ ] **Step 3: 创建 contacts barrel + 更新 shared_features barrel**

```dart
// packages/shared_features/lib/src/contacts/contacts.dart
export 'data/contacts_api.dart';
export 'presentation/contacts_page.dart';
export 'presentation/contacts_provider.dart';
export 'presentation/contacts_providers.dart';
```

- [ ] **Step 4: apps/contacts.dart 改为 shim + 删除旧文件**

同 chat 模式。

- [ ] **Step 5: 依赖方向检查 + analyze + 提交**

```bash
grep -R "package:im_desktop" packages/shared_features/lib || true
grep -R "package:im_mobile" packages/shared_features/lib || true

cd apps/desktop && flutter pub get && flutter analyze
cd ../../apps/mobile && flutter pub get && flutter analyze

git add -A
git commit -m "refactor(shared_features): migrate contacts module (canonical: desktop)"
```

### Task 3.3: 迁移 group 模块

同 chat/contacts 模式。group 文件较少（7 个），整模块迁移。

- [ ] **Step 1-5: 同 Task 3.1 模式**

```bash
mkdir -p packages/shared_features/lib/src/group/data
mkdir -p packages/shared_features/lib/src/group/presentation

# 复制、修正 import、创建 barrel、改 shim、删除旧文件
# 依赖方向检查 + analyze + 提交
```

```bash
git commit -m "refactor(shared_features): migrate group module"
```

### Task 3.4: 迁移 moments 模块

同 chat/contacts 模式。moments 有 22 个文件，整模块迁移。

- [ ] **Step 1-5: 同 Task 3.1 模式**

```bash
mkdir -p packages/shared_features/lib/src/moments/data
mkdir -p packages/shared_features/lib/src/moments/presentation
mkdir -p packages/shared_features/lib/src/moments/presentation/composer
mkdir -p packages/shared_features/lib/src/moments/presentation/composer/widgets
mkdir -p packages/shared_features/lib/src/moments/presentation/feed
mkdir -p packages/shared_features/lib/src/moments/presentation/notifications
mkdir -p packages/shared_features/lib/src/moments/presentation/widgets

# 复制、修正 import、创建 barrel、改 shim、删除旧文件
# 依赖方向检查 + analyze + 提交
```

```bash
git commit -m "refactor(shared_features): migrate moments module"
```

### Task 3.5: 迁移 settings data/provider/state

**Files:**
- Create: `packages/shared_features/lib/src/settings/data/settings_api.dart`
- Create: `packages/shared_features/lib/src/settings/data/ai_api.dart`
- Create: `packages/shared_features/lib/src/settings/presentation/settings_provider.dart`
- Create: `packages/shared_features/lib/src/settings/presentation/settings_providers.dart`
- Create: `packages/shared_features/lib/src/settings/presentation/profile_provider.dart`
- Create: `packages/shared_features/lib/src/settings/presentation/ai_settings_provider.dart`
- Create: `packages/shared_features/lib/src/settings/settings.dart` (barrel)
- Modify: `apps/desktop/lib/features/settings/settings.dart` (shim + settings_page)
- Modify: `apps/mobile/lib/features/settings/settings.dart` (shim + settings_page)

- [ ] **Step 1: 只迁移 data/provider/state 文件**

```bash
mkdir -p packages/shared_features/lib/src/settings/data
mkdir -p packages/shared_features/lib/src/settings/presentation

cp apps/desktop/lib/features/settings/data/settings_api.dart \
   packages/shared_features/lib/src/settings/data/
cp apps/desktop/lib/features/settings/data/ai_api.dart \
   packages/shared_features/lib/src/settings/data/
cp apps/desktop/lib/features/settings/presentation/settings_provider.dart \
   packages/shared_features/lib/src/settings/presentation/
cp apps/desktop/lib/features/settings/presentation/settings_providers.dart \
   packages/shared_features/lib/src/settings/presentation/
cp apps/desktop/lib/features/settings/presentation/profile_provider.dart \
   packages/shared_features/lib/src/settings/presentation/
cp apps/desktop/lib/features/settings/presentation/ai_settings_provider.dart \
   packages/shared_features/lib/src/settings/presentation/
```

- [ ] **Step 2: 修正 import + 统一错误处理**

settings_provider.dart 和 ai_settings_provider.dart 中的 `catch (_) {}` 改为 AppLogger。

- [ ] **Step 3: 创建 shared_features settings barrel（不包含 settings_page）**

```dart
// packages/shared_features/lib/src/settings/settings.dart
export 'data/settings_api.dart';
export 'data/ai_api.dart';
export 'presentation/settings_provider.dart';
export 'presentation/settings_providers.dart';
export 'presentation/profile_provider.dart';
export 'presentation/ai_settings_provider.dart';
```

- [ ] **Step 4: apps settings.dart 改为 shim + 保留 settings_page**

```dart
// apps/desktop/lib/features/settings/settings.dart
export 'package:im_shared_features/src/settings/settings.dart';
export 'presentation/settings_page.dart';
```

```dart
// apps/mobile/lib/features/settings/settings.dart
export 'package:im_shared_features/src/settings/settings.dart';
export 'presentation/settings_page.dart';
```

- [ ] **Step 5: 删除已迁移的 settings 子文件（保留 settings_page.dart）**

```bash
# Desktop
rm apps/desktop/lib/features/settings/data/settings_api.dart
rm apps/desktop/lib/features/settings/data/ai_api.dart
rm apps/desktop/lib/features/settings/presentation/settings_provider.dart
rm apps/desktop/lib/features/settings/presentation/settings_providers.dart
rm apps/desktop/lib/features/settings/presentation/profile_provider.dart
rm apps/desktop/lib/features/settings/presentation/ai_settings_provider.dart

# Mobile - 同样
```

- [ ] **Step 6: 依赖方向检查 + analyze + 提交**

```bash
grep -R "package:im_desktop" packages/shared_features/lib || true
grep -R "package:im_mobile" packages/shared_features/lib || true

cd apps/desktop && flutter pub get && flutter analyze
cd ../../apps/mobile && flutter pub get && flutter analyze

git add -A
git commit -m "refactor(shared_features): migrate settings data/provider/state, settings_page stays in apps"
```

### Task 3.6: Phase 3 验证

- [ ] **Step 1: 全量 analyze**

```bash
cd D:/project/new-im-project/flutter
dart run melos exec -- flutter analyze
```

- [ ] **Step 2: 依赖方向检查**

```bash
grep -R "package:im_desktop" packages/shared_features/lib || true
grep -R "package:im_mobile" packages/shared_features/lib || true
```

- [ ] **Step 3: 提交**

```bash
git commit --allow-empty -m "chore: Phase 3 complete - batch feature migration"
```

---

## Phase 4: E2EE 分层 + 接口提取

### Task 4.1: E2EE providers 改为抽象注入

**Files:**
- Modify: `apps/desktop/lib/features/e2ee/data/e2ee_providers.dart`
- Modify: `apps/mobile/lib/features/e2ee/data/e2ee_providers.dart`

- [ ] **Step 1: 修改 desktop e2ee_providers.dart**

将直接实例化改为抽象 provider：

```dart
// apps/desktop/lib/features/e2ee/data/e2ee_providers.dart
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:im_core_flutter/im_core_flutter.dart';
import '../../auth/presentation/auth_providers.dart';
import 'e2ee_api.dart';
import 'e2ee_key_store.dart';
import 'e2ee_manager.dart';
import 'e2ee_meta_store.dart';
import 'e2ee_session_store.dart';
import 'desktop_key_store.dart';
import 'desktop_session_store.dart';

final e2eeApiProvider = Provider<E2eeApi>((ref) {
  return E2eeApi(ref.watch(httpClientProvider));
});

// These will be overridden by ProviderScope in main.dart
final e2eeKeyStoreProvider = Provider<E2eeKeyStore>((ref) {
  throw UnimplementedError('e2eeKeyStoreProvider must be overridden');
});

final e2eeSessionStoreProvider = Provider<E2eeSessionStore>((ref) {
  throw UnimplementedError('e2eeSessionStoreProvider must be overridden');
});

final e2eeMetaStoreProvider = Provider<E2eeMetaStore>((ref) {
  return E2eeMetaStore(ref.watch(secureStorageProvider));
});

final e2eeManagerProvider = Provider<E2eeManager>((ref) {
  return E2eeManager(
    adapter: ref.watch(e2eeAdapterProvider),
    api: ref.watch(e2eeApiProvider),
    keyStore: ref.watch(e2eeKeyStoreProvider),
    sessionStore: ref.watch(e2eeSessionStoreProvider),
    metaStore: ref.watch(e2eeMetaStoreProvider),
    currentUserId: ref.watch(currentUserIdProvider),
  );
});

final e2eeSessionStatusProvider =
    FutureProvider.family<String, String>((ref, sessionId) async {
  return ref.watch(e2eeMetaStoreProvider).getSessionStatus(sessionId);
});
```

- [ ] **Step 2: 修改 mobile e2ee_providers.dart（同上模式）**

- [ ] **Step 3: desktop main.dart 添加 ProviderScope overrides**

在 `apps/desktop/lib/main.dart` 的 `ProviderScope` 中添加：

```dart
ProviderScope(
  overrides: [
    // ... existing overrides ...
    e2eeKeyStoreProvider.overrideWithValue(DesktopKeyStore()),
    e2eeSessionStoreProvider.overrideWithValue(DesktopSessionStore()),
  ],
  child: const App(),
)
```

- [ ] **Step 4: mobile main.dart 添加 ProviderScope overrides**

同上，使用 MobileKeyStore / MobileSessionStore。

- [ ] **Step 5: 运行 analyze**

```bash
cd apps/desktop && flutter pub get && flutter analyze
cd ../../apps/mobile && flutter pub get && flutter analyze
```

- [ ] **Step 6: 提交**

```bash
git add apps/desktop/lib/features/e2ee/ apps/mobile/lib/features/e2ee/
git add apps/desktop/lib/main.dart apps/mobile/lib/main.dart
git commit -m "refactor(e2ee): change providers to abstract injection, apps override via ProviderScope"
```

### Task 4.2: 迁移 E2EE 到 shared_features

**Files:**
- Create: `packages/shared_features/lib/src/e2ee/` (10 个文件)
- Modify: `apps/desktop/lib/features/e2ee/e2ee.dart` (shim)
- Modify: `apps/mobile/lib/features/e2ee/e2ee.dart` (shim)

- [ ] **Step 1: 复制 E2EE 文件到 shared_features**

```bash
mkdir -p packages/shared_features/lib/src/e2ee/data
mkdir -p packages/shared_features/lib/src/e2ee/presentation

# 接口和管理器
cp apps/desktop/lib/features/e2ee/data/e2ee_api.dart \
   packages/shared_features/lib/src/e2ee/data/
cp apps/desktop/lib/features/e2ee/data/e2ee_manager.dart \
   packages/shared_features/lib/src/e2ee/data/
cp apps/desktop/lib/features/e2ee/data/e2ee_key_store.dart \
   packages/shared_features/lib/src/e2ee/data/
cp apps/desktop/lib/features/e2ee/data/e2ee_session_store.dart \
   packages/shared_features/lib/src/e2ee/data/
cp apps/desktop/lib/features/e2ee/data/e2ee_meta_store.dart \
   packages/shared_features/lib/src/e2ee/data/
cp apps/desktop/lib/features/e2ee/data/e2ee_providers.dart \
   packages/shared_features/lib/src/e2ee/data/

# Presentation
cp apps/desktop/lib/features/e2ee/presentation/e2ee_provider.dart \
   packages/shared_features/lib/src/e2ee/presentation/
cp apps/desktop/lib/features/e2ee/presentation/encryption_badge.dart \
   packages/shared_features/lib/src/e2ee/presentation/
cp apps/desktop/lib/features/e2ee/presentation/encryption_banner.dart \
   packages/shared_features/lib/src/e2ee/presentation/
cp apps/desktop/lib/features/e2ee/presentation/negotiation_dialog.dart \
   packages/shared_features/lib/src/e2ee/presentation/
```

- [ ] **Step 2: 修正 shared_features 中的 e2ee_providers.dart**

改为抽象注入（不能 new DesktopKeyStore）：

```dart
// packages/shared_features/lib/src/e2ee/data/e2ee_providers.dart
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:im_core_flutter/im_core_flutter.dart';
import 'package:im_shared_features/src/auth/presentation/auth_providers.dart';
import 'e2ee_api.dart';
import 'e2ee_key_store.dart';
import 'e2ee_manager.dart';
import 'e2ee_meta_store.dart';
import 'e2ee_session_store.dart';

final e2eeApiProvider = Provider<E2eeApi>((ref) {
  return E2eeApi(ref.watch(httpClientProvider));
});

final e2eeKeyStoreProvider = Provider<E2eeKeyStore>((ref) {
  throw UnimplementedError('e2eeKeyStoreProvider must be overridden');
});

final e2eeSessionStoreProvider = Provider<E2eeSessionStore>((ref) {
  throw UnimplementedError('e2eeSessionStoreProvider must be overridden');
});

final e2eeMetaStoreProvider = Provider<E2eeMetaStore>((ref) {
  return E2eeMetaStore(ref.watch(secureStorageProvider));
});

final e2eeManagerProvider = Provider<E2eeManager>((ref) {
  return E2eeManager(
    adapter: ref.watch(e2eeAdapterProvider),
    api: ref.watch(e2eeApiProvider),
    keyStore: ref.watch(e2eeKeyStoreProvider),
    sessionStore: ref.watch(e2eeSessionStoreProvider),
    metaStore: ref.watch(e2eeMetaStoreProvider),
    currentUserId: ref.watch(currentUserIdProvider),
  );
});

final e2eeSessionStatusProvider =
    FutureProvider.family<String, String>((ref, sessionId) async {
  return ref.watch(e2eeMetaStoreProvider).getSessionStatus(sessionId);
});
```

- [ ] **Step 3: 修正其他 E2EE 文件的 import**

- [ ] **Step 4: 创建 E2EE barrel**

```dart
// packages/shared_features/lib/src/e2ee/e2ee.dart
export 'data/e2ee_api.dart';
export 'data/e2ee_key_store.dart';
export 'data/e2ee_manager.dart';
export 'data/e2ee_meta_store.dart';
export 'data/e2ee_providers.dart';
export 'data/e2ee_session_store.dart';
export 'presentation/e2ee_provider.dart';
export 'presentation/encryption_badge.dart';
export 'presentation/encryption_banner.dart';
export 'presentation/negotiation_dialog.dart';
```

- [ ] **Step 5: 更新 shared_features barrel**

```dart
// packages/shared_features/lib/im_shared_features.dart
library im_shared_features;

export 'src/auth/auth.dart';
export 'src/chat/chat.dart';
export 'src/contacts/contacts.dart';
export 'src/group/group.dart';
export 'src/moments/moments.dart';
export 'src/settings/settings.dart';
export 'src/e2ee/e2ee.dart';
```

- [ ] **Step 6: apps E2EE 改为 shim（保留 platform 实现）**

```dart
// apps/desktop/lib/features/e2ee/e2ee.dart
export 'package:im_shared_features/src/e2ee/e2ee.dart';
export 'data/desktop_key_store.dart';
export 'data/desktop_session_store.dart';
```

```dart
// apps/mobile/lib/features/e2ee/e2ee.dart
export 'package:im_shared_features/src/e2ee/e2ee.dart';
export 'data/mobile_key_store.dart';
export 'data/mobile_session_store.dart';
```

- [ ] **Step 7: 删除 apps 中已迁移的 E2EE 文件（保留 platform 实现）**

```bash
# Desktop - 保留 desktop_key_store.dart 和 desktop_session_store.dart
rm apps/desktop/lib/features/e2ee/data/e2ee_api.dart
rm apps/desktop/lib/features/e2ee/data/e2ee_manager.dart
rm apps/desktop/lib/features/e2ee/data/e2ee_key_store.dart
rm apps/desktop/lib/features/e2ee/data/e2ee_session_store.dart
rm apps/desktop/lib/features/e2ee/data/e2ee_meta_store.dart
rm apps/desktop/lib/features/e2ee/data/e2ee_providers.dart
rm -rf apps/desktop/lib/features/e2ee/presentation/

# Mobile - 保留 mobile_key_store.dart 和 mobile_session_store.dart
rm apps/mobile/lib/features/e2ee/data/e2ee_api.dart
rm apps/mobile/lib/features/e2ee/data/e2ee_manager.dart
rm apps/mobile/lib/features/e2ee/data/e2ee_key_store.dart
rm apps/mobile/lib/features/e2ee/data/e2ee_session_store.dart
rm apps/mobile/lib/features/e2ee/data/e2ee_meta_store.dart
rm apps/mobile/lib/features/e2ee/data/e2ee_providers.dart
rm -rf apps/mobile/lib/features/e2ee/presentation/
```

- [ ] **Step 8: 依赖方向检查 + analyze + 提交**

```bash
grep -R "package:im_desktop" packages/shared_features/lib || true
grep -R "package:im_mobile" packages/shared_features/lib || true

cd apps/desktop && flutter pub get && flutter analyze
cd ../../apps/mobile && flutter pub get && flutter analyze

git add -A
git commit -m "refactor(shared_features): migrate E2EE with interface/implementation split"
```

### Task 4.3: mobile E2EE 改名

**Files:**
- Modify: `apps/mobile/lib/features/e2ee/data/desktop_key_store.dart` → `mobile_key_store.dart`
- Modify: `apps/mobile/lib/features/e2ee/data/desktop_session_store.dart` → `mobile_session_store.dart`

- [ ] **Step 1: 重命名文件**

```bash
mv apps/mobile/lib/features/e2ee/data/desktop_key_store.dart \
   apps/mobile/lib/features/e2ee/data/mobile_key_store.dart
mv apps/mobile/lib/features/e2ee/data/desktop_session_store.dart \
   apps/mobile/lib/features/e2ee/data/mobile_session_store.dart
```

- [ ] **Step 2: 修改类名**

`mobile_key_store.dart` 中：`DesktopKeyStore` → `MobileKeyStore`
`mobile_session_store.dart` 中：`DesktopSessionStore` → `MobileSessionStore`

- [ ] **Step 3: 更新引用**

```dart
// apps/mobile/lib/features/e2ee/e2ee.dart
export 'data/mobile_key_store.dart';
export 'data/mobile_session_store.dart';
```

- [ ] **Step 4: 更新 main.dart ProviderScope overrides**

```dart
e2eeKeyStoreProvider.overrideWithValue(MobileKeyStore()),
e2eeSessionStoreProvider.overrideWithValue(MobileSessionStore()),
```

- [ ] **Step 5: analyze + 提交**

```bash
cd apps/mobile && flutter pub get && flutter analyze
git add -A
git commit -m "refactor(mobile): rename DesktopKeyStore/SessionStore to MobileKeyStore/SessionStore"
```

### Task 4.4: Phase 4 验证

- [ ] **Step 1: 全量 analyze + 依赖方向检查**

```bash
cd D:/project/new-im-project/flutter
dart run melos exec -- flutter analyze

grep -R "package:im_desktop" packages/shared_features/lib || true
grep -R "package:im_mobile" packages/shared_features/lib || true
```

- [ ] **Step 2: 提交**

```bash
git commit --allow-empty -m "chore: Phase 4 complete - E2EE interface/implementation split"
```

---

## Phase 5: apps router 组装 + 旧 features 清理

### Task 5.1: router import 切换到 shared_features

**Files:**
- Modify: `apps/desktop/lib/core/router/app_router.dart`
- Modify: `apps/mobile/lib/core/router/app_router.dart`

- [ ] **Step 1: desktop router 切换 import**

```dart
// apps/desktop/lib/core/router/app_router.dart
// 旧:
// import 'package:im_desktop/features/auth/auth.dart';
// import 'package:im_desktop/features/chat/chat.dart';
// ...

// 新:
import 'package:im_shared_features/src/auth/auth.dart';
import 'package:im_shared_features/src/chat/chat.dart';
import 'package:im_shared_features/src/contacts/contacts.dart';
import 'package:im_shared_features/src/group/group.dart';
import 'package:im_shared_features/src/settings/settings.dart';
import 'package:im_shared_features/src/moments/moments.dart';
```

注意：RouteNames 从 core_flutter 导入：
```dart
import 'package:im_core_flutter/src/router/route_names.dart';
```

- [ ] **Step 2: mobile router 切换 import**

同上模式。RouteMeta、resolveRouteMeta、RouterRefreshListenable 从 core_flutter 导入。

- [ ] **Step 3: analyze + build**

```bash
cd apps/desktop && flutter pub get && flutter analyze
cd ../../apps/mobile && flutter pub get && flutter analyze
```

- [ ] **Step 4: 提交（只改 router import，不删旧目录）**

```bash
git add apps/desktop/lib/core/router/ apps/mobile/lib/core/router/
git commit -m "refactor(apps): switch router imports to shared_features (shims still exist)"
```

### Task 5.2: 删除旧 features 目录

- [ ] **Step 1: 删除 desktop 已迁移的 feature 文件**

```bash
# 删除已迁移的 feature 子目录（保留 settings/presentation/settings_page.dart）
rm -rf apps/desktop/lib/features/auth/data/
rm -rf apps/desktop/lib/features/auth/domain/
rm -rf apps/desktop/lib/features/auth/presentation/
rm -rf apps/desktop/lib/features/chat/data/
rm -rf apps/desktop/lib/features/chat/presentation/
rm -rf apps/desktop/lib/features/contacts/data/
rm -rf apps/desktop/lib/features/contacts/presentation/
rm -rf apps/desktop/lib/features/group/data/
rm -rf apps/desktop/lib/features/group/presentation/
rm -rf apps/desktop/lib/features/moments/data/
rm -rf apps/desktop/lib/features/moments/presentation/
rm -rf apps/desktop/lib/features/e2ee/data/e2ee_*.dart
rm -rf apps/desktop/lib/features/e2ee/presentation/

# 删除 shim barrel 文件（router 已直接引用 shared_features）
rm apps/desktop/lib/features/auth/auth.dart
rm apps/desktop/lib/features/chat/chat.dart
rm apps/desktop/lib/features/contacts/contacts.dart
rm apps/desktop/lib/features/group/group.dart
rm apps/desktop/lib/features/moments/moments.dart
rm apps/desktop/lib/features/e2ee/e2ee.dart
```

- [ ] **Step 2: 删除 mobile 已迁移的 feature 文件**

同上模式。

- [ ] **Step 3: analyze**

```bash
cd apps/desktop && flutter analyze
cd ../../apps/mobile && flutter analyze
```

- [ ] **Step 4: 提交（独立提交，与 5.1 分开）**

```bash
git add -A
git commit -m "refactor(apps): remove migrated feature files, router now uses shared_features directly"
```

### Task 5.3: 清理 dead code

- [ ] **Step 1: 删除空目录**

```bash
find apps/desktop/lib/features -type d -empty -delete
find apps/mobile/lib/features -type d -empty -delete
```

- [ ] **Step 2: 检查 dead import**

```bash
cd D:/project/new-im-project/flutter
dart run melos exec -- flutter analyze 2>&1 | grep "unused_import\|dead_code"
```

- [ ] **Step 3: 修复任何 dead import**

- [ ] **Step 4: 提交**

```bash
git add -A
git commit -m "chore: clean up dead imports and empty directories"
```

---

## Phase 6: 测试、验证、清理、文档更新

### Task 6.1: 全量测试

- [ ] **Step 1: flutter test**

```bash
cd D:/project/new-im-project/flutter
dart run melos exec -- flutter test
```

- [ ] **Step 2: 修复失败的测试**

- [ ] **Step 3: 提交**

```bash
git add -A
git commit -m "test: fix tests after refactoring"
```

### Task 6.2: 全量构建

- [ ] **Step 1: flutter build web**

```bash
cd D:/project/new-im-project/flutter/apps/web
flutter build web
```

- [ ] **Step 2: flutter build windows**

```bash
cd D:/project/new-im-project/flutter/apps/desktop
flutter build windows
```

- [ ] **Step 3: flutter build apk**

```bash
cd D:/project/new-im-project/flutter/apps/mobile
flutter build apk
```

- [ ] **Step 4: 提交**

```bash
git commit --allow-empty -m "chore: verify builds after refactoring"
```

### Task 6.3: 依赖方向最终检查

- [ ] **Step 1: 检查 shared_features 没有 apps 引用**

```bash
grep -R "package:im_desktop" packages/shared_features/lib || echo "PASS"
grep -R "package:im_mobile" packages/shared_features/lib || echo "PASS"
grep -R "package:im_desktop" packages/core_flutter/lib || echo "PASS"
grep -R "package:im_mobile" packages/core_flutter/lib || echo "PASS"
```

- [ ] **Step 2: 检查 core 仍然纯 Dart**

```bash
grep -R "package:flutter" packages/core/lib || echo "PASS"
grep -R "flutter_riverpod" packages/core/lib || echo "PASS"
grep -R "go_router" packages/core/lib || echo "PASS"
```

- [ ] **Step 3: 检查 core_flutter 不依赖 shared_features**

```bash
grep -R "im_shared_features" packages/core_flutter/lib || echo "PASS"
```

### Task 6.4: WebSocket 连接行为验证

- [ ] **Step 1: 验证未登录时不应误连业务 WS**

启动 app，不登录，检查 console 无 WS 连接日志。

- [ ] **Step 2: 验证登录后只保留一个有效 WS 连接**

登录后，检查 console 只有一个 WS 连接建立日志。

- [ ] **Step 3: 验证 logout 后 WS 正确断开**

登出后，检查 console 有 WS 断开日志，无残留连接。

- [ ] **Step 4: 验证重复登录/恢复会话不会重复订阅**

快速登出再登入，检查 console 无重复订阅日志。

### Task 6.5: 更新文档

- [ ] **Step 1: 更新 melos.yaml**

```yaml
# flutter/melos.yaml - packages 段确认包含新包
packages:
  - packages/**
  - apps/**
```

- [ ] **Step 2: 更新架构文档**

更新 `docs/design/2026-06-06-flutter-deep-refactoring-design.md` 状态为"已实施"。

- [ ] **Step 3: 最终提交**

```bash
git add -A
git commit -m "docs: update architecture docs after refactoring completion

- packages/core_flutter created (Flutter infrastructure)
- packages/shared_features created (shared business features)
- Desktop/Mobile features reduced from 64 to ~5 files each
- E2EE uses interface/implementation split
- All builds passing"
```

---

## 验收清单

- [ ] packages/core 仍然无 Flutter / Riverpod / go_router 依赖
- [ ] im_core_flutter 不依赖 im_shared_features
- [ ] im_shared_features 不依赖 apps
- [ ] apps/features 基本清空，仅保留 settings_page
- [ ] E2EE key/session store 由 apps 注入，不在 shared_features 直接实例化
- [ ] desktop/mobile router 能正常进入 auth/chat/contacts/group/moments/settings
- [ ] flutter analyze 零 warning
- [ ] flutter test 全量通过
- [ ] flutter build web/windows/apk 全部通过
