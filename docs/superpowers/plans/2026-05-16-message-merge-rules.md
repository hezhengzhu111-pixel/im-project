# 消息合并规则校准实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 校准实时消息、pending消息、server history与分页列表的合并规则，避免重复、丢失和乱序。

**Architecture:** 在现有代码基础上进行精确调整，调整消息身份识别优先级，增强pending消息合并逻辑，确保replace模式保留pending消息。

**Tech Stack:** TypeScript, React Native, Zustand, Jest

---

## 文件结构

### 修改文件
- `frontend/packages/shared-im-core/src/message-identity.ts` - 调整身份识别优先级
- `frontend/packages/shared-im-core/src/message-dedup.ts` - 增强mergeServerMessageWithPending
- `frontend/apps/mobile/src/utils/messagePagination.ts` - 增强replace模式保留pending
- `frontend/apps/mobile/src/adapters/messageAdapter.ts` - 调整MobileMessage合并逻辑

### 测试文件
- `frontend/packages/shared-im-core/src/__tests__/message-identity.spec.ts` - 新增身份识别测试
- `frontend/packages/shared-im-core/src/__tests__/message-dedup.spec.ts` - 新增合并逻辑测试
- `frontend/apps/mobile/src/utils/__tests__/messagePagination.test.ts` - 增强分页合并测试
- `frontend/apps/mobile/src/adapters/__tests__/messageAdapter.test.ts` - 增强适配器测试

---

### Task 1: 调整消息身份识别优先级

**Files:**
- Modify: `frontend/packages/shared-im-core/src/message-identity.ts`
- Test: `frontend/packages/shared-im-core/src/__tests__/message-identity.spec.ts`

- [ ] **Step 1: 写失败的测试**

```typescript
// frontend/packages/shared-im-core/src/__tests__/message-identity.spec.ts
import { messageIdentityValues, hasSameMessageIdentity } from '../message-identity';
import type { Message } from '@im/shared-types';

describe('messageIdentityValues', () => {
  it('returns messageId first (highest priority)', () => {
    const message: Message = {
      id: 'local_1',
      messageId: 'srv_1',
      clientMessageId: 'cm_1',
      senderId: 'u1',
      isGroupChat: false,
      messageType: 'TEXT',
      content: 'hello',
      sendTime: '2024-06-01T10:00:00Z',
      status: 'SENT',
    };
    const identities = messageIdentityValues(message);
    expect(identities[0]).toBe('srv_1');
    expect(identities[1]).toBe('cm_1');
    expect(identities[2]).toBe('local_1');
  });

  it('skips empty values', () => {
    const message: Message = {
      id: 'local_1',
      senderId: 'u1',
      isGroupChat: false,
      messageType: 'TEXT',
      content: 'hello',
      sendTime: '2024-06-01T10:00:00Z',
      status: 'SENT',
    };
    const identities = messageIdentityValues(message);
    expect(identities).toEqual(['local_1']);
  });

  it('returns empty array when no identities', () => {
    const message: Message = {
      id: '',
      senderId: 'u1',
      isGroupChat: false,
      messageType: 'TEXT',
      content: 'hello',
      sendTime: '2024-06-01T10:00:00Z',
      status: 'SENT',
    };
    const identities = messageIdentityValues(message);
    expect(identities).toEqual([]);
  });
});

describe('hasSameMessageIdentity', () => {
  it('matches by messageId', () => {
    const left: Message = {
      id: 'local_1',
      messageId: 'srv_1',
      senderId: 'u1',
      isGroupChat: false,
      messageType: 'TEXT',
      content: 'hello',
      sendTime: '2024-06-01T10:00:00Z',
      status: 'SENDING',
    };
    const right: Message = {
      id: 'srv_1',
      messageId: 'srv_1',
      senderId: 'u1',
      isGroupChat: false,
      messageType: 'TEXT',
      content: 'hello',
      sendTime: '2024-06-01T10:00:00Z',
      status: 'SENT',
    };
    expect(hasSameMessageIdentity(left, right)).toBe(true);
  });

  it('matches by clientMessageId', () => {
    const left: Message = {
      id: 'local_1',
      clientMessageId: 'cm_1',
      senderId: 'u1',
      isGroupChat: false,
      messageType: 'TEXT',
      content: 'hello',
      sendTime: '2024-06-01T10:00:00Z',
      status: 'SENDING',
    };
    const right: Message = {
      id: 'srv_1',
      clientMessageId: 'cm_1',
      senderId: 'u1',
      isGroupChat: false,
      messageType: 'TEXT',
      content: 'hello',
      sendTime: '2024-06-01T10:00:01Z',
      status: 'SENT',
    };
    expect(hasSameMessageIdentity(left, right)).toBe(true);
  });

  it('does not match when no shared identities', () => {
    const left: Message = {
      id: 'local_1',
      senderId: 'u1',
      isGroupChat: false,
      messageType: 'TEXT',
      content: 'hello',
      sendTime: '2024-06-01T10:00:00Z',
      status: 'SENDING',
    };
    const right: Message = {
      id: 'srv_1',
      senderId: 'u1',
      isGroupChat: false,
      messageType: 'TEXT',
      content: 'hello',
      sendTime: '2024-06-01T10:00:01Z',
      status: 'SENT',
    };
    expect(hasSameMessageIdentity(left, right)).toBe(false);
  });
});
```

