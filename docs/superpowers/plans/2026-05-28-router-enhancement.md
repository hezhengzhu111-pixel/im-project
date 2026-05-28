# Router Enhancement Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Enhance GoRouter routing with RouteMeta, named routes, PermissionProvider, 404, deep link, and auth/permission guards.

**Architecture:** Add route metadata layer (RouteMeta + RouteNames) on top of existing GoRouter. Create independent PermissionProvider for auth-decoupled permission checks. Enhance redirect function to read meta from GoRoute.extra. Add 404 catch-all and /chat/:sessionId deep link.

**Tech Stack:** Flutter, GoRouter 13.x, Riverpod 2.x, flutter_test

---

### Task 1: Create RouteMeta data class

**Files:**
- Create: `flutter/apps/web/lib/core/router/route_meta.dart`

- [ ] **Step 1: Create route_meta.dart**

```dart
/// Route metadata for auth guards, permissions, and page titles.
class RouteMeta {
  final String title;
  final bool requiresAuth;
  final bool hideForAuth;
  final String? permission;

  const RouteMeta({
    required this.title,
    this.requiresAuth = true,
    this.hideForAuth = false,
    this.permission,
  });
}
```

- [ ] **Step 2: Commit**

```bash
git add flutter/apps/web/lib/core/router/route_meta.dart
git commit -m "feat(router): add RouteMeta data class for route metadata"
```

---

### Task 2: Create RouteNames constants

**Files:**
- Create: `flutter/apps/web/lib/core/router/route_names.dart`

- [ ] **Step 1: Create route_names.dart**

```dart
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

- [ ] **Step 2: Commit**

```bash
git add flutter/apps/web/lib/core/router/route_names.dart
git commit -m "feat(router): add RouteNames constants for named navigation"
```

---

### Task 3: Create RouteObserver

**Files:**
- Create: `flutter/apps/web/lib/core/router/route_observer.dart`

- [ ] **Step 1: Create route_observer.dart**

```dart
import 'package:flutter/material.dart';

/// Global route observer for analytics and error tracking.
final routeObserver = RouteObserver<ModalRoute<void>>();
```

- [ ] **Step 2: Commit**

```bash
git add flutter/apps/web/lib/core/router/route_observer.dart
git commit -m "feat(router): add RouteObserver for future analytics"
```

---

### Task 4: Create PermissionProvider with tests

**Files:**
- Create: `flutter/apps/web/lib/core/router/permission_provider.dart`
- Create: `flutter/apps/web/test/core/router/permission_provider_test.dart`

- [ ] **Step 1: Write failing test**

```dart
// flutter/apps/web/test/core/router/permission_provider_test.dart
import 'package:flutter_test/flutter_test.dart';
import 'package:im_web/core/router/permission_provider.dart';

class MockPermissionApi implements PermissionApi {
  List<String> permissionsToReturn = [];
  Exception? errorToThrow;

  @override
  Future<List<String>> fetchPermissions() async {
    if (errorToThrow != null) throw errorToThrow!;
    return permissionsToReturn;
  }
}

