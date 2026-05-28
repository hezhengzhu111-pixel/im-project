# Riverpod 模块化 Provider 重构实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将集中式 `providers.dart` 拆分为模块化 Riverpod 体系，补齐 AppConfig、权限、会话恢复、ProviderObserver。

**Architecture:** 按 feature 领域拆分 provider 定义，`core/di/providers.dart` 降级为 barrel export。新增 `AppConfig` 从 `--dart-define` 读取环境配置，`ProviderObserver` 提供开发期日志。AuthNotifier 增加 `restoreSession`/`hasPermission` 方法，保留 `checkAuth` 兼容。

**Tech Stack:** Flutter, Riverpod, freezed, dart-define, debugPrint

---

## File Structure

| 操作 | 文件路径 | 职责 |
|------|----------|------|
| Create | `lib/core/config/app_config_provider.dart` | AppConfig 模型 + provider |
| Create | `lib/core/network/network_providers.dart` | storage/http/ws providers |
| Create | `lib/core/observer/app_provider_observer.dart` | 开发期日志 observer |
| Create | `lib/features/auth/presentation/auth_providers.dart` | auth provider 定义 |
| Create | `lib/features/chat/presentation/chat_providers.dart` | chat provider 定义 |
| Create | `lib/features/contacts/presentation/contacts_providers.dart` | contacts provider 定义 |
| Create | `lib/features/moments/presentation/moments_providers.dart` | moments provider 定义 |
| Create | `lib/features/settings/presentation/settings_providers.dart` | settings provider 定义 |
| Create | `lib/features/group/presentation/group_providers.dart` | group provider 定义 |
| Create | `lib/features/e2ee/data/e2ee_providers.dart` | e2ee provider 定义 |
| Create | `lib/features/chat/data/file_providers.dart` | fileApi provider |
| Modify | `lib/features/auth/presentation/auth_provider.dart` | AuthState + AuthNotifier 增强 |
| Modify | `lib/features/auth/data/auth_repository_impl.dart` | 增加 refreshToken 方法 |
| Modify | `flutter/packages/core/lib/src/auth/auth_repository.dart` | 接口增加 refreshToken |
| Modify | `lib/core/di/providers.dart` | 替换为 barrel export |
| Modify | `lib/main.dart` | 注册 ProviderObserver |
| Modify | `lib/features/chat/data/outbox_provider.dart` | 更新 import |
| Create | `test/core/config/app_config_provider_test.dart` | AppConfig 单元测试 |
| Create | `test/core/observer/app_provider_observer_test.dart` | Observer 单元测试 |
| Modify | `test/features/auth/auth_provider_test.dart` | 增加增强功能测试 |

---

## Task 1: 创建 AppConfig + 单元测试

**Files:**
- Create: `flutter/apps/web/lib/core/config/app_config_provider.dart`
- Create: `flutter/apps/web/test/core/config/app_config_provider_test.dart`

- [ ] **Step 1: 写 AppConfig 单元测试**

```dart
// test/core/config/app_config_provider_test.dart
import 'package:flutter_test/flutter_test.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:im_web/core/config/app_config_provider.dart';

void main() {
  group('AppConfig', () {
    test('default values', () {
      const config = AppConfig(
        apiBaseUrl: 'http://localhost:8082',
        wsBaseUrl: 'ws://localhost:8082',
      );
      expect(config.appEnv, 'production');
      expect(config.isDevelopment, isFalse);
      expect(config.isProduction, isTrue);
    });

    test('custom values', () {
      const config = AppConfig(
        apiBaseUrl: 'https://api.example.com',
        wsBaseUrl: 'wss://ws.example.com',
        appEnv: 'development',
      );
      expect(config.isDevelopment, isTrue);
      expect(config.isProduction, isFalse);
      expect(config.apiBaseUrl, 'https://api.example.com');
      expect(config.wsBaseUrl, 'wss://ws.example.com');
    });

    test('staging env', () {
      const config = AppConfig(
        apiBaseUrl: 'https://staging.api.com',
        wsBaseUrl: 'wss://staging.ws.com',
        appEnv: 'staging',
      );
      expect(config.isDevelopment, isFalse);
      expect(config.isProduction, isFalse);
    });
  });

  group('appConfigProvider', () {
    test('reads from --dart-define defaults', () {
      final container = ProviderContainer();
      final config = container.read(appConfigProvider);
      // Default values from String.fromEnvironment
      expect(config.apiBaseUrl, isNotEmpty);
      expect(config.wsBaseUrl, isNotEmpty);
      container.dispose();
    });
  });
}
```

