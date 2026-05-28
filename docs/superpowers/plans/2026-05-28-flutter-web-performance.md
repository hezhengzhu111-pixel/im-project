# Flutter Web 性能优化实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为 Flutter Web 增加路由级 deferred imports、首屏 loading、构建脚本和性能文档，减少首包体积 15-30%。

**Architecture:** 使用 DeferredRoutePage 包装器实现 GoRouter 的 lazy loading，将 providers.dart 拆分为按 feature 独立文件，添加 CSS loading 指示器改善首屏体验，提供 Makefile 构建脚本支持 dev/prod/wasm 模式。

**Tech Stack:** Flutter Web, GoRouter, Riverpod, dart2js, dart2wasm, CanvasKit, Skwasm

---

## 文件结构

| 文件 | 操作 | 说明 |
|---|---|---|
| `lib/core/router/deferred_route_page.dart` | 新增 | DeferredRoutePage 包装器 |
| `lib/core/router/app_router.dart` | 修改 | 5 个路由改为 deferred import |
| `lib/core/di/providers.dart` | 修改 | 拆分为通用部分 |
| `lib/core/di/auth_providers.dart` | 新增 | auth provider |
| `lib/core/di/chat_providers.dart` | 新增 | chat provider |
| `lib/core/di/contacts_providers.dart` | 新增 | contacts provider |
| `lib/core/di/moments_providers.dart` | 新增 | moments provider |
| `lib/core/di/settings_providers.dart` | 新增 | settings provider |
| `lib/core/di/group_providers.dart` | 新增 | group provider |
| `lib/core/di/e2ee_providers.dart` | 新增 | e2ee provider |
| `web/index.html` | 修改 | 添加 loading 指示器 |
| `Makefile` | 新增 | 构建脚本 |
| `docs/flutter-web-performance.md` | 新增 | 性能文档 |

---

### Task 1: 创建 DeferredRoutePage 包装器

**Files:**
- Create: `flutter/apps/web/lib/core/router/deferred_route_page.dart`

- [ ] **Step 1: 创建 DeferredRoutePage 文件**

```dart
import 'package:flutter/material.dart';

class DeferredRoutePage<T> extends StatefulWidget {
  final Future<void> Function() loadLibrary;
  final T Function() builder;
  final Widget Function()? loadingBuilder;
  final Widget Function(Object error, VoidCallback retry)? errorBuilder;

  const DeferredRoutePage({
    required this.loadLibrary,
    required this.builder,
    this.loadingBuilder,
    this.errorBuilder,
    super.key,
  });

  @override
  State<DeferredRoutePage<T>> createState() => _DeferredRoutePageState<T>();
}

class _DeferredRoutePageState<T> extends State<DeferredRoutePage<T>> {
  late Future<void> _future;
  Object? _error;

  @override
  void initState() {
    super.initState();
    _future = _loadLibrary();
  }

  Future<void> _loadLibrary() async {
    try {
      await widget.loadLibrary();
      if (mounted) {
        setState(() {
          _error = null;
        });
      }
    } catch (e) {
      if (mounted) {
        setState(() {
          _error = e;
        });
      }
    }
  }

  void _retry() {
    setState(() {
      _error = null;
      _future = _loadLibrary();
    });
  }

  @override
  Widget build(BuildContext context) {
    if (_error != null) {
      if (widget.errorBuilder != null) {
        return widget.errorBuilder!(_error!, _retry);
      }
      return _defaultErrorWidget(_error!, _retry);
    }

    return FutureBuilder<void>(
      future: _future,
      builder: (context, snapshot) {
        if (snapshot.connectionState == ConnectionState.done) {
          if (snapshot.hasError) {
            if (widget.errorBuilder != null) {
              return widget.errorBuilder!(snapshot.error!, _retry);
            }
            return _defaultErrorWidget(snapshot.error!, _retry);
          }
          return widget.builder() as Widget;
        }

        if (widget.loadingBuilder != null) {
          return widget.loadingBuilder!();
        }
        return _defaultLoadingWidget();
      },
    );
  }

  Widget _defaultLoadingWidget() {
    return const Center(
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          CircularProgressIndicator(),
          SizedBox(height: 16),
          Text('加载中...'),
        ],
      ),
    );
  }

  Widget _defaultErrorWidget(Object error, VoidCallback retry) {
    return Center(
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          const Icon(Icons.error_outline, size: 48, color: Colors.red),
          const SizedBox(height: 16),
          Text('加载失败: $error'),
          const SizedBox(height: 16),
          ElevatedButton(
            onPressed: retry,
            child: const Text('重试'),
          ),
        ],
      ),
    );
  }
}
```

