# Web Meta Management for Flutter Web

## Overview

Add Nuxt/vue-meta-like metadata management to the Flutter Web IM app. Route-level `title`, `description`, `canonical`, Open Graph, and Twitter Card tags update dynamically as the user navigates. A static HTML fallback in `index.html` provides minimal SEO for crawlers.

## Goals

- Route-driven `<title>` and `<meta>` tag updates on every GoRouter navigation
- Default IM application metadata as fallback for routes without explicit meta
- Open Graph + Twitter Card support for share cards
- Canonical URL support
- Web-only implementation, isolated from non-Web platforms

## Non-Goals

- SSR/SSG (Flutter Web cannot provide this)
- Full SEO framework integration
- Widget-level meta context (no InheritedWidget for meta)

## Architecture

### Data Model: `WebMeta`

Located at `lib/core/web_meta/web_meta.dart`.

```dart
class WebMeta {
  final String title;
  final String description;
  final String? canonical;
  final String? ogTitle;
  final String? ogDescription;
  final String? ogImage;
  final String? ogUrl;
  final String? twitterCard;    // 'summary' | 'summary_large_image'
  final String? twitterTitle;
  final String? twitterDescription;
  final String? twitterImage;
}
```

Fields with `?` are optional. When omitted, the service uses sensible defaults derived from `title` and `description`.

### Service: `WebMetaService`

Located at `lib/core/web_meta/web_meta_service.dart`.

Responsibilities:
- `applyMeta(WebMeta meta)` — updates `document.title` and all `<meta>` tags
- `applyDefault()` — applies the default IM application metadata
- Internal `_setMeta(String name, String? content, {String? property})` — finds or creates a `<meta>` tag by `name` or `property` attribute
- Internal `_removeCanonical()` / `_setCanonical(String href)` — manages `<link rel="canonical">`

Uses `dart:html` for DOM manipulation. Guarded by `kIsWeb` — all methods are no-op on non-Web platforms.

### Route Listener: `webMetaListenerProvider`

Located at `lib/core/web_meta/web_meta_listener.dart`.

A Riverpod `Provider<void>` that:
1. Watches `routerProvider` to get the current `GoRouterState`
2. Extracts `WebMeta` from `state.extra`
3. Falls back to default meta if `extra` is null or not a `WebMeta`
4. Calls `WebMetaService.applyMeta()`

Registered in `providers.dart` and consumed by the app root.

### Route Configuration Changes

Each `GoRoute` in `app_router.dart` receives an `extra: WebMeta(...)`:

| Path | Title | Description |
|---|---|---|
| `/login` | 登录 - IM | 安全即时通讯应用，端到端加密保护您的隐私 |
| `/register` | 注册 - IM | 创建您的 IM 账户，开始安全通讯 |
| `/chat` | 聊天 - IM | 与好友实时沟通，端到端加密 |
| `/contacts` | 通讯录 - IM | 管理您的联系人列表 |
| `/contacts/add` | 添加好友 - IM | 搜索并添加新朋友 |
| `/groups` | 群组 - IM | 管理您的群组 |
| `/groups/create` | 创建群组 - IM | 创建新的群组聊天 |
| `/moments` | 朋友圈 - IM | 查看好友动态，分享生活 |
| `/moments/notifications` | 朋友圈通知 - IM | 查看朋友圈互动 |
| `/settings` | 设置 - IM | 个性化您的 IM 体验 |
| `/settings/profile` | 个人资料 - IM | 编辑您的个人信息 |
| `/settings/ai` | AI 设置 - IM | 配置 AI 助手 |

### Default Meta

When a route has no `WebMeta` in `extra`, the service falls back to:

```dart
const defaultMeta = WebMeta(
  title: 'IM - 安全即时通讯',
  description: '端到端加密的即时通讯应用，保护您的隐私',
  ogTitle: 'IM - 安全即时通讯',
  ogDescription: '端到端加密的即时通讯应用，保护您的隐私',
  ogImage: '/icons/icon-512.png',
  twitterCard: 'summary',
  twitterTitle: 'IM - 安全即时通讯',
  twitterDescription: '端到端加密的即时通讯应用，保护您的隐私',
);
```

### index.html Changes

Add the following meta tags to `<head>`:

```html
<!-- Open Graph -->
<meta property="og:type" content="website">
<meta property="og:site_name" content="IM">
<meta property="og:title" content="IM - 安全即时通讯">
<meta property="og:description" content="端到端加密的即时通讯应用">
<meta property="og:image" content="/icons/icon-512.png">

<!-- Twitter Card -->
<meta name="twitter:card" content="summary">
<meta name="twitter:title" content="IM - 安全即时通讯">
<meta name="twitter:description" content="端到端加密的即时通讯应用">

<!-- Canonical -->
<link rel="canonical" href="/">
```

These serve as the initial/static fallback before Flutter loads and the JS meta updater takes over.

## File Structure

```
lib/core/web_meta/
  web_meta.dart              # WebMeta data class
  web_meta_service.dart      # DOM manipulation service
  web_meta_listener.dart     # Riverpod route listener provider
```

Modified files:
- `lib/core/router/app_router.dart` — add `extra: WebMeta(...)` to each route
- `lib/core/di/providers.dart` — register `webMetaListenerProvider`
- `web/index.html` — add OG/Twitter/canonical meta tags

## Platform Isolation

- `WebMetaService` uses `dart:html` (already used by `web_ws_adapter.dart`)
- All public methods check `kIsWeb` and are no-op on non-Web
- No `dart:html` imports outside `lib/core/web_meta/`
- No Widget-level DOM access

## Testing

### Unit Tests

- `WebMetaService`: test `_setMeta` creates/updates tags, `applyMeta` sets correct title and all meta fields, `applyDefault` uses fallback values
- `WebMeta`: test constructor, field defaults, immutability

### Widget/Integration Tests

- Verify `webMetaListenerProvider` reacts to route changes
- Mock `GoRouterState` with `extra: WebMeta(...)`, assert `document.title` updated
- Mock `GoRouterState` with null `extra`, assert default meta applied

### Manual Verification

1. `flutter run -d chrome`
2. Navigate to each page, inspect Elements panel for correct `<title>` and `<meta>` tags
3. Share a page URL on social media, verify preview card shows correct title/description/image

## Flutter Web SEO Boundary

This implementation provides:
- Dynamic `<title>` and `<meta>` for browser tabs and social share crawlers that execute JavaScript
- Static HTML fallback in `index.html` for basic crawlers

This does NOT provide:
- Server-side rendered HTML content
- Pre-rendered routes for search engine indexing
- True SSR/SSG capabilities

For an IM application, this level of meta management is sufficient — the primary use case is share cards and browser tab titles, not content SEO.