- [ ] **Step 2: 运行测试验证失败**

Run: `cd frontend && npx jest packages/shared-im-core/src/__tests__/message-identity.spec.ts -v`
Expected: FAIL（当前实现顺序不同）

- [ ] **Step 3: 写最小实现**

```typescript
// frontend/packages/shared-im-core/src/message-identity.ts
import type { Message } from "@im/shared-types";

export const messageIdentityValues = (message: Message): string[] =>
  [
    message.messageId,      // 1. serverId/messageId 最高优先级
    message.clientMessageId, // 2. clientMessageId
    message.id,              // 3. id
  ]
    .map((item) => String(item || ""))
    .filter(Boolean);

export const hasSameMessageIdentity = (
  left: Message,
  right: Message,
): boolean => {
  const rightValues = new Set(messageIdentityValues(right));
  return messageIdentityValues(left).some((item) => rightValues.has(item));
};
```

- [ ] **Step 4: 运行测试验证通过**

Run: `cd frontend && npx jest packages/shared-im-core/src/__tests__/message-identity.spec.ts -v`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add frontend/packages/shared-im-core/src/message-identity.ts frontend/packages/shared-im-core/src/__tests__/message-identity.spec.ts
git commit -m "feat(shared-im-core): adjust message identity priority to messageId > clientMessageId > id"
```

---

### Task 2: 增强mergeServerMessageWithPending合并逻辑

**Files:**
- Modify: `frontend/packages/shared-im-core/src/message-dedup.ts`
- Test: `frontend/packages/shared-im-core/src/__tests__/message-dedup.spec.ts`

- [ ] **Step 1: 写失败的测试**

```typescript
// 在现有测试文件中添加
describe('mergeServerMessageWithPending', () => {
  it('prefers server sendTime over pending sendTime', () => {
    const pending: Message = {
      id: 'local_1',
      clientMessageId: 'cm_1',
      senderId: 'u1',
      isGroupChat: false,
      messageType: 'TEXT',
      content: 'hello',
      sendTime: '2024-06-01T10:00:00Z',
      status: 'SENDING',
    };
    const server: Message = {
      id: 'srv_1',
      messageId: 'srv_1',
      clientMessageId: 'cm_1',
      senderId: 'u1',
      isGroupChat: false,
      messageType: 'TEXT',
      content: 'hello',
      sendTime: '2024-06-01T10:00:01Z',
      status: 'SENT',
    };
    const merged = mergeServerMessageWithPending(pending, server);
    expect(merged.sendTime).toBe('2024-06-01T10:00:01Z');
  });

  it('preserves local mediaUrl when server has no mediaUrl', () => {
    const pending: Message = {
      id: 'local_1',
      clientMessageId: 'cm_1',
      senderId: 'u1',
      isGroupChat: false,
      messageType: 'IMAGE',
      content: '',
      mediaUrl: 'file:///local/photo.jpg',
      sendTime: '2024-06-01T10:00:00Z',
      status: 'SENDING',
    };
    const server: Message = {
      id: 'srv_1',
      messageId: 'srv_1',
      clientMessageId: 'cm_1',
      senderId: 'u1',
      isGroupChat: false,
      messageType: 'IMAGE',
      content: '',
      sendTime: '2024-06-01T10:00:01Z',
      status: 'SENT',
    };
    const merged = mergeServerMessageWithPending(pending, server);
    expect(merged.mediaUrl).toBe('file:///local/photo.jpg');
  });

  it('uses server mediaUrl when server has mediaUrl', () => {
    const pending: Message = {
      id: 'local_1',
      clientMessageId: 'cm_1',
      senderId: 'u1',
      isGroupChat: false,
      messageType: 'IMAGE',
      content: '',
      mediaUrl: 'file:///local/photo.jpg',
      sendTime: '2024-06-01T10:00:00Z',
      status: 'SENDING',
    };
    const server: Message = {
      id: 'srv_1',
      messageId: 'srv_1',
      clientMessageId: 'cm_1',
      senderId: 'u1',
      isGroupChat: false,
      messageType: 'IMAGE',
      content: '',
      mediaUrl: 'https://cdn.example.com/photo.jpg',
      sendTime: '2024-06-01T10:00:01Z',
      status: 'SENT',
    };
    const merged = mergeServerMessageWithPending(pending, server);
    expect(merged.mediaUrl).toBe('https://cdn.example.com/photo.jpg');
  });

  it('prefers server status', () => {
    const pending: Message = {
      id: 'local_1',
      clientMessageId: 'cm_1',
      senderId: 'u1',
      isGroupChat: false,
      messageType: 'TEXT',
      content: 'hello',
      sendTime: '2024-06-01T10:00:00Z',
      status: 'SENDING',
    };
    const server: Message = {
      id: 'srv_1',
      messageId: 'srv_1',
      clientMessageId: 'cm_1',
      senderId: 'u1',
      isGroupChat: false,
      messageType: 'TEXT',
      content: 'hello',
      sendTime: '2024-06-01T10:00:01Z',
      status: 'DELIVERED',
    };
    const merged = mergeServerMessageWithPending(pending, server);
    expect(merged.status).toBe('DELIVERED');
  });
});
```

- [ ] **Step 2: 运行测试验证失败**

Run: `cd frontend && npx jest packages/shared-im-core/src/__tests__/message-dedup.spec.ts -v`
Expected: FAIL（当前实现没有处理sendTime和mediaUrl）

- [ ] **Step 3: 写最小实现**

```typescript
// frontend/packages/shared-im-core/src/message-dedup.ts
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

