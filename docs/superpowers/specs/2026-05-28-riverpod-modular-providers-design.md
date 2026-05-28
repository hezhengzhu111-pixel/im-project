# Riverpod 模块化 Provider 重构设计

## 背景

当前 `core/di/providers.dart` 集中定义了全部 40+ provider，存在以下问题：
- 单文件 194 行，违反单一职责
- `baseUrl`/`wsUrl` 硬编码 `localhost:8082`
- 缺少统一的会话恢复、权限检查、token refresh 协调
- 无开发期状态可观测性
- 无 ProviderObserver，调试困难

## 目标

对标 Vue Pinia 的模块化 store 体验，将 providers 按领域拆分，补齐基础设施。

---

## 1. 目录结构

```
lib/
├── core/
│   ├── config/
│   │   └── app_config_provider.dart      # AppConfig + env provider
│   ├── di/
│   │   └── providers.dart                # barrel export（保留兼容）
│   ├── network/
│   │   └── network_providers.dart        # httpClient, ws, storage
│   ├── observer/
│   │   └── app_provider_observer.dart    # ProviderObserver
│   └── error/
│       └── error_notifier.dart           # 不变
├── features/
│   ├── auth/
│   │   └── presentation/
│   │       └── auth_providers.dart       # authStateProvider, authRepositoryProvider
│   ├── chat/
│   │   └── presentation/
│   │       └── chat_providers.dart       # chatStateProvider, messageApiProvider
│   ├── contacts/
│   │   └── presentation/
│   │       └── contacts_providers.dart
│   ├── moments/
│   │   └── presentation/
│   │       └── moments_providers.dart
│   ├── settings/
│   │   └── presentation/
│   │       └── settings_providers.dart
│   ├── group/
│   │   └── presentation/
│   │       └── group_providers.dart
│   ├── e2ee/
│   │   └── data/
│   │       └── e2ee_providers.dart       # e2ee adapter/api/store/manager providers
│   └── file/
│       └── data/
│           └── file_providers.dart       # fileApiProvider
```

---

## 2. AppConfig（从 --dart-define 读取）

**文件**: `core/config/app_config_provider.dart`

```dart
/// 应用全局配置，通过 --dart-define 注入
class AppConfig {
  const AppConfig({
    required this.apiBaseUrl,
    required this.wsBaseUrl,
    this.appEnv = 'production',
  });

  final String apiBaseUrl;
  final String wsBaseUrl;
  final String appEnv; // 'development' | 'staging' | 'production'

  bool get isDevelopment => appEnv == 'development';
  bool get isProduction => appEnv == 'production';
}

/// 从 --dart-define 读取配置
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

**用法**:
```bash
flutter run --dart-define=API_BASE_URL=https://api.example.com \
            --dart-define=WS_BASE_URL=wss://ws.example.com \
            --dart-define=APP_ENV=production
```

---

## 3. 网络 Provider 拆分

**文件**: `core/network/network_providers.dart`

从原 providers.dart 抽取 storage、httpClient、wsClient、wsState，改用 AppConfig：

```dart
final secureStorageProvider = Provider<SecureStoragePort>((ref) => WebSecureStorageAdapter());
final storageProvider = Provider<StoragePort>((ref) => WebStorageAdapter());

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

---

## 4. Feature Provider 拆分

### 4.1 Auth Provider

**文件**: `features/auth/presentation/auth_providers.dart`

保留 `authStateProvider` 和 `authRepositoryProvider` 名称，增加新能力：

```dart
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

/// 便捷 provider：当前用户 ID
final currentUserIdProvider = Provider<String>((ref) {
  return ref.watch(authStateProvider).user?.id ?? '';
});

/// 便捷 provider：是否已认证
final isAuthenticatedProvider = Provider<bool>((ref) {
  return ref.watch(authStateProvider).isAuthenticated;
});
```

### 4.2 AuthNotifier 增强

**文件**: `features/auth/presentation/auth_provider.dart`（原文件修改）

在现有 `checkAuth()` 基础上增加：

