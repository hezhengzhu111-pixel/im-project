# Flutter Web 性能优化指南

## 概述

本文档说明 Flutter Web 应用的性能优化策略，包括渲染器选择、构建配置、首屏优化和验证方式。

## 渲染器对比

| 渲染器 | 体积 | 渲染方式 | 适用场景 |
|--------|------|----------|----------|
| CanvasKit | ~2-4MB WASM | Skia → WebGL | 默认选择，保真度高 |
| HTML | ~1MB JS | 浏览器原生 | 体积敏感，低端设备 |
| Skwasm | ~1.5MB WASM | Skia → WebGPU | 下一代，需新浏览器 |

### CanvasKit

- **优点**：渲染保真度高，与移动端一致
- **缺点**：体积较大，需要 WebGL 支持
- **适用**：大多数生产环境

### HTML Renderer

- **优点**：体积小，兼容性好
- **缺点**：渲染保真度较低，部分 API 不支持
- **适用**：体积敏感场景，低端设备

### Skwasm (实验性)

- **优点**：体积小，性能好
- **缺点**：需要 WebGPU 支持 (Chrome 119+, Edge 119+)
- **适用**：现代浏览器，追求性能

## 构建策略

### 开发构建

```bash
make dev
# 或
flutter build web --debug
```

- 快速编译，支持热重载
- 无代码混淆，便于调试
- 输出到 `build/web/`

### 生产构建

```bash
make prod
# 或
flutter build web --release --pwa-strategy=none
```

- `--release` 启用 dart2js 优化
- Flutter Web **不支持** `--obfuscate` / `--split-debug-info`
- 输出到 `build/web/`

### WASM 构建

```bash
make wasm
# 或
flutter build web --wasm
```

- 使用 dart2wasm 编译
- 需要 Flutter 3.22+
- 输出 `.wasm` 文件到 `build/web/`

## 部署要求

### CanvasKit

- 需要 WebGL 支持
- 所有现代浏览器都支持
- 推荐用于生产环境

### Skwasm

- 需要 WebGPU 支持
- Chrome 119+, Edge 119+
- 实验性，谨慎使用

### 回退策略

```javascript
// 检测浏览器能力
function checkWebGPUSupport() {
  return navigator.gpu !== undefined;
}

// 根据能力选择渲染器
const renderer = checkWebGPUSupport() ? 'skwasm' : 'canvaskit';
```

## 首屏优化

### Deferred Imports

使用 `DeferredRoutePage` 包装器实现路由级 lazy loading：

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

**优势**：
- 首包体积减少 15-30%
- 低频页面按需加载
- 改善首次加载时间

### Loading 指示器

在 `index.html` 中添加 CSS loading 动画：
- 显示品牌 Logo 和加载动画
- Flutter 初始化后自动移除
- 改善用户感知性能

### Service Worker 缓存

当前构建使用 `--pwa-strategy=none`，不生成 Flutter Service Worker，以避免旧版本 `main.dart.js` 引用已删除的 deferred chunks。
静态资源缓存由 Nginx 控制，推荐配置：

- `index.html` / `flutter_bootstrap.js` / `main.dart.js`：`Cache-Control: public, must-revalidate`（每次 304 校验）
- `/pkg/*`（Rust WASM bridge）：`Cache-Control: public, must-revalidate`
- `/assets/*`：`Cache-Control: public, max-age=86400, must-revalidate`
- `main.dart.js_*.part.js`（deferred chunks）：`Cache-Control: public, max-age=31536000, immutable`
- 启用 `gzip`（并建议前端代理层启用 `brotli`）压缩 JS/WASM/JSON/SVG

## 验证方式

### 首包大小对比

```bash
# 优化前
flutter build web --release
du -sh build/web/main.dart.js

# 优化后
make prod
du -sh build/web/main.dart.js
```

预期：首包减少 15-30%

### Deferred JS 文件生成

```bash
make prod
ls -lh build/web/part_*.js
```

每个 deferred import 应生成独立的 JS chunk

### 页面跳转测试

手动测试每个 deferred 路由：
1. `/settings/profile`
2. `/settings/ai`
3. `/moments/notifications`
4. `/groups/create`
5. `/contacts/add`

验证：
- 首次访问显示 loading → 加载完成后显示页面
- error 状态下 retry 按钮可用

### 首屏 Loading 测试

1. 清除缓存后首次加载
2. 验证：显示 loading 指示器 → Flutter 初始化后消失
3. 验证：offline 状态下显示 offline banner

### WASM 构建测试

```bash
make wasm
ls -lh build/web/*.wasm
```

## 性能指标

### 首次内容绘制 (FCP)

- 目标：< 1.5s
- 测量：Chrome DevTools Performance

### 最大内容绘制 (LCP)

- 目标：< 2.5s
- 测量：Chrome DevTools Performance

### 首包大小

- 目标：< 2MB (main.dart.js)
- 测量：`du -sh build/web/main.dart.js`

### Deferred Chunks

- 目标：每个 < 200KB
- 测量：`ls -lh build/web/part_*.js`

## 故障排查

### Deferred 加载失败

- 检查网络连接
- 查看浏览器控制台错误
- 验证 JS 文件路径正确

### Loading 指示器不消失

- 检查 `flutter-first-frame` 事件是否触发
- 验证 JS 选择器正确

### WASM 构建失败

- 确认 Flutter 版本 >= 3.22
- 检查浏览器 WebGPU 支持