- [ ] **Step 4: 运行测试验证通过**

Run: `cd frontend && npx jest packages/shared-im-core/src/__tests__/message-dedup.spec.ts -v`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add frontend/packages/shared-im-core/src/message-dedup.ts frontend/packages/shared-im-core/src/__tests__/message-dedup.spec.ts
git commit -m "feat(shared-im-core): enhance mergeServerMessageWithPending to preserve local media and prefer server sendTime"
```

---

### Task 3: 增强replace模式保留pending消息

**Files:**
- Modify: `frontend/apps/mobile/src/utils/messagePagination.ts`
- Test: `frontend/apps/mobile/src/utils/__tests__/messagePagination.test.ts`

- [ ] **Step 1: 写失败的测试**

```typescript
// 在现有测试文件中添加
describe('mergePagedMessages — replace with pending preservation', () => {
  it('preserves SENDING messages in replace mode', () => {
    const existing = [
      msg('local_pending', '2024-06-01T10:00:00.000Z', {
        status: 'SENDING',
        clientMessageId: 'cm_pending',
      }),
    ];
    const incoming = [
      msg('srv_1', '2024-06-01T10:00:01.000Z'),
      msg('srv_2', '2024-06-01T10:00:02.000Z'),
    ];
    const result = mergePagedMessages(existing, incoming, 'replace');
    expect(result).toHaveLength(3);
    const pending = result.find((m) => m.id === 'local_pending');
    expect(pending).toBeDefined();
    expect(pending?.status).toBe('SENDING');
  });

  it('preserves FAILED messages in replace mode', () => {
    const existing = [
      msg('local_failed', '2024-06-01T10:00:00.000Z', {
        status: 'FAILED',
        clientMessageId: 'cm_failed',
      }),
    ];
    const incoming = [
      msg('srv_1', '2024-06-01T10:00:01.000Z'),
    ];
    const result = mergePagedMessages(existing, incoming, 'replace');
    expect(result).toHaveLength(2);
    const failed = result.find((m) => m.id === 'local_failed');
    expect(failed).toBeDefined();
    expect(failed?.status).toBe('FAILED');
  });

  it('merges pending with server when same clientMessageId in replace mode', () => {
    const existing = [
      msg('local_1', '2024-06-01T10:00:00.000Z', {
        status: 'SENDING',
        clientMessageId: 'cm_1',
      }),
    ];
    const incoming = [
      msg('srv_1', '2024-06-01T10:00:01.000Z', {
        status: 'SENT',
        clientMessageId: 'cm_1',
      }),
    ];
    const result = mergePagedMessages(existing, incoming, 'replace');
    expect(result).toHaveLength(1);
    expect(result[0].status).toBe('SENT');
    expect(result[0].clientMessageId).toBe('cm_1');
  });
});
```

- [ ] **Step 2: 运行测试验证失败**

Run: `cd frontend/apps/mobile && npx jest src/utils/__tests__/messagePagination.test.ts -v`
Expected: FAIL（当前replace模式不保留pending）

- [ ] **Step 3: 写最小实现**

```typescript
// frontend/apps/mobile/src/utils/messagePagination.ts
export const mergePagedMessages = (
  existing: MobileMessage[],
  incoming: MobileMessage[],
  mode: MergeMode,
): MobileMessage[] => {
  if (mode === 'replace') {
    // 在replace模式下，保留现有的pending消息
    const pendingMessages = existing.filter(
      (msg) => msg.status === 'SENDING' || msg.status === 'FAILED'
    );
    const dedupedIncoming = dedupeList(incoming);
    // 合并pending消息到incoming中
    if (pendingMessages.length > 0) {
      return mergePagedMessages(dedupedIncoming, pendingMessages, 'appendNewer');
    }
    return sortMessages(dedupedIncoming);
  }

  // ... 其余代码保持不变
};
```

- [ ] **Step 4: 运行测试验证通过**

Run: `cd frontend/apps/mobile && npx jest src/utils/__tests__/messagePagination.test.ts -v`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add frontend/apps/mobile/src/utils/messagePagination.ts frontend/apps/mobile/src/utils/__tests__/messagePagination.test.ts
git commit -m "feat(mobile): enhance replace mode to preserve pending messages"
```

