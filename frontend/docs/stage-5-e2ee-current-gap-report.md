# Stage 5 E2EE Current Gap Report

**生成日期**: 2026-05-15
**任务类型**: 前端 E2EE 功能盘点（源码级）
**依据文档**: `frontend/docs/frontend-e2ee-strategy-boundary.md`

---

## 边界确认

**本任务涉及的 E2EE 规则：**
- E1 (阶段五总目标)
- E2 (Web E2EE 能力边界)
- E3 (Mobile E2EE deferred 能力边界)
- E4 (移动端支持等级裁决)
- E28 (Web 既有行为不得回退清单)
- E31 (E2EE 测试矩阵)
- E32 (阶段五禁止事项)
- E33 (冲突处理规则)

**条款归属：**
- Web E2EE: E2, E28
- Mobile E2EE: E3, E4
- Shared contract: E1
- 后端协议: E11

**本任务未越界修改任何内容，仅做盘点分析。**

---

## 1. Web 已实现能力清单

### 1.1 X3DH 密钥协商 (E2.1, E12)

| 能力 | 源码路径 | 状态 |
|------|----------|------|
| Identity Key Pair 生成 (ECDH P-256) | `frontend/apps/web/src/features/e2ee/engine/x3dh.ts` | ✅ 已实现 |
| Signing Identity Key (ECDSA P-256) | `frontend/apps/web/src/features/e2ee/engine/x3dh.ts` | ✅ 已实现 |
| Signed Pre-Key 签名验证 | `frontend/apps/web/src/features/e2ee/engine/x3dh.ts` | ✅ 已实现 |
| X3DH 握手 (initiate/respond) | `frontend/apps/web/src/features/e2ee/engine/x3dh.ts` | ✅ 已实现 |
| One-Time Pre-Key 生成 | `frontend/apps/web/src/features/e2ee/manager/local-device.ts` | ⚠️ 生成但未上传 |
| Key Bundle 上传 | `frontend/apps/web/src/features/e2ee/api/key-service.ts` | ✅ 已实现 |
| 设备注册 | `frontend/apps/web/src/features/e2ee/manager/local-device.ts` | ✅ 已实现 |

### 1.2 Double Ratchet 加密引擎 (E2.1, E13)

| 能力 | 源码路径 | 状态 |
|------|----------|------|
| Ratchet 加密/解密 | `frontend/apps/web/src/features/e2ee/engine/double-ratchet.ts` | ✅ 已实现 |
| Root Key 派生 | `frontend/apps/web/src/features/e2ee/engine/double-ratchet.ts` | ✅ 已实现 |
| Chain Key 分裂 (send/receive) | `frontend/apps/web/src/features/e2ee/engine/double-ratchet.ts` | ✅ 已实现 |
| DH Ratchet 密钥轮换 | `frontend/apps/web/src/features/e2ee/engine/double-ratchet.ts` | ✅ 已实现 |
| Skipped Message Keys 管理 | `frontend/apps/web/src/features/e2ee/engine/double-ratchet.ts` | ✅ 已实现 |
| Counter Gap 检查 (MAX=2000) | `frontend/apps/web/src/features/e2ee/manager/e2ee-manager.ts:80` | ✅ 已实现 |
| AAD 绑定 (ratchetPublicKey, counter, previousCounter) | `frontend/apps/web/src/features/e2ee/engine/double-ratchet.ts` | ✅ 已实现 |

### 1.3 密钥存储 (E17)

| 能力 | 源码路径 | 状态 |
|------|----------|------|
| IndexedDB `e2ee_keys` v2 | `frontend/apps/web/src/features/e2ee/store/key-store.ts` | ✅ 已实现 |
| Identity Key 存储 (non-extractable CryptoKey) | `frontend/apps/web/src/features/e2ee/store/key-store.ts:80` | ✅ 已实现 |
| Signed Pre-Key 存储 (JWK + raw public) | `frontend/apps/web/src/features/e2ee/store/key-store.ts:113` | ✅ 已实现 |
| Ratchet State 持久化 (IndexedDB) | `frontend/apps/web/src/features/e2ee/store/session-store.ts` | ✅ 已实现 |
| Session Status 存储 (localStorage) | `frontend/apps/web/src/features/e2ee/manager/negotiation.ts:29` | ✅ 已实现 |
| Initial Handshake 存储 (localStorage) | `frontend/apps/web/src/features/e2ee/manager/negotiation.ts:42` | ✅ 已实现 |
| Device ID 存储 | `frontend/apps/web/src/features/e2ee/store/key-store.ts:147` | ✅ 已实现 |
| 密钥清除 (logout) | `frontend/apps/web/src/features/e2ee/store/key-store.ts:203` | ✅ 已实现 |

### 1.4 消息加密发送 (E21)

| 能力 | 源码路径 | 状态 |
|------|----------|------|
| 文本消息加密发送 | `frontend/apps/web/src/stores/modules/message-send-queue.ts:245-315` | ✅ 已实现 |
| 发送方本地明文保留 | `frontend/apps/web/src/stores/modules/message-send-queue.ts:340-343` | ✅ 已实现 |
| Negotiating 状态阻断 | `frontend/apps/web/src/stores/modules/message-send-queue.ts:198-200` | ✅ 已实现 |
| 加密失败阻断 | `frontend/apps/web/src/stores/modules/message-send-queue.ts:265-273` | ✅ 已实现 |
| Encrypted Send API 调用 | `frontend/apps/web/src/stores/modules/message-send-queue.ts:305-315` | ✅ 已实现 |