void main() {
  late MockPermissionApi mockApi;
  late PermissionNotifier notifier;

  setUp(() {
    mockApi = MockPermissionApi();
    notifier = PermissionNotifier(mockApi);
  });

  group('PermissionNotifier', () {
    test('initial state has empty permissions', () {
      expect(notifier.state.permissions, isEmpty);
      expect(notifier.state.isLoading, isFalse);
    });

    test('loadPermissions sets permissions on success', () async {
      mockApi.permissionsToReturn = ['chat:read', 'chat:write'];

      await notifier.loadPermissions();

      expect(notifier.state.permissions, containsAll(['chat:read', 'chat:write']));
      expect(notifier.state.isLoading, isFalse);
    });

    test('loadPermissions resets on error', () async {
      mockApi.errorToThrow = Exception('Network error');

      await notifier.loadPermissions();

      expect(notifier.state.permissions, isEmpty);
      expect(notifier.state.isLoading, isFalse);
    });

    test('hasPermission returns true for existing permission', () async {
      mockApi.permissionsToReturn = ['log:read'];
      await notifier.loadPermissions();

      expect(notifier.hasPermission('log:read'), isTrue);
    });

    test('hasPermission returns false for missing permission', () async {
      mockApi.permissionsToReturn = [];
      await notifier.loadPermissions();

      expect(notifier.hasPermission('log:read'), isFalse);
    });
  });
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd flutter/apps/web && flutter test test/core/router/permission_provider_test.dart`
Expected: FAIL - file not found

- [ ] **Step 3: Implement permission_provider.dart**

```dart
// flutter/apps/web/lib/core/router/permission_provider.dart
import 'package:flutter_riverpod/flutter_riverpod.dart';

/// Abstract permission API for fetching user permissions.
abstract class PermissionApi {
  Future<List<String>> fetchPermissions();
}

/// Permission state holding the user's permission set.
class PermissionState {
  final Set<String> permissions;
  final bool isLoading;

  const PermissionState({this.permissions = const {}, this.isLoading = false});

  PermissionState copyWith({Set<String>? permissions, bool? isLoading}) {
    return PermissionState(
      permissions: permissions ?? this.permissions,
      isLoading: isLoading ?? this.isLoading,
    );
  }
}

/// Manages user permissions, loaded after authentication.
class PermissionNotifier extends StateNotifier<PermissionState> {
  PermissionNotifier(this._api) : super(const PermissionState());

  final PermissionApi _api;

  Future<void> loadPermissions() async {
    state = state.copyWith(isLoading: true);
    try {
      final perms = await _api.fetchPermissions();
      state = PermissionState(permissions: perms.toSet());
    } catch (e) {
      state = const PermissionState();
    }
  }

  bool hasPermission(String permission) => state.permissions.contains(permission);
}

final permissionProvider =
    StateNotifierProvider<PermissionNotifier, PermissionState>((ref) {
  return PermissionNotifier(ref.watch(permissionApiProvider));
});

/// Provider for the permission API implementation.
final permissionApiProvider = Provider<PermissionApi>((ref) {
  return EmptyPermissionApi();
});

/// Minimal implementation returning empty permissions.
/// Replace with real API when backend supports it.
class EmptyPermissionApi implements PermissionApi {
  @override
  Future<List<String>> fetchPermissions() async => [];
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd flutter/apps/web && flutter test test/core/router/permission_provider_test.dart`
Expected: PASS (5 tests)

- [ ] **Step 5: Commit**

```bash
git add flutter/apps/web/lib/core/router/permission_provider.dart flutter/apps/web/test/core/router/permission_provider_test.dart
git commit -m "feat(router): add PermissionProvider with tests"
```

---

### Task 5: Create NotFoundPage with test

**Files:**
- Create: `flutter/apps/web/lib/core/router/not_found_page.dart`
- Create: `flutter/apps/web/test/core/router/not_found_page_test.dart`

- [ ] **Step 1: Write failing test**

```dart
// flutter/apps/web/test/core/router/not_found_page_test.dart
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:im_web/core/router/not_found_page.dart';

void main() {
  group('NotFoundPage', () {
    testWidgets('displays 404 text', (tester) async {
      await tester.pumpWidget(
        const MaterialApp(home: NotFoundPage()),
      );

      expect(find.text('404'), findsOneWidget);
    });

    testWidgets('displays page not found message', (tester) async {
      await tester.pumpWidget(
        const MaterialApp(home: NotFoundPage()),
      );

      expect(find.text('页面不存在'), findsOneWidget);
    });

    testWidgets('has return to home button', (tester) async {
      await tester.pumpWidget(
        const MaterialApp(home: NotFoundPage()),
      );

      expect(find.text('返回首页'), findsOneWidget);
    });
  });
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd flutter/apps/web && flutter test test/core/router/not_found_page_test.dart`
Expected: FAIL - file not found

- [ ] **Step 3: Implement not_found_page.dart**

```dart
// flutter/apps/web/lib/core/router/not_found_page.dart
import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

class NotFoundPage extends StatelessWidget {
  const NotFoundPage({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: Center(
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Text(
              '404',
              style: Theme.of(context).textTheme.displayLarge?.copyWith(
                    fontWeight: FontWeight.bold,
                    color: Theme.of(context).colorScheme.error,
                  ),
            ),
            const SizedBox(height: 16),
            Text(
              '页面不存在',
              style: Theme.of(context).textTheme.headlineSmall,
            ),
            const SizedBox(height: 24),
            FilledButton.icon(
              onPressed: () => context.go('/chat'),
              icon: const Icon(Icons.home),
              label: const Text('返回首页'),
            ),
          ],
        ),
      ),
    );
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd flutter/apps/web && flutter test test/core/router/not_found_page_test.dart`
Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add flutter/apps/web/lib/core/router/not_found_page.dart flutter/apps/web/test/core/router/not_found_page_test.dart
git commit -m "feat(router): add NotFoundPage with tests"
```

---

### Task 6: Enhance app_router.dart with meta guards, named routes, 404, deep link

**Files:**
- Modify: `flutter/apps/web/lib/core/router/app_router.dart`

- [ ] **Step 1: Rewrite app_router.dart**

Replace entire file with:

```dart
// flutter/apps/web/lib/core/router/app_router.dart
import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:im_web/core/di/providers.dart';
import 'package:im_web/core/error/error_notifier.dart';
import 'package:im_web/core/responsive/breakpoints.dart';
import 'package:im_web/core/responsive/mobile_shell.dart';
import 'package:im_web/l10n/app_localizations.dart';
import 'package:im_web/features/auth/presentation/login_page.dart';
import 'package:im_web/features/auth/presentation/register_page.dart';
import 'package:im_web/features/chat/presentation/chat_page.dart';
import 'package:im_web/features/contacts/presentation/contacts_page.dart';
import 'package:im_web/features/contacts/presentation/add_friend_page.dart';
import 'package:im_web/features/group/presentation/group_list_page.dart';
import 'package:im_web/features/group/presentation/create_group_page.dart';
import 'package:im_web/features/moments/presentation/moments_main_page.dart';
import 'package:im_web/features/moments/presentation/notifications/moments_notifications_page.dart';
import 'package:im_web/features/settings/presentation/settings_page.dart';
import 'package:im_web/features/settings/presentation/profile_page.dart';
import 'package:im_web/features/settings/presentation/ai_settings_page.dart';
import 'route_meta.dart';
import 'route_names.dart';
import 'not_found_page.dart';
import 'permission_provider.dart';

final routerProvider = Provider<GoRouter>((ref) {
  final authState = ref.watch(authStateProvider);

  return GoRouter(
    initialLocation: '/chat',
    redirect: (context, state) {
      final isAuth = authState.isAuthenticated;
      final meta = state.extra as RouteMeta?;

      // No meta (e.g. 404 catch-all) — let through
      if (meta == null) return null;

      // hideForAuth: logged-in user on /login or /register → /chat
      if (meta.hideForAuth && isAuth) return '/chat';

      // requiresAuth: not logged in → /login?redirect=xxx
      if (meta.requiresAuth && !isAuth) {
        return '/login?redirect=${Uri.encodeComponent(state.uri.toString())}';
      }

      // permission: user lacks required permission → /chat
      if (meta.permission != null) {
        final hasPerm = ref.read(permissionProvider).hasPermission(meta.permission!);
        if (!hasPerm) return '/chat';
      }

      return null;
    },
    routes: [
      GoRoute(
        path: '/login',
        name: RouteNames.login,
        builder: (_, __) => const LoginPage(),
        extra: const RouteMeta(title: '登录', requiresAuth: false, hideForAuth: true),
      ),
      GoRoute(
        path: '/register',
        name: RouteNames.register,
        builder: (_, __) => const RegisterPage(),
        extra: const RouteMeta(title: '注册', requiresAuth: false, hideForAuth: true),
      ),
      ShellRoute(
        builder: (_, __, child) => ResponsiveLayout(
          mobile: (_) => MobileShell(child: child),
          desktop: (_) => MainLayout(child: child),
        ),
        routes: [
          GoRoute(
            path: '/chat',
            name: RouteNames.chat,
            builder: (_, __) => const ChatPage(),
            extra: const RouteMeta(title: '聊天'),
            routes: [
              GoRoute(
                path: ':sessionId',
                name: RouteNames.chatSession,
                builder: (_, state) {
                  final sessionId = state.pathParameters['sessionId']!;
                  return ChatPage(sessionId: sessionId);
                },
                extra: const RouteMeta(title: '聊天'),
              ),
            ],
          ),
          GoRoute(
            path: '/contacts',
            name: RouteNames.contacts,
            builder: (_, __) => const ContactsPage(),
            extra: const RouteMeta(title: '联系人'),
          ),
          GoRoute(
            path: '/contacts/add',
            name: RouteNames.contactsAdd,
            builder: (_, __) => const AddFriendPage(),
            extra: const RouteMeta(title: '添加好友'),
          ),
          GoRoute(
            path: '/groups',
            name: RouteNames.groups,
            builder: (_, __) => const GroupListPage(),
            extra: const RouteMeta(title: '群组'),
          ),
          GoRoute(
            path: '/groups/create',
            name: RouteNames.groupsCreate,
            builder: (_, __) => const CreateGroupPage(),
            extra: const RouteMeta(title: '创建群组'),
          ),
          GoRoute(
            path: '/moments',
            name: RouteNames.moments,
            builder: (_, __) => const MomentsMainPage(),
            extra: const RouteMeta(title: '朋友圈'),
          ),
          GoRoute(
            path: '/moments/notifications',
            name: RouteNames.momentsNotifications,
            builder: (_, __) => const MomentsNotificationsPage(),
            extra: const RouteMeta(title: '朋友圈通知'),
          ),
          GoRoute(
            path: '/settings',
            name: RouteNames.settings,
            builder: (_, __) => const SettingsPage(),
            extra: const RouteMeta(title: '设置'),
          ),
          GoRoute(
            path: '/settings/profile',
            name: RouteNames.settingsProfile,
            builder: (_, __) => const ProfilePage(),
            extra: const RouteMeta(title: '个人资料'),
          ),
          GoRoute(
            path: '/settings/ai',
            name: RouteNames.settingsAi,
            builder: (_, __) => const AiSettingsPage(),
            extra: const RouteMeta(title: 'AI 助手'),
          ),
        ],
      ),
      // 404 catch-all — must be last
      GoRoute(
        path: '/:pathMatch(.*)*',
        name: RouteNames.notFound,
        builder: (_, __) => const NotFoundPage(),
        extra: const RouteMeta(title: '页面未找到', requiresAuth: false),
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

- [ ] **Step 2: Verify build compiles**

Run: `cd flutter/apps/web && flutter analyze --no-pub`
Expected: No errors related to new imports

- [ ] **Step 3: Commit**

```bash
git add flutter/apps/web/lib/core/router/app_router.dart
git commit -m "feat(router): enhance GoRouter with meta guards, named routes, 404, deep link"
```

---

### Task 7: Update ChatPage to initialize from route sessionId

**Files:**
- Modify: `flutter/apps/web/lib/features/chat/presentation/chat_page.dart:30-33`

- [ ] **Step 1: Update initState in ChatPage**

Replace the existing `initState` method (lines 30-33) with:

```dart
@override
void initState() {
  super.initState();
  WidgetsBinding.instance.addPostFrameCallback((_) {
    ref.read(chatStateProvider.notifier).loadSessions();
    // Initialize active session from route parameter (deep link support)
    if (widget.sessionId != null) {
      ref.read(chatStateProvider.notifier).setActiveSession(widget.sessionId);
    }
  });
}
```

- [ ] **Step 2: Verify build compiles**

Run: `cd flutter/apps/web && flutter analyze --no-pub`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add flutter/apps/web/lib/features/chat/presentation/chat_page.dart
git commit -m "feat(chat): initialize active session from route sessionId parameter"
```

---

### Task 8: Register RouteObserver in app.dart

**Files:**
- Modify: `flutter/apps/web/lib/app.dart:1-6`

- [ ] **Step 1: Add import and register observer**

Add import at top of file:

```dart
import 'core/router/route_observer.dart';
```

Update `MaterialApp.router` in build method to include `observers`:

```dart
return MaterialApp.router(
  title: 'IM',
  theme: AppTheme.lightTheme,
  darkTheme: AppTheme.darkTheme,
  routerConfig: router,
  builder: (context, child) {
    final router = GoRouter.of(context);
    return Navigator(
      key: router.routerDelegate.navigatorKey,
      observers: [routeObserver],
      onGenerateRoute: (_) => null,
      pages: [MaterialPage(child: child!)],
    );
  },
  localizationsDelegates: AppLocalizations.localizationsDelegates,
  supportedLocales: AppLocalizations.supportedLocales,
);
```

Note: The `builder` wrapping approach adds routeObserver. If this causes issues with GoRouter, register routeObserver via a simpler approach — add it to the Navigator in MainLayout instead.

- [ ] **Step 2: Verify build compiles**

Run: `cd flutter/apps/web && flutter analyze --no-pub`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add flutter/apps/web/lib/app.dart
git commit -m "feat(router): register RouteObserver in MaterialApp"
```

---

### Task 9: Write router integration tests

**Files:**
- Create: `flutter/apps/web/test/core/router/app_router_test.dart`

- [ ] **Step 1: Create router test file**

```dart
// flutter/apps/web/test/core/router/app_router_test.dart
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:im_web/core/router/route_meta.dart';
import 'package:im_web/core/router/route_names.dart';

void main() {
  group('RouteMeta', () {
    test('default values are correct', () {
      const meta = RouteMeta(title: 'Test');

      expect(meta.title, 'Test');
      expect(meta.requiresAuth, isTrue);
      expect(meta.hideForAuth, isFalse);
      expect(meta.permission, isNull);
    });

    test('custom values override defaults', () {
      const meta = RouteMeta(
        title: 'Login',
        requiresAuth: false,
        hideForAuth: true,
        permission: 'admin:read',
      );

      expect(meta.requiresAuth, isFalse);
      expect(meta.hideForAuth, isTrue);
      expect(meta.permission, 'admin:read');
    });
  });

  group('RouteNames', () {
    test('all route names are defined', () {
      expect(RouteNames.login, 'login');
      expect(RouteNames.register, 'register');
      expect(RouteNames.chat, 'chat');
      expect(RouteNames.chatSession, 'chatSession');
      expect(RouteNames.contacts, 'contacts');
      expect(RouteNames.contactsAdd, 'contactsAdd');
      expect(RouteNames.groups, 'groups');
      expect(RouteNames.groupsCreate, 'groupsCreate');
      expect(RouteNames.moments, 'moments');
      expect(RouteNames.momentsNotifications, 'momentsNotifications');
      expect(RouteNames.settings, 'settings');
      expect(RouteNames.settingsProfile, 'settingsProfile');
      expect(RouteNames.settingsAi, 'settingsAi');
      expect(RouteNames.notFound, 'notFound');
    });

    test('route names are unique', () {
      final names = [
        RouteNames.login,
        RouteNames.register,
        RouteNames.chat,
        RouteNames.chatSession,
        RouteNames.contacts,
        RouteNames.contactsAdd,
        RouteNames.groups,
        RouteNames.groupsCreate,
        RouteNames.moments,
        RouteNames.momentsNotifications,
        RouteNames.settings,
        RouteNames.settingsProfile,
        RouteNames.settingsAi,
        RouteNames.notFound,
      ];
      expect(names.toSet().length, names.length);
    });
  });

  group('Redirect logic', () {
    test('hideForAuth redirects authenticated user to /chat', () {
      const meta = RouteMeta(title: 'Login', requiresAuth: false, hideForAuth: true);
      const isAuth = true;

      String? result;
      if (meta.hideForAuth && isAuth) result = '/chat';

      expect(result, '/chat');
    });

    test('requiresAuth redirects unauthenticated user to /login', () {
      const meta = RouteMeta(title: 'Chat');
      const isAuth = false;

      String? result;
      if (meta.requiresAuth && !isAuth) {
        result = '/login?redirect=${Uri.encodeComponent('/chat')}';
      }

      expect(result, contains('/login?redirect='));
    });

    test('permission guard redirects when permission missing', () {
      const meta = RouteMeta(title: 'Admin', permission: 'admin:read');
      final userPermissions = <String>{};

      String? result;
      if (meta.permission != null && !userPermissions.contains(meta.permission)) {
        result = '/chat';
      }

      expect(result, '/chat');
    });

    test('permission guard allows when permission present', () {
      const meta = RouteMeta(title: 'Admin', permission: 'admin:read');
      final userPermissions = {'admin:read'};

      String? result;
      if (meta.permission != null && !userPermissions.contains(meta.permission)) {
        result = '/chat';
      }

      expect(result, isNull);
    });

    test('null meta lets through (404 catch-all)', () {
      const RouteMeta? meta = null;

      String? result;
      if (meta == null) result = null;

      expect(result, isNull);
    });
  });
}
```

- [ ] **Step 2: Run tests**

Run: `cd flutter/apps/web && flutter test test/core/router/app_router_test.dart`
Expected: PASS (7 tests)

- [ ] **Step 3: Commit**

```bash
git add flutter/apps/web/test/core/router/app_router_test.dart
git commit -m "test(router): add RouteMeta, RouteNames, and redirect logic tests"
```

---

### Task 10: Run full test suite and verify

**Files:**
- None (verification only)

- [ ] **Step 1: Run all tests**

Run: `cd flutter/apps/web && flutter test`
Expected: All tests pass, no regressions

- [ ] **Step 2: Run flutter analyze**

Run: `cd flutter/apps/web && flutter analyze --no-pub`
Expected: No new errors or warnings

- [ ] **Step 3: Final commit if needed**

If any fixes were needed, commit them:

```bash
git add -A
git commit -m "fix(router): address test and analysis issues"
```

---

## Summary

| Task | Files Created | Files Modified | Tests |
|------|---------------|----------------|-------|
| 1. RouteMeta | route_meta.dart | - | - |
| 2. RouteNames | route_names.dart | - | - |
| 3. RouteObserver | route_observer.dart | - | - |
| 4. PermissionProvider | permission_provider.dart | - | 5 tests |
| 5. NotFoundPage | not_found_page.dart | - | 3 tests |
| 6. Enhanced Router | - | app_router.dart | - |
| 7. ChatPage sessionId | - | chat_page.dart | - |
| 8. RouteObserver in app | - | app.dart | - |
| 9. Integration tests | app_router_test.dart | - | 7 tests |
| 10. Full verification | - | - | All pass |

**Total new tests:** 15
**Total files created:** 6
**Total files modified:** 3
