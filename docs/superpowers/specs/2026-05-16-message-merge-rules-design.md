# 消息合并规则校准设计文档

**日期**：2026-05-16
**状态**：已批准
**作者**：Claude Code

## 背景

阶段三后消息来源变多，包括：
- 本地SQLite初始页
- 远端最近页
- 远端older页
- 远端newer页
- WebSocket实时消息
- 本地optimistic pending
- server send回包

如果合并规则不统一，会出现：
- pending消息和server消息重复
- older页覆盖当前新消息
- WebSocket echo和send回包重复
- 刷新最新误删本地失败消息

## 设计目标

1. 统一所有进入messagesBySession的消息都走同一个merge/upsert规则
2. 合并identity优先级：serverId/messageId > clientMessageId > id > conversationId + sendTime fallback
3. server message与local pending clientMessageId相同时合并成一条
4. older page合并只能prepend/merge，不得删除当前列表中较新的消息
5. refreshLatest合并只能append/upsert，不得删除当前列表中较旧的消息
6. realtime addMessage upsert后保持sendTime ASC
7. pending failed消息不应被远端history replace误删
8. 写入messageRepository时不能制造重复行

## 详细设计

### 1. 消息身份识别优先级调整

**修改文件**：`frontend/packages/shared-im-core/src/message-identity.ts`

**当前实现**：
```typescript
export const messageIdentityValues = (message: Message): string[] =>
  [message.id, message.messageId, message.clientMessageId]
    .map((item) => String(item || ""))
    .filter(Boolean);
```

**新实现**：
```typescript
export const messageIdentityValues = (message: Message): string[] =>
  [
    message.messageId,      // 1. serverId/messageId 最高优先级
    message.clientMessageId, // 2. clientMessageId
    message.id,              // 3. id
  ]
    .map((item) => String(item || ""))
    .filter(Boolean);
```

**注意**：`conversationId + sendTime` fallback不在此函数中实现，因为这会导致性能问题（需要遍历所有消息）。这个fallback只在极端情况下使用，可以在`mergePagedMessages`中作为最后手段。

### 2. 增强mergeServerMessageWithPending

**修改文件**：`frontend/packages/shared-im-core/src/message-dedup.ts`

**当前实现**：
```typescript
export const mergeServerMessageWithPending = (
  pending: Message,
  serverMessage: Message,
): Message => ({
  ...pending,
  ...serverMessage,
  id: safePreferExistingId(serverMessage.id, pending.id),
  messageId: serverMessage.messageId ?? pending.messageId,
  clientMessageId: serverMessage.clientMessageId ?? pending.clientMessageId,
});
```

**新实现**：
```typescript
export const mergeServerMessageWithPending = (
  pending: Message,
  serverMessage: Message,
): Message => ({
  ...pending,
  ...serverMessage,
  // 优先使用server的id，但保留pending的id作为fallback
  id: safePreferExistingId(serverMessage.id, pending.id),
  // 优先使用server的messageId
  messageId: serverMessage.messageId ?? pending.messageId,
  // 保留clientMessageId
  clientMessageId: serverMessage.clientMessageId ?? pending.clientMessageId,
  // 优先使用server的sendTime
  sendTime: serverMessage.sendTime || pending.sendTime,
  // 保留本地媒体资源，除非server已返回
  mediaUrl: serverMessage.mediaUrl || pending.mediaUrl,
  thumbnailUrl: serverMessage.thumbnailUrl || pending.thumbnailUrl,
  mediaName: serverMessage.mediaName || pending.mediaName,
  mediaSize: serverMessage.mediaSize || pending.mediaSize,
  // 优先使用server的状态
  status: serverMessage.status || pending.status,
});
```

### 3. 增强replace模式保留pending

**修改文件**：`frontend/apps/mobile/src/utils/messagePagination.ts`

**当前实现**：
```typescript
if (mode === 'replace') {
  return sortMessages(dedupeList(incoming));
}
```

