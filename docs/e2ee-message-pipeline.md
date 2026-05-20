# E2EE Message Pipeline（移动端）

本文档描述 React Native 移动端 E2EE 消息管道的完整数据流，覆盖出站（outbound）、入站（inbound）、
挂起解密重试（pending decrypt retry）和安全约束四个维度。

与 `e2ee-lifecycle.md`（生命周期/启动/存储）和 `e2ee-code-map.md`（文件索引）互补。

---

## 1. Outbound Pipeline（出站管道）

### 1.1 调用链一览

```
chatStore.sendText
  └─ messageStore.sendText(session, content)
       ├─ resolveEffectiveE2eeStatus(session)
       │    ├─ loadLocalSessionStatus(session.id)   // negotiation.ts — 读取持久化的协商状态
       │    └─ getSessionE2eeStatus(session)        // e2eeDeferred.ts — MMKV 缓存回退
       │
       ├─ [status=plaintext]  → Rule A: 触发协商，消息入队 pending
       ├─ [status=negotiating] → Rule B: 消息入队 pending，不重复触发协商
       ├─ [status=encrypted]  → Rule C: 加密并发送
       └─ [status=failed]     → Rule D: 抛错，禁止发送
              │
              ▼ (Rule C 详细流程)
       e2eeManager.encryptToEnvelope({ sessionId, plaintext, recipientUserId })
         ├─ enqueue(sessionId) — 会话级串行锁
         ├─ loadLocalSessionStatus → 必须为 'encrypted'
         ├─ getSessionState → 已有 ratchet state？
         │    ├─ YES → restoreSession → encrypt
         │    └─ NO  → fetchRemoteBundle(userId, deviceId)
         │              ├─ GET /e2ee/devices/{userId}
         │              ├─ 选最新活跃设备
         │              ├─ GET /e2ee/bundle/{userId}/{deviceId}
         │              └─ normalizeRemoteBundle → RustPublicPreKeyBundle
         │            → createOutboundSession (产生 handshake bytes)
         │            → encrypt
         ├─ exportSession(sessionId)
         ├─ e2eeSessionStore.saveSessionState(...)  ← 硬提交边界
         └─ setLocalSessionStatus('encrypted')
              │
              ▼
       messageService.sendPrivateEncrypted(payload)
         └─ POST /messages/private (encrypted=true + e2eeEnvelope)
```

### 1.2 关键设计点

**1.2.1 negotiation.ts 不直接拉 PreKey**

`negotiation.ts` 的职责是协商状态管理：发起请求（`initiateNegotiation`）、接受/拒绝请求、
持久化状态。它**不**拉取远端 PreKey bundle，**不**创建 Rust 会话，**不**执行加密操作。

`initiateNegotiation()` 的内部流程：
1. `persistStatus(sessionId, 'negotiating')`
2. 清理旧的 Rust 会话状态
3. `uploadRequestMetadata` — 调用 `mobileE2eeKeyService.requestEncryption(sessionId)` 上传协商请求元数据
4. `persistStatus(sessionId, 'negotiating')`（再次确认）

它不调用 `fetchRemoteBundle`，不做 X3DH 握手。

**1.2.2 PreKey bundle 拉取在 e2eeManager.fetchRemoteBundle()**

真正的 PreKey bundle 拉取发生在 `e2eeManager.encryptToEnvelope()` 内部：

```typescript
// e2eeManager.ts — encryptToEnvelope()
if (existingState) {
  await runtime.restoreSession(params.sessionId, existingState);
} else {
  const remoteBundle = await this.fetchRemoteBundle(params.recipientUserId, ...);
  // fetchRemoteBundle 内部:
  //   1. GET /e2ee/devices/{userId} → 获取设备列表
  //   2. 选 newestDevice（按 lastActiveAt 排序）
  //   3. GET /e2ee/bundle/{userId}/{deviceId} → 获取 PreKey bundle
  //   4. normalizeRemoteBundle → 转为 RustPublicPreKeyBundle
  await runtime.createOutboundSession({ sessionId, localKeys, remoteBundle });
  // handshake bytes 产生
}
```

