# E2EE 加密通道 Ping 验证 — 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在 E2EE 加密通道建立后实现定期 Ping/Pong 验证，确保加解密通路完整性

**Architecture:** 新增 `channel-ping.ts` 模块管理 Ping/Pong 逻辑和定时器；在 `negotiation.ts` 协商阶段生成并共享 6 位验证短语（通过 `requestPayloadJson`）；在 `websocket.ts` 解密后拦截 Ping/Pong 消息，不添加到聊天列表；在 `App.vue` 登出时清理定时器

**Tech Stack:** TypeScript, Vue 3, localStorage, 现有 E2EE WASM 管线 (`encryptToEnvelope`/`decryptEnvelope`)

---

## 文件结构

| 文件 | 操作 | 职责 |
|------|------|------|
| `frontend/apps/web/src/features/e2ee/manager/channel-ping.ts` | **新建** | Ping/Pong 核心逻辑、定时器管理、退出加密 |
| `frontend/apps/web/src/features/e2ee/manager/negotiation.ts` | 修改 | 生成验证短语、附带在 requestPayloadJson、启动定时器 |
| `frontend/apps/web/src/features/chat/ChatE2eeNegotiationDialog.vue` | 修改 | 从 payload 提取 verifyPhrase 传给 respondToNegotiation |
| `frontend/apps/web/src/features/chat/ChatContainer.vue` | 修改 | accepted 事件中传入 remoteUserId 以启动 ping 定时器 |
| `frontend/apps/web/src/stores/websocket.ts` | 修改 | 解密后拦截 Ping/Pong，不添加到聊天列表 |
| `frontend/apps/web/src/App.vue` | 修改 | 登出时调用 `stopAllPingTimers()` |

---

### Task 1: 创建 `channel-ping.ts` 核心模块

**Files:**
- Create: `frontend/apps/web/src/features/e2ee/manager/channel-ping.ts`

- [ ] **Step 1: 创建文件并写入完整模块代码**