**新实现**：
```typescript
if (mode === 'replace') {
  // 在replace模式下，保留现有的pending消息
  const pendingMessages = existing.filter(
    (msg) => msg.status === 'SENDING' || msg.status === 'FAILED'
  );
  const dedupedIncoming = dedupeList(incoming);
  // 合并pending消息到incoming中
  const merged = mergePagedMessages(dedupedIncoming, pendingMessages, 'appendNewer');
  return sortMessages(merged);
}
```

### 4. 增强MobileMessage合并逻辑

**修改文件**：`frontend/apps/mobile/src/adapters/messageAdapter.ts`

**当前实现**：
```typescript
export const mergeServerMobileMessageWithPending = (
  pending: MobileMessage,
  serverMessage: MobileMessage,
): MobileMessage => {
  const merged = mergeServerMessageWithPending(toSharedMessage(pending), toSharedMessage(serverMessage));
  return {
    ...pending,
    ...serverMessage,
    ...toMobileMessage(merged, { ...pending, ...serverMessage }),
    id: safePreferExistingId(serverMessage.serverId || serverMessage.id, pending.id),
    clientMessageId: serverMessage.clientMessageId || pending.clientMessageId,
  };
};
```

**新实现**：
```typescript
export const mergeServerMobileMessageWithPending = (
  pending: MobileMessage,
  serverMessage: MobileMessage,
): MobileMessage => {
  const merged = mergeServerMessageWithPending(toSharedMessage(pending), toSharedMessage(serverMessage));
  return {
    ...pending,
    ...serverMessage,
    ...toMobileMessage(merged, { ...pending, ...serverMessage }),
    // 优先使用server的id
    id: safePreferExistingId(serverMessage.serverId || serverMessage.id, pending.id),
    // 保留clientMessageId
    clientMessageId: serverMessage.clientMessageId || pending.clientMessageId,
    // 优先使用server的sendTime
    sendTime: serverMessage.sendTime || pending.sendTime,
    // 保留本地媒体资源
    mediaUrl: serverMessage.mediaUrl || pending.mediaUrl,
    thumbnailUrl: serverMessage.thumbnailUrl || pending.thumbnailUrl,
    mediaName: serverMessage.mediaName || pending.mediaName,
    mediaSize: serverMessage.mediaSize || pending.mediaSize,
  };
};
```

## 不同来源消息处理说明

| 消息来源 | 处理方式 | 合并模式 |
|---------|---------|---------|
| 本地SQLite初始页 | 直接加载，作为existing | - |
| 远端最近页 | 与existing合并，保留pending | replace |
| 远端older页 | prepend到existing前 | prependOlder |
| 远端newer页 | append到existing后 | appendNewer |
| WebSocket实时消息 | upsert到existing | upsertRealtime |
| 本地optimistic pending | 添加到existing | upsertRealtime |
| server send回包 | 与pending合并 | upsertRealtime |

## 测试策略

**新增测试用例**：
1. local pending + server history 相同clientMessageId合并为一条
2. local pending + WebSocket echo 相同clientMessageId合并为一条
3. send回包 + WebSocket echo 相同serverId合并为一条
4. loadOlder不删除当前最新消息
5. refreshLatest不删除历史消息
6. failed local message不被unrelated history删除
7. merge后列表按sendTime ASC
8. messageRepository中不出现重复clientMessageId记录

## 边界限制

- 不改UI
- 不改messageService
- 不重写pending/upload状态机
- 不改SQLite schema

## 验证流程

执行命令：
```bash
cd frontend/apps/mobile
npm run typecheck
npm run lint
npm run test -- --testPathPattern="messageStore|messagePagination|messageRepository|mobile-core" --no-coverage
```

## 输出要求

1. 修改文件列表
2. 统一合并规则说明
3. 不同来源消息处理说明
4. 新增/修改测试列表
5. 实际执行命令和结果
