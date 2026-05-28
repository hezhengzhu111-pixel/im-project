# Flutter Web Meta Management Design

## Overview

Add route-level HTML meta tag management for Flutter Web, similar to Nuxt/vue-meta. Each GoRoute carries a `PageMeta` object; a `WebMetaService` listens to route changes and updates `document.title` and `<meta>` tags via `package:web`.

## Scope

- `title`, `description`, `canonical`, Open Graph (`og:title`, `og:description`, `og:image`, `og:url`, `og:type`), Twitter Card (`twitter:card`, `twitter:title`, `twitter:description`, `twitter:image`)
- `theme-color`, viewport (static in index.html)
- Default fallback meta for routes without explicit meta
- Web-only: all DOM operations isolated to `core/web_meta/` directory

## Architecture

```
GoRoute.meta: {'pageMeta': PageMeta(...)}
        ↓
GoRouter listener (route change)
        ↓
WebMetaService.apply(PageMeta)
        ↓
package:web → document.title, meta tags
```

### Files to Create

| File | Purpose |
|------|---------|
| `lib/core/web_meta/page_meta.dart` | `PageMeta` data class |
| `lib/core/web_meta/web_meta_service.dart` | DOM update logic (package:web) |
| `lib/core/web_meta/web_meta_provider.dart` | Riverpod provider + route listener |
| `lib/core/web_meta/web_meta_defaults.dart` | Default meta per route + app-wide fallback |

### Files to Modify

| File | Change |
|------|--------|
| `lib/core/router/app_router.dart` | Add `meta: {'pageMeta': ...}` to each GoRoute |
| `lib/app.dart` | Mount WebMetaService listener |
| `web/index.html` | Add OG/Twitter/robots meta tags |
| `pubspec.yaml` | Add `package:web` dependency |

## Data Model: PageMeta

```dart
class PageMeta {
  final String title;
  final String description;
  final String? canonicalPath; // e.g. '/login'
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
  final String? type; // default 'website'

  const OgMeta({this.title, this.description, this.image, this.type});
}

class TwitterMeta {
  final String? card; // default 'summary'
  final String? title;
  final String? description;
  final String? image;

  const TwitterMeta({this.card, this.title, this.description, this.image});
}
```

## WebMetaService

Uses `package:web` (not `dart:html`) for DOM access. All code behind `kIsWeb` check.

```dart
class WebMetaService {
  static const _baseUrl = 'http://localhost:3000';

  void apply(PageMeta meta) {
    _setTitle(meta.title);
    _setMeta('description', meta.description);
    _setCanonical(meta.canonicalPath);
    _setOg(meta);
    _setTwitter(meta);
  }

  void applyDefault(PageMeta fallback) => apply(fallback);

  // Private methods use package:web:
  // - document.title = ...
  // - document.querySelector('meta[name="description"]')?.setAttribute(...)
  // - document.querySelector('meta[property="og:..."]')?.setAttribute(...)
}
```

Key behaviors:
- If a meta tag doesn't exist in DOM, create it via `document.createElement('meta')`
- If a tag exists, update its attribute
- `canonical`: set `<link rel="canonical">` or create if missing
- OG defaults: `og:type` = 'website', `og:url` = `_baseUrl + canonicalPath`

## GoRouter Integration

Each route gets a `meta` map with a `PageMeta` value:

```dart
GoRoute(
  path: '/login',
  meta: {'pageMeta': PageMeta(
    title: '登录 - IM',
    description: '安全即时通讯，端到端加密',
    canonicalPath: '/login',
    og: OgMeta(title: '登录 - IM', description: '安全即时通讯'),
    twitter: TwitterMeta(title: '登录 - IM'),
  )},
  builder: (_, __) => const LoginPage(),
),
```

In `app.dart`, add a listener on `routerProvider`:

```dart
// Inside _AppState, addPostFrameCallback:
ref.listen<GoRouter>(routerProvider, (prev, next) {
  final pageMeta = next.state?.meta?['pageMeta'] as PageMeta?;
  if (pageMeta != null) {
    _webMetaService.apply(pageMeta);
  } else {
    _webMetaService.applyDefault(defaultMeta);
  }
});
```

## Default Meta per Route

| Route | Title | Description |
|-------|-------|-------------|
| `/login` | 登录 - IM | 安全即时通讯，端到端加密登录 |
| `/register` | 注册 - IM | 创建您的 IM 账户 |
| `/chat` | 聊天 - IM | 与好友安全聊天，端到端加密 |
| `/contacts` | 通讯录 - IM | 管理您的联系人 |
| `/contacts/add` | 添加好友 - IM | 搜索并添加新朋友 |
| `/groups` | 群组 - IM | 管理和加入群组 |
| `/groups/create` | 创建群组 - IM | 创建新的群组聊天 |
| `/moments` | 朋友圈 - IM | 查看好友动态 |
| `/moments/notifications` | 动态通知 - IM | 查看朋友圈互动通知 |
| `/settings` | 设置 - IM | 个性化您的 IM 体验 |
| `/settings/profile` | 个人资料 - IM | 编辑您的个人资料 |
| `/settings/ai` | AI 设置 - IM | 配置 AI 助手 |

App-wide fallback (when route has no meta):
- title: `IM - 安全即时通讯`
- description: `IM 是一款安全即时通讯应用，支持端到端加密、群组聊天、朋友圈等功能`

## index.html Changes

Add before existing `<meta name="description">`:

```html
<!-- Open Graph -->
<meta property="og:site_name" content="IM">
<meta property="og:locale" content="zh_CN">
<meta property="og:type" content="website">

<!-- Twitter Card -->
<meta name="twitter:card" content="summary">
<meta name="twitter:site" content="@im_app">

<!-- Robots -->
<meta name="robots" content="index, follow">
<link rel="canonical" href="http://localhost:3000/">
```

## SEO Boundary (Important)

Flutter Web renders to a CanvasKit/WebGL canvas or a DOM tree depending on the renderer. This meta management:
- Updates `<head>` meta tags for social sharing cards (Facebook, Twitter, Slack previews)
- Updates `document.title` for browser tabs
- Provides a minimal static HTML fallback in index.html for crawlers

**Cannot do:**
- Server-side rendering of page content
- Pre-rendering routes to static HTML
- Full SEO for content-heavy pages (use SSR/SSG for that)

IM apps are primarily dynamic — this covers the practical needs: share cards, browser titles, basic crawler hints.

## Testing Strategy

1. **Unit test**: `WebMetaService` with mock DOM (or skip DOM tests, test PageMeta data class only)
2. **Widget test**: Verify GoRoute.meta is populated correctly
3. **Manual verification**: Run Flutter Web, navigate between pages, inspect `<head>` in DevTools
4. **Share card test**: Paste URL into Facebook Debugger / Twitter Card Validator

Minimal automated test:
```dart
test('PageMeta has required fields', () {
  const meta = PageMeta(title: 'Test', description: 'Desc');
  expect(meta.title, 'Test');
  expect(meta.description, 'Desc');
});
```

## Implementation Order

1. Add `package:web` to pubspec.yaml
2. Create `PageMeta` data class
3. Create `WebMetaService` with DOM operations
4. Create `WebMetaProvider` (Riverpod)
5. Update `app_router.dart` with meta on all routes
6. Mount listener in `app.dart`
7. Update `index.html` with static meta tags
8. Add unit tests for PageMeta