- [ ] **Step 2: 运行测试确认失败**

Run: `cd flutter/apps/web && flutter test test/core/config/app_config_provider_test.dart`
Expected: FAIL — file not found

- [ ] **Step 3: 创建 AppConfig 实现**

```dart
// flutter/apps/web/lib/core/config/app_config_provider.dart
import 'package:flutter_riverpod/flutter_riverpod.dart';

class AppConfig {
  const AppConfig({
    required this.apiBaseUrl,
    required this.wsBaseUrl,
    this.appEnv = 'production',
  });

  final String apiBaseUrl;
  final String wsBaseUrl;
  final String appEnv;

  bool get isDevelopment => appEnv == 'development';
  bool get isProduction => appEnv == 'production';
}

final appConfigProvider = Provider<AppConfig>((ref) {
  const apiBase = String.fromEnvironment(
    'API_BASE_URL',
    defaultValue: 'http://localhost:8082',
  );
  const wsBase = String.fromEnvironment(
    'WS_BASE_URL',
    defaultValue: 'ws://localhost:8082',
  );
  const env = String.fromEnvironment('APP_ENV', defaultValue: 'development');
  return AppConfig(apiBaseUrl: apiBase, wsBaseUrl: wsBase, appEnv: env);
});
```

- [ ] **Step 4: 运行测试确认通过**

Run: `cd flutter/apps/web && flutter test test/core/config/app_config_provider_test.dart`
Expected: PASS

- [ ] **Step 5: 提交**

```bash
git add flutter/apps/web/lib/core/config/app_config_provider.dart flutter/apps/web/test/core/config/app_config_provider_test.dart
git commit -m "feat(config): add AppConfig from --dart-define with unit tests"
```

---

## Task 2: 创建 network_providers.dart

**Files:**
- Create: `flutter/apps/web/lib/core/network/network_providers.dart`

- [ ] **Step 1: 创建 network_providers.dart**

```dart
// flutter/apps/web/lib/core/network/network_providers.dart
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:im_core/core.dart';
import '../../adapters/adapters.dart';
import '../config/app_config_provider.dart';

final secureStorageProvider = Provider<SecureStoragePort>((ref) {
  return WebSecureStorageAdapter();
});

final storageProvider = Provider<StoragePort>((ref) {
  return WebStorageAdapter();
});

final httpClientProvider = Provider<HttpClientPort>((ref) {
  final config = ref.watch(appConfigProvider);
  return WebHttpClient(
    baseUrl: config.apiBaseUrl,
    secureStorage: ref.watch(secureStorageProvider),
  );
});

final wsClientProvider = Provider<WsClientPort>((ref) {
  final config = ref.watch(appConfigProvider);
  final client = WebWsClient(
    ticketUrl: AuthEndpoints.wsTicket,
    wsBaseUrl: '${config.wsBaseUrl}${WsEndpoints.path}',
  );
  ref.onDispose(() => client.dispose());
  return client;
});

final wsStateProvider = StreamProvider<WsConnectionState>((ref) {
  return ref.watch(wsClientProvider).connectionState;
});
```

- [ ] **Step 2: 验证无静态错误**

Run: `cd flutter/apps/web && flutter analyze lib/core/network/network_providers.dart`
Expected: No issues found

- [ ] **Step 3: 提交**

```bash
git add flutter/apps/web/lib/core/network/network_providers.dart
git commit -m "feat(network): add network_providers with AppConfig integration"
```