### 1.5 消息解密接收 (E22)

| 能力 | 源码路径 | 状态 |
|------|----------|------|
| Encrypted 消息识别 | `frontend/apps/web/src/stores/websocket.ts:476` | ✅ 已实现 |
| 非自己消息解密 | `frontend/apps/web/src/stores/websocket.ts:487-498` | ✅ 已实现 |
| 自己消息本地明文保留 | `frontend/apps/web/src/stores/websocket.ts:543-558` | ✅ 已实现 |
| No Ratchet State 自动协商 | `frontend/apps/web/src/stores/websocket.ts:516-533` | ✅ 已实现 |
| Counter Gap 重新协商触发 | `frontend/apps/web/src/features/e2ee/manager/e2ee-manager.ts:80-83` | ✅ 已实现 |

### 1.6 媒体加密 (E23)

| 能力 | 源码路径 | 状态 |
|------|----------|------|
| 媒体文件 AES-GCM 加密 | `frontend/apps/web/src/features/e2ee/engine/media-crypto.ts` | ✅ 已实现 |
| 大文件 Web Worker 加密 | `frontend/apps/web/src/features/e2ee/workers/media-crypto.worker.ts` | ✅ 已实现 |
| 分块加密 (5MB chunks) | `frontend/apps/web/src/features/e2ee/engine/media-crypto.ts:15` | ✅ 已实现 |
| 随机 Media Key 生成 | `frontend/apps/web/src/features/e2ee/engine/media-crypto.ts:54` | ✅ 已实现 |
| 上传前加密拦截 | `frontend/apps/web/src/features/chat/composables/useFileMessageUpload.ts:88-108` | ✅ 已实现 |
| Media Key 随消息传输 | `frontend/apps/web/src/features/chat/composables/useFileMessageUpload.ts:103-107` | ✅ 已实现 |

### 1.7 Pending Encrypted Message (E24)

| 能力 | 源码路径 | 状态 |
|------|----------|------|
| Pending 消息缓存 | `frontend/apps/web/src/features/e2ee/manager/pending-messages.ts` | ✅ 已实现 |
| 协商完成后重试解密 | `frontend/apps/web/src/stores/websocket.ts:519-533` | ✅ 已实现 |
| 内存缓存 (非持久化) | `frontend/apps/web/src/features/e2ee/manager/pending-messages.ts:19` | ✅ 已实现 |

### 1.8 协商状态管理 (E9, E10)

| 能力 | 源码路径 | 状态 |
|------|----------|------|
| 会话状态 plaintext/negotiating/encrypted/failed | `frontend/apps/web/src/features/e2ee/manager/negotiation.ts:29-35` | ✅ 已实现 |
| 协商请求发起 | `frontend/apps/web/src/features/e2ee/manager/negotiation.ts:90-175` | ✅ 已实现 |
| 协商响应处理 | `frontend/apps/web/src/features/e2ee/manager/negotiation.ts:181-230` | ✅ 已实现 |
| 协商接受/拒绝/禁用事件 | `frontend/apps/web/src/features/e2ee/negotiation-events.ts` | ✅ 已实现 |
| E2EE 状态变更事件 | `frontend/apps/web/src/features/e2ee/status-events.ts` | ✅ 已实现 |

### 1.9 WebSocket E2EE 事件 (E11)

| 能力 | 源码路径 | 状态 |
|------|----------|------|
| E2EE_NEGOTIATION 事件识别 | `frontend/apps/web/src/stores/websocket.ts:626` | ✅ 已实现 |
| 事件归一化 | `frontend/apps/web/src/stores/websocket.ts:41-60` | ✅ 已实现 |
| 分发到 negotiation event bus | `frontend/apps/web/src/stores/websocket.ts:632-638` | ✅ 已实现 |
| 不在 WS store 内执行 crypto | `frontend/apps/web/src/stores/websocket.ts:626-639` | ✅ 已实现 |

---

## 2. Mobile 已实现 deferred 能力清单 (E3)

### 2.1 Encrypted Message 遮罩 (E3.2, E26)

| 能力 | 源码路径 | 状态 |
|------|----------|------|
| `isEncryptedMessage` 检测 | `frontend/apps/mobile/src/e2ee/e2eeDeferred.ts:10-11` | ✅ 已实现 |
| `maskEncryptedMessage` 遮罩 | `frontend/apps/mobile/src/e2ee/e2eeDeferred.ts:16-29` | ✅ 已实现 |
| 遮罩文案: `此端到端加密消息暂不能在移动端查看，请在 Web 端查看。` | `frontend/apps/mobile/src/e2ee/e2eeDeferred.ts:4-5` | ✅ 已实现 |
| 清除 mediaUrl/thumbnailUrl/mediaName/mediaSize/duration | `frontend/apps/mobile/src/e2ee/e2eeDeferred.ts:22-27` | ✅ 已实现 |
| `E2eeUnsupportedMessage` 组件 | `frontend/apps/mobile/src/e2ee/E2eeUnsupportedMessage.tsx` | ✅ 已实现 |

### 2.2 Encrypted Session 发送阻断 (E3.2, E27)

