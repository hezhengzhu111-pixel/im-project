# Web SEO Meta Consolidation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix hardcoded SEO meta issues: remove localhost canonical, add i18n support, merge routeMetaMap/pageMetaMap into single routeRegistry.

**Architecture:** New `RouteEntry` class merges auth guard + SEO fields. Single `routeRegistry` const map is the source of truth. `routeMetaMap` and `metaForPath()` derive from it. ARB keys use `seo` prefix to avoid collision with existing UI keys.

**Tech Stack:** Flutter Web, Dart, go_router, package:web, flutter_localizations

---

## ARB Key Naming Fix

**Important:** Existing ARB files already have `loginTitle`, `settingsTitle`, `profileTitle`, `aiTitle`, `momentsTitle`, `addFriendTitle`, `groupCreateTitle` for UI purposes. SEO meta keys use `seo` prefix to avoid collision:

| UI Key (existing) | SEO Key (new) |
|---|---|
| `loginTitle` = "登录" | `seoLoginTitle` = "登录 - IM" |
| `settingsTitle` = "设置" | `seoSettingsTitle` = "设置 - IM" |
| `profileTitle` = "个人资料" | `seoProfileTitle` = "个人资料 - IM" |
| `aiTitle` = "AI 助手" | `seoAiSettingsTitle` = "AI 设置 - IM" |
| `momentsTitle` = "朋友圈" | `seoMomentsTitle` = "朋友圈 - IM" |
| `addFriendTitle` = "添加好友" | `seoAddFriendTitle` = "添加好友 - IM" |
| `groupCreateTitle` = "创建群组" | `seoCreateGroupTitle` = "创建群组 - IM" |

---

## Task 1: Create RouteEntry and routeRegistry

**Files:**
- Create: `flutter/apps/web/lib/core/router/route_registry.dart`

- [ ] **Step 1: Write the failing test**

Create `flutter/apps/web/test/core/router/route_registry_test.dart`:

```dart
import 'package:flutter_test/flutter_test.dart';
import 'package:im_web/core/router/route_registry.dart';
import 'package:im_web/core/router/route_resolver.dart';

void main() {
  group('RouteEntry', () {
    test('constructs with required fields', () {
      const entry = RouteEntry(
        titleKey: 'seoLoginTitle',
        descriptionKey: 'seoLoginDescription',
      );
      expect(entry.titleKey, 'seoLoginTitle');
      expect(entry.descriptionKey, 'seoLoginDescription');
      expect(entry.requiresAuth, isTrue);
      expect(entry.hideForAuth, isFalse);
      expect(entry.permission, isNull);
      expect(entry.ogImage, isNull);
      expect(entry.ogType, isNull);
    });

    test('constructs with all fields', () {
      const entry = RouteEntry(
        titleKey: 'seoLoginTitle',
        requiresAuth: false,
        hideForAuth: true,
        permission: 'admin:read',
        descriptionKey: 'seoLoginDescription',
        ogImage: 'custom.png',
        ogType: 'article',
      );
      expect(entry.requiresAuth, isFalse);
      expect(entry.hideForAuth, isTrue);
      expect(entry.permission, 'admin:read');
      expect(entry.ogImage, 'custom.png');
      expect(entry.ogType, 'article');
    });
  });

  group('routeRegistry', () {
    test('contains all 12 routes', () {
      expect(routeRegistry.length, 12);
    });

    test('all entries have titleKey and descriptionKey', () {
      for (final entry in routeRegistry.values) {
        expect(entry.titleKey, isNotEmpty);
        expect(entry.descriptionKey, isNotEmpty);
      }
    });

    test('/login and /register have hideForAuth', () {
      expect(routeRegistry['/login']!.hideForAuth, isTrue);
      expect(routeRegistry['/register']!.hideForAuth, isTrue);
      expect(routeRegistry['/login']!.requiresAuth, isFalse);
      expect(routeRegistry['/register']!.requiresAuth, isFalse);
    });

    test('debug/gallery not in registry', () {
      expect(routeRegistry.containsKey('/debug/gallery'), isFalse);
    });

    test('all 12 expected routes exist', () {
      const expectedPaths = [
        '/login', '/register', '/chat', '/contacts', '/contacts/add',
        '/groups', '/groups/create', '/moments', '/moments/notifications',
        '/settings', '/settings/profile', '/settings/ai',
      ];
      for (final path in expectedPaths) {
        expect(routeRegistry.containsKey(path), isTrue, reason: 'Missing: $path');
      }
    });
  });

  group('routeMetaMap consistency', () {
    test('routeMetaMap keys match routeRegistry keys', () {
      expect(routeMetaMap.keys.toSet(), routeRegistry.keys.toSet());
    });

    test('routeMetaMap has same length as routeRegistry', () {
      expect(routeMetaMap.length, routeRegistry.length);
    });
  });
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd flutter/apps/web && dart test test/core/router/route_registry_test.dart`
Expected: FAIL with "Undefined name 'routeRegistry'"