---

## Task 3: 创建 ProviderObserver + 单元测试

**Files:**
- Create: `flutter/apps/web/lib/core/observer/app_provider_observer.dart`
- Create: `flutter/apps/web/test/core/observer/app_provider_observer_test.dart`

- [ ] **Step 1: 写 ProviderObserver 单元测试**

```dart
// flutter/apps/web/test/core/observer/app_provider_observer_test.dart
import 'package:flutter/foundation.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:im_web/core/observer/app_provider_observer.dart';

void main() {
  group('AppProviderObserver', () {
    late AppProviderObserver observer;
    late List<String> logs;

    setUp(() {
      observer = AppProviderObserver(env: 'development');
      logs = [];
      debugPrint = (String? message, {int? wrapWidth}) {
        if (message != null) logs.add(message);
      };
    });

    tearDown(() {
      debugPrint = print;
    });

    test('does not log in production', () {
      final prodObserver = AppProviderObserver(env: 'production');
      final provider = Provider<String>((ref) => 'test');
      final container = ProviderContainer(
        overrides: [provider.overrideWithValue('test')],
        observers: [prodObserver],
      );

      container.read(provider);
      expect(logs, isEmpty);
      container.dispose();
    });

    test('logs non-sensitive providers in development', () {
      final provider = Provider<String>((ref) => 'test');
      final container = ProviderContainer(
        overrides: [provider.overrideWithValue('test')],
        observers: [observer],
      );

      container.read(provider);
      expect(logs.any((l) => l.contains('Provider')), isTrue);
      container.dispose();
    });

    test('filters sensitive provider names', () {
      expect(observer.isSensitive('authStateProvider'), isTrue);
      expect(observer.isSensitive('secureStorageProvider'), isTrue);
      expect(observer.isSensitive('wsClientProvider'), isTrue);
      expect(observer.isSensitive('chatStateProvider'), isFalse);
      expect(observer.isSensitive('contactsStateProvider'), isFalse);
    });
  });
}
```

- [ ] **Step 2: 运行测试确认失败**

Run: `cd flutter/apps/web && flutter test test/core/observer/app_provider_observer_test.dart`
Expected: FAIL — file not found

- [ ] **Step 3: 创建 ProviderObserver 实现**

```dart
// flutter/apps/web/lib/core/observer/app_provider_observer.dart
import 'package:flutter/foundation.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

class AppProviderObserver extends ProviderObserver {
  AppProviderObserver({this.env = 'development'});

  final String env;

  bool get _isDevelopment => env == 'development';

  bool isSensitive(String name) {
    const prefixes = ['auth', 'token', 'secure', 'wsClient'];
    return prefixes.any(name.toLowerCase().contains);
  }

  @override
  void didAddProvider(
    ProviderBase<Object?> provider,
    Object? value,
    ProviderContainer container,
  ) {
    if (!_isDevelopment) return;
    final name = provider.name ?? provider.runtimeType.toString();
    if (isSensitive(name)) return;
    debugPrint('[Provider] add: $name');
  }

  @override
  void didUpdateProvider(
    ProviderBase<Object?> provider,
    Object? previousValue,
    Object? newValue,
    ProviderContainer container,
  ) {
    if (!_isDevelopment) return;
    final name = provider.name ?? provider.runtimeType.toString();
    if (isSensitive(name)) return;

    final prevSummary = _summarize(previousValue);
    final nextSummary = _summarize(newValue);
    debugPrint('[Provider] update: $name ($prevSummary -> $nextSummary)');
  }

  String _summarize(Object? value) {
    if (value == null) return 'null';
    if (value is StateNotifier) {
      return value.state.runtimeType.toString();
    }
    return value.runtimeType.toString();
  }
}
```

- [ ] **Step 4: 运行测试确认通过**

Run: `cd flutter/apps/web && flutter test test/core/observer/app_provider_observer_test.dart`
Expected: PASS

- [ ] **Step 5: 提交**

