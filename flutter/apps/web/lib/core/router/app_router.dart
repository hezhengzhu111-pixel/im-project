import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:im_web/core/di/providers.dart';
import 'package:im_web/core/error/error_notifier.dart';
import 'package:im_web/core/responsive/breakpoints.dart';
import 'package:im_web/core/responsive/mobile_shell.dart';
import 'package:im_web/core/web_meta/page_meta.dart';
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
        meta: {
          'pageMeta': PageMeta(
            title: '登录 - IM',
            description: '安全即时通讯，端到端加密登录',
            canonicalPath: '/login',
            og: OgMeta(title: '登录 - IM', description: '安全即时通讯，端到端加密登录'),
            twitter: TwitterMeta(title: '登录 - IM'),
          ),
        },
        builder: (_, __) => const LoginPage(),
        extra: const RouteMeta(title: '登录', requiresAuth: false, hideForAuth: true),
      ),
      GoRoute(
        path: '/register',
        name: RouteNames.register,
        meta: {
          'pageMeta': PageMeta(
            title: '注册 - IM',
            description: '创建您的 IM 账户',
            canonicalPath: '/register',
            og: OgMeta(title: '注册 - IM', description: '创建您的 IM 账户'),
            twitter: TwitterMeta(title: '注册 - IM'),
          ),
        },
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
            meta: {
              'pageMeta': PageMeta(
                title: '聊天 - IM',
                description: '与好友安全聊天，端到端加密',
                canonicalPath: '/chat',
                og: OgMeta(title: '聊天 - IM', description: '与好友安全聊天，端到端加密'),
                twitter: TwitterMeta(title: '聊天 - IM'),
              ),
            },
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
            meta: {
              'pageMeta': PageMeta(
                title: '通讯录 - IM',
                description: '管理您的联系人',
                canonicalPath: '/contacts',
                og: OgMeta(title: '通讯录 - IM', description: '管理您的联系人'),
                twitter: TwitterMeta(title: '通讯录 - IM'),
              ),
            },
            builder: (_, __) => const ContactsPage(),
            extra: const RouteMeta(title: '联系人'),
          ),
          GoRoute(
            path: '/contacts/add',
            name: RouteNames.contactsAdd,
            meta: {
              'pageMeta': PageMeta(
                title: '添加好友 - IM',
                description: '搜索并添加新朋友',
                canonicalPath: '/contacts/add',
                og: OgMeta(title: '添加好友 - IM', description: '搜索并添加新朋友'),
                twitter: TwitterMeta(title: '添加好友 - IM'),
              ),
            },
            builder: (_, __) => const AddFriendPage(),
            extra: const RouteMeta(title: '添加好友'),
          ),
          GoRoute(
            path: '/groups',
            name: RouteNames.groups,
            meta: {
              'pageMeta': PageMeta(
                title: '群组 - IM',
                description: '管理和加入群组',
                canonicalPath: '/groups',
                og: OgMeta(title: '群组 - IM', description: '管理和加入群组'),
                twitter: TwitterMeta(title: '群组 - IM'),
              ),
            },
            builder: (_, __) => const GroupListPage(),
            extra: const RouteMeta(title: '群组'),
          ),
          GoRoute(
            path: '/groups/create',
            name: RouteNames.groupsCreate,
            meta: {
              'pageMeta': PageMeta(
                title: '创建群组 - IM',
                description: '创建新的群组聊天',
                canonicalPath: '/groups/create',
                og: OgMeta(title: '创建群组 - IM', description: '创建新的群组聊天'),
                twitter: TwitterMeta(title: '创建群组 - IM'),
              ),
            },
            builder: (_, __) => const CreateGroupPage(),
            extra: const RouteMeta(title: '创建群组'),
          ),
          GoRoute(
            path: '/moments',
            name: RouteNames.moments,
            meta: {
              'pageMeta': PageMeta(
                title: '朋友圈 - IM',
                description: '查看好友动态',
                canonicalPath: '/moments',
                og: OgMeta(title: '朋友圈 - IM', description: '查看好友动态'),
                twitter: TwitterMeta(title: '朋友圈 - IM'),
              ),
            },
            builder: (_, __) => const MomentsMainPage(),
            extra: const RouteMeta(title: '朋友圈'),
          ),
          GoRoute(
            path: '/moments/notifications',
            name: RouteNames.momentsNotifications,
            meta: {
              'pageMeta': PageMeta(
                title: '动态通知 - IM',
                description: '查看朋友圈互动通知',
                canonicalPath: '/moments/notifications',
                og: OgMeta(title: '动态通知 - IM', description: '查看朋友圈互动通知'),
                twitter: TwitterMeta(title: '动态通知 - IM'),
              ),
            },
            builder: (_, __) => const MomentsNotificationsPage(),
            extra: const RouteMeta(title: '朋友圈通知'),
          ),
          GoRoute(
            path: '/settings',
            name: RouteNames.settings,
            meta: {
              'pageMeta': PageMeta(
                title: '设置 - IM',
                description: '个性化您的 IM 体验',
                canonicalPath: '/settings',
                og: OgMeta(title: '设置 - IM', description: '个性化您的 IM 体验'),
                twitter: TwitterMeta(title: '设置 - IM'),
              ),
            },
            builder: (_, __) => const SettingsPage(),
            extra: const RouteMeta(title: '设置'),
          ),
          GoRoute(
            path: '/settings/profile',
            name: RouteNames.settingsProfile,
            meta: {
              'pageMeta': PageMeta(
                title: '个人资料 - IM',
                description: '编辑您的个人资料',
                canonicalPath: '/settings/profile',
                og: OgMeta(title: '个人资料 - IM', description: '编辑您的个人资料'),
                twitter: TwitterMeta(title: '个人资料 - IM'),
              ),
            },
            builder: (_, __) => const ProfilePage(),
            extra: const RouteMeta(title: '个人资料'),
          ),
          GoRoute(
            path: '/settings/ai',
            name: RouteNames.settingsAi,
            meta: {
              'pageMeta': PageMeta(
                title: 'AI 设置 - IM',
                description: '配置 AI 助手',
                canonicalPath: '/settings/ai',
                og: OgMeta(title: 'AI 设置 - IM', description: '配置 AI 助手'),
                twitter: TwitterMeta(title: 'AI 设置 - IM'),
              ),
            },
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
