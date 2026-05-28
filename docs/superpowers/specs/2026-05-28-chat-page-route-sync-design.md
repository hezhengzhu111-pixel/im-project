# ChatPage 路由参数同步设计

**日期**: 2026-05-28
**目标**: 修复 /chat/:sessionId 和 /chat?sessionId 场景下，ChatPage 未正确加载消息的问题

## 问题

1. `initState` 中 `loadSessions()` 未 await，导致 `setActiveSession` 在 sessions 加载前执行
2. `setActiveSession` 后未调用 `loadMessages()` / `loadGroupMessages()`
3. 路由不支持 `/chat?sessionId=xxx` query 参数

## 方案

### 1. app_router.dart — query 参数支持

`/chat` route builder 读取 `state.uri.queryParameters['sessionId']`，传递给 `ChatPage(sessionId:)`。

### 2. chat_page.dart — initState 修复

```
initState:
  1. await loadSessions()
  2. setActiveSession(sessionId)
  3. 查找 session，判断类型
  4. loadMessages(targetId) 或 loadGroupMessages(targetId)
```

### 3. session 不存在时

静默降级：header 显示 sessionId + 空消息列表，输入框禁用。不崩溃，不跳转。

## 改动文件

- `flutter/apps/web/lib/features/chat/presentation/chat_page.dart`
- `flutter/apps/web/lib/core/router/app_router.dart`

## 不改动

- chat_provider_with_outbox.dart
- route_registry.dart
- 消息发送/媒体逻辑