**1.2.3 status=encrypted 表示协商已接受，不必然表示 ratchet ready**

`status = "encrypted"` 仅表示双方已同意加密。Rust ratchet 状态可能尚未创建。

使用以下方法来区分：
- `hasSessionState(sessionId)` — 布尔值状态检查
- `getSessionCryptoReadiness(sessionId)` — 返回 `"none"` | `"accepted"` | `"ratchet_ready"`

出站会话在第一次 `encryptToEnvelope()` 调用时创建并持久化 ratchet state；
入站会话在收到第一条携带 handshake 的消息时创建。

**1.2.4 首条 outbound encrypted message 携带 handshake**

当 `existingState` 为假（首次加密发送）时，`encryptToEnvelope()` 会调用
`createOutboundSession`，产生 handshake bytes，编码为 Base64 后放入 envelope.handshake。
接收方可以从此 handshake 创建入站会话。

**1.2.5 Pending E2EE Send Queue（出站挂起队列）**

`Rule A` 和 `Rule B` 场景下，消息不直接发送，而是通过 `enqueuePendingE2eeText()` 写入
pending 队列：

```typescript
// outbound/pendingE2eeSend.ts
enqueuePendingE2eeText(session, message, plaintext, 'negotiation')
  → pendingMessageRepository.enqueue({
      payloadJson: JSON.stringify({
        requiresE2ee: true,
        e2eeWaitReason: 'negotiation',
        plaintext,          // 明文存储在本地 pending 队列
        data: { receiverId, clientMessageId, messageType: 'TEXT' }
        // 注意：data 中无 content 字段，无 encrypted 标记
      })
    })
```

**安全说明**：`plaintext` 字段仅在本地 SQLite（`pendingMessageRepository`）中暂存，永远不会
通过网络发送。当协商完成后，`encryptPendingE2eePayload()` 会用 `e2eeEnvelope` 替换
`plaintext`，然后再通过 `sendPrivateEncrypted` 发送。

**1.2.6 Resume 触发链路**

协商被接受后，恢复出站 pending 的完整链路：

1. `handleNegotiationAccepted(sessionId)` 或 `acceptPendingNegotiation(sessionId)`
   → `setLocalSessionStatus(sessionId, 'encrypted')`
2. `setLocalSessionStatus` → `emitE2eeStatusChange(sessionId, 'encrypted')`
3. `subscribeE2eeStatusChanges` 回调（messageStore.ts:1262）→ `resumeOutboundE2eeSends(sessionId)`
4. `resumeOutboundE2eeSends`：
   - `findPendingE2eeSends(sessionId)` — 查找 `requiresE2ee=true` 的 pending
   - 对每个 pending：`encryptPendingE2eePayload(item)` → 加密并替换 payload
   - 更新本地 optimistic message
   - `retryMessage(item.localId, { force: true })` → 通过正常 retry 管道发送

---

## 2. Inbound Pipeline（入站管道）

### 2.1 调用链一览

```
WebSocket onmessage
  └─ wsMessageQueue.enqueue(payload)
       └─ websocketStore.dispatchPayload(payload)
            ├─ classifyWsEvent(payload)
            ├─ normalizeMessage(data)
            ├─ resolveMessageSessionId → sessionId
            │
            ├─ [type=message]
            │    └─ processE2eeMessage(routedMessage, options)
            │         ├─ parseRawMessage → 提取 rawJson 中的 e2eeEnvelope
            │         ├─ isEncryptedValue? → NO → plaintext（直接返回）
            │         ├─ hasKnownE2eeDisplayPlaintext? → YES → decrypted（已缓存明文）
            │         ├─ isGroupChat? → YES → failed（移动端不支持群聊 E2EE）
            │         ├─ isOwnEcho? → YES → own-echo-preserved（从 optimistic 恢复）
            │         ├─ isRustE2eeEnvelope? → NO → failed
            │         │
            │         └─ e2eeManager.decryptEnvelope(envelope, senderId)
            │              ├─ enqueue(sessionId) — 会话级串行锁
            │              ├─ getSessionState → 已有 ratchet state？
            │              │    ├─ YES → restoreSession → decrypt
            │              │    └─ NO + handshake → createInboundSession → decrypt
            │              │         └─ NO + no handshake → throw (→ pending)
            │              ├─ decrypt
            │              ├─ exportSession → saveSessionState  ← 硬提交边界
            │              └─ setLocalSessionStatus('encrypted')
            │
            ├─ [decryptStatus=pending]
            │    └─ cachePendingEncryptedMessage(sessionId, rawMessage)
            │
            ├─ [shouldDrainPendingAfterDecrypt]
            │    └─ retryDecryptPendingMessages(sessionId) — 触发 pending drain
            │
            └─ addMessage(displayMessage, sessionId) — 添加到 UI 状态
```