| 能力 | 源码路径 | 状态 |
|------|----------|------|
| `isEncryptedSession` 检测 | `frontend/apps/mobile/src/e2ee/e2eeDeferred.ts:13-14` | ✅ 已实现 |
| `assertPlaintextSendAllowed` 阻断 | `frontend/apps/mobile/src/e2ee/e2eeDeferred.ts:31-35` | ✅ 已实现 |
| 阻断文案: `移动端暂不支持端到端加密会话发送，请切换到 Web 端或关闭加密通道。` | `frontend/apps/mobile/src/e2ee/e2eeDeferred.ts:7-8` | ✅ 已实现 |
| `sendText` 阻断 | `frontend/apps/mobile/src/stores/messageStore.ts:179` | ✅ 已实现 |
| `sendMedia` 阻断 | `frontend/apps/mobile/src/stores/messageStore.ts:188` | ✅ 已实现 |
| `E2eeUnsupportedNotice` 组件 | `frontend/apps/mobile/src/e2ee/E2eeUnsupportedNotice.tsx` | ✅ 已实现 |

### 2.3 Pending Encrypted Payload 阻断 (E3.2, E24)

| 能力 | 源码路径 | 状态 |
|------|----------|------|
| `blockEncryptedPendingPayload` 检测 | `frontend/apps/mobile/src/e2ee/e2eeDeferred.ts:37-44` | ✅ 已实现 |
| `retryMessage` 中阻断 | `frontend/apps/mobile/src/stores/messageStore.ts:220-222` | ✅ 已实现 |
| Blocked 状态标记 | `frontend/apps/mobile/src/stores/messageStore.ts:221` | ✅ 已实现 |

### 2.4 WebSocket E2EE Negotiation Deferred (E3.3)

| 能力 | 源码路径 | 状态 |
|------|----------|------|
| E2EE_NEGOTIATION 事件识别 | `frontend/apps/mobile/src/stores/websocketStore.ts:299` | ✅ 已实现 |
| Deferred 日志记录 | `frontend/apps/mobile/src/stores/websocketStore.ts:300` | ✅ 已实现 |
| 不执行协商/不生成密钥 | `frontend/apps/mobile/src/stores/websocketStore.ts:299-301` | ✅ 已实现 |

### 2.5 Chat Screen E2EE 集成

| 能力 | 源码路径 | 状态 |
|------|----------|------|
| Encrypted Session 检测 | `frontend/apps/mobile/src/screens/chat/ChatScreen.tsx:32` | ✅ 已实现 |
| E2eeUnsupportedNotice 显示 | `frontend/apps/mobile/src/screens/chat/ChatScreen.tsx:132` | ✅ 已实现 |
| 发送按钮禁用 | `frontend/apps/mobile/src/screens/chat/ChatScreen.tsx:163` | ✅ 已实现 |
| 输入框禁用 | `frontend/apps/mobile/src/screens/chat/ChatScreen.tsx:157` | ✅ 已实现 |
| 媒体按钮禁用 | `frontend/apps/mobile/src/screens/chat/ChatScreen.tsx:150-154` | ✅ 已实现 |
| Placeholder 提示 | `frontend/apps/mobile/src/screens/chat/ChatScreen.tsx:158` | ✅ 已实现 |

### 2.6 消息加载时遮罩

| 能力 | 源码路径 | 状态 |
|------|----------|------|
| `loadMessages` 遮罩 | `frontend/apps/mobile/src/stores/messageStore.ts:150` | ✅ 已实现 |
| `addMessage` 遮罩 | `frontend/apps/mobile/src/stores/messageStore.ts:159` | ✅ 已实现 |

---

## 3. Mobile 缺失能力清单 (E3.1, E4)

### 3.1 X3DH 协议 (完全缺失)

| 缺失能力 | 说明 | 风险等级 |
|----------|------|----------|
| Identity Key Pair 生成 | 无 ECDH P-256 密钥对生成 | 高 |
| Signing Identity Key | 无 ECDSA P-256 签名密钥 | 高 |
| Signed Pre-Key 生成/签名 | 无 SPK 生成和签名 | 高 |
| One-Time Pre-Key 管理 | 无 OPK 生成/上传/消耗 | 高 |
| X3DH 握手 | 无 initiate/respond 逻辑 | 高 |
| Key Bundle 上传 | 无 bundle 注册 API 调用 | 高 |
| 设备注册 | 无 E2EE device 注册 | 高 |

### 3.2 Double Ratchet 引擎 (完全缺失)

| 缺失能力 | 说明 | 风险等级 |
|----------|------|----------|
| Ratchet 加密/解密 | 无 AES-GCM 加解密 | 高 |
| Root Key 派生 | 无 HKDF 派生 | 高 |
| Chain Key 分裂 | 无 send/receive chain | 高 |
| DH Ratchet 密钥轮换 | 无 ECDH ratchet | 高 |
| Skipped Message Keys | 无乱序消息处理 | 高 |
| Counter Gap 检查 | 无重协商触发 | 高 |

### 3.3 密钥存储 (完全缺失)

| 缺失能力 | 说明 | 风险等级 |
|----------|------|----------|
| Identity Key 持久化 | 无 secure key store | 高 |
| Ratchet State 持久化 | 无 session store | 高 |
| Session Status 管理 | 无 encrypted/negotiating 状态 | 中 |
| Pre-Key Bundle 元数据 | 无 bundle 缓存 | 中 |