---

### Task 4: 增强MobileMessage合并逻辑

**Files:**
- Modify: `frontend/apps/mobile/src/adapters/messageAdapter.ts`
- Test: `frontend/apps/mobile/src/adapters/__tests__/messageAdapter.test.ts`

- [ ] **Step 1: 写失败的测试**

```typescript
// 在现有测试文件中添加
describe('mergeServerMobileMessageWithPending', () => {
  it('prefers server sendTime', () => {
    const pending: MobileMessage = {
      id: 'local_1',
      clientMessageId: 'cm_1',
      senderId: 'u1',
      isGroupChat: false,
      messageType: 'TEXT',
      content: 'hello',
      sendTime: '2024-06-01T10:00:00Z',
      status: 'SENDING',
    };
    const server: MobileMessage = {
      id: 'srv_1',
      serverId: 'srv_1',
      clientMessageId: 'cm_1',
      senderId: 'u1',
      isGroupChat: false,
      messageType: 'TEXT',
      content: 'hello',
      sendTime: '2024-06-01T10:00:01Z',
      status: 'SENT',
    };
    const merged = mergeServerMobileMessageWithPending(pending, server);
    expect(merged.sendTime).toBe('2024-06-01T10:00:01Z');
  });

  it('preserves local mediaUrl when server has no mediaUrl', () => {
    const pending: MobileMessage = {
      id: 'local_1',
      clientMessageId: 'cm_1',
      senderId: 'u1',
      isGroupChat: false,
      messageType: 'IMAGE',
      content: '',
      mediaUrl: 'file:///local/photo.jpg',
      sendTime: '2024-06-01T10:00:00Z',
      status: 'SENDING',
    };
    const server: MobileMessage = {
      id: 'srv_1',
      serverId: 'srv_1',
      clientMessageId: 'cm_1',
      senderId: 'u1',
      isGroupChat: false,
      messageType: 'IMAGE',
      content: '',
      sendTime: '2024-06-01T10:00:01Z',
      status: 'SENT',
    };
    const merged = mergeServerMobileMessageWithPending(pending, server);
    expect(merged.mediaUrl).toBe('file:///local/photo.jpg');
  });

  it('uses server mediaUrl when server has mediaUrl', () => {
    const pending: MobileMessage = {
      id: 'local_1',
      clientMessageId: 'cm_1',
      senderId: 'u1',
      isGroupChat: false,
      messageType: 'IMAGE',
      content: '',
      mediaUrl: 'file:///local/photo.jpg',
      sendTime: '2024-06-01T10:00:00Z',
      status: 'SENDING',
    };
    const server: MobileMessage = {
      id: 'srv_1',
      serverId: 'srv_1',
      clientMessageId: 'cm_1',
      senderId: 'u1',
      isGroupChat: false,
      messageType: 'IMAGE',
      content: '',
      mediaUrl: 'https://cdn.example.com/photo.jpg',
      sendTime: '2024-06-01T10:00:01Z',
      status: 'SENT',
    };
    const merged = mergeServerMobileMessageWithPending(pending, server);
    expect(merged.mediaUrl).toBe('https://cdn.example.com/photo.jpg');
  });
});
```

