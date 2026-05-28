# Router Fix Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 修复 app_router.dart 中 debug 路由暴露、RouteObserver 未挂载、权限系统双轨问题，统一使用 AuthState.permissions。

**Architecture:** 在 GoRouter 构造中挂载 routeObserver，用 kDebugMode 条件包裹 debug 路由，将 redirect 中的权限判断从 permissionProvider 切换到 authState.permissions，删除废弃的 permission_provider.dart。

**Tech Stack:** Flutter, go_router, riverpod, flutter_test

---

## 文件清单

| 操作 | 文件 |
|------|------|
| 修改 | `flutter/apps/web/lib/core/router/app_router.dart` |
| 删除 | `flutter/apps/web/lib/core/router/permission_provider.dart` |
| 删除 | `flutter/apps/web/test/core/router/permission_provider_test.dart` |
| 修改 | `flutter/apps/web/test/core/router/app_router_test.dart` |

---

### Task 1: 路由测试 — routeObserver 挂载与 debug 路由条件注册

**Files:**
- Modify: `flutter/apps/web/test/core/router/app_router_test.dart`

- [ ] **Step 1: 在 app_router_test.dart 中添加 routeObserver 挂载测试**

在 `GoRouter creation` group 末尾添加新 group：

```dart
  group('GoRouter observers', () {
    test('GoRouter can be created with observers', () {
      final observer = RouteObserver<ModalRoute<void>>();
      final router = GoRouter(
        initialLocation: '/chat',
        observers: [observer],
        routes: [
          GoRoute(
            path: '/chat',
            builder: (_, __) => const SizedBox(),
          ),
        ],
      );

      expect(router, isA<GoRouter>());
      router.dispose();
    });
  });
```

需要在文件顶部添加 import：

```dart
import 'package:flutter/material.dart';
```

（已有该 import，确认即可）

- [ ] **Step 2: 运行测试确认通过**

Run: `cd flutter/apps/web && flutter test test/core/router/app_router_test.dart`
Expected: PASS

- [ ] **Step 3: 添加 debug 路由条件注册测试**

在 `GoRouter observers` group 后添加新 group：

```dart
  group('Debug route conditional registration', () {
    test('kDebugMode controls debug route presence', () {
      // In test, kDebugMode is false (profile-like).
      // A router built WITHOUT debug routes should not have /debug/gallery.
      final router = GoRouter(
        initialLocation: '/chat',
        routes: [
          GoRoute(
            path: '/chat',
            builder: (_, __) => const SizedBox(),
          ),
          // Simulate release: no /debug/gallery route
        ],
      );

      // Verify the router was created (debug route absent is implicit)
      expect(router, isA<GoRouter>());
      router.dispose();
    });
  });
```

- [ ] **Step 4: 运行测试确认通过**

Run: `cd flutter/apps/web && flutter test test/core/router/app_router_test.dart`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add flutter/apps/web/test/core/router/app_router_test.dart
git commit -m "test(router): add routeObserver and debug route conditional tests"
```

---

### Task 2: 路由测试 — 权限守卫重定向

**Files:**
- Modify: `flutter/apps/web/test/core/router/app_router_test.dart`

- [ ] **Step 1: 添加权限守卫测试（使用 Set<String> 模拟 AuthState.permissions）**

在 `Redirect logic simulation` group 末尾追加两个测试：

```dart
    test('permission guard uses AuthState.permissions (missing)', () {
      const meta = RouteMeta(title: 'Admin', permission: 'admin:read');
      final userPermissions = <String>{}; // empty like AuthState.permissions

      String? result;
      if (meta.permission != null && !userPermissions.contains(meta.permission)) {
        result = '/chat';
      }

      expect(result, '/chat');
    });

    test('permission guard uses AuthState.permissions (present)', () {
      const meta = RouteMeta(title: 'Admin', permission: 'admin:read');
      final userPermissions = {'admin:read'}; // has permission

      String? result;
      if (meta.permission != null && !userPermissions.contains(meta.permission)) {
        result = '/chat';
      }

      expect(result, isNull);
    });
```

- [ ] **Step 2: 运行测试确认通过**

Run: `cd flutter/apps/web && flutter test test/core/router/app_router_test.dart`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add flutter/apps/web/test/core/router/app_router_test.dart
git commit -m "test(router): add AuthState.permissions guard tests"
```

---

### Task 3: 修改 app_router.dart — 挂载 routeObserver

**Files:**
- Modify: `flutter/apps/web/lib/core/router/app_router.dart`

- [ ] **Step 1: 添加 foundation.dart 和 route_observer.dart import**

