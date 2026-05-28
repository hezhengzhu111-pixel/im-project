# Flutter Web 性能优化设计方案

## 概述

为 Flutter Web 增加可量化的性能优化：首屏 loading、deferred imports、构建体积预算、WASM/renderer 构建策略和性能文档。

### 当前痛点

- Vue Web 依靠 Vite 动态 import 做路由级代码分割
- Flutter Web 所有页面静态 import 到 `app_router.dart`，导致业务页面、settings、moments、group、E2EE 等模块进入首包
- 没有构建体积预算、首屏 loading 或 renderer 策略
- `providers.dart` 是单体文件，拉入所有 feature 的 data/state 层代码

### 对标 Vue + Vite 能力

- 路由级 lazy loading
- chunk 加载失败恢复
- 构建产物分析
- 首屏 loading shell
- 按环境构建 dev/sit/prod

## 设计方案

### 1. DeferredRoutePage 包装器

**目标**：封装统一的 lazy loading 包装器，处理 loading、error、retry 三种状态。

**文件**：`core/router/deferred_route_page.dart`

**接口设计**：

```dart
class DeferredRoutePage<T> extends StatefulWidget {
  final Future<void> Function() loadLibrary;
  final T Function() builder;
  final Widget Function()? loadingBuilder;
  final Widget Function(Object error, VoidCallback retry)? errorBuilder;

  const DeferredRoutePage({
    required this.loadLibrary,
    required this.builder,
    this.loadingBuilder,
    this.errorBuilder,
    super.key,
  });
}
```

**核心逻辑**：
- `initState` 时调用 `loadLibrary()`
- `setState` 切换 loading → loaded / error
- error 状态提供 retry 按钮，点击重新调用 `loadLibrary()`
- 使用 `FutureBuilder` 或手动管理 `AsyncSnapshot`

**适用路由**（5 个低频页面）：

| 路由 | Deferred Import | Widget |
|---|---|---|
| `/settings/profile` | `deferred as profile_page` | `ProfilePage` |
| `/settings/ai` | `deferred as ai_settings_page` | `AiSettingsPage` |
| `/moments/notifications` | `deferred as notifications_page` | `MomentsNotificationsPage` |
| `/groups/create` | `deferred as create_group_page` | `CreateGroupPage` |
| `/contacts/add` | `deferred as add_friend_page` | `AddFriendPage` |

**高频路由保持静态 import**：`/chat`、`/contacts`、`/groups`、`/moments`、`/settings`、`/login`、`/register`

**GoRouter 集成示例**：

```dart
import 'features/settings/presentation/profile_page.dart'
    deferred as profile_page;

GoRoute(
  path: 'profile',
  pageBuilder: (context, state) => NoTransitionPage(
    child: DeferredRoutePage(
      loadLibrary: profile_page.loadLibrary,
      builder: () => profile_page.ProfilePage(),
    ),
  ),
),
```

### 2. providers.dart 拆分

**目标**：将单体 providers.dart 拆分为按 feature 独立的 provider 文件，避免静态 import 拉入所有 feature 代码。

**当前结构**：

```
providers.dart (单体)
├── import auth/...
├── import chat/...
├── import contacts/...
├── import moments/...
├── import settings/...
├── import group/...
├── import e2ee/...
└── import core/network/...
```

**拆分后结构**：

```
core/di/
├── providers.dart          (仅保留通用 provider: network, storage 等)
├── auth_providers.dart     (auth_repository_impl, auth_provider)
├── chat_providers.dart     (message_api, message_pipeline, chat_provider 等)
├── contacts_providers.dart (contacts_api, contacts_provider)
├── moments_providers.dart  (moments_api, moments_repository 等)
├── settings_providers.dart (settings_api, ai_api, settings_provider 等)
├── group_providers.dart    (group_api, group_provider)
└── e2ee_providers.dart     (e2ee_api, e2ee_key_store 等)
```

**关键约束**：
- `app_router.dart` 只 `import providers.dart`（通用部分）
- 各 feature 页面通过 `ref.watch` 访问自己的 provider
- Riverpod 的 provider 是全局的，只要文件被 import 就会注册 —— 所以需要确保每个 feature 的 provider 文件只在对应页面的 deferred import 链中被引入
- 如果某个 provider 被多个页面共享（如 `auth_provider`），它应该留在通用 `providers.dart` 中

**共享 provider 策略**：
- `auth_provider`、`network_status_provider`：被多个页面依赖，留在 `providers.dart`
- 其他 feature-specific provider：拆分到各自文件

### 3. 首屏 Loading 体验

**目标**：在 Flutter 初始化期间提供友好的 loading 指示器，替代当前的白屏。

**方案**：修改 `web/index.html`，在 `<body>` 中添加 CSS loading 动画，在 Flutter ready 后移除。

**关键细节**：
- Loading 指示器样式内联在 `<style>` 中（避免额外请求）
- 使用应用品牌色（蓝色渐变圆环 + "IM" 文字）
- Flutter 通过 `flutter-first-frame` 事件或自定义 JS 回调移除 loading
- 保留现有的 offline banner 逻辑
- 保留 service worker 注册逻辑

**视觉效果**：

