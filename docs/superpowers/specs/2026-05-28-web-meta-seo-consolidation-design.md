# Web SEO Meta Consolidation Design

## Overview

Fix hardcoded SEO meta issues in Flutter Web: remove localhost canonical from `index.html`, add i18n support for meta content, and merge `routeMetaMap` / `pageMetaMap` into a single `routeRegistry` to eliminate dual-system maintenance.

## Goals

1. Remove hardcoded `http://localhost:3000/` canonical from `index.html`
2. Add i18n support for meta content via AppLocalizations
3. Merge `RouteMeta` and `PageMeta` into a single `RouteEntry` registry
4. Ensure `/debug/gallery` does not enter production SEO meta
5. Add comprehensive tests for meta generation

## Non-Goals

- SSR/SSG capabilities
- Changing GoRouter business logic
- Widget-level meta context

## Current State

### Problems Identified

1. **`web/index.html:36`**: `<link rel="canonical" href="http://localhost:3000/">` hardcoded
2. **Dual maps**: `routeMetaMap` (12 routes) and `pageMetaMap` (12 routes) maintained independently
3. **Chinese-only**: All meta content hardcoded in Chinese, no i18n support
4. **No debug exclusion**: `/debug/gallery` not in either map (acceptable, but needs explicit policy)

### Existing Files

| File | Purpose |
|------|---------|
| `core/router/route_meta.dart` | `RouteMeta` class (auth guard fields) |
| `core/router/route_resolver.dart` | `routeMetaMap` + `resolveRouteMeta()` |
| `core/web_meta/page_meta.dart` | `PageMeta`, `OgMeta`, `TwitterMeta` classes |
| `core/web_meta/web_meta_defaults.dart` | `pageMetaMap` + `metaForPath()` |
| `core/web_meta/web_meta_service_web.dart` | DOM manipulation (already uses `window.location.origin`) |
| `app.dart` | Listens to route changes, applies meta |

## Architecture

### New Data Model: `RouteEntry`

Merges `RouteMeta` (auth guard) and `PageMeta` (SEO) into a single class.

```dart
// core/router/route_registry.dart

class RouteEntry {
  final String titleKey;        // ARB key, e.g. 'loginTitle'
  final bool requiresAuth;
  final bool hideForAuth;
  final String? permission;
  final String descriptionKey;  // ARB key, e.g. 'loginDescription'
  final String? ogImage;        // optional, defaults to icons/icon-512.png
  final String? ogType;         // optional, defaults to 'website'

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
```

**Design decisions:**
- `titleKey` / `descriptionKey` store ARB keys (not strings), keeping registry `const`
- No `canonicalPath` field — it equals the map key, avoiding duplication
- No `twitter` field — all pages use default Twitter Card (summary), only override when needed
- `ogImage` / `ogType` optional —大多数页面用默认值

### Single Registry

```dart
// core/router/route_registry.dart

const routeRegistry = <String, RouteEntry>{
  '/login': RouteEntry(
    titleKey: 'loginTitle',
    requiresAuth: false,
    hideForAuth: true,
    descriptionKey: 'loginDescription',
  ),
  '/register': RouteEntry(
    titleKey: 'registerTitle',
    requiresAuth: false,
    hideForAuth: true,
    descriptionKey: 'registerDescription',
  ),
  '/chat': RouteEntry(
    titleKey: 'chatTitle',
    descriptionKey: 'chatDescription',
  ),
  '/contacts': RouteEntry(
    titleKey: 'contactsTitle',
    descriptionKey: 'contactsDescription',
  ),
  '/contacts/add': RouteEntry(
    titleKey: 'addFriendTitle',
    descriptionKey: 'addFriendDescription',
  ),
  '/groups': RouteEntry(
    titleKey: 'groupsTitle',
    descriptionKey: 'groupsDescription',
  ),
  '/groups/create': RouteEntry(
    titleKey: 'createGroupTitle',
    descriptionKey: 'createGroupDescription',
  ),
  '/moments': RouteEntry(
    titleKey: 'momentsTitle',
    descriptionKey: 'momentsDescription',
  ),
  '/moments/notifications': RouteEntry(
    titleKey: 'momentsNotificationsTitle',
    descriptionKey: 'momentsNotificationsDescription',
  ),
  '/settings': RouteEntry(
    titleKey: 'settingsTitle',
    descriptionKey: 'settingsDescription',
  ),
  '/settings/profile': RouteEntry(
    titleKey: 'profileTitle',
    descriptionKey: 'profileDescription',
  ),
  '/settings/ai': RouteEntry(
    titleKey: 'aiSettingsTitle',
    descriptionKey: 'aiSettingsDescription',
  ),
};
```