### 2.2 关键设计点

**2.2.1 没有 state 且没有 handshake 的消息必须 pending**

```typescript
// e2eeManager.ts — decryptEnvelope()
if (state) {
  await runtime.restoreSession(envelope.sessionId, state);
} else if (envelope.handshake) {
  // 从 handshake 创建入站会话
  await runtime.createInboundSession({ ... });
} else {
  throw new Error('Rust E2EE session state unavailable and envelope has no handshake');
}
```

`messageProcessor.ts` 中的 `shouldKeepPending()` 检测此错误短语，确保消息进入 pending
而不是标记为 failed。

**2.2.2 handshake 消息成功后要 drain pending queue**

`shouldDrainPendingAfterDecrypt()` 在以下条件同时满足时返回 `true`：
- `decryptStatus === 'decrypted'`
- rawMessage 或 displayMessage 的 envelope 中包含 truthy `handshake` 字段

触发链路：
1. `websocketStore.dispatchPayload` 中 decrypt 成功后调用
   `shouldDrainPendingAfterDecrypt(processed)`
2. 若为 true，调用 `retryDecryptPendingMessages(sessionId)`
3. `processMessageForSession`（messageStore 内部）也通过 `triggerPendingDrain` 触发相同逻辑

**2.2.3 批量历史消息用 compareE2eeDecryptOrder 排序**

`processE2eeMessages()` 批量处理时，remote encrypted private text 消息按 session 分组，
每组内使用 `compareE2eeDecryptOrder` 排序：

1. 先按 `sendTime` 升序
2. 再按 `conversationSeq` 升序
3. 最后按 messageId/serverId/id 字典序

排序确保了在批量处理时先创建 session（handshake 消息在前），再解密后续消息。

**2.2.4 Rust skipped message keys 支持 counter gap 内乱序消息**

Rust Double Ratchet 协议通过 skipped message keys 机制支持一定范围内的消息乱序到达。
当消息 #2 在 #1 之前到达时，如果 session state 已就绪，#2 仍可成功解密（只要 counter
gap 在协议允许范围内）。

但业务层仍需 pending retry 机制，因为：
- 消息 #2 可能在新 session state 创建前到达（此时 Rust 侧无 ratchet）
- 消息 #2 到达时 #1（handshake）尚未到达，无 session state 也无 handshake

---

## 3. Pending Decrypt Retry（挂起解密重试）

### 3.1 架构分层

```
Durable Source (持久层)
  messageRepository.listPendingEncryptedMessages()
    → 过滤条件：encrypted=true, decryptStatus!=failed
    → 返回 MobileMessage[] 包含完整 e2eeEnvelope

Runtime Queue (运行时加速层)
  pendingDecryptStore (Map<sessionId, PendingEncryptedMessageEntry[]>)
    → retryCount, nextRetryAt, lastError, lastTriedAt
    → 不存储明文，消息体通过 rawJson 引用 encrypted envelope
```

**关键原则**：`pendingDecryptStore` 是运行时加速层，**不**持有持久加密消息体。
持久数据源是 `messageRepository`。

### 3.2 触发重试的时机