- [ ] **Step 2: 运行测试验证失败**

Run: `cd frontend/apps/mobile && npx jest src/adapters/__tests__/messageAdapter.test.ts -v`
Expected: FAIL（当前实现没有处理sendTime和mediaUrl）

- [ ] **Step 3: 写最小实现**

```typescript
// frontend/apps/mobile/src/adapters/messageAdapter.ts
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

- [ ] **Step 4: 运行测试验证通过**

Run: `cd frontend/apps/mobile && npx jest src/adapters/__tests__/messageAdapter.test.ts -v`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add frontend/apps/mobile/src/adapters/messageAdapter.ts frontend/apps/mobile/src/adapters/__tests__/messageAdapter.test.ts
git commit -m "feat(mobile): enhance mergeServerMobileMessageWithPending to preserve local media"
```

---

### Task 5: 集成测试验证

**Files:**
- Test: `frontend/apps/mobile/src/utils/__tests__/messagePagination.test.ts`

- [ ] **Step 1: 写集成测试**

```typescript
// 在现有测试文件中添加
describe('message merge integration tests', () => {
  it('local pending + server history same clientMessageId merge into one', () => {
    const existing = [
      msg('local_1', '2024-06-01T10:00:00.000Z', {
        status: 'SENDING',
        clientMessageId: 'cm_1',
        content: 'hello',
      }),
    ];
    const incoming = [
      msg('srv_1', '2024-06-01T10:00:01.000Z', {
        status: 'SENT',
        clientMessageId: 'cm_1',
        content: 'hello',
        serverId: 'srv_1',
      }),
    ];
    const result = mergePagedMessages(existing, incoming, 'appendNewer');
    expect(result).toHaveLength(1);
    expect(result[0].clientMessageId).toBe('cm_1');
    expect(result[0].status).toBe('SENT');
  });

  it('loadOlder does not delete current newest messages', () => {
    const existing = [
      msg('msg_1', '2024-06-01T10:00:00.000Z'),
      msg('msg_2', '2024-06-01T10:00:01.000Z'),
      msg('msg_3', '2024-06-01T10:00:02.000Z'),
    ];
    const older = [
      msg('old_1', '2024-05-31T10:00:00.000Z'),
      msg('old_2', '2024-05-31T10:00:01.000Z'),
    ];
    const result = mergePagedMessages(existing, older, 'prependOlder');
    expect(result).toHaveLength(5);
    expect(result[3].id).toBe('msg_2');
    expect(result[4].id).toBe('msg_3');
  });

  it('refreshLatest does not delete history messages', () => {
    const existing = [
      msg('msg_1', '2024-06-01T10:00:00.000Z'),
      msg('msg_2', '2024-06-01T10:00:01.000Z'),
    ];
    const newer = [
      msg('new_1', '2024-06-01T10:00:02.000Z'),
    ];
    const result = mergePagedMessages(existing, newer, 'appendNewer');
    expect(result).toHaveLength(3);
    expect(result[0].id).toBe('msg_1');
    expect(result[1].id).toBe('msg_2');
    expect(result[2].id).toBe('new_1');
  });

  it('failed local message not deleted by unrelated history', () => {
    const existing = [
      msg('local_failed', '2024-06-01T10:00:00.000Z', {
        status: 'FAILED',
        clientMessageId: 'cm_failed',
      }),
    ];
    const incoming = [
      msg('srv_other', '2024-06-01T10:00:01.000Z', {
        status: 'SENT',
        clientMessageId: 'cm_other',
      }),
    ];
    const result = mergePagedMessages(existing, incoming, 'appendNewer');
    expect(result).toHaveLength(2);
    const failed = result.find((m) => m.id === 'local_failed');
    expect(failed).toBeDefined();
    expect(failed?.status).toBe('FAILED');
  });

  it('merge result sorted by sendTime ASC', () => {
    const existing = [
      msg('msg_3', '2024-06-01T10:00:02.000Z'),
      msg('msg_1', '2024-06-01T10:00:00.000Z'),
    ];
    const incoming = [
      msg('msg_2', '2024-06-01T10:00:01.000Z'),
    ];
    const result = mergePagedMessages(existing, incoming, 'appendNewer');
    expect(result).toHaveLength(3);
    expect(result[0].id).toBe('msg_1');
    expect(result[1].id).toBe('msg_2');
    expect(result[2].id).toBe('msg_3');
  });

  it('no duplicate clientMessageId in repository', () => {
    const messages = [
      msg('local_1', '2024-06-01T10:00:00.000Z', {
        clientMessageId: 'cm_1',
        status: 'SENDING',
      }),
      msg('srv_1', '2024-06-01T10:00:01.000Z', {
        clientMessageId: 'cm_1',
        status: 'SENT',
      }),
    ];
    const result = mergePagedMessages([], messages, 'replace');
    const cm1Messages = result.filter((m) => m.clientMessageId === 'cm_1');
    expect(cm1Messages).toHaveLength(1);
  });
});
```

- [ ] **Step 2: 运行测试验证通过**

Run: `cd frontend/apps/mobile && npx jest src/utils/__tests__/messagePagination.test.ts -v`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add frontend/apps/mobile/src/utils/__tests__/messagePagination.test.ts
git commit -m "test(mobile): add integration tests for message merge rules"
```

---

### Task 6: 运行完整验证

- [ ] **Step 1: 运行typecheck**

Run: `cd frontend/apps/mobile && npm run typecheck`
Expected: PASS

- [ ] **Step 2: 运行lint**

Run: `cd frontend/apps/mobile && npm run lint`
Expected: PASS

- [ ] **Step 3: 运行测试**

Run: `cd frontend/apps/mobile && npm run test -- --testPathPattern="messageStore|messagePagination|messageRepository|mobile-core" --no-coverage`
Expected: PASS

- [ ] **Step 4: 最终Commit**

```bash
git add -A
git commit -m "feat: complete message merge rules calibration"
```