```typescript
import { e2eeManager } from "./e2ee-manager";
import { setLocalSessionStatus } from "./negotiation";
import { keyService } from "../api/key-service";
import { http } from "@/utils/request";
import { MESSAGE_ENDPOINTS } from "@im/shared-api-contract";
import { useUserStore } from "@/stores/user";
import { ElMessage } from "element-plus";
import { logger } from "@/utils/logger";

const PING_INTERVAL_MS = 30 * 60 * 1000;
const PING_TIMEOUT_MS = 30 * 1000;
const PING_RETRY_MS = 10 * 1000;
const VERIFY_PHRASE_PREFIX = "e2ee:verify_phrase:";
const PING_PREFIX = "E2EE_PING|";
const PONG_PREFIX = "E2EE_PONG|";

// ── 验证短语 ──

export function generateVerifyPhrase(): string {
  return String(Math.floor(Math.random() * 1_000_000)).padStart(6, "0");
}

export function saveVerifyPhrase(sessionId: string, phrase: string): void {
  localStorage.setItem(VERIFY_PHRASE_PREFIX + sessionId, phrase);
}

export function getVerifyPhrase(sessionId: string): string | null {
  return localStorage.getItem(VERIFY_PHRASE_PREFIX + sessionId);
}

export function deleteVerifyPhrase(sessionId: string): void {
  localStorage.removeItem(VERIFY_PHRASE_PREFIX + sessionId);
}

// ── 消息检测 ──

export function isPingMessage(plaintext: string): boolean {
  return plaintext.startsWith(PING_PREFIX);
}

export function isPongMessage(plaintext: string): boolean {
  return plaintext.startsWith(PONG_PREFIX);
}

interface PingPayload {
  phrase: string;
  timestamp: number;
}

function parsePayload(plaintext: string, prefix: string): PingPayload | null {
  const body = plaintext.slice(prefix.length);
  const sep = body.lastIndexOf("|");
  if (sep < 0) return null;
  return {
    phrase: body.slice(0, sep),
    timestamp: Number(body.slice(sep + 1)),
  };
}

// ── 超时管理 ──

const pendingTimeouts = new Map<string, ReturnType<typeof setTimeout>>();

function setPendingTimeout(sessionId: string, fn: () => void, ms: number): void {
  clearPendingTimeout(sessionId);
  pendingTimeouts.set(
    sessionId,
    setTimeout(() => {
      pendingTimeouts.delete(sessionId);
      fn();
    }, ms),
  );
}

function clearPendingTimeout(sessionId: string): void {
  const timer = pendingTimeouts.get(sessionId);
  if (timer) {
    clearTimeout(timer);
    pendingTimeouts.delete(sessionId);
  }
}

// ── 定时器管理 ──

const pingTimers = new Map<string, ReturnType<typeof setInterval>>();

export function startPingTimer(sessionId: string, remoteUserId: string): void {
  stopPingTimer(sessionId);

  const tick = () => {
    void sendPing(sessionId, remoteUserId);
  };

  tick(); // 立即首次 ping

  pingTimers.set(sessionId, setInterval(tick, PING_INTERVAL_MS));
}

export function stopPingTimer(sessionId: string): void {
  const timer = pingTimers.get(sessionId);
  if (timer) {
    clearInterval(timer);
    pingTimers.delete(sessionId);
  }
  clearPendingTimeout(sessionId);
}

export function stopAllPingTimers(): void {
  for (const [sessionId] of pingTimers) {
    stopPingTimer(sessionId);
  }
}

// ── 发送 Ping/Pong ──

async function sendPing(sessionId: string, remoteUserId: string): Promise<void> {
  const phrase = getVerifyPhrase(sessionId);
  if (!phrase) {
    logger.warn("[E2EE Ping] verify phrase missing, skipping ping", { sessionId });
    return;
  }

  const userStore = useUserStore();
  const senderUserId = String(userStore.userId);
  if (!senderUserId) return;

  const plaintext = `${PING_PREFIX}${phrase}|${Date.now()}`;

  try {
    const envelope = await e2eeManager.encryptToEnvelope({
      conversationId: sessionId,
      clientMsgId: crypto.randomUUID(),
      senderUserId,
      recipientUserId: remoteUserId,
      plaintext,
    });

    await http.post(MESSAGE_ENDPOINTS.SEND_PRIVATE, {
      receiverId: remoteUserId,
      clientMessageId: crypto.randomUUID(),
      messageType: "TEXT",
      encrypted: true,
      e2eeEnvelope: envelope,
      e2eeDeviceId: envelope.senderDeviceId,
    });

    setPendingTimeout(
      sessionId,
      () => {
        logger.warn("[E2EE Ping] pong timeout", { sessionId });
        void exitEncryption(sessionId);
      },
      PING_TIMEOUT_MS,
    );
  } catch (error) {
    logger.warn("[E2EE Ping] send failed, retrying once", {
      sessionId,
      error: error instanceof Error ? error.message : String(error),
    });
    setTimeout(() => {
      void sendPing(sessionId, remoteUserId);
    }, PING_RETRY_MS);
  }
}

async function sendPong(sessionId: string, remoteUserId: string): Promise<void> {
  const phrase = getVerifyPhrase(sessionId);
  if (!phrase) return;

  const userStore = useUserStore();
  const senderUserId = String(userStore.userId);
  if (!senderUserId) return;

  const plaintext = `${PONG_PREFIX}${phrase}|${Date.now()}`;

  try {
    const envelope = await e2eeManager.encryptToEnvelope({
      conversationId: sessionId,
      clientMsgId: crypto.randomUUID(),
      senderUserId,
      recipientUserId: remoteUserId,
      plaintext,
    });

    await http.post(MESSAGE_ENDPOINTS.SEND_PRIVATE, {
      receiverId: remoteUserId,
      clientMessageId: crypto.randomUUID(),
      messageType: "TEXT",
      encrypted: true,
      e2eeEnvelope: envelope,
      e2eeDeviceId: envelope.senderDeviceId,
    });
  } catch (error) {
    logger.warn("[E2EE Ping] send pong failed", {
      sessionId,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

// ── 处理收到的 Ping/Pong ──

export function handleIncomingPing(
  plaintext: string,
  sessionId: string,
  remoteUserId: string,
): void {
  const payload = parsePayload(plaintext, PING_PREFIX);
  if (!payload) return;

  const expected = getVerifyPhrase(sessionId);
  if (!expected || payload.phrase !== expected) {
    logger.warn("[E2EE Ping] received ping with mismatched phrase", { sessionId });
    void exitEncryption(sessionId);
    return;
  }

  void sendPong(sessionId, remoteUserId);
}

export function handleIncomingPong(
  plaintext: string,
  sessionId: string,
): boolean {
  const payload = parsePayload(plaintext, PONG_PREFIX);
  if (!payload) return false;

  const expected = getVerifyPhrase(sessionId);
  if (!expected || payload.phrase !== expected) {
    logger.warn("[E2EE Ping] received pong with mismatched phrase", { sessionId });
    void exitEncryption(sessionId);
    return false;
  }

  clearPendingTimeout(sessionId);
  return true;
}

// ── 退出加密 ──

async function exitEncryption(sessionId: string): Promise<void> {
  stopPingTimer(sessionId);
  deleteVerifyPhrase(sessionId);

  try {
    await e2eeManager.clearSession(sessionId);
  } catch {
    // best-effort
  }

  setLocalSessionStatus(sessionId, "plaintext");

  try {
    await keyService.disableEncryption(sessionId);
  } catch (err) {
    logger.warn("[E2EE Ping] disable encryption API failed", {
      sessionId,
      error: err instanceof Error ? err.message : String(err),
    });
  }

  ElMessage.warning("加密通道验证失败，已切换为明文模式");
}
```