- [ ] **Step 2: 验证文件创建成功**

Run: `cat flutter/apps/web/lib/core/router/deferred_route_page.dart | head -20`
Expected: 文件存在且包含 DeferredRoutePage 类定义

- [ ] **Step 3: Commit**

```bash
git add flutter/apps/web/lib/core/router/deferred_route_page.dart
git commit -m "feat: add DeferredRoutePage wrapper for lazy loading"
```

---

### Task 2: 拆分 providers.dart - 创建通用 providers

**Files:**
- Modify: `flutter/apps/web/lib/core/di/providers.dart`

- [ ] **Step 1: 保留通用 providers 并移除 feature-specific imports**

修改 `providers.dart`，只保留以下通用 providers：

```dart
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:im_core/core.dart';
import '../../adapters/adapters.dart';
import '../../core/error/error_notifier.dart';
import '../../core/network/network_status_provider.dart';

// Storage
final secureStorageProvider = Provider<SecureStoragePort>((ref) => WebSecureStorageAdapter());
final storageProvider = Provider<StoragePort>((ref) => WebStorageAdapter());

// HTTP
final httpClientProvider = Provider<HttpClientPort>((ref) {
  return WebHttpClient(
    baseUrl: 'http://localhost:8082',
    secureStorage: ref.watch(secureStorageProvider),
  );
});

// WebSocket
final wsClientProvider = Provider<WsClientPort>((ref) {
  final client = WebWsClient(
    ticketUrl: AuthEndpoints.wsTicket,
    wsBaseUrl: 'ws://localhost:8082${WsEndpoints.path}',
  );
  ref.onDispose(() => client.dispose());
  return client;
});

final wsStateProvider = StreamProvider<WsConnectionState>((ref) {
  return ref.watch(wsClientProvider).connectionState;
});

// Error
final errorProvider = StateNotifierProvider<ErrorNotifier, ErrorState>((ref) {
  return ErrorNotifier();
});

// Language
final languageProvider = StateProvider<String>((ref) => 'zh');

// Theme
final themeModeProvider = StateProvider<ThemeMode>((ref) => ThemeMode.system);
```

- [ ] **Step 2: 验证 providers.dart 只保留通用 providers**

Run: `grep -c "Provider" flutter/apps/web/lib/core/di/providers.dart`
Expected: 8 (secureStorage, storage, httpClient, wsClient, wsState, error, language, themeMode)

- [ ] **Step 3: Commit**

```bash
git add flutter/apps/web/lib/core/di/providers.dart
git commit -m "refactor: split providers.dart to keep only common providers"
```

---

### Task 3: 拆分 providers.dart - 创建 feature providers

**Files:**
- Create: `flutter/apps/web/lib/core/di/auth_providers.dart`
- Create: `flutter/apps/web/lib/core/di/chat_providers.dart`
- Create: `flutter/apps/web/lib/core/di/contacts_providers.dart`
- Create: `flutter/apps/web/lib/core/di/moments_providers.dart`
- Create: `flutter/apps/web/lib/core/di/settings_providers.dart`
- Create: `flutter/apps/web/lib/core/di/group_providers.dart`
- Create: `flutter/apps/web/lib/core/di/e2ee_providers.dart`

- [ ] **Step 1: 创建 auth_providers.dart**

```dart
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:im_core/core.dart';
import '../../adapters/adapters.dart';
import '../../features/auth/data/auth_repository_impl.dart';
import '../../features/auth/presentation/auth_provider.dart';
import 'providers.dart';

final authRepositoryProvider = Provider<AuthRepository>((ref) {
  return AuthRepositoryImpl(
    httpClient: ref.watch(httpClientProvider),
    secureStorage: ref.watch(secureStorageProvider),
  );
});

final authStateProvider = StateNotifierProvider<AuthNotifier, AuthState>((ref) {
  return AuthNotifier(ref.watch(authRepositoryProvider), ref.watch(wsClientProvider), ref.watch(httpClientProvider));
});
```

- [ ] **Step 2: 创建 chat_providers.dart**