```bash
git add flutter/apps/web/lib/core/observer/app_provider_observer.dart flutter/apps/web/test/core/observer/app_provider_observer_test.dart
git commit -m "feat(observer): add ProviderObserver with sensitive prefix filtering"
```

---

## Task 4: 增强 AuthNotifier（restoreSession + permissions + refreshToken）

**Files:**
- Modify: `flutter/apps/web/lib/features/auth/data/auth_repository_impl.dart`
- Modify: `flutter/apps/web/lib/features/auth/presentation/auth_provider.dart`
- Modify: `flutter/apps/web/test/features/auth/auth_provider_test.dart`

- [ ] **Step 1: 写失败测试 — restoreSession**

在 `test/features/auth/auth_provider_test.dart` 的 `MockAuthRepository` 类中添加：

```dart
  @override
  Future<void> refreshToken() async {
    if (errorToThrow != null) throw errorToThrow!;
  }
```

然后在 `main()` 末尾 `main()` 闭括号前添加：

```dart
    group('AuthNotifier - restoreSession', () {
      test('restoreSession sets authReady true when not authenticated', () async {
        mockRepo.isAuthResponse = false;
        await notifier.restoreSession();
        expect(notifier.state.authReady, isTrue);
        expect(notifier.state.isAuthenticated, isFalse);
      });

      test('restoreSession sets authReady true when authenticated', () async {
        mockRepo.isAuthResponse = true;
        const user = User(id: '1', username: 'test', permissions: ['chat:read']);
        mockRepo.profileResponse = user;
        await notifier.restoreSession();
        expect(notifier.state.authReady, isTrue);
        expect(notifier.state.isAuthenticated, isTrue);
        expect(notifier.state.permissions, ['chat:read']);
      });

      test('checkAuth delegates to restoreSession', () async {
        mockRepo.isAuthResponse = false;
        await notifier.checkAuth();
        expect(notifier.state.authReady, isTrue);
      });
    });

    group('AuthNotifier - permissions', () {
      test('hasPermission returns true for granted permission', () async {
        mockRepo.isAuthResponse = true;
        const user = User(id: '1', username: 'test', permissions: ['chat:read', 'chat:write']);
        mockRepo.profileResponse = user;
        await notifier.restoreSession();
        expect(notifier.hasPermission('chat:read'), isTrue);
        expect(notifier.hasPermission('admin'), isFalse);
      });

      test('hasAnyPermission returns true if any match', () async {
        mockRepo.isAuthResponse = true;
        const user = User(id: '1', username: 'test', permissions: ['chat:read']);
        mockRepo.profileResponse = user;
        await notifier.restoreSession();
        expect(notifier.hasAnyPermission(['admin', 'chat:read']), isTrue);
        expect(notifier.hasAnyPermission(['admin', 'superadmin']), isFalse);
      });
    });

    group('AuthNotifier - ensureFreshSession', () {
      test('returns true when already authenticated', () async {
        mockRepo.isAuthResponse = true;
        final result = await notifier.ensureFreshSession();
        expect(result, isTrue);
      });

      test('returns false when refresh fails', () async {
        mockRepo.isAuthResponse = false;
        mockRepo.errorToThrow = Exception('refresh failed');
        final result = await notifier.ensureFreshSession();
        expect(result, isFalse);
      });
    });
```

- [ ] **Step 2: 运行测试确认失败**

Run: `cd flutter/apps/web && flutter test test/features/auth/auth_provider_test.dart`
Expected: FAIL — restoreSession/hasPermission/ensureFreshSession not defined

- [ ] **Step 3: 增强 AuthState**

在 `flutter/apps/web/lib/features/auth/presentation/auth_provider.dart` 中修改 `AuthState`：