- [ ] **Step 2: 运行 TypeScript 类型检查**

```bash
cd frontend && npx tsc --noEmit --project apps/web/tsconfig.json
```

Expected: 零错误。如有错误按提示修复。

- [ ] **Step 3: 提交**

```bash
git add frontend/apps/web/src/features/e2ee/manager/channel-ping.ts
git commit -m "feat(e2ee): add channel ping core module

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

### Task 2: 修改 `negotiation.ts` — 生成验证短语 + 共享 + 启动定时器

**Files:**
- Modify: `frontend/apps/web/src/features/e2ee/manager/negotiation.ts`

- [ ] **Step 1: 在文件顶部新增 import**

在第 14 行（`import { ensureLocalE2eeDeviceRegistered...`）之后添加：

```typescript
import {
  generateVerifyPhrase,
  saveVerifyPhrase,
  startPingTimer,
} from "./channel-ping";
```

- [ ] **Step 2: 修改 `initiateNegotiation()` — 生成 verifyPhrase 并附带在 payload 中**

替换第 194-210 行。原代码：

```typescript
    localStorage.setItem(`e2ee:remote_device:${sessionId}`, remoteBundle.deviceId);

    const handshake: InitialE2eeHandshake = {
      senderIdentityKey: localKeys.publicBundle.identityKey,
      handshake: bytesToBase64(handshakeBytes),
      senderDeviceId: deviceId,
      targetDeviceId: remoteBundle.deviceId,
    };
    savePendingInitialHandshake(sessionId, handshake);

    await keyService.requestEncryption(
      sessionId,
      localKeys.publicBundle.identityKey,
      localKeys.publicBundle.signedPreKey.key,
      JSON.stringify(handshake),
    );
    setLocalSessionStatus(sessionId, "negotiating");
    return true;
```

替换为：

```typescript
    localStorage.setItem(`e2ee:remote_device:${sessionId}`, remoteBundle.deviceId);

    const handshake: InitialE2eeHandshake = {
      senderIdentityKey: localKeys.publicBundle.identityKey,
      handshake: bytesToBase64(handshakeBytes),
      senderDeviceId: deviceId,
      targetDeviceId: remoteBundle.deviceId,
    };
    savePendingInitialHandshake(sessionId, handshake);

    const verifyPhrase = generateVerifyPhrase();
    saveVerifyPhrase(sessionId, verifyPhrase);

    const requestPayloadJson = JSON.stringify({
      ...handshake,
      verifyPhrase,
    });

    await keyService.requestEncryption(
      sessionId,
      localKeys.publicBundle.identityKey,
      localKeys.publicBundle.signedPreKey.key,
      requestPayloadJson,
    );
    setLocalSessionStatus(sessionId, "negotiating");
    return true;
```

- [ ] **Step 3: 修改 `respondToNegotiation()` — 接受并存储 verifyPhrase**

修改函数签名（第 229 行），新增 `verifyPhrase` 参数：

```typescript
export async function respondToNegotiation(
  sessionId: string,
  remoteIdentityKeyBase64: string,
  handshakeBase64: string,
  senderUserId: string,
  senderDeviceId: string,
  targetDeviceId: string,
  verifyPhrase?: string,
): Promise<boolean> {
```

在 `setLocalSessionStatus(sessionId, "encrypted")`（第 313 行）之前添加：

```typescript
    if (verifyPhrase && verifyPhrase.length > 0) {
      saveVerifyPhrase(sessionId, verifyPhrase);
    }

    setLocalSessionStatus(sessionId, "encrypted");
```

- [ ] **Step 4: 修改 `markNegotiationAccepted()` — 启动 Ping 定时器**

修改第 66-69 行。原代码：

```typescript
export function markNegotiationAccepted(sessionId: string): void {
  clearPendingInitialHandshake(sessionId);
  setLocalSessionStatus(sessionId, "encrypted");
}
```

替换为：

```typescript
export function markNegotiationAccepted(sessionId: string, remoteUserId?: string): void {
  clearPendingInitialHandshake(sessionId);
  setLocalSessionStatus(sessionId, "encrypted");
  if (remoteUserId) {
    startPingTimer(sessionId, remoteUserId);
  }
}
```

- [ ] **Step 5: 运行类型检查**

```bash
cd frontend && npx tsc --noEmit --project apps/web/tsconfig.json
```

Expected: 零错误。

- [ ] **Step 6: 提交**

```bash
git add frontend/apps/web/src/features/e2ee/manager/negotiation.ts
git commit -m "feat(e2ee): generate and share verify phrase during E2EE negotiation

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

### Task 3: 修改 `ChatE2eeNegotiationDialog.vue` — 提取并传递 verifyPhrase

**Files:**
- Modify: `frontend/apps/web/src/features/chat/ChatE2eeNegotiationDialog.vue`

- [ ] **Step 1: 在 `handleAccept()` 中提取 verifyPhrase 并传给 respondToNegotiation**

修改第 122-147 行。将 payload 类型和 respondToNegotiation 调用更新如下：

```typescript
    const payload = JSON.parse(props.requestPayloadJson) as {
      senderIdentityKey?: string;
      handshake?: string;
      senderDeviceId?: string;
      targetDeviceId?: string;
      verifyPhrase?: string;
    };

    if (!payload.senderIdentityKey || !payload.handshake) {
      throw new Error("协商载荷格式错误，缺少必要的密钥信息。");
    }
    if (!payload.senderDeviceId || !payload.targetDeviceId) {
      throw new Error("协商载荷格式错误，缺少必要的设备信息。");
    }

    const { respondToNegotiation } = await import(
      "@/features/e2ee/manager/negotiation"
    );
    const ok = await respondToNegotiation(
      props.sessionId,
      payload.senderIdentityKey,
      payload.handshake,
      props.requesterId,
      payload.senderDeviceId,
      payload.targetDeviceId,
      payload.verifyPhrase,
    );
```

注意：只需修改两处：(1) payload 类型添加 `verifyPhrase?: string`；(2) `respondToNegotiation` 调用末尾添加 `payload.verifyPhrase`。

- [ ] **Step 2: 运行类型检查**

```bash
cd frontend && npx tsc --noEmit --project apps/web/tsconfig.json
```

Expected: 零错误。

- [ ] **Step 3: 提交**

```bash
git add frontend/apps/web/src/features/chat/ChatE2eeNegotiationDialog.vue
git commit -m "feat(e2ee): pass verify phrase from negotiation dialog to responder

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

### Task 4: 修改 `ChatContainer.vue` — accepted 事件传入 remoteUserId

**Files:**
- Modify: `frontend/apps/web/src/features/chat/ChatContainer.vue`

- [ ] **Step 1: 在 `markNegotiationAccepted` 调用处传入 `event.targetUserId`**

修改第 615-616 行。原代码：

```typescript
    import("@/features/e2ee/manager/negotiation").then(({ markNegotiationAccepted }) => {
      markNegotiationAccepted(event.sessionId);
```

替换为：

```typescript
    import("@/features/e2ee/manager/negotiation").then(({ markNegotiationAccepted }) => {
      markNegotiationAccepted(event.sessionId, event.targetUserId);
```

- [ ] **Step 2: 运行类型检查**

```bash
cd frontend && npx tsc --noEmit --project apps/web/tsconfig.json
```

Expected: 零错误。

- [ ] **Step 3: 提交**

```bash
git add frontend/apps/web/src/features/chat/ChatContainer.vue
git commit -m "feat(e2ee): start ping timer when negotiation is accepted

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

### Task 5: 修改 `websocket.ts` — 拦截 Ping/Pong 消息

**Files:**
- Modify: `frontend/apps/web/src/stores/websocket.ts`

- [ ] **Step 1: 在 `addMessage` 之前添加 Ping/Pong 拦截**

在 `if (isEncrypted ...)` 块结束之后（约第 523 行 `}` 之后）、`await chatStore.addMessage(normalizedMessage)`（约第 527 行）之前，插入拦截逻辑。

注意：需要在 `if (isEncrypted ...)` 块结束后，能够访问 `isEncrypted` 和 `senderId` 变量。查看代码结构，`isEncrypted` 在 if 块内部定义（第 477 行），`senderId` 在第 480 行的 if 块内定义。需要在拦截代码中重新计算：

在第 527 行 `await chatStore.addMessage(normalizedMessage);` 之前插入：

```typescript
      // Intercept E2EE Ping/Pong — process but don't add to chat
      if (
        normalizedMessage.encrypted &&
        normalizedMessage.messageType !== "SYSTEM" &&
        typeof normalizedMessage.content === "string" &&
        normalizedMessage.content.length > 0
      ) {
        const content = normalizedMessage.content;
        const msgSenderId = String(normalizedMessage.senderId || "");
        if (content.startsWith("E2EE_PING|")) {
          if (msgSenderId !== currentUserId) {
            const { handleIncomingPing } = await import(
              "@/features/e2ee/manager/channel-ping"
            );
            const sessionId = normalizedMessage.receiverId
              ? buildSessionId("private", currentUserId, normalizedMessage.receiverId)
              : "";
            if (sessionId) handleIncomingPing(content, sessionId, msgSenderId);
          }
          return;
        }
        if (content.startsWith("E2EE_PONG|")) {
          if (msgSenderId !== currentUserId) {
            const { handleIncomingPong } = await import(
              "@/features/e2ee/manager/channel-ping"
            );
            const sessionId = normalizedMessage.receiverId
              ? buildSessionId("private", currentUserId, normalizedMessage.receiverId)
              : "";
            if (sessionId) handleIncomingPong(content, sessionId);
          }
          return;
        }
      }
```

注意 `buildSessionId` 已在 websocket.ts 第 7 行从 `@/normalizers/chat` 导入。

- [ ] **Step 2: 运行类型检查**

```bash
cd frontend && npx tsc --noEmit --project apps/web/tsconfig.json
```

Expected: 零错误。

- [ ] **Step 3: 提交**

```bash
git add frontend/apps/web/src/stores/websocket.ts
git commit -m "feat(e2ee): intercept ping/pong messages in websocket handler

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

### Task 6: 修改 `App.vue` — 登出时清理 Ping 定时器

**Files:**
- Modify: `frontend/apps/web/src/App.vue`

- [ ] **Step 1: 在 import 区域添加 `stopAllPingTimers`**

在第 34 行 `import { resetDeviceIdCache }...` 之后添加：

```typescript
import { stopAllPingTimers } from "@/features/e2ee/manager/channel-ping";
```

- [ ] **Step 2: 在 `resetUserServices()` 末尾调用**

在第 76 行 `}`（localStorage 清理 try/catch 结束）之后、第 78 行 `};` 之前添加：

```typescript
  stopAllPingTimers();
```

完整函数：

```typescript
const resetUserServices = () => {
  bootstrapped.value = false;
  webSocketStore.disconnect();
  chatStore.clear();
  stopDeviceHeartbeat();
  clearAllKeys().catch(() => {});
  resetDeviceIdCache();
  try {
    for (const key of Object.keys(localStorage)) {
      if (key.startsWith("e2ee:")) {
        localStorage.removeItem(key);
      }
    }
  } catch {
    // localStorage may be unavailable
  }
  stopAllPingTimers();
};
```

- [ ] **Step 3: 运行类型检查**

```bash
cd frontend && npx tsc --noEmit --project apps/web/tsconfig.json
```

Expected: 零错误。

- [ ] **Step 4: 提交**

```bash
git add frontend/apps/web/src/App.vue
git commit -m "feat(e2ee): stop all ping timers on logout

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

### Task 7: 集成验证

- [ ] **Step 1: 完整类型检查**

```bash
cd frontend && npx tsc --noEmit --project apps/web/tsconfig.json
```

Expected: 零错误。

- [ ] **Step 2: 生产构建验证**

```bash
cd frontend && npm run web:build
```

Expected: 构建成功。

- [ ] **Step 3: 提交（如有未提交的变更）**

```bash
git status
git add -A
git commit -m "feat(e2ee): complete channel ping verification

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```