| 触发时机 | 入口 | 说明 |
|----------|------|------|
| WebSocket open | `websocketStore.onopen` → `retryAllPendingEncryptedMessages()` | 网络恢复后批量重试 |
| Foreground reconcile | App 生命周期 → `restorePendingEncryptedMessagesFromRepository()` + retry | 从后台恢复时重建运行时队列 |
| Session open | 进入会话页面 → `retryDecryptVisibleEncryptedMessages()` | 尝试解密当前可见的加密消息 |
| Negotiation accepted | `handleNegotiationAccepted()` → `retryDecryptPendingMessages()` + `retryDecryptVisibleEncryptedMessages()` | 协商完成后重试入站 pending |
| Handshake decrypt success | `dispatchPayload`/`processMessageForSession` → `triggerPendingDrain` | 收到 handshake 后自动 drain |

### 3.3 Backoff / Max Retry / Dead-Letter 规则

配置位于 `constants/config.ts`：

```typescript
E2EE_DECRYPT_RETRY_CONFIG = {
  maxRetryCount: 5,       // 最大重试次数
  baseDelayMs: 2_000,     // 初始退避延迟
  maxDelayMs: 120_000,    // 最大退避延迟（2 分钟）
  maxPerSession: 20,      // 每次重试单个会话最大处理条数
  maxGlobal: 100,         // 每次全局重试最大处理条数
}
```

重试流程（`messageStore.retryDecryptPendingMessages`）：

1. 按 `compareE2eeDecryptOrder` 排序 entries
2. 逐个处理：`processE2eeMessage(entry.message, ...)`
3. 若 `decryptStatus === 'decrypted'` → 从队列移除，添加到 UI
4. 若 `decryptStatus === 'pending'`：
   - 检查 `errorClassification.retryable`：非 retryable → `markDecryptFailed`
   - `retryCount + 1 > maxRetryCount` → `markDecryptFailed`（dead-letter）
   - 否则 → 留在队列，更新 `retryCount`、`nextRetryAt`（使用 `createNextRetryAt`）、`lastError`、`lastTriedAt`
5. 若 `decryptStatus === 'failed'` → `markDecryptFailed`

**Dead-Letter**：达到 max retry 或遇到不可重试错误后，消息被标记为 `decryptStatus='failed'`，
通过 `messageRepository.upsertMessages` 持久化，从运行时 pending 队列移除。

**NextRetryAt 计算**：使用 `shared-im-core` 的 `createNextRetryAt(retryCount, now, config)`，
基于指数退避算法，`baseDelayMs=2000`，`maxDelayMs=120000`。

**Inflight Guard**：`pendingDecryptStore.retryDecryptPendingMessages` 使用
`inflightRetries` Set 防止同一 session 的并发/递归 drain。

### 3.4 Runtime → Durable 同步

`restorePendingEncryptedMessagesFromRepository(sessionId?)` 在以下场景被调用：
- 启动/恢复时（`websocketStore` 补偿）
- Foreground reconcile

它将 `messageRepository.listPendingEncryptedMessages()` 的结果重新填充到运行时
`pendingBySession` Map 中，保留 `retryCount=0`（因为之前可能已有重试记录被重置）。

---

## 4. 安全约束

### 4.1 不发送标记 encrypted 但缺少 e2eeEnvelope 的 payload

`blockEncryptedPendingPayload()` 在 `retryMessage` 阶段检查：

- 若 payload 标记了 `encrypted=true`，但缺少完整的 `e2eeEnvelope`（`isRustE2eeEnvelope` 检查），
  则将其标记为 `blocked` 状态，**绝不**发送。
- 这是防止未加密数据以加密标记发送的最后一道防线。

### 4.2 不把 decrypted plaintext 存入 pending decrypt queue

`pendingDecryptStore.cachePendingEncryptedMessage()` 内部调用 `pendingSafeMessage()`，
它会：
- 清除 `content`（替换为 `E2EE_UNSUPPORTED_TEXT`）
- 清除 `mediaUrl`、`thumbnailUrl`、`mediaName`、`mediaSize`、`duration`
- 保留 `encrypted: true` 和 `e2eeEnvelope`
- 将这些安全值写入 `rawJson`

因此 runtime pending 队列中**绝不**包含已解密的明文。

