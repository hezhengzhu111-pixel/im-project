# Meta 国际化设计

## 概述

修复 `index.html` 和 `appFallbackMeta` 的静态中文默认值，确保 Flutter 启动前、启动后、路由变化后和语言切换后 meta 表现一致。

## 当前问题

1. `web/index.html` 写死中文 description、og:title、og:description、twitter:title、twitter:description 和 `html lang="zh-CN"`
2. `appFallbackMeta` 是中文常量，不支持多语言
3. 动态 meta 只有 Flutter 启动后才能覆盖，首屏 HTML 和分享爬虫默认值仍偏中文
4. `/chat/:sessionId` 缺少 canonical 归一策略

## 设计方案

### 方案选择

采用**纯客户端方案**：
- Flutter Web 本质是 SPA，首屏内容有限是预期行为
- 搜索引擎对 SPA 的索引能力已大幅改善
- 分享场景主要依赖 Flutter 启动后的动态 meta
- 实现最简单，不引入额外构建复杂度

---

## 第一段：index.html 改造

**目标**：移除中文硬编码，保留语言中性默认值。

### 变更内容

```html
<!-- 移除 -->
<html lang="zh-CN">  →  <html lang="en">
<meta name="description" content="IM 是一款安全即时通讯应用...">  →  删除
<meta property="og:title" content="IM - 安全即时通讯">  →  删除
<meta property="og:description" content="...">  →  删除
<meta property="og:locale" content="zh_CN">  →  删除
<meta name="twitter:title" content="...">  →  删除
<meta name="twitter:description" content="...">  →  删除
<title>IM - 安全即时通讯</title>  →  <title>IM</title>

<!-- 保留 -->
<meta property="og:type" content="website">
<meta property="og:site_name" content="IM">
<meta property="og:image" content="icons/icon-512.png">
<meta name="twitter:card" content="summary">
<meta name="twitter:site" content="@im_app">
<meta name="twitter:image" content="icons/icon-512.png">
<meta name="viewport" content="...">
<meta name="theme-color" content="#1a1a2e">
```

**加载指示器**：保留中文 "加载中..." 和离线提示，这是首屏 UI，不影响 SEO。

---

## 第二段：appFallbackMeta 改造

**目标**：将常量改为函数，支持 l10n 本地化。

### 变更内容

```dart
// web_meta_defaults.dart

// 删除旧常量
// const appFallbackMeta = PageMeta(...);

// 新增函数
PageMeta fallbackMetaForLocale(AppLocalizations? l10n) {
  if (l10n != null) {
    return PageMeta(
      title: l10n.seoAppTitle,
      description: l10n.seoAppDescription,
      canonicalPath: '/',
      og: OgMeta(
        title: l10n.seoAppTitle,
        description: l10n.seoAppDescription,
        type: 'website',
      ),
      twitter: TwitterMeta(
        card: 'summary',
        title: l10n.seoAppTitle,
        description: l10n.seoAppDescription,
      ),
    );
  }

  // null 时返回英文默认
  return const PageMeta(
    title: 'IM - Secure Messaging',
    description: 'IM is a secure messaging app with end-to-end encryption, group chat, and more.',
    canonicalPath: '/',
    og: OgMeta(
      title: 'IM - Secure Messaging',
      description: 'IM is a secure messaging app with end-to-end encryption, group chat, and more.',
      type: 'website',
    ),
    twitter: TwitterMeta(
      card: 'summary',
      title: 'IM - Secure Messaging',
      description: 'IM is a secure messaging app with end-to-end encryption, group chat, and more.',
    ),
  );
}
```

### ARB 新增 key

```json
// app_zh.arb
"seoAppTitle": "IM - 安全即时通讯",
"seoAppDescription": "IM 是一款安全即时通讯应用，支持端到端加密、群组聊天、朋友圈等功能"

// app_en.arb
"seoAppTitle": "IM - Secure Messaging",
"seoAppDescription": "IM is a secure messaging app with end-to-end encryption, group chat, and more."
```

### 调用方修改（app.dart）

```dart
// 旧
_webMetaService.apply(appFallbackMeta);

// 新
final locale = ref.read(languageProvider);
final l10n = lookupAppLocalizations(Locale(locale));
_webMetaService.apply(fallbackMetaForLocale(l10n));
```

---

## 第三段：WebMetaService 增强

**目标**：`apply` 时同步更新 `document.documentElement.lang`、`og:locale`、`og:locale:alternate`。

### 变更内容