```dart
class AuthState {
  const AuthState({
    this.user,
    this.isAuthenticated = false,
    this.isLoading = false,
    this.error,
    this.rememberMe = false,
    this.authReady = false,
    this.permissions = const [],
  });

  final User? user;
  final bool isAuthenticated;
  final bool isLoading;
  final String? error;
  final bool rememberMe;
  final bool authReady;
  final List<String> permissions;

  AuthState copyWith({
    User? user,
    bool? isAuthenticated,
    bool? isLoading,
    String? error,
    bool? rememberMe,
    bool? authReady,
    List<String>? permissions,
  }) {
    return AuthState(
      user: user ?? this.user,
      isAuthenticated: isAuthenticated ?? this.isAuthenticated,
      isLoading: isLoading ?? this.isLoading,
      error: error,
      rememberMe: rememberMe ?? this.rememberMe,
      authReady: authReady ?? this.authReady,
      permissions: permissions ?? this.permissions,
    );
  }
}
```

- [ ] **Step 4: 增强 AuthNotifier — 添加 refreshToken 到 AuthRepository**

在 `flutter/packages/core/lib/src/auth/auth_repository.dart` 添加方法声明：

```dart
  Future<void> refreshToken();
```

在 `flutter/apps/web/lib/features/auth/data/auth_repository_impl.dart` 添加实现：

```dart
  @override
  Future<void> refreshToken() async {
    final token = await _secureStorage.read('refresh_token');
    if (token == null) throw Exception('No refresh token');
    // 实际 refresh token API 调用（待后端接口就绪后实现）
  }
```

- [ ] **Step 5: 增强 AuthNotifier — 添加新方法**

在 `flutter/apps/web/lib/features/auth/presentation/auth_provider.dart` 中修改 `AuthNotifier`：

```dart
class AuthNotifier extends StateNotifier<AuthState> {
  AuthNotifier(this._repository, this._wsClient, this._httpClient)
      : super(const AuthState());

  final AuthRepository _repository;
  final WsClientPort _wsClient;
  final HttpClientPort _httpClient;

  // ... login, register, logout 保持不变 ...

  Future<void> restoreSession() async {
    state = state.copyWith(authReady: false);
    try {
      final isAuth = await _repository.isAuthenticated();
      if (isAuth) {
        final user = await _repository.getProfile();
        state = AuthState(
          user: user,
          isAuthenticated: true,
          authReady: true,
          permissions: user.permissions ?? [],
        );
        _connectWs();
      } else {
        state = const AuthState(authReady: true);
      }
    } catch (e) {
      state = const AuthState(authReady: true);
    }
  }

  Future<void> checkAuth() => restoreSession();

  Future<bool> ensureFreshSession() async {
    final isAuth = await _repository.isAuthenticated();
    if (!isAuth) {
      try {
        await _repository.refreshToken();
        return true;
      } catch (e) {
        state = const AuthState();
        return false;
      }
    }
    return true;
  }

  bool hasPermission(String permission) {
    return state.permissions.contains(permission);
  }

  bool hasAnyPermission(List<String> permissions) {
    return permissions.any(state.permissions.contains);
  }

  // ... _connectWs 保持不变 ...
}
```

- [ ] **Step 6: 运行测试确认通过**

Run: `cd flutter/apps/web && flutter test test/features/auth/auth_provider_test.dart`
Expected: PASS

- [ ] **Step 7: 提交**

```bash
git add flutter/apps/web/lib/features/auth/data/auth_repository_impl.dart flutter/apps/web/lib/features/auth/presentation/auth_provider.dart flutter/apps/web/test/features/auth/auth_provider_test.dart
git commit -m "feat(auth): add restoreSession, permissions, and ensureFreshSession"
```

---

## Task 5: 创建 Feature Provider 文件

**Files:**
- Create: `flutter/apps/web/lib/features/auth/presentation/auth_providers.dart`
- Create: `flutter/apps/web/lib/features/chat/presentation/chat_providers.dart`
- Create: `flutter/apps/web/lib/features/chat/data/file_providers.dart`
- Create: `flutter/apps/web/lib/features/contacts/presentation/contacts_providers.dart`
- Create: `flutter/apps/web/lib/features/moments/presentation/moments_providers.dart`
- Create: `flutter/apps/web/lib/features/settings/presentation/settings_providers.dart`
- Create: `flutter/apps/web/lib/features/group/presentation/group_providers.dart`
- Create: `flutter/apps/web/lib/features/e2ee/data/e2ee_providers.dart`