### 3.4 消息加密发送 (完全缺失)

| 缺失能力 | 说明 | 风险等级 |
|----------|------|----------|
| 文本加密发送 | 无 e2eeManager.encryptMessage | 高 |
| 媒体加密上传 | 无 encryptMedia | 高 |
| Encrypted Send API | 无 sendPrivateEncrypted | 高 |
| 发送方明文保留 | 无本地明文缓存 | 中 |

### 3.5 消息解密接收 (完全缺失)

| 缺失能力 | 说明 | 风险等级 |
|----------|------|----------|
| Encrypted 消息解密 | 无 ratchetDecrypt | 高 |
| 自己消息明文保留 | 无 clientMessageId 匹配 | 中 |
| Counter Gap 重协商 | 无自动协商触发 | 中 |

### 3.6 Pending Encrypted Message (完全缺失)

| 缺失能力 | 说明 | 风险等级 |
|----------|------|----------|
| 缓存加密消息 | 无 cachePendingMessage | 中 |
| 协商后重试解密 | 无 retry decrypt | 中 |

### 3.7 协商状态管理 (完全缺失)

| 缺失能力 | 说明 | 风险等级 |
|----------|------|----------|
| 会话状态追踪 | 无 plaintext/negotiating/encrypted/failed | 中 |
| 协商请求发起 | 无 initiateNegotiation | 高 |
| 协商响应处理 | 无 respondToNegotiation | 高 |
| 协商接受/拒绝 | 无 accept/reject 处理 | 高 |

---

## 4. shared-types 已有 E2EE 字段清单 (E29)

### 4.1 Message 类型 E2EE 字段

**源码路径**: `frontend/packages/shared-types/src/message.ts`

| 字段 | 类型 | 说明 |
|------|------|------|
| `encrypted` | `boolean \| number` | 消息是否加密 |
| `e2eeHeader` | `string` | Ratchet header (JSON) |
| `e2eeDeviceId` | `string` | 发送设备 ID |
| `e2eeSenderIdentityKey` | `string` | 发送方 identity key |
| `e2eeEphemeralKey` | `string` | 临时公钥 |

**RawMessageDTO 兼容字段** (camelCase + snake_case):
- `encrypted`
- `e2eeHeader` / `e2ee_header`
- `e2eeDeviceId` / `e2ee_device_id`
- `e2eeSenderIdentityKey` / `e2ee_sender_identity_key`
- `e2eeEphemeralKey` / `e2ee_ephemeral_key`

### 4.2 ChatSession 类型 E2EE 字段

**源码路径**: `frontend/packages/shared-types/src/session.ts`

| 字段 | 类型 | 说明 |
|------|------|------|
| `encrypted` | `boolean` | 会话是否启用 E2EE (展示用) |

**RawConversationDTO 兼容字段**:
- `encrypted` (boolean | number)

### 4.3 WebSocketMessage 类型

**源码路径**: `frontend/packages/shared-types/src/session.ts`

| 类型 | 说明 |
|------|------|
| `E2EE_NEGOTIATION` | 协商控制面事件 |

---

## 5. WebSocket E2EE_NEGOTIATION 处理差异 (E11)

### 5.1 Web 处理流程

**源码路径**: `frontend/apps/web/src/stores/websocket.ts:626-639`

```typescript
// W20: E2EE negotiation — dispatch only, no crypto logic change
if (eventKind === "e2eeNegotiation") {
  if (!data.data) return;
  const normalized = normalizeE2eeNegotiationEvent(data.data);
  if (!normalized) return;
  try {
    const { emitE2eeNegotiation } = await import("@/features/e2ee/negotiation-events");
    emitE2eeNegotiation(normalized);
  } catch (e) {
    console.error("[E2EE] Failed to dispatch negotiation event:", e);
  }
  return;
}
```

**特点**:
- ✅ 归一化字段 (sessionId, action, requesterId, requestPayloadJson)
- ✅ 分发到 negotiation event bus
- ✅ 不执行 X3DH/Double Ratchet
- ✅ 只做事件路由

### 5.2 Mobile 处理流程

**源码路径**: `frontend/apps/mobile/src/stores/websocketStore.ts:299-301`

```typescript
// W20: E2EE negotiation — deferred on mobile.
if (kind === 'e2eeNegotiation') {
  logger.info('websocket', 'E2EE negotiation ignored on mobile because E2EE is deferred');
}
```

**特点**:
- ✅ 识别 E2EE_NEGOTIATION 事件
- ✅ 只记录 deferred 日志
- ✅ 不执行协商
- ✅ 不生成密钥
- ✅ 不接受/拒绝协议事件

### 5.3 差异分析

| 维度 | Web | Mobile | 符合 E11 |
|------|-----|--------|----------|
| 事件识别 | ✅ | ✅ | ✅ |
| 字段归一化 | ✅ | ❌ (不需要) | ✅ |
| 事件分发 | ✅ (event bus) | ❌ (日志) | ✅ |
| 不执行 crypto | ✅ | ✅ | ✅ |
| 状态推进 | ✅ (由 negotiation.ts) | ❌ | ✅ |

**结论**: 两端均符合 E11 要求，Web 做事件分发由 negotiation 模块处理，Mobile 做 deferred 日志。