**Key points:**
- 12 routes, matching existing `routeMetaMap` and `pageMetaMap`
- `/debug/gallery` intentionally excluded — uses `appFallbackMeta`
- Registry is `const` — no runtime dependencies

### Meta Resolution

```dart
// core/web_meta/web_meta_defaults.dart

PageMeta metaForPath(String path, AppLocalizations? l10n) {
  final entry = routeRegistry[path];
  if (entry == null) return appFallbackMeta;

  final title = _resolveTitle(entry.titleKey, l10n);
  final description = _resolveDescription(entry.descriptionKey, l10n);

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

String _resolveTitle(String key, AppLocalizations? l10n) {
  return l10n?.translate(key) ?? key;
}

String _resolveDescription(String key, AppLocalizations? l10n) {
  return l10n?.translate(key) ?? key;
}
```

### RouteMeta Derivation

```dart
// core/router/route_resolver.dart

/// Derive routeMetaMap from registry for GoRouter redirect logic
Map<String, RouteMeta> get routeMetaMap => routeRegistry.map(
  (path, entry) => MapEntry(path, RouteMeta(
    title: entry.titleKey,
    requiresAuth: entry.requiresAuth,
    hideForAuth: entry.hideForAuth,
    permission: entry.permission,
  )),
);

/// Keep existing longest-prefix match logic.
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

### app.dart Integration

```dart
// app.dart

class _AppState extends ConsumerState<App> {
  final _webMetaService = createWebMetaService();

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      final analytics = ref.read(analyticsProvider);
      analytics.trackEvent('app_start', {'platform': 'web'});
      ref.read(authStateProvider.notifier).checkAuth();
      _webMetaService.apply(appFallbackMeta);

      ref.listen<GoRouter>(routerProvider, (prev, next) {
        final path = next.routeInformationProvider.value.uri.path;
        final locale = ref.read(languageProvider);
        final l10n = AppLocalizations.ofLocale(Locale(locale));
        final meta = metaForPath(path, l10n);
        _webMetaService.apply(meta);
      });
    });
  }
  // ... build method unchanged
}
```

### index.html Changes

Delete line 36:
```html
<!-- DELETE this line -->
<link rel="canonical" href="http://localhost:3000/">
```

**canonical injection** already handled by `web_meta_service_web.dart`:
```dart
void _setCanonical(String? path) {
  final href = path != null ? '$_baseUrl$path' : '$_baseUrl/';
  // ... dynamically injects into DOM using window.location.origin
}
```

## i18n: ARB Files

### app_zh.arb (add)

```json
"loginTitle": "登录 - IM",
"loginDescription": "安全即时通讯，端到端加密登录",
"registerTitle": "注册 - IM",
"registerDescription": "创建您的 IM 账户",
"chatTitle": "聊天 - IM",
"chatDescription": "与好友安全聊天，端到端加密",
"contactsTitle": "通讯录 - IM",
"contactsDescription": "管理您的联系人",
"addFriendTitle": "添加好友 - IM",
"addFriendDescription": "搜索并添加新朋友",
"groupsTitle": "群组 - IM",
"groupsDescription": "管理和加入群组",
"createGroupTitle": "创建群组 - IM",
"createGroupDescription": "创建新的群组聊天",
"momentsTitle": "朋友圈 - IM",
"momentsDescription": "查看好友动态",
"momentsNotificationsTitle": "动态通知 - IM",
"momentsNotificationsDescription": "查看朋友圈互动通知",
"settingsTitle": "设置 - IM",
"settingsDescription": "个性化您的 IM 体验",
"profileTitle": "个人资料 - IM",
"profileDescription": "编辑您的个人资料",
"aiSettingsTitle": "AI 设置 - IM",
"aiSettingsDescription": "配置 AI 助手"
```

### app_en.arb (add)

```json
"loginTitle": "Login - IM",
"loginDescription": "Secure instant messaging with end-to-end encryption login",
"registerTitle": "Register - IM",
"registerDescription": "Create your IM account",
"chatTitle": "Chat - IM",
"chatDescription": "Chat with friends securely, end-to-end encrypted",
"contactsTitle": "Contacts - IM",
"contactsDescription": "Manage your contacts",
"addFriendTitle": "Add Friend - IM",
"addFriendDescription": "Search and add new friends",
"groupsTitle": "Groups - IM",
"groupsDescription": "Manage and join groups",
"createGroupTitle": "Create Group - IM",
"createGroupDescription": "Create a new group chat",
"momentsTitle": "Moments - IM",
"momentsDescription": "View friends' updates",
"momentsNotificationsTitle": "Moments Notifications - IM",
"momentsNotificationsDescription": "View moments interaction notifications",
"settingsTitle": "Settings - IM",
"settingsDescription": "Personalize your IM experience",
"profileTitle": "Profile - IM",
"profileDescription": "Edit your profile",
"aiSettingsTitle": "AI Settings - IM",
"aiSettingsDescription": "Configure AI assistant"
```

**Naming convention:** Meta keys use `XxxTitle` / `XxxDescription` suffix to avoid collision with existing UI keys (e.g. `login`, `chat`).

## File Changes Summary

| File | Operation | Description |
|------|-----------|-------------|
| `core/router/route_registry.dart` | Create | `RouteEntry` class + `routeRegistry` |
| `core/router/route_meta.dart` | Modify | `RouteMeta` kept as-is, derived from registry |
| `core/router/route_resolver.dart` | Modify | `routeMetaMap` becomes getter from registry |
| `core/web_meta/web_meta_defaults.dart` | Modify | `pageMetaMap` removed, `metaForPath` accepts l10n |
| `core/web_meta/web_meta.dart` | Modify | Export updated |
| `l10n/app_zh.arb` | Modify | Add 24 meta i18n keys |
| `l10n/app_en.arb` | Modify | Add 24 meta i18n keys |
| `web/index.html` | Modify | Delete canonical tag |
| `app.dart` | Modify | Pass l10n to `metaForPath` |
| `test/core/router/route_registry_test.dart` | Create | Registry + consistency tests |
| `test/core/web_meta/page_meta_test.dart` | Modify | Update metaForPath tests |

## Testing Strategy

### New Test File: `test/core/router/route_registry_test.dart`

```dart
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
});

