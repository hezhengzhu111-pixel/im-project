# App 启动生命周期与 WebMeta 修复设计

## 概述

修复 `flutter/apps/web/lib/app.dart` 中 App 启动生命周期、路由监听、WebMeta 更新和 Navigator 包装方式，确保路由跳转、语言切换、SEO meta、RouteObserver 都稳定工作。

## 当前问题

1. **initState 中不合规的 ref.listen** — 在 `addPostFrameCallback` 内调用 `ref.listen<GoRouter>`，违反 Riverpod 生命周期规范
2. **路由监听不准确** — 监听 `routerProvider` 本身（Provider 实例变化），而非 GoRouter 的实际路由变化，普通路由跳转不触发 meta 更新
3. **嵌套 Navigator** — `MaterialApp.router.builder` 中额外包裹了一层 `Navigator`，与 GoRouter 已配置的 `observers` 冲突
4. **WebMeta 更新不可靠** — 只在启动后执行一次 `appFallbackMeta`，后续路由和语言变化的 meta 更新机制不可靠
5. **AppLogger.init 延迟** — 放在 `addPostFrameCallback` 中，早期启动错误无法进入统一 logger

## 设计方案

### 1. 移除嵌套 Navigator

**改动文件**: `flutter/apps/web/lib/app.dart`

删除 `MaterialApp.router.builder` 中的 `Navigator` 包装，保留 `BreakpointScope` 直接包裹 `child`。

```dart
// Before
builder: (context, child) {
  return BreakpointScope(
    child: Navigator(
      observers: [routeObserver],
      onGenerateRoute: (_) => MaterialPageRoute(
        builder: (_) => child ?? const SizedBox.shrink(),
      ),
    ),
  );
},

// After
builder: (context, child) {
  return BreakpointScope(
    child: child ?? const SizedBox.shrink(),
  );
},
```

`routeObserver` 已在 `app_router.dart` 的 GoRouter 构造函数中注册（`observers: [routeObserver]`），无需重复。

### 2. WebMeta 更新机制重构

**改动文件**: `flutter/apps/web/lib/app.dart`

#### 路由变化监听

使用 `GoRouter.routeInformationProvider.addListener` 监听底层 URI 变化：

```dart
late final GoRouter _router;

@override
void initState() {
  super.initState();
  _router = ref.read(routerProvider);
  _router.routeInformationProvider.addListener(_onRouteChanged);
}

void _onRouteChanged() {
  final path = _router.routeInformationProvider.value.uri.path;
  final l10n = ref.read(languageProvider);
  final meta = metaForPath(path, l10n);
  _webMetaService.apply(meta);
}
```

#### Locale 变化监听

使用 `ref.listenManual` 在 initState 中注册，locale 变化时重新 apply 当前 path 的 meta：

```dart
ref.listenManual(languageProvider, (previous, next) {
  if (previous != next) {
    final path = _router.routeInformationProvider.value.uri.path;
    final meta = metaForPath(path, next);
    _webMetaService.apply(meta);
  }
});
```

#### 清理

```dart
@override
void dispose() {
  _router.routeInformationProvider.removeListener(_onRouteChanged);
  super.dispose();
}
```

### 3. initState 生命周期重排

**改动文件**: `flutter/apps/web/lib/app.dart`

```dart
@override
void initState() {
  super.initState();
  
  // 1. 同步初始化 AppLogger（确保早期错误可记录）
  AppLogger.init(errorReporter: ref.read(errorReporterProvider));
  
  // 2. 获取 router 实例，注册路由监听
  _router = ref.read(routerProvider);
  _router.routeInformationProvider.addListener(_onRouteChanged);
  
  // 3. 注册 locale 变化监听（ref.listenManual 在 initState 中合规）
  ref.listenManual(languageProvider, _onLocaleChanged);
  
  // 4. 启动一次性操作
  ref.read(authStateProvider.notifier).checkAuth();
  _trackAppStart();
  
  // 5. 应用初始 meta（首帧使用 fallback，路由 listener 会在路由确定后更新）
  _webMetaService.apply(appFallbackMeta);
}
```

### 4. 测试覆盖

**新增文件**: `flutter/apps/web/test/app_lifecycle_test.dart`

| 测试用例 | 验证内容 |
|---------|---------|
| 路由跳转触发 meta 更新 | 从 `/login` 跳转到 `/chat` 时，`WebMetaService.apply` 被调用且参数包含正确的 title |
| Locale 切换触发 meta 更新 | 切换语言后，当前 path 的 meta 使用新 locale 重新生成 |
| MaterialApp.router 无嵌套 Navigator | `MaterialApp.router` 的 `builder` 返回的 widget 树中不包含 `Navigator` |
| routeObserver 仅通过 GoRouter 注册 | 验证 `routeObserver` 只在 GoRouter 的 observers 中出现 |

## 不改动的部分

- `app_router.dart` 路由表（除非必须）
- `WebMetaService` 的 web/noop 条件实现
- `dart:html` 不引入跨平台文件
- auth check、analytics 等现有行为
- themeMode / locale / routerConfig 的 watch 方式

## 依赖关系

- `routeInformationProvider` 是 Flutter 框架 API，无需额外依赖
- `ref.listenManual` 是 Riverpod 2.x API，项目已使用
- `WebMetaService` 保持现有接口不变

## 风险评估

| 风险 | 影响 | 缓解措施 |
|-----|------|---------|
| routeInformationProvider 在首帧前无有效 path | 首次 meta 更新可能拿到空 path | 使用 `appFallbackMeta` 作为初始值，listener 在路由确定后覆盖 |
| locale 变化时 routeInformationProvider 可能未初始化 | NPE | 在 `_onLocaleChanged` 中检查 `_router` 是否已初始化 |
| 移除嵌套 Navigator 影响 BreakpointScope | 低风险，BreakpointScope 不依赖 Navigator | 保留 BreakpointScope 包裹方式不变 |
