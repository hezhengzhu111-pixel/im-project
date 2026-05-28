# 群组会话 Key 一致性修复设计文档

## 问题描述

Flutter Web 中，群组列表点击群组后，`activeSessionId` 与消息加载使用的 key 不一致，导致群聊历史消息无法显示。

### 问题根因

**Vue Web 实现**：
- `buildSessionId("group", "", groupId)` 始终返回 `group_${groupId}` 格式
- 所有群组会话使用统一的 `group_${groupId}` 作为 session key

**Flutter Web 实现**：
- `group_list_page.dart` 中 `setActiveSession('group_${group.id}')` 使用 `group_${group.id}` 格式
- `loadGroupMessages(group.id)` 内部调用 `_sessionKeyForGroupTarget(groupId)` 生成 session key
- `_sessionKeyForGroupTarget` 会在 `state.sessions` 中查找已存在的会话，如果找到则返回 `existing?.id`（可能是后端返回的 `conversationId`）

**不一致场景**：
1. 用户点击群组 → `activeSessionId` 设置为 `group_${groupId}`
2. `loadGroupMessages` 调用 `_sessionKeyForGroupTarget(groupId)`
3. 如果 sessions 中存在该群组会话，返回 `conversationId`（如 `conv_123`）
4. 消息存储在 `conv_123` 为 key 的位置
5. ChatPage 查找 `group_${groupId}` 的消息 → 为空

## 修复方案

### 方案选择

**方案 A：统一使用 canonical key**（已选择）

修改 `group_list_page.dart`，让 `setActiveSession` 也使用 `_sessionKeyForGroupTarget` 生成的 canonical key。

### 架构设计

#### 1. 添加公开方法获取 canonical session key

在 `ChatNotifierWithOutbox` 中添加公开方法：

```dart
/// 获取群组的 canonical session key
String getGroupSessionKey(String groupId) {
  return _sessionKeyForGroupTarget(groupId);
}
```

#### 2. 修改 group_list_page.dart

修改 `onTap` 回调，使用 canonical key：

```dart
onTap: () {
  // 获取 canonical session key
  final sessionKey = ref.read(chatStateProvider.notifier).getGroupSessionKey(group.id);
  ref.read(chatStateProvider.notifier).setActiveSession(sessionKey);
  ref.read(chatStateProvider.notifier).loadGroupMessages(group.id);
  context.go('/chat');
},
```

### 数据流

```
用户点击群组
    ↓
getGroupSessionKey(groupId)
    ↓
_sessionKeyForGroupTarget(groupId)
    ↓
[检查 sessions 中是否存在] → 存在则返回 existing.id
                          → 不存在则返回 group_${groupId}
    ↓
setActiveSession(canonicalKey)
    ↓
loadGroupMessages(groupId)  // 内部使用相同的 canonical key
    ↓
context.go('/chat')
```

### 关键文件

| 文件 | 修改内容 |
|------|----------|
| `flutter/apps/web/lib/features/chat/presentation/chat_provider_with_outbox.dart` | 添加 `getGroupSessionKey` 公开方法 |
| `flutter/apps/web/lib/features/group/presentation/group_list_page.dart` | 修改 `onTap` 使用 canonical key |

### 影响范围

- **群组进入聊天**：修复 ✅
- **私聊**：不受影响（使用不同的 session key 生成逻辑）
- **消息加载**：保持现有逻辑不变
- **WebSocket 消息接收**：保持现有逻辑不变

### 测试验证

1. 点击群组后，ChatPage 显示正确的群聊历史消息
2. 私聊功能正常工作
3. 会话列表中的群组会话正确显示

## 约束条件

- 不修改联系人逻辑
- 不修改媒体发送逻辑
- 不改 Vue/后端
- 不实现群组搜索、加入群、退群、成员列表
- 不改群组 UI 样式