```dart
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:im_core/core.dart';
import '../../features/chat/data/message_api.dart';
import '../../features/chat/data/message_pipeline.dart';
import '../../features/chat/data/message_outbox.dart';
import '../../features/chat/data/outbox_provider.dart';
import '../../features/chat/presentation/chat_provider.dart';
import '../../features/chat/presentation/chat_provider_with_outbox.dart';
import '../../features/chat/data/file_api.dart';
import '../../features/e2ee/data/e2ee_manager.dart';
import '../../features/e2ee/data/e2ee_meta_store.dart';
import '../../core/network/network_status_provider.dart';
import 'providers.dart';
import 'auth_providers.dart';
import 'e2ee_providers.dart';

final messageApiProvider = Provider<MessageApi>((ref) => MessageApi(ref.watch(httpClientProvider)));

final chatStateProvider = StateNotifierProvider<ChatNotifierWithOutbox, ChatStateWithOutbox>((ref) {
  return ChatNotifierWithOutbox(
    ref.watch(messageApiProvider),
    MessagePipeline(),
    ref.watch(wsClientProvider),
    () => ref.read(authStateProvider).user?.id ?? '',
    ref.watch(e2eeManagerProvider),
    ref.watch(e2eeMetaStoreProvider),
    ref.watch(messageOutboxProvider),
    ref.watch(networkStatusProvider.notifier),
  );
});

final fileApiProvider = Provider<FileApi>((ref) {
  return FileApi(ref.watch(httpClientProvider));
});
```

- [ ] **Step 3: 创建 contacts_providers.dart**

```dart
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../features/contacts/data/contacts_api.dart';
import '../../features/contacts/presentation/contacts_provider.dart';
import 'providers.dart';

final contactsApiProvider = Provider<ContactsApi>((ref) => ContactsApi(ref.watch(httpClientProvider)));

final contactsStateProvider = StateNotifierProvider<ContactsNotifier, ContactsState>((ref) {
  return ContactsNotifier(ref.watch(contactsApiProvider), ref.watch(wsClientProvider));
});
```

- [ ] **Step 4: 创建 moments_providers.dart**

```dart
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../features/moments/data/moments_api.dart';
import '../../features/moments/data/moments_repository.dart';
import '../../features/moments/presentation/feed/moments_feed_provider.dart';
import '../../features/moments/presentation/composer/composer_provider.dart';
import '../../features/moments/presentation/notifications/notifications_provider.dart';
import 'providers.dart';
import 'chat_providers.dart';

final momentsApiProvider = Provider<MomentsApi>((ref) => MomentsApi(ref.watch(httpClientProvider)));

final momentsRepositoryProvider = Provider<MomentsRepository>((ref) {
  return MomentsRepository(ref.watch(momentsApiProvider), ref.watch(fileApiProvider));
});

final momentsFeedProvider = StateNotifierProvider<MomentsFeedNotifier, MomentsFeedState>((ref) {
  return MomentsFeedNotifier(ref.watch(momentsRepositoryProvider));
});

final composerProvider = StateNotifierProvider<ComposerNotifier, ComposerState>((ref) {
  return ComposerNotifier(ref.watch(momentsRepositoryProvider));
});

final notificationsProvider = StateNotifierProvider<MomentsNotificationsNotifier, MomentsNotificationsState>((ref) {
  return MomentsNotificationsNotifier(ref.watch(momentsRepositoryProvider));
});
```

- [ ] **Step 5: 创建 settings_providers.dart**

```dart
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:im_core/core.dart';
import '../../features/settings/data/settings_api.dart';
import '../../features/settings/data/ai_api.dart';
import '../../features/settings/presentation/settings_provider.dart';
import '../../features/settings/presentation/ai_settings_provider.dart';
import '../../features/settings/presentation/profile_provider.dart';
import 'providers.dart';

final settingsApiProvider = Provider<SettingsApi>((ref) => SettingsApi(ref.watch(httpClientProvider)));

final settingsStateProvider = StateNotifierProvider<SettingsNotifier, UserSettings?>((ref) {
  return SettingsNotifier(ref.watch(settingsApiProvider));
});

final aiApiProvider = Provider<AiApi>((ref) => AiApi(ref.watch(httpClientProvider)));

final aiSettingsStateProvider = StateNotifierProvider<AiSettingsNotifier, AiSettingsState>((ref) {
  return AiSettingsNotifier(ref.watch(aiApiProvider));
});

final profileStateProvider = StateNotifierProvider<ProfileNotifier, ProfileState>((ref) {
  return ProfileNotifier(ref.watch(settingsApiProvider));
});
```

- [ ] **Step 6: 创建 group_providers.dart**

```dart
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../features/group/data/group_api.dart';
import '../../features/group/presentation/group_provider.dart';
import 'providers.dart';

final groupApiProvider = Provider<GroupApi>((ref) {
  return GroupApi(ref.watch(httpClientProvider));
});

final groupStateProvider = StateNotifierProvider<GroupNotifier, GroupState>((ref) {
  return GroupNotifier(ref.watch(groupApiProvider));
});
```