group('routeMetaMap consistency', () {
  test('routeMetaMap keys match routeRegistry keys', () {
    expect(routeMetaMap.keys.toSet(), routeRegistry.keys.toSet());
  });
});

group('metaForPath', () {
  test('returns correct meta for /login', () {
    final meta = metaForPath('/login', null);
    expect(meta.title, 'loginTitle'); // fallback when l10n is null
    expect(meta.canonicalPath, '/login');
  });

  test('returns correct meta for /chat', () {
    final meta = metaForPath('/chat', null);
    expect(meta.title, 'chatTitle');
    expect(meta.canonicalPath, '/chat');
  });

  test('returns correct meta for /settings', () {
    final meta = metaForPath('/settings', null);
    expect(meta.title, 'settingsTitle');
    expect(meta.canonicalPath, '/settings');
  });

  test('unknown path uses appFallbackMeta', () {
    final meta = metaForPath('/unknown', null);
    expect(meta.title, appFallbackMeta.title);
  });

  test('canonical does not contain localhost', () {
    for (final path in routeRegistry.keys) {
      final meta = metaForPath(path, null);
      expect(meta.canonicalPath, isNot(contains('localhost')));
    }
  });

  test('all routes have canonicalPath', () {
    for (final path in routeRegistry.keys) {
      final meta = metaForPath(path, null);
      expect(meta.canonicalPath, path);
    }
  });
});
```

### Test Coverage

- `/login`, `/chat`, `/settings` meta generation
- Unknown path fallback
- Canonical no localhost
- routeMetaMap vs routeRegistry path consistency
- debug/gallery exclusion

## Implementation Order

1. Create `core/router/route_registry.dart` with `RouteEntry` + `routeRegistry`
2. Update `core/router/route_resolver.dart` — `routeMetaMap` becomes getter
3. Update `core/web_meta/web_meta_defaults.dart` — remove `pageMetaMap`, update `metaForPath`
4. Update `l10n/app_zh.arb` and `l10n/app_en.arb` — add meta keys
5. Update `app.dart` — pass l10n to `metaForPath`
6. Update `web/index.html` — delete canonical tag
7. Create `test/core/router/route_registry_test.dart`
8. Update `test/core/web_meta/page_meta_test.dart`
9. Run tests, verify all pass

## Risk Assessment

| Risk | Mitigation |
|------|------------|
| `routeMetaMap` as getter creates new map per call | `resolveRouteMeta` caches map locally; 12-entry map overhead negligible |
| ARB key typo causes runtime error | `_resolveTitle` falls back to key itself, won't crash |
| i18n keys missing in new locale | `l10n?.translate(key) ?? key` fallback ensures no crash |
| GoRouter redirect depends on routeMetaMap | Getter provides same data, no behavioral change |