```dart
// web_meta_service_web.dart

class WebMetaServiceImpl implements WebMetaService {
  String get _baseUrl => web.window.location.origin;

  // 支持的语言列表
  static const _supportedLocales = ['zh', 'en'];

  @override
  void apply(PageMeta meta, {String? locale}) {
    _setTitle(meta.title);
    _setMeta('description', meta.description);
    _setCanonical(meta.canonicalPath);
    _setOg(meta);
    _setTwitter(meta);
    if (locale != null) {
      _setLocale(locale);
    }
  }

  void _setLocale(String locale) {
    // 更新 <html lang>
    web.document.documentElement?.setAttribute('lang', locale);

    // 更新 og:locale
    final ogLocale = locale.replaceAll('-', '_'); // zh-CN → zh_CN
    _setProperty('og:locale', ogLocale);

    // 设置 og:locale:alternate（排除当前语言）
    for (final alt in _supportedLocales) {
      if (alt != locale) {
        final altOg = alt.replaceAll('-', '_');
        _setProperty('og:locale:alternate', altOg);
      }
    }
  }

  // ... 其他方法不变
}
```

### 接口修改

```dart
// web_meta_service.dart
abstract class WebMetaService {
  void apply(PageMeta meta, {String? locale});
}

// NoOpWebMetaService 同步修改
class NoOpWebMetaService implements WebMetaService {
  @override
  void apply(PageMeta meta, {String? locale}) {}
}
```

### 调用方修改（app.dart）

```dart
// 旧
_webMetaService.apply(meta);

// 新
_webMetaService.apply(meta, locale: locale);
```

---

## 第四段：routeRegistry 增强

**目标**：支持 `/chat/:sessionId` 归一到 `/chat` 的 canonical 策略。

### 变更内容

```dart
// route_registry.dart

class RouteEntry {
  final String titleKey;
  final bool requiresAuth;
  final bool hideForAuth;
  final String? permission;
  final String descriptionKey;
  final String? ogImage;
  final String? ogType;
  final String? canonicalOverride;  // 新增

  const RouteEntry({
    required this.titleKey,
    this.requiresAuth = true,
    this.hideForAuth = false,
    this.permission,
    required this.descriptionKey,
    this.ogImage,
    this.ogType,
    this.canonicalOverride,  // 新增
  });
}

const routeRegistry = <String, RouteEntry>{
  '/chat': RouteEntry(
    titleKey: 'seoChatTitle',
    descriptionKey: 'seoChatDescription',
    canonicalOverride: '/chat',
  ),
  // ... 其他路由不变
};
```

### metaForPath 修改

```dart
// web_meta_defaults.dart

PageMeta metaForPath(String path, AppLocalizations? l10n) {
  // 先尝试精确匹配
  var entry = routeRegistry[path];

  // 精确匹配失败时，尝试前缀匹配（处理 /chat/abc123）
  if (entry == null) {
    for (final regEntry in routeRegistry.entries) {
      if (path.startsWith('${regEntry.key}/')) {
        entry = regEntry.value;
        break;
      }
    }
  }

  if (entry == null) return fallbackMetaForLocale(l10n);

  final title = l10n?.translate(entry.titleKey) ?? entry.titleKey;
  final description = l10n?.translate(entry.descriptionKey) ?? entry.descriptionKey;

  // 使用 canonicalOverride 或原始 path
  final canonicalPath = entry.canonicalOverride ?? path;

  return PageMeta(
    title: title,
    description: description,
    canonicalPath: canonicalPath,
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

### 效果

| 路径 | Canonical |
|------|-----------|
| `/chat` | `/chat` |
| `/chat/abc123` | `/chat` |
| `/settings/ai` | `/settings/ai` |

---

## 第五段：测试设计

**目标**：覆盖核心逻辑层，确保 meta 生成正确。

### 新增测试用例

```dart
// page_meta_test.dart 新增

group('fallbackMetaForLocale', () {
  test('returns Chinese meta for zh locale', () {
    final l10n = lookupAppLocalizations(const Locale('zh'));
    final meta = fallbackMetaForLocale(l10n);
    expect(meta.title, 'IM - 安全即时通讯');
    expect(meta.description, contains('端到端加密'));
    expect(meta.og?.title, meta.title);
    expect(meta.twitter?.title, meta.title);
  });

  test('returns English meta for en locale', () {
    final l10n = lookupAppLocalizations(const Locale('en'));
    final meta = fallbackMetaForLocale(l10n);
    expect(meta.title, 'IM - Secure Messaging');
    expect(meta.description, contains('end-to-end'));
  });

  test('returns English meta when l10n is null', () {
    final meta = fallbackMetaForLocale(null);
    expect(meta.title, 'IM - Secure Messaging');
    expect(meta.canonicalPath, '/');
  });

  test('all fallback meta has og and twitter', () {
    final meta = fallbackMetaForLocale(null);
    expect(meta.og, isNotNull);
    expect(meta.twitter, isNotNull);
    expect(meta.og?.type, 'website');
    expect(meta.twitter?.card, 'summary');
  });
});