- [ ] **Step 7: 创建 e2ee_providers.dart**

```dart
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../adapters/web_e2ee_adapter.dart';
import '../../features/e2ee/data/e2ee_api.dart';
import '../../features/e2ee/data/e2ee_key_store.dart';
import '../../features/e2ee/data/e2ee_session_store.dart';
import '../../features/e2ee/data/e2ee_meta_store.dart';
import '../../features/e2ee/data/e2ee_manager.dart';
import 'providers.dart';
import 'auth_providers.dart';

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
  final authState = ref.watch(authStateProvider);
  return E2eeManager(
    adapter: ref.watch(e2eeAdapterProvider),
    api: ref.watch(e2eeApiProvider),
    keyStore: ref.watch(e2eeKeyStoreProvider),
    sessionStore: ref.watch(e2eeSessionStoreProvider),
    metaStore: ref.watch(e2eeMetaStoreProvider),
    currentUserId: authState.user?.id ?? '',
  );
});

final e2eeSessionStatusProvider = FutureProvider.family<String, String>((ref, sessionId) async {
  final metaStore = ref.watch(e2eeMetaStoreProvider);
  return metaStore.getSessionStatus(sessionId);
});
```

- [ ] **Step 8: 验证所有 provider 文件创建成功**

Run: `ls -la flutter/apps/web/lib/core/di/*.dart | wc -l`
Expected: 8 (providers.dart + 7 feature providers)

- [ ] **Step 9: Commit**

```bash
git add flutter/apps/web/lib/core/di/
git commit -m "refactor: split providers.dart into feature-specific provider files"
```

---

### Task 4: 修改 app_router.dart 使用 deferred imports

**Files:**
- Modify: `flutter/apps/web/lib/core/router/app_router.dart`

- [ ] **Step 1: 更新 app_router.dart 使用 deferred imports**