- [ ] **Step 3: Write implementation**

Create `flutter/apps/web/lib/core/router/route_registry.dart`:

```dart
/// Single source of truth for route metadata (auth guard + SEO).
///
/// Auth guard fields: requiresAuth, hideForAuth, permission
/// SEO fields: titleKey, descriptionKey, ogImage, ogType
class RouteEntry {
  final String titleKey;
  final bool requiresAuth;
  final bool hideForAuth;
  final String? permission;
  final String descriptionKey;
  final String? ogImage;
  final String? ogType;

  const RouteEntry({
    required this.titleKey,
    this.requiresAuth = true,
    this.hideForAuth = false,
    this.permission,
    required this.descriptionKey,
    this.ogImage,
    this.ogType,
  });
}

const routeRegistry = <String, RouteEntry>{
  '/login': RouteEntry(
    titleKey: 'seoLoginTitle',
    requiresAuth: false,
    hideForAuth: true,
    descriptionKey: 'seoLoginDescription',
  ),
  '/register': RouteEntry(
    titleKey: 'seoRegisterTitle',
    requiresAuth: false,
    hideForAuth: true,
    descriptionKey: 'seoRegisterDescription',
  ),
  '/chat': RouteEntry(
    titleKey: 'seoChatTitle',
    descriptionKey: 'seoChatDescription',
  ),
  '/contacts': RouteEntry(
    titleKey: 'seoContactsTitle',
    descriptionKey: 'seoContactsDescription',
  ),
  '/contacts/add': RouteEntry(
    titleKey: 'seoAddFriendTitle',
    descriptionKey: 'seoAddFriendDescription',
  ),
  '/groups': RouteEntry(
    titleKey: 'seoGroupsTitle',
    descriptionKey: 'seoGroupsDescription',
  ),
  '/groups/create': RouteEntry(
    titleKey: 'seoCreateGroupTitle',
    descriptionKey: 'seoCreateGroupDescription',
  ),
  '/moments': RouteEntry(
    titleKey: 'seoMomentsTitle',
    descriptionKey: 'seoMomentsDescription',
  ),
  '/moments/notifications': RouteEntry(
    titleKey: 'seoMomentsNotificationsTitle',
    descriptionKey: 'seoMomentsNotificationsDescription',
  ),
  '/settings': RouteEntry(
    titleKey: 'seoSettingsTitle',
    descriptionKey: 'seoSettingsDescription',
  ),
  '/settings/profile': RouteEntry(
    titleKey: 'seoProfileTitle',
    descriptionKey: 'seoProfileDescription',
  ),
  '/settings/ai': RouteEntry(
    titleKey: 'seoAiSettingsTitle',
    descriptionKey: 'seoAiSettingsDescription',
  ),
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd flutter/apps/web && dart test test/core/router/route_registry_test.dart`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add flutter/apps/web/lib/core/router/route_registry.dart flutter/apps/web/test/core/router/route_registry_test.dart
git commit -m "feat(router): add RouteEntry and routeRegistry as single source of truth"
```

---

## Task 2: Derive routeMetaMap from registry

**Files:**
- Modify: `flutter/apps/web/lib/core/router/route_resolver.dart`

- [ ] **Step 1: Write the failing test**

Add to `flutter/apps/web/test/core/router/route_registry_test.dart`:

```dart
  group('resolveRouteMeta', () {
    test('returns exact match for /login', () {
      final meta = resolveRouteMeta('/login');
      expect(meta, isNotNull);
      expect(meta!.title, 'seoLoginTitle');
    });

    test('resolves /chat/abc123 to /chat meta (deep link)', () {
      final meta = resolveRouteMeta('/chat/abc123');
      expect(meta, isNotNull);
      expect(meta!.title, 'seoChatTitle');
    });

    test('resolves /contacts/add to exact match', () {
      final meta = resolveRouteMeta('/contacts/add');
      expect(meta, isNotNull);
      expect(meta!.title, 'seoAddFriendTitle');
    });

    test('returns null for unknown path (404)', () {
      final meta = resolveRouteMeta('/unknown-page');
      expect(meta, isNull);
    });

    test('/login has hideForAuth via routeMetaMap', () {
      final meta = routeMetaMap['/login']!;
      expect(meta.requiresAuth, isFalse);
      expect(meta.hideForAuth, isTrue);
    });
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd flutter/apps/web && dart test test/core/router/route_registry_test.dart`
Expected: FAIL with "Expected: 'seoLoginTitle', Actual: '登录'"

- [ ] **Step 3: Write implementation**

Modify `flutter/apps/web/lib/core/router/route_resolver.dart`:

```dart
import 'route_meta.dart';
import 'route_registry.dart';

/// Derive routeMetaMap from registry for GoRouter redirect logic.
Map<String, RouteMeta> get routeMetaMap => routeRegistry.map(
  (path, entry) => MapEntry(path, RouteMeta(
    title: entry.titleKey,
    requiresAuth: entry.requiresAuth,
    hideForAuth: entry.hideForAuth,
    permission: entry.permission,
  )),
);

/// Resolve [RouteMeta] for a given location by longest-prefix match.
/// Cache the derived map locally to avoid repeated getter invocations.
RouteMeta? resolveRouteMeta(String location) {
  final map = routeMetaMap;
  if (map.containsKey(location)) {
    return map[location];
  }
  String bestMatch = '';
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

- [ ] **Step 4: Run test to verify it passes**

Run: `cd flutter/apps/web && dart test test/core/router/route_registry_test.dart`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add flutter/apps/web/lib/core/router/route_resolver.dart
git commit -m "refactor(router): derive routeMetaMap from routeRegistry"
```

---

## Task 3: Update web_meta_defaults to use registry

**Files:**
- Modify: `flutter/apps/web/lib/core/web_meta/web_meta_defaults.dart`
- Modify: `flutter/apps/web/test/core/web_meta/page_meta_test.dart`

- [ ] **Step 1: Write the failing test**

Replace `flutter/apps/web/test/core/web_meta/page_meta_test.dart`:

```dart
import 'package:flutter_test/flutter_test.dart';
import 'package:im_web/core/web_meta/page_meta.dart';
import 'package:im_web/core/web_meta/web_meta_defaults.dart';

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

  group('metaForPath', () {
    test('returns correct meta for /login (no l10n, falls back to key)', () {
      final meta = metaForPath('/login', null);
      expect(meta.title, 'seoLoginTitle');
      expect(meta.description, 'seoLoginDescription');
      expect(meta.canonicalPath, '/login');
      expect(meta.og?.title, 'seoLoginTitle');
      expect(meta.og?.type, 'website');
      expect(meta.twitter?.card, 'summary');
    });

    test('returns correct meta for /chat', () {
      final meta = metaForPath('/chat', null);
      expect(meta.title, 'seoChatTitle');
      expect(meta.description, 'seoChatDescription');
      expect(meta.canonicalPath, '/chat');
    });

    test('returns correct meta for /settings', () {
      final meta = metaForPath('/settings', null);
      expect(meta.title, 'seoSettingsTitle');
      expect(meta.canonicalPath, '/settings');
    });

    test('returns appFallbackMeta for unknown routes', () {
      final meta = metaForPath('/unknown', null);
      expect(meta.title, appFallbackMeta.title);
      expect(meta.description, appFallbackMeta.description);
    });

    test('returns appFallbackMeta for empty path', () {
      final meta = metaForPath('', null);
      expect(meta.title, appFallbackMeta.title);
    });

    test('canonical does not contain localhost', () {
      for (final path in [
        '/login', '/register', '/chat', '/contacts', '/contacts/add',
        '/groups', '/groups/create', '/moments', '/moments/notifications',
        '/settings', '/settings/profile', '/settings/ai',
      ]) {
        final meta = metaForPath(path, null);
        expect(meta.canonicalPath, isNot(contains('localhost')),
            reason: 'Path $path has localhost in canonical');
      }
    });

    test('all routes have canonicalPath matching path', () {
      for (final path in [
        '/login', '/register', '/chat', '/contacts', '/contacts/add',
        '/groups', '/groups/create', '/moments', '/moments/notifications',
        '/settings', '/settings/profile', '/settings/ai',
      ]) {
        final meta = metaForPath(path, null);
        expect(meta.canonicalPath, path);
      }
    });

    test('all routes have og and twitter meta', () {
      for (final path in [
        '/login', '/register', '/chat', '/contacts', '/contacts/add',
        '/groups', '/groups/create', '/moments', '/moments/notifications',
        '/settings', '/settings/profile', '/settings/ai',
      ]) {
        final meta = metaForPath(path, null);
        expect(meta.og, isNotNull, reason: 'Path $path missing og');
        expect(meta.twitter, isNotNull, reason: 'Path $path missing twitter');
        expect(meta.twitter?.card, 'summary');
      }
    });
  });

  group('appFallbackMeta', () {
    test('has default values', () {
      expect(appFallbackMeta.title, 'IM - 安全即时通讯');
      expect(appFallbackMeta.canonicalPath, '/');
      expect(appFallbackMeta.og?.type, 'website');
      expect(appFallbackMeta.twitter?.card, 'summary');
    });
  });
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd flutter/apps/web && dart test test/core/web_meta/page_meta_test.dart`
Expected: FAIL with "Expected: 'seoLoginTitle', Actual: '登录 - IM'"

- [ ] **Step 3: Write implementation**

Modify `flutter/apps/web/lib/core/web_meta/web_meta_defaults.dart`:

```dart
import 'package:im_web/l10n/app_localizations.dart';
import 'package:im_web/core/router/route_registry.dart';
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
    description:
        'IM 是一款安全即时通讯应用，支持端到端加密、群组聊天、朋友圈等功能',
  ),
);

PageMeta metaForPath(String path, AppLocalizations? l10n) {
  final entry = routeRegistry[path];
  if (entry == null) return appFallbackMeta;

  final title = l10n?.translate(entry.titleKey) ?? entry.titleKey;
  final description = l10n?.translate(entry.descriptionKey) ?? entry.descriptionKey;

  return PageMeta(
    title: title,
    description: description,
    canonicalPath: path,
    og: OgMeta(
      title: title,
      description: description,
      image: entry.ogImage,
      type: entry.ogType ?? 'website',
    ),
    twitter: TwitterMeta(
      card: 'summary',
      title: title,
      description: description,
    ),
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd flutter/apps/web && dart test test/core/web_meta/page_meta_test.dart`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add flutter/apps/web/lib/core/web_meta/web_meta_defaults.dart flutter/apps/web/test/core/web_meta/page_meta_test.dart
git commit -m "refactor(web_meta): derive metaForPath from routeRegistry, add l10n param"
```

---

## Task 4: Add SEO i18n keys to ARB files

**Files:**
- Modify: `flutter/apps/web/lib/l10n/app_zh.arb`
- Modify: `flutter/apps/web/lib/l10n/app_en.arb`

- [ ] **Step 1: Add keys to app_zh.arb**

Append before the closing `}`:

```json
  "seoLoginTitle": "登录 - IM",
  "seoLoginDescription": "安全即时通讯，端到端加密登录",
  "seoRegisterTitle": "注册 - IM",
  "seoRegisterDescription": "创建您的 IM 账户",
  "seoChatTitle": "聊天 - IM",
  "seoChatDescription": "与好友安全聊天，端到端加密",
  "seoContactsTitle": "通讯录 - IM",
  "seoContactsDescription": "管理您的联系人",
  "seoAddFriendTitle": "添加好友 - IM",
  "seoAddFriendDescription": "搜索并添加新朋友",
  "seoGroupsTitle": "群组 - IM",
  "seoGroupsDescription": "管理和加入群组",
  "seoCreateGroupTitle": "创建群组 - IM",
  "seoCreateGroupDescription": "创建新的群组聊天",
  "seoMomentsTitle": "朋友圈 - IM",
  "seoMomentsDescription": "查看好友动态",
  "seoMomentsNotificationsTitle": "动态通知 - IM",
  "seoMomentsNotificationsDescription": "查看朋友圈互动通知",
  "seoSettingsTitle": "设置 - IM",
  "seoSettingsDescription": "个性化您的 IM 体验",
  "seoProfileTitle": "个人资料 - IM",
  "seoProfileDescription": "编辑您的个人资料",
  "seoAiSettingsTitle": "AI 设置 - IM",
  "seoAiSettingsDescription": "配置 AI 助手"
```

- [ ] **Step 2: Add keys to app_en.arb**

Append before the closing `}`:

```json
  "seoLoginTitle": "Login - IM",
  "seoLoginDescription": "Secure instant messaging with end-to-end encryption login",
  "seoRegisterTitle": "Register - IM",
  "seoRegisterDescription": "Create your IM account",
  "seoChatTitle": "Chat - IM",
  "seoChatDescription": "Chat with friends securely, end-to-end encrypted",
  "seoContactsTitle": "Contacts - IM",
  "seoContactsDescription": "Manage your contacts",
  "seoAddFriendTitle": "Add Friend - IM",
  "seoAddFriendDescription": "Search and add new friends",
  "seoGroupsTitle": "Groups - IM",
  "seoGroupsDescription": "Manage and join groups",
  "seoCreateGroupTitle": "Create Group - IM",
  "seoCreateGroupDescription": "Create a new group chat",
  "seoMomentsTitle": "Moments - IM",
  "seoMomentsDescription": "View friends' updates",
  "seoMomentsNotificationsTitle": "Moments Notifications - IM",
  "seoMomentsNotificationsDescription": "View moments interaction notifications",
  "seoSettingsTitle": "Settings - IM",
  "seoSettingsDescription": "Personalize your IM experience",
  "seoProfileTitle": "Profile - IM",
  "seoProfileDescription": "Edit your profile",
  "seoAiSettingsTitle": "AI Settings - IM",
  "seoAiSettingsDescription": "Configure AI assistant"
```

- [ ] **Step 3: Verify ARB files are valid JSON**

Run: `cd flutter/apps/web && python -c "import json; json.load(open('lib/l10n/app_zh.arb')); json.load(open('lib/l10n/app_en.arb')); print('Valid JSON')"`
Expected: `Valid JSON`

- [ ] **Step 4: Commit**

```bash
git add flutter/apps/web/lib/l10n/app_zh.arb flutter/apps/web/lib/l10n/app_en.arb
git commit -m "feat(i18n): add seo meta i18n keys to ARB files"
```

---

## Task 5: Update app.dart to pass l10n

**Files:**
- Modify: `flutter/apps/web/lib/app.dart`

- [ ] **Step 1: Write implementation**

Modify `flutter/apps/web/lib/app.dart` — update the route listener to pass l10n:

Find the `ref.listen<GoRouter>(routerProvider, (prev, next) {` block and replace it:

```dart
      ref.listen<GoRouter>(routerProvider, (prev, next) {
        final path = next.routeInformationProvider.value.uri.path;
        final locale = ref.read(languageProvider);
        final l10n = AppLocalizations.ofLocale(Locale(locale));
        final meta = metaForPath(path, l10n);
        _webMetaService.apply(meta);
      });
```

- [ ] **Step 2: Verify import exists**

Check that `app.dart` already imports `AppLocalizations` and `web_meta_defaults.dart`. If `AppLocalizations` import is missing, add:

```dart
import 'l10n/app_localizations.dart';
```

- [ ] **Step 3: Verify compilation**

Run: `cd flutter/apps/web && flutter analyze lib/app.dart`
Expected: No errors

- [ ] **Step 4: Commit**

```bash
git add flutter/apps/web/lib/app.dart
git commit -m "feat(app): pass l10n to metaForPath for i18n support"
```

---

## Task 6: Delete canonical from index.html

**Files:**
- Modify: `flutter/apps/web/web/index.html`

- [ ] **Step 1: Remove canonical tag**

Delete line 36 from `flutter/apps/web/web/index.html`:

```html
<link rel="canonical" href="http://localhost:3000/">
```

- [ ] **Step 2: Verify canonical is gone**

Run: `grep -n "canonical" flutter/apps/web/web/index.html`
Expected: No output (no canonical tag)

- [ ] **Step 3: Commit**

```bash
git add flutter/apps/web/web/index.html
git commit -m "fix(web): remove hardcoded localhost canonical from index.html"
```

---

## Task 7: Update web_meta exports

**Files:**
- Modify: `flutter/apps/web/lib/core/web_meta/web_meta.dart`

- [ ] **Step 1: Verify exports**

Read `flutter/apps/web/lib/core/web_meta/web_meta.dart` and ensure it exports:

```dart
export 'page_meta.dart';
export 'web_meta_service.dart';
export 'web_meta_defaults.dart';
```

Note: `route_registry.dart` is in `core/router/`, not `core/web_meta/`, so it doesn't need to be exported here.

- [ ] **Step 2: Commit (if changed)**

If changes were made:
```bash
git add flutter/apps/web/lib/core/web_meta/web_meta.dart
git commit -m "chore(web_meta): update exports"
```

---

## Task 8: Run all tests and verify

**Files:**
- Test: `flutter/apps/web/test/core/router/route_registry_test.dart`
- Test: `flutter/apps/web/test/core/web_meta/page_meta_test.dart`
- Test: `flutter/apps/web/test/core/router/app_router_test.dart`

- [ ] **Step 1: Run all tests**

Run: `cd flutter/apps/web && flutter test`
Expected: All tests pass

- [ ] **Step 2: Verify app_router_test still passes**

The existing `app_router_test.dart` tests `routeMetaMap` and `resolveRouteMeta`. Since we changed `routeMetaMap` to a getter, verify these tests still pass.

Run: `cd flutter/apps/web && dart test test/core/router/app_router_test.dart`
Expected: PASS

- [ ] **Step 3: Verify no regression**

Run: `cd flutter/apps/web && flutter test test/core/`
Expected: All tests pass

- [ ] **Step 4: Final commit (if any fixups needed)**

If any test fixes were needed:
```bash
git add -A
git commit -m "fix: test fixes for routeRegistry consolidation"
```

---

## Summary

| Task | Description | Files |
|------|-------------|-------|
| 1 | Create RouteEntry + routeRegistry | route_registry.dart, route_registry_test.dart |
| 2 | Derive routeMetaMap from registry | route_resolver.dart |
| 3 | Update web_meta_defaults | web_meta_defaults.dart, page_meta_test.dart |
| 4 | Add SEO i18n keys | app_zh.arb, app_en.arb |
| 5 | Update app.dart | app.dart |
| 6 | Delete canonical | index.html |
| 7 | Update exports | web_meta.dart |
| 8 | Run all tests | All test files |