- [ ] **Step 1: 创建 auth_providers.dart**

```dart
// flutter/apps/web/lib/features/auth/presentation/auth_providers.dart
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:im_core/core.dart';
import '../../../core/network/network_providers.dart';
import '../data/auth_repository_impl.dart';
import 'auth_provider.dart';

final authRepositoryProvider = Provider<AuthRepository>((ref) {
  return AuthRepositoryImpl(
    httpClient: ref.watch(httpClientProvider),
    secureStorage: ref.watch(secureStorageProvider),
  );
});

final authStateProvider = StateNotifierProvider<AuthNotifier, AuthState>((ref) {
  return AuthNotifier(
    ref.watch(authRepositoryProvider),
    ref.watch(wsClientProvider),
    ref.watch(httpClientProvider),
  );
});

final currentUserIdProvider = Provider<String>((ref) {
  return ref.watch(authStateProvider).user?.id ?? '';
});

final isAuthenticatedProvider = Provider<bool>((ref) {
  return ref.watch(authStateProvider).isAuthenticated;
});
```

- [ ] **Step 2: 创建 chat_providers.dart**

```dart
// flutter/apps/web/lib/features/chat/presentation/chat_providers.dart
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:im_core/core.dart';
import '../../../core/network/network_providers.dart';
import '../../../core/network/network_status_provider.dart';
import '../../auth/presentation/auth_providers.dart';
import '../../e2ee/data/e2ee_providers.dart';
import '../data/message_api.dart';
import '../data/message_pipeline.dart';
import '../data/outbox_provider.dart';
import 'chat_provider_with_outbox.dart';

final messageApiProvider = Provider<MessageApi>((ref) {
  return MessageApi(ref.watch(httpClientProvider));
});

final chatStateProvider =
    StateNotifierProvider<ChatNotifierWithOutbox, ChatStateWithOutbox>((ref) {
  return ChatNotifierWithOutbox(
    ref.watch(messageApiProvider),
    MessagePipeline(),
    ref.watch(wsClientProvider),
    () => ref.read(currentUserIdProvider),
    ref.watch(e2eeManagerProvider),
    ref.watch(e2eeMetaStoreProvider),
    ref.watch(messageOutboxProvider),
    ref.watch(networkStatusProvider.notifier),
  );
});
```

- [ ] **Step 3: 创建 file_providers.dart**

```dart
// flutter/apps/web/lib/features/chat/data/file_providers.dart
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../core/network/network_providers.dart';
import 'file_api.dart';

final fileApiProvider = Provider<FileApi>((ref) {
  return FileApi(ref.watch(httpClientProvider));
});
```

- [ ] **Step 4: 创建 contacts_providers.dart**

```dart
// flutter/apps/web/lib/features/contacts/presentation/contacts_providers.dart
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../core/network/network_providers.dart';
import '../data/contacts_api.dart';
import 'contacts_provider.dart';

final contactsApiProvider = Provider<ContactsApi>((ref) {
  return ContactsApi(ref.watch(httpClientProvider));
});

final contactsStateProvider =
    StateNotifierProvider<ContactsNotifier, ContactsState>((ref) {
  return ContactsNotifier(
    ref.watch(contactsApiProvider),
    ref.watch(wsClientProvider),
  );
});
```

- [ ] **Step 5: 创建 moments_providers.dart**