```dart
import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:im_web/core/di/providers.dart';
import 'package:im_web/core/di/auth_providers.dart';
import 'package:im_web/core/error/error_notifier.dart';
import 'package:im_web/core/responsive/breakpoints.dart';
import 'package:im_web/core/responsive/mobile_shell.dart';
import 'package:im_web/l10n/app_localizations.dart';
import 'package:im_web/features/auth/presentation/login_page.dart';
import 'package:im_web/features/auth/presentation/register_page.dart';
import 'package:im_web/features/chat/presentation/chat_page.dart';
import 'package:im_web/features/contacts/presentation/contacts_page.dart';
import 'package:im_web/features/group/presentation/group_list_page.dart';
import 'package:im_web/features/moments/presentation/moments_main_page.dart';
import 'package:im_web/features/settings/presentation/settings_page.dart';
import 'deferred_route_page.dart';

// Deferred imports for low-frequency pages
import 'package:im_web/features/contacts/presentation/add_friend_page.dart'
    deferred as add_friend_page;
import 'package:im_web/features/group/presentation/create_group_page.dart'
    deferred as create_group_page;
import 'package:im_web/features/moments/presentation/notifications/moments_notifications_page.dart'
    deferred as notifications_page;
import 'package:im_web/features/settings/presentation/profile_page.dart'
    deferred as profile_page;
import 'package:im_web/features/settings/presentation/ai_settings_page.dart'
    deferred as ai_settings_page;

final routerProvider = Provider<GoRouter>((ref) {
  final authState = ref.watch(authStateProvider);

  return GoRouter(
    initialLocation: '/chat',
    redirect: (context, state) {
      final isAuth = authState.isAuthenticated;
      final isLoginRoute = state.uri.path == '/login' ||
          state.uri.path == '/register';

      // If not authenticated and not on auth pages, redirect to login
      if (!isAuth && !isLoginRoute) return '/login';

      // If authenticated and on auth pages, redirect to chat
      if (isAuth && isLoginRoute) return '/chat';

      return null;
    },
    routes: [
      GoRoute(path: '/login', builder: (_, __) => const LoginPage()),
      GoRoute(path: '/register', builder: (_, __) => const RegisterPage()),
      ShellRoute(
        builder: (_, __, child) => ResponsiveLayout(
          mobile: (_) => MobileShell(child: child),
          desktop: (_) => MainLayout(child: child),
        ),
        routes: [
          GoRoute(path: '/chat', builder: (_, __) => const ChatPage()),
          GoRoute(
              path: '/contacts', builder: (_, __) => const ContactsPage()),
          GoRoute(
            path: '/contacts/add',
            pageBuilder: (_, __) => NoTransitionPage(
              child: DeferredRoutePage(
                loadLibrary: add_friend_page.loadLibrary,
                builder: () => add_friend_page.AddFriendPage(),
              ),
            ),
          ),
          GoRoute(
              path: '/groups', builder: (_, __) => const GroupListPage()),
          GoRoute(
            path: '/groups/create',
            pageBuilder: (_, __) => NoTransitionPage(
              child: DeferredRoutePage(
                loadLibrary: create_group_page.loadLibrary,
                builder: () => create_group_page.CreateGroupPage(),
              ),
            ),
          ),
          GoRoute(
              path: '/moments', builder: (_, __) => const MomentsMainPage()),
          GoRoute(
            path: '/moments/notifications',
            pageBuilder: (_, __) => NoTransitionPage(
              child: DeferredRoutePage(
                loadLibrary: notifications_page.loadLibrary,
                builder: () => notifications_page.MomentsNotificationsPage(),
              ),
            ),
          ),
          GoRoute(
              path: '/settings', builder: (_, __) => const SettingsPage()),
          GoRoute(
            path: '/settings/profile',
            pageBuilder: (_, __) => NoTransitionPage(
              child: DeferredRoutePage(
                loadLibrary: profile_page.loadLibrary,
                builder: () => profile_page.ProfilePage(),
              ),
            ),
          ),
          GoRoute(
            path: '/settings/ai',
            pageBuilder: (_, __) => NoTransitionPage(
              child: DeferredRoutePage(
                loadLibrary: ai_settings_page.loadLibrary,
                builder: () => ai_settings_page.AiSettingsPage(),
              ),
            ),
          ),
        ],
      ),
    ],
  );
});

class MainLayout extends ConsumerWidget {
  const MainLayout({required this.child, super.key});
  final Widget child;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l10n = AppLocalizations.of(context)!;

    ref.listen<ErrorState>(errorProvider, (prev, next) {
      if (next.message != null && next.message != prev?.message) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(next.message!),
            duration: const Duration(seconds: 3),
          ),
        );
        ref.read(errorProvider.notifier).clear();
      }
    });

    return Scaffold(
      body: Row(
        children: [
          NavigationRail(
            selectedIndex: _selectedIndex(context),
            onDestinationSelected: (index) => _onNavigate(context, index),
            labelType: NavigationRailLabelType.all,
            destinations: [
              NavigationRailDestination(
                icon: const Icon(Icons.chat_outlined),
                selectedIcon: const Icon(Icons.chat),
                label: Text(l10n.navChat),
              ),
              NavigationRailDestination(
                icon: const Icon(Icons.people_outlined),
                selectedIcon: const Icon(Icons.people),
                label: Text(l10n.navContacts),
              ),
              NavigationRailDestination(
                icon: const Icon(Icons.group_outlined),
                selectedIcon: const Icon(Icons.group),
                label: Text(l10n.navGroups),
              ),
              NavigationRailDestination(
                icon: const Icon(Icons.camera_alt_outlined),
                selectedIcon: const Icon(Icons.camera_alt),
                label: Text(l10n.navMoments),
              ),
              NavigationRailDestination(
                icon: const Icon(Icons.settings_outlined),
                selectedIcon: const Icon(Icons.settings),
                label: Text(l10n.navSettings),
              ),
            ],
          ),
          const VerticalDivider(thickness: 1, width: 1),
          Expanded(child: child),
        ],
      ),
    );
  }

  int _selectedIndex(BuildContext context) {
    final location = GoRouterState.of(context).uri.path;
    if (location.startsWith('/chat')) return 0;
    if (location.startsWith('/contacts')) return 1;
    if (location.startsWith('/groups')) return 2;
    if (location.startsWith('/moments')) return 3;
    if (location.startsWith('/settings')) return 4;
    return 0;
  }

  void _onNavigate(BuildContext context, int index) {
    switch (index) {
      case 0:
        context.go('/chat');
      case 1:
        context.go('/contacts');
      case 2:
        context.go('/groups');
      case 3:
        context.go('/moments');
      case 4:
        context.go('/settings');
    }
  }
}
```

- [ ] **Step 2: 验证 deferred imports 语法正确**

Run: `grep -c "deferred as" flutter/apps/web/lib/core/router/app_router.dart`
Expected: 5

- [ ] **Step 3: Commit**

```bash
git add flutter/apps/web/lib/core/router/app_router.dart
git commit -m "feat: add deferred imports for low-frequency routes"
```

---

### Task 5: 更新 index.html 添加 loading 指示器

**Files:**
- Modify: `flutter/apps/web/web/index.html`