```dart
class AuthState {
  // ...现有字段...
  final bool authReady;       // 新增：会话恢复是否已完成
  final List<String> permissions; // 新增：用户权限列表
}

class AuthNotifier extends StateNotifier<AuthState> {
  // ...现有构造函数...

  /// 会话恢复（保留 checkAuth 作为别名）
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

  /// checkAuth 保留为 restoreSession 的别名
  Future<void> checkAuth() => restoreSession();

  /// 确保 token 有效，过期则刷新
  Future<bool> ensureFreshSession() async {
    final isAuth = await _repository.isAuthenticated();
    if (!isAuth) {
      // 尝试 refresh
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

  /// 权限检查
  bool hasPermission(String permission) {
    return state.permissions.contains(permission);
  }

  bool hasAnyPermission(List<String> permissions) {
    return permissions.any(state.permissions.contains);
  }
}
```

### 4.3 Chat Provider

**文件**: `features/chat/presentation/chat_providers.dart`

```dart
final messageApiProvider = Provider<MessageApi>((ref) {
  return MessageApi(ref.watch(httpClientProvider));
});

final chatStateProvider = StateNotifierProvider<ChatNotifierWithOutbox, ChatStateWithOutbox>((ref) {
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

### 4.4 E2EE Provider

**文件**: `features/e2ee/data/e2ee_providers.dart`

```dart
final e2eeAdapterProvider = Provider<WebE2eeAdapter>((ref) => WebE2eeAdapter());
final e2eeApiProvider = Provider<E2eeApi>((ref) => E2eeApi(ref.watch(httpClientProvider)));
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
final e2eeSessionStatusProvider = FutureProvider.family<String, String>((ref, sessionId) async {
  return ref.watch(e2eeMetaStoreProvider).getSessionStatus(sessionId);
});
```

### 4.5 其他 Feature Provider

类似模式拆分到各自 feature 目录：
- `contacts_providers.dart`
- `moments_providers.dart`
- `settings_providers.dart`
- `group_providers.dart`
- `file_providers.dart`

---

## 5. ProviderObserver（开发日志）

**文件**: `core/observer/app_provider_observer.dart`

```dart
import 'package:flutter/foundation.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

/// 不输出的 provider 名称前缀（避免泄露敏感信息）
const _sensitivePrefixes = ['auth', 'token', 'secure', 'wsClient'];

class AppProviderObserver extends ProviderObserver {
  AppProviderObserver({this.env = 'development'});

  final String env;

  bool get _isDevelopment => env == 'development';

  @override
  void didAddProvider(
    ProviderBase<Object?> provider,
    Object? value,
    ProviderContainer container,
  ) {
    if (!_isDevelopment) return;
    final name = provider.name ?? provider.runtimeType.toString();
    if (_isSensitive(name)) return;
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
    if (_isSensitive(name)) return;

    final prevSummary = _summarize(previousValue);
    final nextSummary = _summarize(newValue);
    debugPrint('[Provider] update: $name ($prevSummary -> $nextSummary)');
  }

  bool _isSensitive(String name) {
    return _sensitivePrefixes.any(name.toLowerCase().contains);
  }

  String _summarize(Object? value) {
    if (value == null) return 'null';
    if (value is StateNotifier) {
      final state = value.state;
      return state.runtimeType.toString();
    }
    return value.runtimeType.toString();
  }
}
```

**注册到 ProviderScope** (`main.dart`):

```dart
void main() {
  WidgetsFlutterBinding.ensureInitialized();
  const env = String.fromEnvironment('APP_ENV', defaultValue: 'development');
  runApp(ProviderScope(
    observers: [AppProviderObserver(env: env)],
    child: const App(),
  ));
}
```

---

## 6. Barrel Export（兼容层）

**文件**: `core/di/providers.dart`

```dart
/// Barrel export — 所有 provider 通过此文件统一导入。
/// 各 feature 自己持有 provider 定义，这里只做 re-export。

// Core
export '../config/app_config_provider.dart';
export '../network/network_providers.dart';
export '../observer/app_provider_observer.dart';

// Features
export '../../features/auth/presentation/auth_providers.dart';
export '../../features/chat/presentation/chat_providers.dart';
export '../../features/contacts/presentation/contacts_providers.dart';
export '../../features/moments/presentation/moments_providers.dart';
export '../../features/settings/presentation/settings_providers.dart';
export '../../features/group/presentation/group_providers.dart';
export '../../features/e2ee/data/e2ee_providers.dart';
export '../../features/chat/data/file_providers.dart';