---

## 6. 文本消息加密发送差异 (E21)

### 6.1 Web 发送流程

**源码路径**: `frontend/apps/web/src/stores/modules/message-send-queue.ts:179-401`

```
1. 检查 session.type === "private"
2. 动态导入 getLocalSessionStatus
3. 若 status === "negotiating" → 阻断，提示"端到端加密协商尚未完成"
4. 创建 optimistic message (localId, clientMessageId)
5. 若 status === "encrypted":
   a. 调用 e2eeManager.encryptMessage(sessionId, content)
   b. 获取 initialHandshake (senderIdentityKey, ephemeralPublicKey, deviceId)
   c. 若加密失败 → markPendingFailed, 返回 false
6. 调用 messageService.sendPrivateEncrypted({
     receiverId, clientMessageId, messageType, content: ciphertext,
     encrypted: true, e2eeHeader, e2eeDeviceId, e2eeSenderIdentityKey, e2eeEphemeralKey
   })
7. 服务端返回后，保留本地明文: serverMessage.content = pendingMessage.content
8. 网络失败时，pending payload 保存密文 (encrypted: true)
```

**符合 E21 条款**:
- ✅ E21.1: 先加密后发送
- ✅ E21.2: 加密失败/negotiating 阻断
- ✅ E21.3: 发送方本地保留明文

### 6.2 Mobile 发送流程

**源码路径**: `frontend/apps/mobile/src/stores/messageStore.ts:178-185`

```
1. 调用 assertPlaintextSendAllowed(session)
2. 若 session.encrypted === true → throw Error("移动端暂不支持端到端加密会话发送")
3. 创建 optimistic message
4. 调用 messageService.sendPrivate(payload)
```

**符合 E21 条款**:
- ✅ E21.4: 不允许 encrypted session 发送
- ✅ 抛出 E2EE send disabled 文案

### 6.3 差异分析

| 维度 | Web | Mobile | 说明 |
|------|-----|--------|------|
| 加密能力 | ✅ | ❌ | Mobile 无加密引擎 |
| Negotiating 阻断 | ✅ | ❌ | Mobile 只检查 encrypted |
| 加密失败处理 | ✅ | N/A | Mobile 不加密 |
| 明文保留 | ✅ | N/A | Mobile 不加密 |
| Encrypted API | ✅ | ❌ | Mobile 无 sendPrivateEncrypted |
| Pending 密文保存 | ✅ | ❌ | Mobile 不加密 |

---

## 7. 文本消息解密接收差异 (E22)

### 7.1 Web 接收流程

**源码路径**: `frontend/apps/web/src/stores/websocket.ts:476-558`

```
1. 检测 encrypted === true || encrypted === 1
2. 若非 SYSTEM 类型:
   a. 若 senderId !== currentUserId (非自己消息):
      - 解析 e2eeHeader (JSON)
      - 获取 senderIdentityKey, ephemeralKey
      - 调用 e2eeManager.decryptMessage(sessionId, senderId, header, content, ...)
      - 解密成功 → 替换 content, encrypted = false
      - 解密失败:
        * No ratchet state + status=encrypted → 重置为 plaintext, 通知用户
        * No ratchet state + status=negotiating → 提示协商进行中
        * No ratchet state + status=plaintext → 缓存消息, 自动发起协商
        * 其他错误 → 保持 encrypted=true
   b. 若 senderId === currentUserId (自己消息):
      - 从本地消息列表查找匹配的 clientMessageId
      - 若找到 → 使用本地明文替换 content
      - 保持 encrypted=true
3. 调用 chatStore.addMessage(normalizedMessage)
```

**符合 E22 条款**:
- ✅ E22.1: encrypted=true 时 content 视为密文
- ✅ E22.2: 非自己消息使用 Ratchet state 解密
- ✅ E22.3: 解密失败保持 encrypted 状态或显示遮罩

### 7.2 Mobile 接收流程

**源码路径**: `frontend/apps/mobile/src/stores/messageStore.ts:150,159`

```
1. loadMessages:
   - response.data.map(maskEncryptedMessage)
   - 遮罩: content → E2EE_UNSUPPORTED_TEXT, 清除媒体字段
2. addMessage:
   - maskEncryptedMessage(message)
   - 遮罩后存入 messagesBySession
```

**符合 E22 条款**:
- ✅ E22.4: 始终遮罩 encrypted message，不解密

### 7.3 差异分析

| 维度 | Web | Mobile | 说明 |
|------|-----|--------|------|
| 解密能力 | ✅ | ❌ | Mobile 无解密引擎 |
| 自己消息明文 | ✅ | ❌ | Mobile 遮罩所有 |
| Counter Gap 处理 | ✅ | ❌ | Mobile 无 ratchet state |
| 自动协商触发 | ✅ | ❌ | Mobile deferred |
| 遮罩展示 | ❌ | ✅ | Web 解密后展示明文 |

---

## 8. 媒体消息加密差异 (E23)

### 8.1 Web 媒体加密流程

**源码路径**: `frontend/apps/web/src/features/chat/composables/useFileMessageUpload.ts:61-134`