- [ ] **Step 1: 更新 index.html 添加 loading 指示器**

```html
<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <base href="$FLUTTER_BASE_HREF">
  <meta charset="UTF-8">
  <meta content="IE=Edge" http-equiv="X-UA-Compatible">
  <meta name="description" content="IM Web Application">
  <meta name="theme-color" content="#1a1a2e">
  <meta name="apple-mobile-web-app-capable" content="yes">
  <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
  <meta name="apple-mobile-web-app-title" content="IM">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
  <link rel="manifest" href="manifest.json">
  <link rel="apple-touch-icon" href="icons/icon-192.png">
  <title>IM</title>
  <style>
    body {
      margin: 0;
      padding: 0;
      overflow: hidden;
    }

    /* Loading indicator */
    .loading-indicator {
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      display: flex;
      flex-direction: column;
      justify-content: center;
      align-items: center;
      background: #ffffff;
      z-index: 10000;
    }

    .loading-logo {
      width: 80px;
      height: 80px;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      border-radius: 16px;
      display: flex;
      justify-content: center;
      align-items: center;
      margin-bottom: 24px;
      animation: pulse 2s ease-in-out infinite;
    }

    .loading-logo span {
      color: white;
      font-size: 32px;
      font-weight: bold;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    }

    .loading-text {
      color: #666;
      font-size: 14px;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    }

    .loading-spinner {
      width: 24px;
      height: 24px;
      border: 3px solid #f3f3f3;
      border-top: 3px solid #667eea;
      border-radius: 50%;
      animation: spin 1s linear infinite;
      margin-top: 16px;
    }

    @keyframes spin {
      0% { transform: rotate(0deg); }
      100% { transform: rotate(360deg); }
    }

    @keyframes pulse {
      0%, 100% { transform: scale(1); }
      50% { transform: scale(1.05); }
    }

    /* Offline fallback styles */
    .offline-banner {
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      background: #ff6b6b;
      color: white;
      text-align: center;
      padding: 8px;
      z-index: 9999;
      font-family: sans-serif;
      font-size: 14px;
      transform: translateY(-100%);
      transition: transform 0.3s ease;
    }

    .offline-banner.visible {
      transform: translateY(0);
    }
  </style>
</head>
<body>
  <!-- Loading indicator -->
  <div id="loading-indicator" class="loading-indicator">
    <div class="loading-logo">
      <span>IM</span>
    </div>
    <div class="loading-text">加载中...</div>
    <div class="loading-spinner"></div>
  </div>

  <!-- Offline banner shown by service worker -->
  <div id="offline-banner" class="offline-banner">
    网络已断开，部分功能可能不可用
  </div>

  <script src="flutter_bootstrap.js" async></script>

  <script>
    // Remove loading indicator when Flutter is ready
    window.addEventListener('flutter-first-frame', () => {
      const loadingIndicator = document.getElementById('loading-indicator');
      if (loadingIndicator) {
        loadingIndicator.style.opacity = '0';
        loadingIndicator.style.transition = 'opacity 0.3s ease';
        setTimeout(() => {
          loadingIndicator.remove();
        }, 300);
      }
    });

    // Register service worker
    if ('serviceWorker' in navigator) {
      window.addEventListener('load', async () => {
        try {
          const registration = await navigator.serviceWorker.register('/service_worker.js');
          console.log('SW registered:', registration.scope);

          // Listen for updates
          registration.addEventListener('updatefound', () => {
            const newWorker = registration.installing;
            newWorker.addEventListener('statechange', () => {
              if (newWorker.state === 'activated') {
                console.log('New service worker activated');
              }
            });
          });
        } catch (error) {
          console.log('SW registration failed:', error);
        }
      });
    }

    // Show/hide offline banner
    function updateOnlineStatus() {
      const banner = document.getElementById('offline-banner');
      if (banner) {
        if (navigator.onLine) {
          banner.classList.remove('visible');
        } else {
          banner.classList.add('visible');
        }
      }
    }

    window.addEventListener('online', updateOnlineStatus);
    window.addEventListener('offline', updateOnlineStatus);
    updateOnlineStatus();
  </script>
</body>
</html>
```

- [ ] **Step 2: 验证 loading indicator 添加成功**

Run: `grep -c "loading-indicator" flutter/apps/web/web/index.html`
Expected: 3 (div, getElementById, remove)

- [ ] **Step 3: Commit**

```bash
git add flutter/apps/web/web/index.html
git commit -m "feat: add loading indicator for better first-screen experience"
```

---

### Task 6: 创建 Makefile 构建脚本

