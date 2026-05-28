# Session Key 回归测试设计

**日期**: 2026-05-28
**目标**: 为 Codex-C1 会话 key 修复补充最小回归测试

## 测试场景

### 1. 私聊 session.id ≠ targetId
- 会话存在 `id='custom-session-1'`, `targetId='user-2'`, `type='private'`
- 消息路由应使用 session.id 而非生成的 `user-1_user-2`
- 验证: `state.messages['custom-session-1']` 包含消息

### 2. 群聊 session.id ≠ groupId
- 会话存在 `id='custom-group-session'`, `targetId='group-1'`, `type='group'`
- 消息路由应使用 session.id 而非生成的 `group_group-1`
- 验证: `state.messages['custom-group-session']` 包含消息

### 3. pending 消息被服务端消息替换
- sendMessage 失败后消息状态为 PENDING
- 服务端确认后通过 _replaceMessage 替换
- 验证: 消息不重复，内容更新为服务端版本

## 方案

追加到 `chat_notifier_with_outbox_test.dart`，复用已有测试基础设施。

## 改动文件

- `flutter/apps/web/test/features/chat/chat_notifier_with_outbox_test.dart`