```
┌─────────────────────────────┐
│                             │
│         ┌───────┐           │
│         │  IM   │           │
│         └───────┘           │
│       ◌ 加载中...           │
│                             │
│   ┌ 网络已断开，部分功能... │  ← 保留现有 offline banner
│                             │
└─────────────────────────────┘
```

**实现要点**：
- Loading 指示器 ID 为 `loading-indicator`
- Flutter 初始化完成后通过 JS 移除该元素
- 使用 `flutter-first-frame` 事件监听

### 4. 构建脚本

**目标**：提供标准化的构建命令，支持 dev/prod/wasm 三种模式和体积报告。

**文件**：`flutter/apps/web/Makefile`

**构建目标**：

| 命令 | 说明 | 输出 |
|---|---|---|
| `make dev` | 开发构建 (dart2js, CanvasKit, debug) | `build/web/` |
| `make prod` | 生产构建 (dart2js, CanvasKit, obfuscated) | `build/web/` |
| `make wasm` | WASM 构建 (dart2wasm, skwasm) | `build/web/` |
| `make size` | 输出 build/web/ 目录总大小 | 终端输出 |
| `make report` | 构建 + 分析体积 (--analyze-size) | `build/web/` + 分析报告 |
| `make clean` | 清理构建产物 | - |

**关键点**：
- `prod` 使用 `--obfuscate --split-debug-info=build/debug-info` 生成 sourcemap
- `wasm` 使用 `--wasm` 标志，需要 Flutter 3.22+
- `report` 使用 `--analyze-size` 生成体积分析 JSON
- 所有构建输出到 `build/web/`

### 5. 性能文档

**目标**：创建 `docs/flutter-web-performance.md`，说明渲染器选择、部署要求和回退策略。

**文档结构**：

```markdown
# Flutter Web 性能优化指南

## 渲染器对比
| 渲染器 | 体积 | 渲染方式 | 适用场景 |
|--------|------|----------|----------|
| CanvasKit | ~2-4MB WASM | Skia → WebGL | 默认选择，保真度高 |
| HTML | ~1MB JS | 浏览器原生 | 体积敏感，低端设备 |
| Skwasm | ~1.5MB WASM | Skia → WebGPU | 下一代，需新浏览器 |

## 构建策略
- dev: dart2js + CanvasKit (快速编译)
- prod: dart2js + CanvasKit + obfuscate (生产部署)
- wasm: dart2wasm + Skwasm (实验性，需 Chrome 119+)

## 部署要求
- CanvasKit: 需要 WebGL 支持
- Skwasm: 需要 WebGPU 支持 (Chrome 119+, Edge 119+)
- 回退: 检测浏览器能力，自动降级到 CanvasKit

## 首屏优化
- Deferred imports 减少首包体积
- Loading 指示器改善感知性能
- Service Worker 缓存策略

## 验证方式
- 首包大小: make size
- Deferred JS: 检查 build/web/ 下是否有 part_*.js
- 页面跳转: 手动测试每个 deferred 路由
```

### 6. 验证方式

**验证步骤**：

1. **首包体积对比**
   - 优化前：`flutter build web --release` → `du -sh build/web/main.dart.js`
   - 优化后：对比 `main.dart.js` 体积变化
   - 预期：首包减少 15-30%（取决于 deferred 页面的依赖树大小）

2. **Deferred JS 文件生成**
   - 检查 `build/web/` 目录下是否生成 `part_*.js` 文件
   - 每个 deferred import 应生成独立的 JS chunk

3. **页面跳转测试**
   - 手动测试每个 deferred 路由（`/settings/profile`、`/settings/ai`、`/moments/notifications`、`/groups/create`、`/contacts/add`）
   - 验证：首次访问显示 loading → 加载完成后显示页面
   - 验证：error 状态下 retry 按钮可用

4. **首屏 Loading 测试**
   - 清除缓存后首次加载
   - 验证：显示 loading 指示器 → Flutter 初始化后消失
   - 验证：offline 状态下显示 offline banner

5. **WASM 构建测试**
   - `make wasm` 成功构建
   - 检查 `build/web/` 下是否有 `.wasm` 文件

## 技术约束

- 不重写业务页面
- 优先只处理路由层
- 保留当前 MaterialApp.router
- 如果 deferred import 与 GoRouter builder 有冲突，用 DeferredRoutePage 包装器解决

## 文件变更清单

| 文件 | 操作 | 说明 |
|---|---|---|
| `core/router/deferred_route_page.dart` | 新增 | DeferredRoutePage 包装器 |
| `core/router/app_router.dart` | 修改 | 5 个路由改为 deferred import |
| `core/di/providers.dart` | 修改 | 拆分为通用部分 |
| `core/di/auth_providers.dart` | 新增 | auth provider |
| `core/di/chat_providers.dart` | 新增 | chat provider |
| `core/di/contacts_providers.dart` | 新增 | contacts provider |
| `core/di/moments_providers.dart` | 新增 | moments provider |
| `core/di/settings_providers.dart` | 新增 | settings provider |
| `core/di/group_providers.dart` | 新增 | group provider |
| `core/di/e2ee_providers.dart` | 新增 | e2ee provider |
| `web/index.html` | 修改 | 添加 loading 指示器 |
| `Makefile` | 新增 | 构建脚本 |
| `docs/flutter-web-performance.md` | 新增 | 性能文档 |