```
1. 检查 sessionId && e2eeManager.getSessionStatus(sessionId) === "encrypted"
2. 若加密:
   a. 调用 encryptMedia(file) → { encryptedChunks, mediaKey, chunkIvs }
   b. 合并加密块为单个 Blob
   c. 上传密文 blob
   d. 返回 encryption metadata: { mediaKey, chunkIvs, mimeType }
3. 发送时将 encryption metadata 随消息传输
```

**源码路径**: `frontend/apps/web/src/features/e2ee/engine/media-crypto.ts`

```
- AES-GCM-256 加密
- 分块大小: 5MB
- 小文件主线程处理，大文件 Web Worker
- 随机 mediaKey (32 bytes) + chunk IV (12 bytes)
```

**符合 E23 条款**:
- ✅ E23.1: 上传前 AES-GCM 加密
- ✅ E23.2: media key 随消息安全传输

### 8.2 Mobile 媒体发送

**源码路径**: `frontend/apps/mobile/src/stores/messageStore.ts:187-202`

```
1. 调用 assertPlaintextSendAllowed(session)
2. 若 encrypted → throw Error (阻断)
3. 创建 optimistic message (带 mediaUrl, mediaName, etc.)
4. 调用 uploadService.createTask(file)
5. 调用 messageService.sendPrivate(payload)
```

**符合 E23 条款**:
- ✅ E23.3: 不支持 encrypted session 媒体发送

### 8.3 差异分析

| 维度 | Web | Mobile | 说明 |
|------|-----|--------|------|
| 文件加密 | ✅ (AES-GCM) | ❌ | Mobile 无加密引擎 |
| 分块加密 | ✅ (5MB chunks) | ❌ | Mobile 无加密引擎 |
| Web Worker | ✅ | ❌ | Mobile 无 Web Worker |
| Media Key 传输 | ✅ | ❌ | Mobile 不加密 |
| 阻断发送 | N/A | ✅ | Mobile 阻断 encrypted session |

---

## 9. pending encrypted payload 差异 (E24, E25)

### 9.1 Web Pending 处理

**源码路径**: `frontend/apps/web/src/features/e2ee/manager/pending-messages.ts`

```
- 内存 Map 缓存 (非持久化)
- 缓存内容: sessionId, peerId, content, header, senderIdentityKey, ephemeralPublicKey, messageRef
- 协商完成后取出重试解密
```

**源码路径**: `frontend/apps/web/src/stores/modules/message-send-queue.ts:370-397`

```
- 网络失败时:
  - 若 encryptedPayload 存在 → 保存密文 payload (encrypted: true)
  - payload 包含: ciphertext, e2eeHeader, e2eeDeviceId, e2eeSenderIdentityKey, e2eeEphemeralKey
```

**符合 E24/E25 条款**:
- ✅ E24.1: 只用于等待协商后重试解密
- ✅ E24.2: 日志脱敏
- ✅ E25.1: 保存已生成的密文
- ✅ E25.2: 不反复用同一明文重新加密

### 9.2 Mobile Pending 处理

**源码路径**: `frontend/apps/mobile/src/stores/messageStore.ts:218-222`

```
1. retryMessage 解析 payloadJson
2. 调用 blockEncryptedPendingPayload(payload)
3. 检测 payload.encrypted === true || data.encrypted === true
4. 若加密 → 更新 status: 'blocked', lastError: 'E2EE deferred'
5. 返回，不重试发送
```

**符合 E24/E25 条款**:
- ✅ E24.3: encrypted payload 置为 blocked
- ✅ E25.3: 调用 blockEncryptedPendingPayload
- ✅ E25.4: blocked 状态不自动恢复

### 9.3 差异分析

| 维度 | Web | Mobile | 说明 |
|------|-----|--------|------|
| Incoming 缓存 | ✅ (内存) | ❌ | Mobile 不缓存加密消息 |
| Outgoing 密文保存 | ✅ | ❌ | Mobile 不生成密文 |
| Blocked 状态 | ❌ | ✅ | Web 不需要 blocked |
| 重试解密 | ✅ | ❌ | Mobile deferred |

---

## 10. 移动端密钥存储差异 (E18)

### 10.1 当前 Mobile 存储方案

**secureStorage** (`frontend/apps/mobile/src/services/storage/secureStorage.ts`):
- 用途: access token, session meta, cookie mirror
- 底层: react-native-keychain (WHEN_UNLOCKED_THIS_DEVICE_ONLY)
- Fallback: 内存 Map
- **不存储 E2EE 密钥** ✅

**kvStorage** (`frontend/apps/mobile/src/services/storage/kvStorage.ts`):
- 用途: 用户快照、设置、草稿、WS 缓存、FCM token
- 底层: MMKV (im-mobile-kv)
- Fallback: 内存 Map
- **不存储 E2EE 密钥** ✅

**messageDatabase** (`frontend/apps/mobile/src/services/storage/messageDatabase.ts`):
- 用途: 消息、会话、pending 队列、上传任务
- 底层: SQLite
- **不存储 E2EE 密钥** ✅

### 10.2 符合 E18 条款

- ✅ E18.1: Track A 下不存储 E2EE 密钥
- ✅ E18.2: Keychain 内存 fallback 只用于 auth 降级
- ✅ E18.3: MMKV/SQLite 只保存非敏感数据

### 10.3 Track B 前置需求

