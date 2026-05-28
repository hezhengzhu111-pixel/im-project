# Router Fix: Debug 路由暴露、RouteObserver 挂载、权限双轨统一

## 问题

1. `/debug/gallery` 无条件注册，release/profile 下可访问
2. `RouteObserver` 已定义但未挂载到 GoRouter
3. 路由权限判断使用 `permissionProvider.notifier.hasPermission`（基于 `EmptyPermissionApi`，永远返回空），而 `AuthState.permissions` 已有完整权限数据

## 目标

- debug 路由仅在 `kDebugMode` 下注册
- GoRouter 挂载 `routeObserver`
- 统一使用 `AuthState.permissions` 作为路由权限来源
- 删除废弃的 `EmptyPermissionApi` / `PermissionNotifier`

## 不变

- `routeMetaMap` / `resolveRouteMeta` 不变
- 登录重定向行为不变（未登录 -> /login?redirect=，已登录 /login /register -> /chat）
- `route_meta.dart` 不变

## 实现

### 1. app_router.dart

- 添加 `import 'package:flutter/foundation.dart'` 和 `import 'route_observer.dart'`
- GoRouter 添加 `observers: [routeObserver]`
- `/debug/gallery` 路由用 `if (kDebugMode)` 条件包裹
- redirect 中权限判断改为 `authState.permissions.contains(meta.permission!)`
- 移除 `import 'permission_provider.dart'`

### 2. 删除 permission_provider.dart

- `EmptyPermissionApi`、`PermissionNotifier`、`permissionProvider` 无其他消费者，整体删除

### 3. 测试

- 删除 `permission_provider_test.dart`（测试的类已废弃）
- `app_router_test.dart` 增加：
  - routeObserver 挂载验证
  - debug 路由条件注册测试
  - 权限守卫重定向测试（使用 `AuthState.permissions`）