**Files:**
- Create: `flutter/apps/web/Makefile`

- [ ] **Step 1: 创建 Makefile**

```makefile
.PHONY: dev prod wasm size report clean help

FLUTTER := flutter
BUILD_DIR := build/web
DEBUG_INFO_DIR := build/debug-info

help: ## 显示帮助信息
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | sort | \
		awk 'BEGIN {FS = ":.*?## "}; {printf "\033[36m%-15s\033[0m %s\n", $$1, $$2}'

dev: ## 开发构建 (dart2js, CanvasKit, debug)
	$(FLUTTER) build web --debug

prod: ## 生产构建 (dart2js, CanvasKit, obfuscated)
	$(FLUTTER) build web --release --obfuscate --split-debug-info=$(DEBUG_INFO_DIR)

wasm: ## WASM 构建 (dart2wasm, skwasm)
	$(FLUTTER) build web --wasm

size: ## 输出构建产物大小
	@echo "=== 构建产物大小 ==="
	@du -sh $(BUILD_DIR) 2>/dev/null || echo "构建目录不存在，请先运行 make dev/prod/wasm"
	@if [ -f "$(BUILD_DIR)/main.dart.js" ]; then \
		echo "main.dart.js: $$(du -h $(BUILD_DIR)/main.dart.js | cut -f1)"; \
	fi
	@if [ -f "$(BUILD_DIR)/main.dart.wasm" ]; then \
		echo "main.dart.wasm: $$(du -h $(BUILD_DIR)/main.dart.wasm | cut -f1)"; \
	fi
	@echo "=== Deferred chunks ==="
	@ls -lh $(BUILD_DIR)/part_*.js 2>/dev/null || echo "无 deferred chunks"

report: ## 构建 + 分析体积
	$(FLUTTER) build web --release --analyze-size
	@echo "=== 体积分析完成 ==="
	@du -sh $(BUILD_DIR)

clean: ## 清理构建产物
	$(FLUTTER) clean
	rm -rf $(BUILD_DIR) $(DEBUG_INFO_DIR)
```

- [ ] **Step 2: 验证 Makefile 创建成功**

Run: `cat flutter/apps/web/Makefile | head -20`
Expected: Makefile 存在且包含 dev/prod/wasm 目标

- [ ] **Step 3: Commit**

```bash
git add flutter/apps/web/Makefile
git commit -m "feat: add Makefile for dev/prod/wasm build scripts"
```

---

### Task 7: 创建性能文档

**Files:**
- Create: `flutter/docs/flutter-web-performance.md`

- [ ] **Step 1: 创建性能文档**

```markdown
# Flutter Web 性能优化指南

## 概述

本文档说明 Flutter Web 应用的性能优化策略，包括渲染器选择、构建配置、首屏优化和验证方式。

## 渲染器对比

| 渲染器 | 体积 | 渲染方式 | 适用场景 |
|--------|------|----------|----------|
| CanvasKit | ~2-4MB WASM | Skia → WebGL | 默认选择，保真度高 |
| HTML | ~1MB JS | 浏览器原生 | 体积敏感，低端设备 |
| Skwasm | ~1.5MB WASM | Skia → WebGPU | 下一代，需新浏览器 |

### CanvasKit

- **优点**：渲染保真度高，与移动端一致
- **缺点**：体积较大，需要 WebGL 支持
- **适用**：大多数生产环境

### HTML Renderer

- **优点**：体积小，兼容性好
- **缺点**：渲染保真度较低，部分 API 不支持
- **适用**：体积敏感场景，低端设备

### Skwasm (实验性)

- **优点**：体积小，性能好
- **缺点**：需要 WebGPU 支持 (Chrome 119+, Edge 119+)
- **适用**：现代浏览器，追求性能

## 构建策略

### 开发构建

```bash
make dev
# 或
flutter build web --debug
```

- 快速编译，支持热重载
- 无代码混淆，便于调试
- 输出到 `build/web/`

### 生产构建

```bash
make prod
# 或
flutter build web --release --obfuscate --split-debug-info=build/debug-info
```

- 代码混淆，减小体积
- 生成 sourcemap 到 `build/debug-info/`
- 输出到 `build/web/`

### WASM 构建

```bash
make wasm
# 或
flutter build web --wasm
```

- 使用 dart2wasm 编译
- 需要 Flutter 3.22+
- 输出 `.wasm` 文件到 `build/web/`

## 部署要求

### CanvasKit

- 需要 WebGL 支持
- 所有现代浏览器都支持
- 推荐用于生产环境

### Skwasm

- 需要 WebGPU 支持
- Chrome 119+, Edge 119+
- 实验性，谨慎使用

### 回退策略

```javascript
// 检测浏览器能力
function checkWebGPUSupport() {
  return navigator.gpu !== undefined;
}