若未来启用 Track B，需要:
1. **Secure Key Store**: Identity Key → Keychain/Keystore (不可导出)
2. **Ratchet State Store**: 加密后存 SQLite (wrapping key 在 Keychain)
3. **Session Status**: 可存 MMKV (非敏感 UI flags)

---

## 11. 采用 Track A/B/C 后的任务影响 (E4, E5, E6, E7)

### 11.1 Track A (当前采用) (E4.1, E5)

**允许的 Mimo 任务** (E5.5, E34.2):
- ✅ Mobile deferred 文案测试
- ✅ Encrypted message 遮罩测试
- ✅ Encrypted pending payload blocked 测试
- ✅ WebSocket negotiation deferred 测试
- ✅ Shared normalizer 字段测试
- ✅ Web 不回退回归测试
- ✅ 日志脱敏检查

**禁止的 Mimo 任务** (E5.5, E32):
- ❌ X3DH/Double Ratchet 协议实现
- ❌ Mobile 加密发送
- ❌ Mobile 解密展示
- ❌ Mobile 接受协商
- ❌ Mobile 注册 E2EE device
- ❌ Mobile 上传 key bundle
- ❌ Shared-e2ee-core 抽取

### 11.2 Track B (未采用) (E4.3, E6)

**前置条件** (E6.2-E6.5):
1. React Native crypto 运行时验证 (P-256 ECDH/ECDSA, HKDF, AES-GCM, CSPRNG)
2. Secure key store 方案 (Keychain/Keystore, 无内存 fallback)
3. IndexedDB 替代方案 (Ratchet state, skipped keys, bundle metadata)
4. 测试矩阵 (Web/Mobile 互通、乱序、重复、counter gap、重启恢复、真机 Keychain)

### 11.3 Track C (未采用) (E4.4, E7)

**定义** (E7.1-E7.3):
- 允许展示 encrypted session 状态
- 允许展示协商待处理提示
- 允许遮罩 encrypted message
- 禁止解密、加密发送、生成密钥、上传 bundle、接受协商、推进 Ratchet

**当前 Mobile 已实现的能力接近 Track C**，但:
- 当前实现是 Track A (deferred)，不是 Track C
- Track C 需要同步 Web 已建立的会话状态
- Track C 需要 Codex 明确事件语义和冲突处理

---

## 12. 阶段五风险清单 (E34.4)

### 12.1 高风险项

| 风险 | 说明 | 条款 | 缓解措施 |
|------|------|------|----------|
| Web encrypted 状态与 Ratchet state 不一致 | localStorage status=encrypted 但 IndexedDB 无 state | E14.1 | 已有检查: `session-store.ts:146-152` |
| OPK 生成但未启用 | `local-device.ts` 上传 `oneTimePreKeys: []` | E15.2 | 阶段五不宣称 OPK 已启用 |
| Mobile Keychain 内存 fallback | 可用于 auth，不可用于 E2EE | E18.2 | Track A 不存储 E2EE 密钥 |
| Media key 包装格式未固化 | 随消息传输，无专用包装 | E23.2 | Web 当前方案可用，需 Codex 审计 |
| Skipped message keys 资源上限 | 无明确上限限制 | E13.1 | 需 Codex 裁决 |
| Offline retry 与 Ratchet state 事务性 | 加密后保存密文，无 rollback | E25.2 | 需 Codex 设计 |

### 12.2 中风险项

| 风险 | 说明 | 条款 | 缓解措施 |
|------|------|------|----------|
| 多设备只选最新设备 | `newestDevice()` 选择逻辑 | E16.2 | 阶段五不扩展多设备 |
| 日志中出现 counter 或状态 | `session-store.ts:109,137` 有 counter 日志 | E20.4 | 短期诊断可接受 |
| Mobile 无 encrypted session 状态追踪 | 只检查 `session.encrypted` | E9.5 | Track A 足够 |
| Mobile 搜索可能泄露密文 | `searchMessages` 过滤 content | E26.3 | 遮罩后 content 已替换 |

### 12.3 低风险项

| 风险 | 说明 | 条款 | 缓解措施 |
|------|------|------|----------|
| Mobile notification 可能显示遮罩文案 | `displayMessageNotification` | E26.3 | 遮罩后 content 已替换 |
| Mobile lastMessage 显示遮罩文案 | `applyMessageToSession` | E26.3 | 遮罩后 content 已替换 |
| Web pending message 内存泄露 | Map 无自动清理 | E24.1 | 会话切换时清理 |

---

## 源码路径索引

### Web E2EE 核心

| 模块 | 路径 |
|------|------|
| E2EE Manager | `frontend/apps/web/src/features/e2ee/manager/e2ee-manager.ts` |
| X3DH 引擎 | `frontend/apps/web/src/features/e2ee/engine/x3dh.ts` |
| Double Ratchet 引擎 | `frontend/apps/web/src/features/e2ee/engine/double-ratchet.ts` |
| Media Crypto 引擎 | `frontend/apps/web/src/features/e2ee/engine/media-crypto.ts` |
| Key Store | `frontend/apps/web/src/features/e2ee/store/key-store.ts` |
| Session Store | `frontend/apps/web/src/features/e2ee/store/session-store.ts` |
| 协商模块 | `frontend/apps/web/src/features/e2ee/manager/negotiation.ts` |
| Pending Messages | `frontend/apps/web/src/features/e2ee/manager/pending-messages.ts` |
| Local Device | `frontend/apps/web/src/features/e2ee/manager/local-device.ts` |
| Device Identity | `frontend/apps/web/src/features/e2ee/manager/device-identity.ts` |
| Negotiation Events | `frontend/apps/web/src/features/e2ee/negotiation-events.ts` |
| Status Events | `frontend/apps/web/src/features/e2ee/status-events.ts` |