// Network status
export '../network/network_status_provider.dart';

// Error
export '../error/error_notifier.dart';

// Language & Theme
export '../../features/settings/presentation/settings_provider.dart'
    show languageProvider, themeModeProvider;
```

保留 `authStateProvider`、`chatStateProvider` 等原有名称不变。

---

## 7. 单元测试

### 测试策略
- 现有测试文件保持原位不动
- 新增测试按新结构放置

### 新增测试文件

#### 7.1 AppConfig 测试

**文件**: `test/core/config/app_config_provider_test.dart`

```dart
void main() {
  group('AppConfig', () {
    test('default values', () {
      const config = AppConfig(
        apiBaseUrl: 'http://localhost:8082',
        wsBaseUrl: 'ws://localhost:8082',
      );
      expect(config.appEnv, 'production');
      expect(config.isDevelopment, isFalse);
    });

    test('custom values', () {
      const config = AppConfig(
        apiBaseUrl: 'https://api.example.com',
        wsBaseUrl: 'wss://ws.example.com',
        appEnv: 'development',
      );
      expect(config.isDevelopment, isTrue);
      expect(config.isProduction, isFalse);
    });
  });
}
```

#### 7.2 AuthNotifier 增强测试

**文件**: `test/features/auth/auth_provider_test.dart`（在现有文件中追加）

```dart
group('AuthNotifier - enhanced', () {
  test('restoreSession sets authReady true', () async {
    mockRepo.isAuthResponse = false;
    await notifier.restoreSession();
    expect(notifier.state.authReady, isTrue);
    expect(notifier.state.isAuthenticated, isFalse);
  });

  test('hasPermission returns true for granted permission', () async {
    const user = User(id: '1', username: 'test', permissions: ['chat:read']);
    mockRepo.isAuthResponse = true;
    mockRepo.profileResponse = user;
    await notifier.restoreSession();
    expect(notifier.hasPermission('chat:read'), isTrue);
    expect(notifier.hasPermission('admin'), isFalse);
  });

  test('hasAnyPermission returns true if any match', () async {
    const user = User(id: '1', username: 'test', permissions: ['chat:read']);
    mockRepo.isAuthResponse = true;
    mockRepo.profileResponse = user;
    await notifier.restoreSession();
    expect(notifier.hasAnyPermission(['admin', 'chat:read']), isTrue);
  });
});
```

#### 7.3 ProviderObserver 测试

**文件**: `test/core/observer/app_provider_observer_test.dart`

```dart
void main() {
  group('AppProviderObserver', () {
    test('does not log sensitive providers', () {
      // 验证 auth/token/secure 前缀被过滤
    });

    test('summarizes StateNotifier state', () {
      // 验证 _summarize 输出 StateNotifier 的 state 类型
    });
  });
}
```

---

## 8. 迁移步骤

1. **创建 AppConfig** → `core/config/app_config_provider.dart`
2. **创建 network_providers.dart** → 从 providers.dart 抽取 storage/http/ws
3. **创建各 feature providers** → 按领域拆分
4. **修改 AuthNotifier** → 增加 restoreSession/hasPermission/authReady
5. **创建 ProviderObserver** → `core/observer/app_provider_observer.dart`
6. **替换 providers.dart** → barrel export
7. **修改 main.dart** → 注册 ProviderObserver
8. **新增单元测试**
9. **验证构建** → `flutter analyze` + `flutter test`

---

## 9. 风险与缓解

| 风险 | 缓解 |
|------|------|
| 页面 import 路径变化 | barrel export 保持兼容 |
| authStateProvider 名称变化 | 保留原名称 |
| token 泄露到日志 | ProviderObserver 过滤敏感前缀 |
| E2EE provider 循环依赖 | e2ee_providers 通过 currentUserIdProvider 获取用户 ID |
| AppConfig 未注入导致默认值 | 默认值 fallback 到 localhost |

---

## 10. 不变项

- `AuthNotifier` 的 `login`/`register`/`logout` 逻辑不变
- `ChatNotifier`/`ChatNotifierWithOutbox` 的 WS 订阅逻辑不变
- 现有测试文件不动
- 现有 adapter 层不变
