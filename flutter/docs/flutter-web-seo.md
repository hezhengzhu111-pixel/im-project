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
- Flutter 启动后，分享链接能显示正确的标题和描述
- 支持 Open Graph 和 Twitter Card 协议
- 多语言环境下 meta 内容正确本地化

当前方案**不保证**：
- 首屏 HTML 就有完整 meta（需等 Flutter 加载）
- 所有爬虫都能索引动态内容
- 无 JavaScript 环境下能获取 meta

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