```dart
// flutter/apps/web/lib/features/moments/presentation/moments_providers.dart
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../core/network/network_providers.dart';
import '../../chat/data/file_providers.dart';
import '../data/moments_api.dart';
import '../data/moments_repository.dart';
import 'composer/composer_provider.dart';
import 'feed/moments_feed_provider.dart';
import 'notifications/notifications_provider.dart';

final momentsApiProvider = Provider<MomentsApi>((ref) {
  return MomentsApi(ref.watch(httpClientProvider));
});

final momentsRepositoryProvider = Provider<MomentsRepository>((ref) {
  return MomentsRepository(
    ref.watch(momentsApiProvider),
    ref.watch(fileApiProvider),
  );
});

final momentsFeedProvider =
    StateNotifierProvider<MomentsFeedNotifier, MomentsFeedState>((ref) {
  return MomentsFeedNotifier(ref.watch(momentsRepositoryProvider));
});

final composerProvider =
    StateNotifierProvider<ComposerNotifier, ComposerState>((ref) {
  return ComposerNotifier(ref.watch(momentsRepositoryProvider));
});

final notificationsProvider = StateNotifierProvider<MomentsNotificationsNotifier,
    MomentsNotificationsState>((ref) {
  return MomentsNotificationsNotifier(ref.watch(momentsRepositoryProvider));
});
```

- [ ] **Step 6: 创建 settings_providers.dart**

```dart
// flutter/apps/web/lib/features/settings/presentation/settings_providers.dart
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../core/network/network_providers.dart';
import '../data/ai_api.dart';
import '../data/settings_api.dart';
import 'ai_settings_provider.dart';
import 'profile_provider.dart';
import 'settings_provider.dart';

final settingsApiProvider = Provider<SettingsApi>((ref) {
  return SettingsApi(ref.watch(httpClientProvider));
});

final settingsStateProvider =
    StateNotifierProvider<SettingsNotifier, UserSettings?>((ref) {
  return SettingsNotifier(ref.watch(settingsApiProvider));
});

final aiApiProvider = Provider<AiApi>((ref) {
  return AiApi(ref.watch(httpClientProvider));
});

final aiSettingsStateProvider =
    StateNotifierProvider<AiSettingsNotifier, AiSettingsState>((ref) {
  return AiSettingsNotifier(ref.watch(aiApiProvider));
});

final profileStateProvider =
    StateNotifierProvider<ProfileNotifier, ProfileState>((ref) {
  return ProfileNotifier(ref.watch(settingsApiProvider));
});

final languageProvider = StateProvider<String>((ref) => 'zh');
final themeModeProvider = StateProvider<ThemeMode>((ref) => ThemeMode.system);
```

- [ ] **Step 7: 创建 group_providers.dart**

```dart
// flutter/apps/web/lib/features/group/presentation/group_providers.dart
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../core/network/network_providers.dart';
import '../data/group_api.dart';
import 'group_provider.dart';

final groupApiProvider = Provider<GroupApi>((ref) {
  return GroupApi(ref.watch(httpClientProvider));
});

final groupStateProvider =
    StateNotifierProvider<GroupNotifier, GroupState>((ref) {
  return GroupNotifier(ref.watch(groupApiProvider));
});
```

- [ ] **Step 8: 创建 e2ee_providers.dart**