### 4.3 Outbound pending 的 plaintext 存储

`enqueuePendingE2eeText()` 在本地 pending 中存储 `plaintext`，这是现有普通发送 pending
语义的延续（非加密消息也会在 pending payload 的 `data.content` 中存储明文）。

**关键区别**：
- 该 `plaintext` 不通过 `data.content` 伪装成待发送内容
- `data` 中**不含** `content` 字段 — 这是 E2EE-waiting pending 与普通 pending 的关键区别
- `requiresE2ee=true` 标记阻止 `retryMessage` 直接发送该 payload
- 只有经过 `encryptPendingE2eePayload()` 替换为 `e2eeEnvelope` 后，才会被发送

### 4.4 不允许 silent plaintext downgrade

以下场景全部被阻止：

| 场景 | 防护机制 |
|------|---------|
| `status=plaintext` 私聊发送 | Rule A：不调用 `sendPrivate`，直接入队 pending + 触发协商 |
| `status=negotiating` 私聊发送 | Rule B：入队 pending，不调用 `sendPrivate` |
| `status=encrypted` + 加密失败 | `catch` 块标记 `FAILED`，不 fallback 到 `sendPrivate` |
| `status=failed` 私聊发送 | Rule D：直接 `throw` |
| encrypted 群聊 | `sendText` 直接 `throw` E2EE_SEND_DISABLED_TEXT |
| encrypted=undefined + 已协商 | `resolveEffectiveE2eeStatus` 从持久化加载状态 |
| pending payload 含 encrypted 但不完整 | `blockEncryptedPendingPayload` 标记 blocked |

### 4.5 日志安全

所有 E2EE 相关日志通过 `sanitizeE2eeLogValue()` 处理，确保不泄露：
- identity key
- ephemeral key
- handshake bytes
- wire ciphertext

---

## 5. 相关文件速查

| 文件 | 职责 |
|------|------|
| `src/stores/messageStore.ts` | 发送入口、pending 管理、retry 编排 |
| `src/stores/websocketStore.ts` | WebSocket 消息分发、入站消息路由 |
| `src/e2ee/messageProcessor.ts` | 入站解密调度、排序、pending/failed 分类 |
| `src/e2ee/manager/e2eeManager.ts` | 加密/解密核心逻辑、PreKey 拉取、会话状态提交 |
| `src/e2ee/manager/negotiation.ts` | 协商状态管理（不拉 PreKey，不加密） |
| `src/e2ee/outbound/pendingE2eeSend.ts` | 出站 E2EE pending 入队/加密/恢复 |
| `src/e2ee/store/pendingDecryptStore.ts` | 入站 pending 运行时队列 |
| `src/e2ee/e2eeDeferred.ts` | 加密消息安全掩码、发送守卫 |
| `src/constants/config.ts` | RETRY_CONFIG、E2EE_DECRYPT_RETRY_CONFIG |

## 6. 测试文件速查

| 文件 | 覆盖范围 |
|------|---------|
| `src/stores/__tests__/messageStore.e2ee.test.ts` | 发送阻塞、pending 管理、drain、retry 元数据 |
| `src/stores/__tests__/messageStore.e2ee.outbound.test.ts` | 出站完整管道：plaintext→pending→negotiation→resume→encrypted send |
| `src/stores/__tests__/messageStore.e2ee.inbound-order.test.ts` | 入站乱序恢复：no-handshake pending → handshake → drain |
| `src/stores/__tests__/websocketStore.e2ee.test.ts` | WebSocket E2EE 协商事件分发、敏感字段防泄漏 |
| `src/e2ee/__tests__/messageProcessor.e2ee.test.ts` | 消息处理：排序、handshake 检测、drain 条件 |
| `src/e2ee/__tests__/pendingDecryptStore.test.ts` | 运行时队列恢复、batch 限制、元数据保留 |
| `src/e2ee/__tests__/pendingDecryptStore.retry.test.ts` | retryCount/backoff/max retry/dead-letter |
| `src/e2ee/__tests__/e2eeManagerCommit.test.ts` | session state 提交边界 |
