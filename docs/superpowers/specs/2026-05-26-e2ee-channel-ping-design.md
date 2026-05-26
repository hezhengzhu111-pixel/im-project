# E2EE 加密通道 Ping 验证

## 概述

在 E2EE 加密通道建立后，通过定期发送加密 Ping/Pong 消息验证通道完整性。
验证短语在 X3DH 协商阶段自动生成并共享，双方各自存储。Ping/Pong 通过现有
`encryptToEnvelope`/`decryptEnvelope` 管线发送，测试真实的消息加解密通路。

---

## 触发时机

| 时机 | 说明 |
|------|------|
| 加密通道建立后 | **立即**执行首次 Ping |
| 每隔 30 分钟 | 发起方自动执行 Ping |
| 用户手动 | 可选的「验证通道」按钮触发（后续迭代） |

**谁负责 Ping：** 发起加密协商的一方（即调用 `initiateNegotiation()` 的用户）。

---

## 验证短语

- **生成：** 发起方在协商阶段生成 6 位随机数字（`Math.random` → `000000-999999`）
- **共享：** 附带在 `requestPayloadJson` 中（与 handshake payload 合并为 JSON），
  通过 `POST /api/e2ee/request` → `e2ee_sessions.request_payload_json` 传递。
  后端无需改动，`request_payload_json` 字段已支持任意 JSON 内容。
- **存储：** 双方各自存储在 IndexedDB（key: `e2ee:verify_phrase:<sessionId>`）
- **生命周期：** 随加密通道销毁而清除

---

## Ping/Pong 消息格式

Ping/Pong 不创建新消息类型，使用特殊 content 前缀通过现有加密管线：

```
Ping:  "E2EE_PING|<verifyPhrase>|<timestamp_ms>"
Pong:  "E2EE_PONG|<verifyPhrase>|<timestamp_ms>"
```

例：`E2EE_PING|482916|1779760706898`

消息通过 `encryptToEnvelope` 加密、发送至服务端，但不显示在聊天 UI 中，
也不持久化到 IndexedDB 消息缓存。

---

## 完整流程

### 阶段 1：协商阶段（建立加密通道时）

```
A (发起方 / 后续 Ping 方)                  B (接收方)
  │                                          │
  ├─ 生成 verifyPhrase = "482916"            │
  ├─ 存储 IndexedDB                          │
  ├─ POST /api/e2ee/request                  │
  │   { sessionId, payload, verifyPhrase } ──→
  │                                          ├─ 收到 pending 通知
  │                                          ├─ respondToNegotiation()
  │                                          ├─ 从 request 读取 verifyPhrase
  │                                          ├─ 存储 IndexedDB
  │                                          │
  ├─ 收到 accepted ←─────────────────────────┤
  ├─ startPingTimer(sessionId)               │
  │   └─ 立即首次 ping ─────────────────────→ 详见阶段 2
```

### 阶段 2：Ping/Pong 阶段

```
A (发起方)                                  B (接收方)
  │                                          │
  ├─ sendPing(sessionId)                     │
  │   1. 读取 verifyPhrase = "482916"        │
  │   2. plaintext = "E2EE_PING|482916|ts"  │
  │   3. envelope = encryptToEnvelope(...)   │
  │   4. 通过 API 发送 (systemMessage) ──────→
  │   5. 启动 30 秒超时                       │
  │                                          ├─ WebSocket 收到消息
  │                                          ├─ decryptEnvelope(envelope)
  │                                          ├─ plaintext 以 "E2EE_PING|" 开头
  │                                          ├─ 解析 phrase, 比对本地存储
  │                                          ├─ ✓ 匹配:
  │                                          │    sendPong(sessionId)
  │                                          │    "E2EE_PONG|482916|ts"
  │                                          │    encryptToEnvelope(...)
  │                                          ├─ ✗ 不匹配:
  │                                          │    exitEncryption(sessionId)
  │                                          │
  ├─ decryptEnvelope ←───────────────────────┤
  ├─ plaintext 以 "E2EE_PONG|" 开头         │
  ├─ 解析 phrase, 比对                       │
  ├─ ✓ 匹配: 清除超时, 记录成功, 30 分钟后重复│
  └─ ✗ 不匹配或超时: exitEncryption(sessionId)
```

### 阶段 3：退出加密通道（验证失败时）

```
exitEncryption(sessionId):
  1. 设置 session status = "plaintext"
  2. 清除本地 E2EE 会话 (clearSession)
  3. 调用 POST /api/e2ee/disable 通知服务端
  4. 停止 Ping 定时器
  5. ElMessage.warning("加密通道验证失败，已切换为明文模式")
  6. 对方收到 disable push → 同样执行 1-4
```