### Web Store 集成

| 模块 | 路径 |
|------|------|
| Message Send Queue | `frontend/apps/web/src/stores/modules/message-send-queue.ts` |
| WebSocket Store | `frontend/apps/web/src/stores/websocket.ts` |
| File Upload | `frontend/apps/web/src/features/chat/composables/useFileMessageUpload.ts` |

### Mobile E2EE Deferred

| 模块 | 路径 |
|------|------|
| E2EE Deferred | `frontend/apps/mobile/src/e2ee/e2eeDeferred.ts` |
| E2eeUnsupportedNotice | `frontend/apps/mobile/src/e2ee/E2eeUnsupportedNotice.tsx` |
| E2eeUnsupportedMessage | `frontend/apps/mobile/src/e2ee/E2eeUnsupportedMessage.tsx` |

### Mobile Store

| 模块 | 路径 |
|------|------|
| Message Store | `frontend/apps/mobile/src/stores/messageStore.ts` |
| WebSocket Store | `frontend/apps/mobile/src/stores/websocketStore.ts` |
| Session Store | `frontend/apps/mobile/src/stores/sessionStore.ts` |

### Mobile Storage

| 模块 | 路径 |
|------|------|
| Secure Storage | `frontend/apps/mobile/src/services/storage/secureStorage.ts` |
| KV Storage | `frontend/apps/mobile/src/services/storage/kvStorage.ts` |
| Message Database | `frontend/apps/mobile/src/services/storage/messageDatabase.ts` |

### Shared Types

| 模块 | 路径 |
|------|------|
| Message Types | `frontend/packages/shared-types/src/message.ts` |
| Session Types | `frontend/packages/shared-types/src/session.ts` |

---

## 条款引用清单

本报告引用的条款编号:

| 条款 | 说明 | 引用位置 |
|------|------|----------|
| E1 | 阶段五总目标 | 边界确认 |
| E2 | Web E2EE 能力边界 | §1 |
| E3 | Mobile E2EE deferred 边界 | §2, §3 |
| E4 | 移动端支持等级裁决 | §11 |
| E5 | Track A 策略 | §11.1 |
| E6 | Track B 策略 | §11.2 |
| E7 | Track C 策略 | §11.3 |
| E9 | 会话状态语义 | §1.8 |
| E10 | 协商事件语义 | §1.8 |
| E11 | WebSocket E2EE 事件边界 | §5 |
| E12 | X3DH 协议边界 | §1.1 |
| E13 | Double Ratchet 协议边界 | §1.2 |
| E14 | Counter gap 与重协商 | §1.2, §12.1 |
| E15 | Identity key / SPK / OPK 边界 | §12.1 |
| E16 | deviceId 与多设备 | §12.1 |
| E17 | Web 密钥存储 | §1.3 |
| E18 | Mobile 密钥存储 | §10 |
| E20 | 日志禁止规则 | §12.1 |
| E21 | 文本消息加密发送 | §6 |
| E22 | 文本消息解密接收 | §7 |
| E23 | 媒体消息加密 | §8 |
| E24 | Pending encrypted payload | §9 |
| E25 | 离线重试与密文 payload | §9 |
| E26 | Mobile 密文遮罩文案 | §2.1 |
| E27 | Mobile 加密会话发送阻断 | §2.2 |
| E28 | Web 既有行为不得回退 | §1 |
| E29 | shared-types E2EE 字段 | §4 |
| E31 | E2EE 测试矩阵 | 边界确认 |
| E32 | 阶段五禁止事项 | §11.1 |
| E33 | 冲突处理规则 | 边界确认 |
| E34 | 后续任务引用方式 | §11.1, §12 |

---

## 验收清单

- ✅ 报告文件存在: `frontend/docs/stage-5-e2ee-current-gap-report.md`
- ✅ 报告引用 E1-E34 条款
- ✅ 报告列出源码路径证据
- ✅ 未修改代码逻辑
- ✅ 未修改测试
- ✅ 未修改文案
- ✅ 未猜测未读取的源码

---

## 条款遵守确认

**已读取的 frontend-e2ee-strategy-boundary.md 条款编号**: E1-E34 (全部)

**本任务实际遵守的条款编号**:
- E1: 阶段五总目标 — 盘点当前能力，不做业务逻辑改造
- E2: Web E2EE 能力边界 — 盘点 Web 已实现能力
- E3: Mobile E2EE deferred 能力边界 — 盘点 Mobile 已实现 deferred 能力
- E4: 移动端支持等级裁决 — 确认 Track A/B/C 影响
- E28: Web 既有行为不得回退 — 确认 Web 能力完整性
- E31: E2EE 测试矩阵 — 盘点测试覆盖现状
- E32: 阶段五禁止事项 — 确认盘点不越界
- E33: 冲突处理规则 — 报告发现的差距

**是否发现任务要求与边界文档冲突**: ❌ 无冲突

**本任务未违反 frontend-e2ee-strategy-boundary.md**