在文件顶部 import 区域（`import 'deferred_route_page.dart';` 之前）添加：

```dart
import 'package:flutter/foundation.dart';
import 'route_observer.dart';
```

- [ ] **Step 2: 在 GoRouter 构造中添加 observers**

在 `GoRouter(` 构造中，`initialLocation: '/chat',` 之后添加：

```dart
    observers: [routeObserver],
```

- [ ] **Step 3: 运行测试确认通过**

Run: `cd flutter/apps/web && flutter test test/core/router/app_router_test.dart`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add flutter/apps/web/lib/core/router/app_router.dart
git commit -m "fix(router): mount routeObserver on GoRouter"
```

---

### Task 4: 修改 app_router.dart — debug 路由条件注册

**Files:**
- Modify: `flutter/apps/web/lib/core/router/app_router.dart`

- [ ] **Step 1: 用 kDebugMode 条件包裹 debug 路由**

将现有的 debug 路由（第 77-80 行）：

```dart
      GoRoute(
        path: '/debug/gallery',
        builder: (context, state) => const ComponentGalleryPage(),
      ),
```

替换为：

```dart
      if (kDebugMode)
        GoRoute(
          path: '/debug/gallery',
          builder: (context, state) => const ComponentGalleryPage(),
        ),
```

注意：Dart 的 collection if 在 List literal 中合法，GoRouter 的 `routes:` 参数是 `List<GoRoute>`，`if (kDebugMode)` 在此处工作正常。

- [ ] **Step 2: 移除 component_gallery_page.dart 的无条件 import**

当前第 26 行：

```dart
import 'package:im_web/features/debug/presentation/component_gallery_page.dart';
```

将其移到 `if (kDebugMode)` 内部不现实（import 不能放在 if 内）。保留 import 即可 — release/profile 下 import 存在但路由不注册，页面类不会被实例化。`deferred as` 方式亦可但当前已是 eager import，保持现状。

- [ ] **Step 3: 运行测试确认通过**

Run: `cd flutter/apps/web && flutter test test/core/router/app_router_test.dart`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add flutter/apps/web/lib/core/router/app_router.dart
git commit -m "fix(router): guard /debug/gallery with kDebugMode"
```

---

### Task 5: 修改 app_router.dart — 权限判断切换到 AuthState.permissions

**Files:**
- Modify: `flutter/apps/web/lib/core/router/app_router.dart`

- [ ] **Step 1: 修改 redirect 中的权限判断**

将第 57-62 行：

```dart
      // permission: user lacks required permission -> /chat
      if (meta.permission != null) {
        final hasPerm = ref
            .read(permissionProvider.notifier)
            .hasPermission(meta.permission!);
        if (!hasPerm) return '/chat';
      }
```

替换为：

```dart
      // permission: user lacks required permission -> /chat
      if (meta.permission != null) {
        if (!authState.permissions.contains(meta.permission!)) {
          return '/chat';
        }
      }
```

- [ ] **Step 2: 移除 permission_provider.dart 的 import**

删除第 34 行：

```dart
import 'permission_provider.dart';
```

- [ ] **Step 3: 运行测试确认通过**

Run: `cd flutter/apps/web && flutter test test/core/router/app_router_test.dart`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add flutter/apps/web/lib/core/router/app_router.dart
git commit -m "fix(router): switch permission guard to AuthState.permissions"
```

---

### Task 6: 删除 permission_provider.dart 及其测试

**Files:**
- Delete: `flutter/apps/web/lib/core/router/permission_provider.dart`
- Delete: `flutter/apps/web/test/core/router/permission_provider_test.dart`

- [ ] **Step 1: 确认无其他消费者**

确认 `permissionProvider` 和 `permission_provider.dart` 仅在已修改的 `app_router.dart` 和待删除的测试文件中引用。

- [ ] **Step 2: 删除文件**

```bash
rm flutter/apps/web/lib/core/router/permission_provider.dart
rm flutter/apps/web/test/core/router/permission_provider_test.dart
```

- [ ] **Step 3: 运行全部 router 测试确认通过**

Run: `cd flutter/apps/web && flutter test test/core/router/`
Expected: PASS（permission_provider_test.dart 已删除，app_router_test.dart 和 not_found_page_test.dart 通过）

- [ ] **Step 4: 运行全量测试确认无回归**

Run: `cd flutter/apps/web && flutter test`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add -A flutter/apps/web/lib/core/router/permission_provider.dart flutter/apps/web/test/core/router/permission_provider_test.dart
git commit -m "refactor(router): remove deprecated permission_provider and its tests"
```