group('metaForPath with canonicalOverride', () {
  test('/chat/abc123 normalizes to /chat canonical', () {
    final meta = metaForPath('/chat/abc123', null);
    expect(meta.canonicalPath, '/chat');
    expect(meta.title, 'seoChatTitle');
  });

  test('/settings/ai keeps its own canonical', () {
    final meta = metaForPath('/settings/ai', null);
    expect(meta.canonicalPath, '/settings/ai');
  });

  test('unknown route returns fallback', () {
    final meta = metaForPath('/unknown/path', null);
    expect(meta.title, 'IM - Secure Messaging');
    expect(meta.canonicalPath, '/');
  });
});

group('index.html validation', () {
  test('does not contain hardcoded Chinese descriptions', () {
    final content = File('web/index.html').readAsStringSync();
    expect(content, isNot(contains('安全即时通讯')));
    expect(content, isNot(contains('端到端加密')));
  });

  test('does not contain localhost', () {
    final content = File('web/index.html').readAsStringSync();
    expect(content, isNot(contains('localhost')));
  });

  test('html lang is en', () {
    final content = File('web/index.html').readAsStringSync();
    expect(content, contains('<html lang="en"'));
  });
});
```

### 现有测试更新

- `appFallbackMeta` 相关测试改为调用 `fallbackMetaForLocale(null)`
- 确保现有路由测试仍通过

---

## 第六段：文档说明

**目标**：记录方案边界和限制。

### 新增文档（`docs/flutter-web-seo.md`）

```markdown
# Flutter Web SEO 方案

## 架构概述

本项目采用纯客户端 meta 更新策略：

- `index.html`：只包含语言中性的最小默认 meta
- `WebMetaService`：Flutter 启动后动态更新所有 meta 标签
- `routeRegistry`：单一来源，定义路由与 meta 的映射关系

## 重要限制

### 不是 SSR

Flutter Web 是单页应用（SPA），**不是**服务端渲染（SSR）。

- 首屏 HTML 只有最小化 meta，不含页面具体内容
- 所有 meta 在 Flutter 启动后由客户端 JavaScript 更新
- 搜索引擎爬虫可能无法索引动态内容

### 分享卡片

当前方案保证：
- ✅ Flutter 启动后，分享链接能显示正确的标题和描述
- ✅ 支持 Open Graph 和 Twitter Card 协议
- ✅ 多语言环境下 meta 内容正确本地化

当前方案**不保证**：
- ❌ 首屏 HTML 就有完整 meta（需等 Flutter 加载）
- ❌ 所有爬虫都能索引动态内容
- ❌ 无 JavaScript 环境下能获取 meta

## 语言支持

- 默认语言：`<html lang="en">`
- 支持语言：zh, en
- `og:locale` 和 `og:locale:alternate` 由 `WebMetaService` 动态管理

## Canonical 策略

| 路由模式 | Canonical |
|---------|-----------|
| `/chat` | `/chat` |
| `/chat/:sessionId` | `/chat`（归一） |
| `/settings/ai` | `/settings/ai` |
| 其他 | 使用原始路径 |

## 测试

测试覆盖逻辑层（`fallbackMetaForLocale`、`metaForPath`），不测试 DOM 操作。
```

---

## 技术约束

- 不引入 Nuxt/SSR
- 不破坏现有 WebMetaService 条件导入
- 不在路由表和 PageMeta 再维护两套 path

## 文件变更清单

| 文件 | 变更类型 |
|------|---------|
| `flutter/apps/web/web/index.html` | 修改 |
| `flutter/apps/web/lib/core/web_meta/web_meta_defaults.dart` | 修改 |
| `flutter/apps/web/lib/core/web_meta/web_meta_service.dart` | 修改 |
| `flutter/apps/web/lib/core/web_meta/web_meta_service_web.dart` | 修改 |
| `flutter/apps/web/lib/core/web_meta/web_meta_service_stub.dart` | 修改 |
| `flutter/apps/web/lib/core/router/route_registry.dart` | 修改 |
| `flutter/apps/web/lib/app.dart` | 修改 |
| `flutter/apps/web/lib/l10n/app_zh.arb` | 修改 |
| `flutter/apps/web/lib/l10n/app_en.arb` | 修改 |
| `flutter/apps/web/test/core/web_meta/page_meta_test.dart` | 修改 |
| `docs/flutter-web-seo.md` | 新增 |
