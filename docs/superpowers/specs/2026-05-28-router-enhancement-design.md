# Flutter Web GoRouter 路由增强设计

## 目标

为 `flutter/apps/web` 增强 GoRouter 路由体系，使其达到接近 Vue Router 的工程能力：命名路由、路由 meta、权限守卫、404、深链。

## 当前状态

- `app_router.dart`：简单 GoRouter，只有 auth 重定向
- `auth_provider.dart`：AuthState 有 user/isAuthenticated，无 permissions
- `chat_page.dart`：已接受 `sessionId` 参数，未从路由驱动
- 无路由名常量、无 404 页面、无权限守卫

## 设计决策

| 决策 | 选择 | 理由 |
|------|------|------|
| 权限模型 | 独立 PermissionProvider | 和 AuthState 解耦，灵活扩展 |
| 深链路由 | 独立 /chat/:sessionId | 直接打开对应会话，URL 语义清晰 |
| 滚动恢复 | 页面自行管理 | Flutter Web 无自动恢复机制，简单可靠 |
| 动态导入兜底 | 跳过 | Flutter Web 整包加载，无 chunk 问题 |
| 实现方案 | 方案 A：最小增强 | 改动小，渐进式，保持现有结构 |

## 新增文件

```
flutter/apps/web/lib/core/router/
├── app_router.dart          # 增强：meta 守卫、404、命名路由
├── route_meta.dart          # 新增：RouteMeta 数据类
├── route_names.dart         # 新增：路由名常量
├── route_observer.dart      # 新增：RouteObserver 预留
├── permission_provider.dart # 新增：独立权限 Provider
└── not_found_page.dart      # 新增：404 页面
```

## 1. RouteMeta & RouteNames

### route_meta.dart

```dart
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

### route_names.dart

```dart
class RouteNames {
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

每个 GoRoute 通过 `extra: RouteMeta(...)` 附加元数据。

## 2. PermissionProvider

### permission_provider.dart

```dart
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
```

### PermissionApi

```dart
abstract class PermissionApi {
  Future<List<String>> fetchPermissions();
}

class PermissionApiImpl implements PermissionApi {
  // 从后端 API 获取用户权限列表
  // 暂时返回空列表，后续接入真实 API
}
```

登录成功后调用 `ref.read(permissionProvider.notifier).loadPermissions()`。

## 3. 增强 Redirect 守卫

```dart
redirect: (context, state) {
  final isAuth = authState.isAuthenticated;
  final meta = state.extra as RouteMeta?;

  // 无 meta 的路由（如 404）直接放行
  if (meta == null) return null;

  // hideForAuth: 已登录访问 /login /register → /chat
  if (meta.hideForAuth && isAuth) return '/chat';

  // requiresAuth: 未登录访问业务页 → /login?redirect=xxx
  if (meta.requiresAuth && !isAuth) {
    return '/login?redirect=${Uri.encodeComponent(state.uri.toString())}';
  }

  // permission: 有权限要求但用户无权限 → /chat
  if (meta.permission != null) {
    final hasPerm = ref.read(permissionProvider).hasPermission(meta.permission!);
    if (!hasPerm) return '/chat';
  }

  return null;
},
```

关键行为：
- `hideForAuth`：已登录用户访问 /login、/register 自动跳 /chat
- `requiresAuth`：未登录用户访问业务页跳 /login?redirect=xxx
- `permission`：权限不足重定向到 /chat（不暴露 403 页面）
- 无 meta 的路由直接放行（404 兜底）

## 4. 404 兜底 & RouteObserver

### 404 路由

```dart
GoRoute(
  path: '/:pathMatch(.*)*',
  name: RouteNames.notFound,
  builder: (_, __) => const NotFoundPage(),
  extra: const RouteMeta(title: '页面未找到', requiresAuth: false),
),
```

放在路由列表最后，通配符匹配所有未定义路由。

### NotFoundPage

简洁的 404 页面：
- 居中显示 "404"
- "页面不存在" 提示文字
- "返回首页" 按钮

### RouteObserver

```dart
final routeObserver = RouteObserver<ModalRoute<void>>();
```

在 `MaterialApp.router` 的 `observers` 中注册，预留未来扩展（analytics、错误上报）。

## 5. /chat/:sessionId 深链

### 路由定义

```dart
GoRoute(
  path: '/chat/:sessionId',
  name: RouteNames.chatSession,
  builder: (_, state) {
    final sessionId = state.pathParameters['sessionId']!;
    return ChatPage(sessionId: sessionId);
  },
  extra: const RouteMeta(title: '聊天', requiresAuth: true),
),
```

### ChatPage 改动

在 `initState` 中添加：

```dart
@override
void initState() {
  super.initState();
  WidgetsBinding.instance.addPostFrameCallback((_) {
    ref.read(chatStateProvider.notifier).loadSessions();
    // 从路由参数设置活跃会话
    if (widget.sessionId != null) {
      ref.read(chatStateProvider.notifier).setActiveSession(widget.sessionId);
    }
  });
}
```

### 导航方式

```dart
// 深链直接打开
context.go('/chat/abc123');

// 命名路由导航
context.goNamed(RouteNames.chatSession, pathParameters: {'sessionId': 'abc123'});
```

## 6. 完整路由表

```dart
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
  // 404 兜底 - 必须放在最后
  GoRoute(
    path: '/:pathMatch(.*)*',
    name: RouteNames.notFound,
    builder: (_, __) => const NotFoundPage(),
    extra: const RouteMeta(title: '页面未找到', requiresAuth: false),
  ),
],
```

## 7. 测试计划

| 测试场景 | 验证点 |
|----------|--------|
| 路由重定向 | 未登录访问 /chat → /login；已登录访问 /login → /chat |
| redirect 回跳 | /login?redirect=/chat 登录后跳回 /chat |
| 权限拦截 | 无权限访问需要 permission 的路由 → /chat |
| 404 兜底 | 访问 /unknown → NotFoundPage |
| 深链 | /chat/abc123 → ChatPage(sessionId: 'abc123') |
| 命名路由 | context.goNamed(RouteNames.chat) 正确导航 |
| hideForAuth | 已登录访问 /register → /chat |

## 8. 不改动的部分

- 业务页面组件（ChatPage、ContactsPage 等）- 仅 ChatPage 添加 sessionId 初始化
- AuthState 结构 - 权限独立管理
- ShellRoute 布局结构 - 保持不变
- 现有 Riverpod Provider - 新增 permissionProvider

## 9. 未来扩展

- RouteObserver 用于页面级 analytics
- PermissionApi 接入真实后端 API
- 路由级错误边界（ErrorWidget）
- 路由过渡动画