// 根据能力选择渲染器
const renderer = checkWebGPUSupport() ? 'skwasm' : 'canvaskit';
```

## 首屏优化

### Deferred Imports

使用 `DeferredRoutePage` 包装器实现路由级 lazy loading：

```dart
import 'features/settings/presentation/profile_page.dart'
    deferred as profile_page;

GoRoute(
  path: 'profile',
  pageBuilder: (context, state) => NoTransitionPage(
    child: DeferredRoutePage(
      loadLibrary: profile_page.loadLibrary,
      builder: () => profile_page.ProfilePage(),
    ),
  ),
),
```

**优势**：
- 首包体积减少 15-30%
- 低频页面按需加载
- 改善首次加载时间

### Loading 指示器

在 `index.html` 中添加 CSS loading 动画：
- 显示品牌 Logo 和加载动画
- Flutter 初始化后自动移除
- 改善用户感知性能

### Service Worker 缓存

- 预缓存应用 shell
- 静态资源 stale-while-revalidate
- API 请求 network-first
- 图片 cache-first

## 验证方式

### 首包大小对比

```bash
# 优化前
flutter build web --release
du -sh build/web/main.dart.js

# 优化后
make prod
du -sh build/web/main.dart.js
```

预期：首包减少 15-30%

### Deferred JS 文件生成

```bash
make prod
ls -lh build/web/part_*.js
```

每个 deferred import 应生成独立的 JS chunk

### 页面跳转测试

手动测试每个 deferred 路由：
1. `/settings/profile`
2. `/settings/ai`
3. `/moments/notifications`
4. `/groups/create`
5. `/contacts/add`

验证：
- 首次访问显示 loading → 加载完成后显示页面
- error 状态下 retry 按钮可用

### 首屏 Loading 测试

1. 清除缓存后首次加载
2. 验证：显示 loading 指示器 → Flutter 初始化后消失
3. 验证：offline 状态下显示 offline banner

### WASM 构建测试

```bash
make wasm
ls -lh build/web/*.wasm
```

## 性能指标

### 首次内容绘制 (FCP)

- 目标：< 1.5s
- 测量：Chrome DevTools Performance

### 最大内容绘制 (LCP)

- 目标：< 2.5s
- 测量：Chrome DevTools Performance

### 首包大小

- 目标：< 2MB (main.dart.js)
- 测量：`du -sh build/web/main.dart.js`

### Deferred Chunks

- 目标：每个 < 200KB
- 测量：`ls -lh build/web/part_*.js`

## 故障排查

### Deferred 加载失败

- 检查网络连接
- 查看浏览器控制台错误
- 验证 JS 文件路径正确

### Loading 指示器不消失

- 检查 `flutter-first-frame` 事件是否触发
- 验证 JS 选择器正确

### WASM 构建失败

- 确认 Flutter 版本 >= 3.22
- 检查浏览器 WebGPU 支持
```

- [ ] **Step 2: 验证文档创建成功**

Run: `cat flutter/docs/flutter-web-performance.md | head -20`
Expected: 文档存在且包含渲染器对比表格

- [ ] **Step 3: Commit**

```bash
git add flutter/docs/flutter-web-performance.md
git commit -m "docs: add Flutter Web performance optimization guide"
```

---

### Task 8: 验证优化效果

**Files:**
- 无新增文件

- [ ] **Step 1: 运行开发构建验证**

```bash
cd flutter/apps/web
make dev
```

Expected: 构建成功，无编译错误

- [ ] **Step 2: 检查 deferred chunks 生成**

```bash
ls -lh build/web/part_*.js
```

Expected: 生成 5 个 part_*.js 文件（对应 5 个 deferred 路由）

- [ ] **Step 3: 运行生产构建**

```bash
make prod
```

Expected: 构建成功，main.dart.js 体积减小

- [ ] **Step 4: 对比首包大小**

```bash
du -sh build/web/main.dart.js
```

Expected: 首包体积减少 15-30%

- [ ] **Step 5: 启动本地服务器测试**

```bash
cd build/web
python -m http.server 8000
```

然后访问 http://localhost:8000 测试：
1. 首屏 loading 指示器显示
2. 页面跳转正常
3. deferred 页面加载正常

- [ ] **Step 6: 最终 Commit**

```bash
git add -A
git commit -m "chore: verify performance optimization results"
```