---

## 新增文件

### `frontend/apps/web/src/features/e2ee/manager/channel-ping.ts`

核心模块，职责：

```
sendPing(sessionId: string): Promise<void>
  - 读取 verifyPhrase
  - 构造 ping content → encryptToEnvelope → 发送
  - 启动超时计时器

handleIncomingPingPlaintext(plaintext: string, sessionId: string): boolean
  - 解析 "E2EE_PING|<phrase>|<ts>"
  - 比对 verifyPhrase
  - 返回 true（验证通过）或 false（需退出加密）

sendPong(sessionId: string): Promise<void>
  - 读取 verifyPhrase
  - 构造 pong content → encryptToEnvelope → 发送

handleIncomingPongPlaintext(plaintext: string, sessionId: string): boolean
  - 解析 "E2EE_PONG|<phrase>|<ts>"
  - 比对 verifyPhrase
  - 清除对应超时计时器
  - 返回 true/false

isPingMessage(plaintext: string): boolean
  - 判断是否以 "E2EE_PING|" 开头

isPongMessage(plaintext: string): boolean
  - 判断是否以 "E2EE_PONG|" 开头

startPingTimer(sessionId: string): void
  - 立即首次 ping
  - 设置 30 分钟间隔定时器

stopPingTimer(sessionId: string): void
  - 清除该 session 的定时器

stopAllPingTimers(): void
  - 登出时清除所有定时器

exitEncryption(sessionId: string): Promise<void>
  - 降级为明文 + 通知用户
```

PING_INTERVAL_MS = 30 * 60 * 1000
PING_TIMEOUT_MS = 30 * 1000

---

## 需要修改的文件

### negotiation.ts — 生成并共享验证短语

1. `initiateNegotiation()` 中：
   - 生成 `verifyPhrase = randomDigits(6)`
   - 存入 IndexedDB: `e2ee:verify_phrase:<sessionId>`
   - 附带在 `requestEncryption()` 的请求体中

2. `respondToNegotiation()` 中：
   - 从 pending request 读取 `verifyPhrase`
   - 存入 IndexedDB

3. 协商成功后（accepted），发起方调用 `startPingTimer(sessionId)`

### e2ee-manager.ts — 暴露 ping 所需接口

- 确保 `encryptToEnvelope` 和 `decryptEnvelope` 可被 ping 模块调用（当前已是 public 方法）

### message-send-queue.ts — 支持 systemMessage 发送

- 新增 `sendSystemEncryptedMessage()` 方法：加密并发送，但不添加到消息列表
- 或直接在 channel-ping.ts 中调用 `messageService` 发送特殊消息

### websocket.ts — 拦截 Ping/Pong 消息

- 在 WebSocket 消息处理入口处，解密后检查 plaintext 前缀
- 如果是 `E2EE_PING|`：调用 `handleIncomingPingPlaintext()` → 自动回复 pong
- 如果是 `E2EE_PONG|`：调用 `handleIncomingPongPlaintext()` → 验证
- 两种情况下都 **不** 将消息添加到聊天消息列表

### App.vue — 登出清理

- `resetUserServices()` 中调用 `stopAllPingTimers()`

---

## 验证短语存储

- **Key:** `e2ee:verify_phrase:<sessionId>`
- **存储位置:** localStorage（与 `e2ee:status:<sessionId>` 保持一致）
- **清理时机:**
  - `exitEncryption()` 调用时删除
  - `clearAllSessionState()` 调用时删除
  - `resetUserServices()` 登出时删除（已有 `e2ee:*` 前缀清理逻辑）

---

## 错误处理矩阵

| 场景 | 发起方处理 | 接收方处理 |
|------|-----------|-----------|
| Ping 发送失败（网络错误） | 10 秒后重试 1 次，仍失败 → exitEncryption | 无操作 |
| Ping 解密失败（AES-GCM 不匹配） | 超时 30 秒 → exitEncryption | decryptEnvelope 内已处理 → session 降级 |
| 解析出 phrase 不匹配 | 收到 pong 后比对失败 → exitEncryption | 收到 ping 后比对失败 → exitEncryption |
| 30 秒超时未收到 pong | exitEncryption | 无操作 |
| 接收方不在线 | 超时 → exitEncryption | 下次上线收到 ping 消息 → 正常处理 |
| Ping 定时器触发时用户已登出 | stopAllPingTimers 已清理 | 无操作 |

---

## 不在本次范围

- 用户手动「验证通道」按钮（后续迭代）
- 群聊加密通道 ping（当前仅 1v1 加密）
- Ping 历史记录/日志
- 可视化验证状态指示器（如绿盾图标）
