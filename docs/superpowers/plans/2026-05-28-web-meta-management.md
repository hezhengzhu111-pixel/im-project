# Web Meta Management Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add route-level HTML meta tag management for Flutter Web, similar to Nuxt/vue-meta.

**Architecture:** GoRoute.meta carries PageMeta objects; a WebMetaService listens to route changes via Riverpod and updates document.title and meta tags via package:web. All DOM code isolated to `core/web_meta/`.

**Tech Stack:** Flutter Web, GoRouter, Riverpod, package:web

---

### Task 1: Add package:web dependency

**Files:**
- Modify: `flutter/apps/web/pubspec.yaml`

- [ ] **Step 1: Add package:web to dependencies**

In `flutter/apps/web/pubspec.yaml`, add `web: ^1.0.0` under dependencies:

```yaml
dependencies:
  flutter:
    sdk: flutter
  flutter_localizations:
    sdk: flutter
  im_core:
    path: ../../packages/core
  im_ui:
    path: ../../packages/ui
  flutter_riverpod: ^2.4.9
  go_router: ^13.0.0
  dio: ^5.4.0
  web_socket_channel: ^2.4.0
  flutter_secure_storage: ^9.0.0
  freezed_annotation: ^2.4.1
  json_annotation: ^4.8.1
  intl: ^0.19.0
  google_fonts: ^6.1.0
  idb_shim: ^2.6.1+7
  crypto: ^3.0.6
  file_picker: ^6.1.1
  web: ^1.0.0
```

- [ ] **Step 2: Run flutter pub get**

Run: `cd flutter/apps/web && flutter pub get`
Expected: Resolution succeeds, `web` package installed

- [ ] **Step 3: Commit**

```bash
cd D:/project/new-im-project
git add flutter/apps/web/pubspec.yaml flutter/apps/web/pubspec.lock
git commit -m "chore(deps): add package:web for DOM access"
```

---

### Task 2: Create PageMeta data class

**Files:**
- Create: `flutter/apps/web/lib/core/web_meta/page_meta.dart`
- Test: `flutter/apps/web/test/core/web_meta/page_meta_test.dart`

- [ ] **Step 1: Write the failing test**

Create `flutter/apps/web/test/core/web_meta/page_meta_test.dart`:

```dart
import 'package:flutter_test/flutter_test.dart';
import 'package:im_web/core/web_meta/page_meta.dart';

void main() {
  group('PageMeta', () {
    test('constructs with required fields', () {
      const meta = PageMeta(title: 'Test Title', description: 'Test Desc');
      expect(meta.title, 'Test Title');
      expect(meta.description, 'Test Desc');
      expect(meta.canonicalPath, isNull);
      expect(meta.og, isNull);
      expect(meta.twitter, isNull);
    });

    test('constructs with all fields', () {
      const og = OgMeta(
        title: 'OG Title',
        description: 'OG Desc',
        image: 'https://example.com/image.png',
        type: 'article',
      );
      const twitter = TwitterMeta(
        card: 'summary_large_image',
        title: 'Twitter Title',
        description: 'Twitter Desc',
        image: 'https://example.com/tw.png',
      );
      const meta = PageMeta(
        title: 'Title',
        description: 'Desc',
        canonicalPath: '/test',
        og: og,
        twitter: twitter,
      );
      expect(meta.canonicalPath, '/test');
      expect(meta.og?.type, 'article');
      expect(meta.twitter?.card, 'summary_large_image');
    });
  });

  group('OgMeta', () {
    test('constructs with no fields', () {
      const og = OgMeta();
      expect(og.title, isNull);
      expect(og.description, isNull);
      expect(og.image, isNull);
      expect(og.type, isNull);
    });
  });

  group('TwitterMeta', () {
    test('constructs with no fields', () {
      const twitter = TwitterMeta();
      expect(twitter.card, isNull);
      expect(twitter.title, isNull);
      expect(twitter.description, isNull);
      expect(twitter.image, isNull);
    });
  });
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd flutter/apps/web && flutter test test/core/web_meta/page_meta_test.dart`
Expected: FAIL — import error (file doesn't exist yet)

- [ ] **Step 3: Write PageMeta implementation**

Create `flutter/apps/web/lib/core/web_meta/page_meta.dart`:

```dart
class PageMeta {
  final String title;
  final String description;
  final String? canonicalPath;
  final OgMeta? og;
  final TwitterMeta? twitter;

  const PageMeta({
    required this.title,
    required this.description,
    this.canonicalPath,
    this.og,
    this.twitter,
  });
}

class OgMeta {
  final String? title;
  final String? description;
  final String? image;
  final String? type;

  const OgMeta({this.title, this.description, this.image, this.type});
}

class TwitterMeta {
  final String? card;
  final String? title;
  final String? description;
  final String? image;

  const TwitterMeta({this.card, this.title, this.description, this.image});
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd flutter/apps/web && flutter test test/core/web_meta/page_meta_test.dart`
Expected: PASS (all 3 groups, 3 tests)

- [ ] **Step 5: Commit**

```bash
cd D:/project/new-im-project
git add flutter/apps/web/lib/core/web_meta/page_meta.dart flutter/apps/web/test/core/web_meta/page_meta_test.dart
git commit -m "feat(web_meta): add PageMeta data class with unit tests"
```

---

### Task 3: Create WebMetaService

**Files:**
- Create: `flutter/apps/web/lib/core/web_meta/web_meta_service.dart`

- [ ] **Step 1: Create the service**

Create `flutter/apps/web/lib/core/web_meta/web_meta_service.dart`:

```dart
import 'package:flutter/foundation.dart';
import 'page_meta.dart';

// package:web is only available on web platform.
// We use conditional imports to keep this testable.
import 'web_meta_service_stub.dart'
    if (dart.library.js_interop) 'web_meta_service_web.dart';

abstract class WebMetaService {
  void apply(PageMeta meta);
}

WebMetaService createWebMetaService() {
  if (kIsWeb) {
    return WebMetaServiceImpl();
  }
  return NoOpWebMetaService();
}
```

- [ ] **Step 2: Create the stub implementation**

Create `flutter/apps/web/lib/core/web_meta/web_meta_service_stub.dart`:

```dart
import 'page_meta.dart';
import 'web_meta_service.dart';

class NoOpWebMetaService implements WebMetaService {
  @override
  void apply(PageMeta meta) {}
}
```

- [ ] **Step 3: Create the web implementation**

Create `flutter/apps/web/lib/core/web_meta/web_meta_service_web.dart`:

```dart
import 'package:web/web.dart' as web;
import 'page_meta.dart';
import 'web_meta_service.dart';

class WebMetaServiceImpl implements WebMetaService {
  static const _baseUrl = 'http://localhost:3000';

  @override
  void apply(PageMeta meta) {
    _setTitle(meta.title);
    _setMeta('description', meta.description);
    _setCanonical(meta.canonicalPath);
    _setOg(meta);
    _setTwitter(meta);
  }

  void _setTitle(String title) {
    web.document.title = title;
  }

  void _setMeta(String name, String content) {
    final existing = web.document.querySelector('meta[name="$name"]');
    if (existing != null) {
      existing.setAttribute('content', content);
    } else {
      final el = web.document.createElement('meta') as web.HTMLMetaElement;
      el.name = name;
      el.content = content;
      web.document.head?.appendChild(el);
    }
  }

  void _setCanonical(String? path) {
    final href = path != null ? '$_baseUrl$path' : '$_baseUrl/';
    final existing = web.document.querySelector('link[rel="canonical"]');
    if (existing != null) {
      existing.setAttribute('href', href);
    } else {
      final el = web.document.createElement('link') as web.HTMLLinkElement;
      el.rel = 'canonical';
      el.href = href;
      web.document.head?.appendChild(el);
    }
  }

  void _setOg(PageMeta meta) {
    final og = meta.og;
    final ogTitle = og?.title ?? meta.title;
    final ogDesc = og?.description ?? meta.description;
    final ogType = og?.type ?? 'website';
    final ogUrl = '${_baseUrl}${meta.canonicalPath ?? '/'}';

    _setProperty('og:title', ogTitle);
    _setProperty('og:description', ogDesc);
    _setProperty('og:type', ogType);
    _setProperty('og:url', ogUrl);

    if (og?.image != null) {
      _setProperty('og:image', og!.image!);
    }
  }

  void _setTwitter(PageMeta meta) {
    final twitter = meta.twitter;
    final twCard = twitter?.card ?? 'summary';
    final twTitle = twitter?.title ?? meta.title;
    final twDesc = twitter?.description ?? meta.description;

    _setMeta('twitter:card', twCard);
    _setMeta('twitter:title', twTitle);
    _setMeta('twitter:description', twDesc);

    if (twitter?.image != null) {
      _setMeta('twitter:image', twitter!.image!);
    }
  }

  void _setProperty(String property, String content) {
    final selector = 'meta[property="$property"]';
    final existing = web.document.querySelector(selector);
    if (existing != null) {
      existing.setAttribute('content', content);
    } else {
      final el = web.document.createElement('meta') as web.HTMLMetaElement;
      el.setAttribute('property', property);
      el.content = content;
      web.document.head?.appendChild(el);
    }
  }
}
```

- [ ] **Step 4: Commit**

```bash
cd D:/project/new-im-project
git add flutter/apps/web/lib/core/web_meta/
git commit -m "feat(web_meta): add WebMetaService with conditional web/stub impl"
```

---

### Task 4: Create default meta definitions

**Files:**
- Create: `flutter/apps/web/lib/core/web_meta/web_meta_defaults.dart`

- [ ] **Step 1: Create defaults file**

Create `flutter/apps/web/lib/core/web_meta/web_meta_defaults.dart`:

```dart
import 'page_meta.dart';

const appFallbackMeta = PageMeta(
  title: 'IM - 安全即时通讯',
  description:
      'IM 是一款安全即时通讯应用，支持端到端加密、群组聊天、朋友圈等功能',
  canonicalPath: '/',
  og: OgMeta(
    title: 'IM - 安全即时通讯',
    description:
        'IM 是一款安全即时通讯应用，支持端到端加密、群组聊天、朋友圈等功能',
    type: 'website',
  ),
  twitter: TwitterMeta(
    card: 'summary',
    title: 'IM - 安全即时通讯',
  ),
);

const routeMetaMap = <String, PageMeta>{
  '/login': PageMeta(
    title: '登录 - IM',
    description: '安全即时通讯，端到端加密登录',
    canonicalPath: '/login',
    og: OgMeta(title: '登录 - IM', description: '安全即时通讯，端到端加密登录'),
    twitter: TwitterMeta(title: '登录 - IM'),
  ),
  '/register': PageMeta(
    title: '注册 - IM',
    description: '创建您的 IM 账户',
    canonicalPath: '/register',
    og: OgMeta(title: '注册 - IM', description: '创建您的 IM 账户'),
    twitter: TwitterMeta(title: '注册 - IM'),
  ),
  '/chat': PageMeta(
    title: '聊天 - IM',
    description: '与好友安全聊天，端到端加密',
    canonicalPath: '/chat',
    og: OgMeta(title: '聊天 - IM', description: '与好友安全聊天，端到端加密'),
    twitter: TwitterMeta(title: '聊天 - IM'),
  ),
  '/contacts': PageMeta(
    title: '通讯录 - IM',
    description: '管理您的联系人',
    canonicalPath: '/contacts',
    og: OgMeta(title: '通讯录 - IM', description: '管理您的联系人'),
    twitter: TwitterMeta(title: '通讯录 - IM'),
  ),
  '/contacts/add': PageMeta(
    title: '添加好友 - IM',
    description: '搜索并添加新朋友',
    canonicalPath: '/contacts/add',
    og: OgMeta(title: '添加好友 - IM', description: '搜索并添加新朋友'),
    twitter: TwitterMeta(title: '添加好友 - IM'),
  ),
  '/groups': PageMeta(
    title: '群组 - IM',
    description: '管理和加入群组',
    canonicalPath: '/groups',
    og: OgMeta(title: '群组 - IM', description: '管理和加入群组'),
    twitter: TwitterMeta(title: '群组 - IM'),
  ),
  '/groups/create': PageMeta(
    title: '创建群组 - IM',
    description: '创建新的群组聊天',
    canonicalPath: '/groups/create',
    og: OgMeta(title: '创建群组 - IM', description: '创建新的群组聊天'),
    twitter: TwitterMeta(title: '创建群组 - IM'),
  ),
  '/moments': PageMeta(
    title: '朋友圈 - IM',
    description: '查看好友动态',
    canonicalPath: '/moments',
    og: OgMeta(title: '朋友圈 - IM', description: '查看好友动态'),
    twitter: TwitterMeta(title: '朋友圈 - IM'),
  ),
  '/moments/notifications': PageMeta(
    title: '动态通知 - IM',
    description: '查看朋友圈互动通知',
    canonicalPath: '/moments/notifications',
    og: OgMeta(title: '动态通知 - IM', description: '查看朋友圈互动通知'),
    twitter: TwitterMeta(title: '动态通知 - IM'),
  ),
  '/settings': PageMeta(
    title: '设置 - IM',
    description: '个性化您的 IM 体验',
    canonicalPath: '/settings',
    og: OgMeta(title: '设置 - IM', description: '个性化您的 IM 体验'),
    twitter: TwitterMeta(title: '设置 - IM'),
  ),
  '/settings/profile': PageMeta(
    title: '个人资料 - IM',
    description: '编辑您的个人资料',
    canonicalPath: '/settings/profile',
    og: OgMeta(title: '个人资料 - IM', description: '编辑您的个人资料'),
    twitter: TwitterMeta(title: '个人资料 - IM'),
  ),
  '/settings/ai': PageMeta(
    title: 'AI 设置 - IM',
    description: '配置 AI 助手',
    canonicalPath: '/settings/ai',
    og: OgMeta(title: 'AI 设置 - IM', description: '配置 AI 助手'),
    twitter: TwitterMeta(title: 'AI 设置 - IM'),
  ),
};

PageMeta metaForPath(String path) {
  return routeMetaMap[path] ?? appFallbackMeta;
}
```

- [ ] **Step 2: Commit**

```bash
cd D:/project/new-im-project
git add flutter/apps/web/lib/core/web_meta/web_meta_defaults.dart
git commit -m "feat(web_meta): add default meta definitions for all routes"
```

---

### Task 5: Create Riverpod provider for WebMetaService

**Files:**
- Create: `flutter/apps/web/lib/core/web_meta/web_meta_provider.dart`

- [ ] **Step 1: Create the provider**

Create `flutter/apps/web/lib/core/web_meta/web_meta_provider.dart`:

```dart
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'web_meta_service.dart';
import 'web_meta_defaults.dart';

final webMetaServiceProvider = Provider<WebMetaService>((ref) {
  return createWebMetaService();
});

void setupWebMetaListener(WidgetRef ref) {
  final service = ref.read(webMetaServiceProvider);

  // Apply default meta on startup
  service.apply(appFallbackMeta);

  // Listen to route changes
  ref.listen<GoRouter>(routerProvider, (prev, next) {
    final path = next.state?.uri.path ?? '/';
    final meta = metaForPath(path);
    service.apply(meta);
  });
}

// Provider reference needed from app_router.dart
// This import will be resolved by adding a re-export or direct import
```

- [ ] **Step 2: Commit**

```bash
cd D:/project/new-im-project
git add flutter/apps/web/lib/core/web_meta/web_meta_provider.dart
git commit -m "feat(web_meta): add Riverpod provider for WebMetaService"
```

---

### Task 6: Update GoRouter with route meta

**Files:**
- Modify: `flutter/apps/web/lib/core/router/app_router.dart`

- [ ] **Step 1: Update router with meta on each route**

Replace the entire `flutter/apps/web/lib/core/router/app_router.dart` with:

```dart
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

final routerProvider = Provider<GoRouter>((ref) {
  final authState = ref.watch(authStateProvider);

  return GoRouter(
    initialLocation: '/chat',
    redirect: (context, state) {
      final isAuth = authState.isAuthenticated;
      final isLoginRoute = state.uri.path == '/login' ||
          state.uri.path == '/register';

      if (!isAuth && !isLoginRoute) return '/login';
      if (isAuth && isLoginRoute) return '/chat';

      return null;
    },
    routes: [
      GoRoute(
        path: '/login',
        meta: {
          'pageMeta': PageMeta(
            title: '登录 - IM',
            description: '安全即时通讯，端到端加密登录',
            canonicalPath: '/login',
            og: OgMeta(
                title: '登录 - IM', description: '安全即时通讯，端到端加密登录'),
            twitter: TwitterMeta(title: '登录 - IM'),
          ),
        },
        builder: (_, __) => const LoginPage(),
      ),
      GoRoute(
        path: '/register',
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
      ),
      ShellRoute(
        builder: (_, __, child) => ResponsiveLayout(
          mobile: (_) => MobileShell(child: child),
          desktop: (_) => MainLayout(child: child),
        ),
        routes: [
          GoRoute(
            path: '/chat',
            meta: {
              'pageMeta': PageMeta(
                title: '聊天 - IM',
                description: '与好友安全聊天，端到端加密',
                canonicalPath: '/chat',
                og: OgMeta(
                    title: '聊天 - IM', description: '与好友安全聊天，端到端加密'),
                twitter: TwitterMeta(title: '聊天 - IM'),
              ),
            },
            builder: (_, __) => const ChatPage(),
          ),
          GoRoute(
            path: '/contacts',
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
          ),
          GoRoute(
            path: '/contacts/add',
            meta: {
              'pageMeta': PageMeta(
                title: '添加好友 - IM',
                description: '搜索并添加新朋友',
                canonicalPath: '/contacts/add',
                og: OgMeta(
                    title: '添加好友 - IM', description: '搜索并添加新朋友'),
                twitter: TwitterMeta(title: '添加好友 - IM'),
              ),
            },
            builder: (_, __) => const AddFriendPage(),
          ),
          GoRoute(
            path: '/groups',
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
          ),
          GoRoute(
            path: '/groups/create',
            meta: {
              'pageMeta': PageMeta(
                title: '创建群组 - IM',
                description: '创建新的群组聊天',
                canonicalPath: '/groups/create',
                og: OgMeta(
                    title: '创建群组 - IM', description: '创建新的群组聊天'),
                twitter: TwitterMeta(title: '创建群组 - IM'),
              ),
            },
            builder: (_, __) => const CreateGroupPage(),
          ),
          GoRoute(
            path: '/moments',
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
          ),
          GoRoute(
            path: '/moments/notifications',
            meta: {
              'pageMeta': PageMeta(
                title: '动态通知 - IM',
                description: '查看朋友圈互动通知',
                canonicalPath: '/moments/notifications',
                og: OgMeta(
                    title: '动态通知 - IM',
                    description: '查看朋友圈互动通知'),
                twitter: TwitterMeta(title: '动态通知 - IM'),
              ),
            },
            builder: (_, __) => const MomentsNotificationsPage(),
          ),
          GoRoute(
            path: '/settings',
            meta: {
              'pageMeta': PageMeta(
                title: '设置 - IM',
                description: '个性化您的 IM 体验',
                canonicalPath: '/settings',
                og: OgMeta(
                    title: '设置 - IM', description: '个性化您的 IM 体验'),
                twitter: TwitterMeta(title: '设置 - IM'),
              ),
            },
            builder: (_, __) => const SettingsPage(),
          ),
          GoRoute(
            path: '/settings/profile',
            meta: {
              'pageMeta': PageMeta(
                title: '个人资料 - IM',
                description: '编辑您的个人资料',
                canonicalPath: '/settings/profile',
                og: OgMeta(
                    title: '个人资料 - IM', description: '编辑您的个人资料'),
                twitter: TwitterMeta(title: '个人资料 - IM'),
              ),
            },
            builder: (_, __) => const ProfilePage(),
          ),
          GoRoute(
            path: '/settings/ai',
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

- [ ] **Step 2: Commit**

```bash
cd D:/project/new-im-project
git add flutter/apps/web/lib/core/router/app_router.dart
git commit -m "feat(router): add PageMeta to all GoRoute definitions"
```

---

### Task 7: Mount WebMetaService listener in app.dart

**Files:**
- Modify: `flutter/apps/web/lib/app.dart`

- [ ] **Step 1: Update app.dart**

Replace the entire `flutter/apps/web/lib/app.dart` with:

```dart
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:im_web/l10n/app_localizations.dart';
import 'core/di/providers.dart';
import 'core/router/app_router.dart';
import 'core/theme/app_theme.dart';
import 'core/web_meta/web_meta_defaults.dart';
import 'core/web_meta/web_meta_service.dart';

class App extends ConsumerStatefulWidget {
  const App({super.key});

  @override
  ConsumerState<App> createState() => _AppState();
}

class _AppState extends ConsumerState<App> {
  final _webMetaService = createWebMetaService();

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      ref.read(authStateProvider.notifier).checkAuth();
      _webMetaService.apply(appFallbackMeta);

      ref.listen<GoRouter>(routerProvider, (prev, next) {
        final path = next.state?.uri.path ?? '/';
        final meta = metaForPath(path);
        _webMetaService.apply(meta);
      });
    });
  }

  @override
  Widget build(BuildContext context) {
    final router = ref.watch(routerProvider);

    return MaterialApp.router(
      title: 'IM',
      theme: AppTheme.lightTheme,
      darkTheme: AppTheme.darkTheme,
      routerConfig: router,
      localizationsDelegates: AppLocalizations.localizationsDelegates,
      supportedLocales: AppLocalizations.supportedLocales,
    );
  }
}
```

- [ ] **Step 2: Commit**

```bash
cd D:/project/new-im-project
git add flutter/apps/web/lib/app.dart
git commit -m "feat(app): mount WebMetaService route listener"
```

---

### Task 8: Update index.html with static meta tags

**Files:**
- Modify: `flutter/apps/web/web/index.html`

- [ ] **Step 1: Add meta tags to index.html**

Replace the `<head>` section in `flutter/apps/web/web/index.html` with:

```html
<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <base href="$FLUTTER_BASE_HREF">
  <meta charset="UTF-8">
  <meta content="IE=Edge" http-equiv="X-UA-Compatible">

  <!-- Primary Meta -->
  <meta name="description" content="IM 是一款安全即时通讯应用，支持端到端加密、群组聊天、朋友圈等功能">
  <meta name="theme-color" content="#1a1a2e">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
  <meta name="robots" content="index, follow">

  <!-- Open Graph -->
  <meta property="og:site_name" content="IM">
  <meta property="og:locale" content="zh_CN">
  <meta property="og:type" content="website">
  <meta property="og:title" content="IM - 安全即时通讯">
  <meta property="og:description" content="IM 是一款安全即时通讯应用，支持端到端加密、群组聊天、朋友圈等功能">

  <!-- Twitter Card -->
  <meta name="twitter:card" content="summary">
  <meta name="twitter:site" content="@im_app">
  <meta name="twitter:title" content="IM - 安全即时通讯">
  <meta name="twitter:description" content="IM 是一款安全即时通讯应用，支持端到端加密、群组聊天、朋友圈等功能">

  <!-- Apple -->
  <meta name="apple-mobile-web-app-capable" content="yes">
  <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
  <meta name="apple-mobile-web-app-title" content="IM">

  <link rel="manifest" href="manifest.json">
  <link rel="apple-touch-icon" href="icons/icon-192.png">
  <link rel="canonical" href="http://localhost:3000/">
  <title>IM - 安全即时通讯</title>
  <style>
    body {
      margin: 0;
      padding: 0;
      overflow: hidden;
    }

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
  <div id="offline-banner" class="offline-banner">
    网络已断开，部分功能可能不可用
  </div>

  <script src="flutter_bootstrap.js" async></script>

  <script>
    if ('serviceWorker' in navigator) {
      window.addEventListener('load', async () => {
        try {
          const registration = await navigator.serviceWorker.register('/service_worker.js');
          console.log('SW registered:', registration.scope);
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

- [ ] **Step 2: Commit**

```bash
cd D:/project/new-im-project
git add flutter/apps/web/web/index.html
git commit -m "feat(html): add OG/Twitter/robots meta tags to index.html"
```

---

### Task 9: Create barrel export file

**Files:**
- Create: `flutter/apps/web/lib/core/web_meta/web_meta.dart`

- [ ] **Step 1: Create barrel export**

Create `flutter/apps/web/lib/core/web_meta/web_meta.dart`:

```dart
export 'page_meta.dart';
export 'web_meta_service.dart';
export 'web_meta_defaults.dart';
```

- [ ] **Step 2: Commit**

```bash
cd D:/project/new-im-project
git add flutter/apps/web/lib/core/web_meta/web_meta.dart
git commit -m "chore(web_meta): add barrel export file"
```

---

### Task 10: Run all tests and verify build

**Files:** None (verification only)

- [ ] **Step 1: Run flutter test**

Run: `cd flutter/apps/web && flutter test`
Expected: All tests pass

- [ ] **Step 2: Run flutter build web (dry check)**

Run: `cd flutter/apps/web && flutter build web --no-tree-shake-icons 2>&1 | head -30`
Expected: Build completes without errors (or only warnings)

- [ ] **Step 3: Final commit if any fixes needed**

```bash
cd D:/project/new-im-project
git add -A
git commit -m "fix(web_meta): address test/build issues"
```

(Only if changes were needed in steps 1-2)