```dart
// flutter/apps/web/lib/features/e2ee/data/e2ee_providers.dart
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../adapters/web_e2ee_adapter.dart';
import '../../../core/network/network_providers.dart';
import '../../auth/presentation/auth_providers.dart';
import 'e2ee_api.dart';
import 'e2ee_key_store.dart';
import 'e2ee_manager.dart';
import 'e2ee_meta_store.dart';
import 'e2ee_session_store.dart';

final e2eeAdapterProvider = Provider<WebE2eeAdapter>((ref) {
  return WebE2eeAdapter();
});

final e2eeApiProvider = Provider<E2eeApi>((ref) {
  return E2eeApi(ref.watch(httpClientProvider));
});

final e2eeKeyStoreProvider = Provider<E2eeKeyStore>((ref) {
  final store = E2eeKeyStore();
  ref.onDispose(() => store.dispose());
  return store;
});

final e2eeSessionStoreProvider = Provider<E2eeSessionStore>((ref) {
  final store = E2eeSessionStore();
  ref.onDispose(() => store.dispose());
  return store;
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

- [ ] **Step 9: 验证无静态错误**

Run: `cd flutter/apps/web && flutter analyze lib/`
Expected: No issues (or only pre-existing issues)

- [ ] **Step 10: 提交**

```bash
git add flutter/apps/web/lib/features/*/presentation/*_providers.dart flutter/apps/web/lib/features/e2ee/data/e2ee_providers.dart flutter/apps/web/lib/features/chat/data/file_providers.dart
git commit -m "feat(providers): split providers into feature-level modules"
```

---

## Task 6: 替换 providers.dart 为 barrel export

**Files:**
- Modify: `flutter/apps/web/lib/core/di/providers.dart`

- [ ] **Step 1: 替换为 barrel export**

将 `flutter/apps/web/lib/core/di/providers.dart` 的全部内容替换为：

```dart
// flutter/apps/web/lib/core/di/providers.dart
/// Barrel export — 所有 provider 通过此文件统一导入。
/// 各 feature 自己持有 provider 定义，这里只做 re-export。

// Core
export '../config/app_config_provider.dart';
export '../network/network_providers.dart';
export '../network/network_status_provider.dart';
export '../observer/app_provider_observer.dart';
export '../error/error_notifier.dart';

// Features
export '../../features/auth/presentation/auth_providers.dart';
export '../../features/chat/presentation/chat_providers.dart';
export '../../features/chat/data/file_providers.dart';
export '../../features/contacts/presentation/contacts_providers.dart';
export '../../features/moments/presentation/moments_providers.dart';
export '../../features/settings/presentation/settings_providers.dart';
export '../../features/group/presentation/group_providers.dart';
export '../../features/e2ee/data/e2ee_providers.dart';
```

- [ ] **Step 2: 更新 outbox_provider.dart 的 import**

在 `flutter/apps/web/lib/features/chat/data/outbox_provider.dart` 中，将：

```dart
import '../../../core/di/providers.dart';
```

改为：

```dart
import '../../../core/network/network_providers.dart';
import '../presentation/chat_providers.dart';
```

- [ ] **Step 3: 验证编译**

Run: `cd flutter/apps/web && flutter analyze lib/`
Expected: No issues

- [ ] **Step 4: 提交**

```bash
git add flutter/apps/web/lib/core/di/providers.dart flutter/apps/web/lib/features/chat/data/outbox_provider.dart
git commit -m "refactor(providers): replace centralized providers with barrel export"
```

---

## Task 7: 注册 ProviderObserver 到 main.dart

**Files:**
- Modify: `flutter/apps/web/lib/main.dart`

- [ ] **Step 1: 修改 main.dart**

```dart
// flutter/apps/web/lib/main.dart
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'app.dart';
import 'core/observer/app_provider_observer.dart';

void main() {
  WidgetsFlutterBinding.ensureInitialized();
  const env = String.fromEnvironment('APP_ENV', defaultValue: 'development');
  runApp(ProviderScope(
    observers: [AppProviderObserver(env: env)],
    child: const App(),
  ));
}
```

- [ ] **Step 2: 验证编译**

Run: `cd flutter/apps/web && flutter analyze lib/main.dart`
Expected: No issues

- [ ] **Step 3: 运行全部测试**

Run: `cd flutter/apps/web && flutter test`
Expected: ALL PASS

- [ ] **Step 4: 提交**

```bash
git add flutter/apps/web/lib/main.dart
git commit -m "feat: register ProviderObserver in main.dart"
```

---

## Task 8: 最终验证

- [ ] **Step 1: 运行静态分析**

Run: `cd flutter/apps/web && flutter analyze`
Expected: No new issues

- [ ] **Step 2: 运行全部测试**

Run: `cd flutter/apps/web && flutter test`
Expected: ALL PASS

- [ ] **Step 3: 检查 barrel export 兼容性**

确认以下 import 仍可用（在任意文件中测试）：
```dart
import 'package:im_web/core/di/providers.dart';
// authStateProvider, chatStateProvider, wsClientProvider 等仍可用
```

- [ ] **Step 4: 最终提交（如有残留修改）**

```bash
git add -A
git commit -m "chore: final cleanup for modular providers refactoring"
```
