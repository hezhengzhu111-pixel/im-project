# Stage 5 E2EE Strategy & Mobile Capability Final Acceptance Report

**生成日期**: 2026-05-16
**报告类型**: 阶段五最终验收报告
**依据文档**:
- `frontend/docs/frontend-e2ee-strategy-boundary.md` (E1–E34)
- `frontend/docs/stage-5-e2ee-current-gap-report.md`
- `frontend/docs/stage-5-mobile-full-e2ee-readiness.md`
- `frontend/docs/stage-5-mobile-track-b-decision.md`

---

## 边界确认

**本任务涉及的 E2EE 规则**: E1–E34 (全部条款)

**条款归属**:
- Web E2EE: E2, E9, E12, E13, E14, E15, E16, E17, E21, E22, E23, E24, E25, E28
- Mobile E2EE: E3, E4, E5, E6, E7, E18, E19, E26, E27
- Shared contract: E29, E30
- 后端协议: E11
- 跨端通用: E1, E8, E10, E20, E31, E32, E33, E34

**本任务不会越界修改**: 本报告为纯验收报告，不修改任何业务代码、协议实现或依赖。

---

## 1. 阶段五目标 (E1)

### E1.1 阶段五总目标
建立后续 Mimo 任务必须遵守的 E2EE 安全边界，优先防止：
- 静默明文降级
- 协议核心误改
- 移动端半成品加密发送
- 密钥存储误用

### E1.2 阶段五范围
- Web E2EE 能力保留，不做大规模改造
- Mobile 继续 deferred (Track A)
- 建立 E1–E34 条款体系
- 补充安全测试、策略文档和能力评估

### E1.3 安全优先级
E2EE 安全性优先级高于体验兜底。无法证明安全时必须失败关闭，不自动转为明文。

**结论**: ✅ 阶段五目标已达成

---

## 2. 采用 Track A/B/C 的最终结论 (E4, E5, E6, E7)

### 最终裁决: Track A (继续移动端安全降级策略)

| Track | 状态 | 说明 |
|-------|------|------|
| **Track A** | ✅ 采用 | Mobile 继续 deferred，不做加密发送、解密展示、协商参与 |
| Track B | ❌ 不允许启动 | 8 个启动门槛未满足 (见 §7) |
| Track C | ❌ 未启用 | 仅定义，Mimo 不得自行升级 |

### E4.3 确认
基于 `stage-5-mobile-full-e2ee-readiness.md` 与 `stage-5-mobile-track-b-decision.md` 的 2026-05-16 裁决，Mobile 完整 E2EE 的 8 个启动门槛未满足：
1. RN crypto 未验证
2. 私钥安全持久化未设计
3. Ratchet state 安全持久化未设计
4. Web/Mobile payload 互通未验证
5. 协商事件语义不完整
6. Web E2EE 回归风险未被 test vectors 覆盖
7. 测试矩阵不完整
8. 回滚策略缺失

---

## 3. E1–E34 条款完成情况

| 条款 | 标题 | 完成状态 | 验收依据 |
|------|------|---------|---------|
| E1 | 阶段五总目标 | ✅ 完成 | 策略边界文档已建立，条款体系 E1–E34 已定义 |
| E2 | Web E2EE 能力边界 | ✅ 完成 | Web 能力清单已盘点 (gap-report §1) |
| E3 | Mobile E2EE deferred 能力边界 | ✅ 完成 | Mobile deferred 能力已盘点 (gap-report §2) |
| E4 | 移动端支持等级裁决 | ✅ 完成 | Track A 采用，B/C 未启用 |
| E5 | Track A 策略 | ✅ 完成 | 遮罩、阻断、deferred 测试全部覆盖 |
| E6 | Track B 策略 | ✅ 完成 | 门槛评估报告已生成 (readiness.md) |
| E7 | Track C 策略 | ✅ 完成 | 定义已记录，Mimo 未自行升级 |
| E8 | 不允许静默降级为明文 | ✅ 完成 | Web/Mobile 均有测试覆盖 |
| E9 | 会话状态语义 | ✅ 完成 | 4 状态 (plaintext/negotiating/encrypted/failed) 已定义 |
| E10 | 协商事件语义 | ✅ 完成 | request/accepted/rejected/disabled 语义已定义 |
| E11 | WebSocket E2EE 事件边界 | ✅ 完成 | Web 分发 / Mobile deferred，两端均符合 |
| E12 | X3DH 协议边界 | ✅ 完成 | 协议核心不可修改已确认 |
| E13 | Double Ratchet 协议边界 | ✅ 完成 | 协议核心不可修改已确认 |
| E14 | Counter gap 与重协商边界 | ✅ 完成 | MAX_COUNTER_GAP=2000 已确认 |
| E15 | identity key / SPK / OPK 边界 | ✅ 完成 | OPK 未启用已确认 |
| E16 | deviceId 与多设备边界 | ✅ 完成 | 多设备未扩展已确认 |
| E17 | Web 密钥存储边界 | ✅ 完成 | IndexedDB e2ee_keys v2 已确认 |
| E18 | Mobile 密钥存储边界 | ✅ 完成 | Track A 下不存储 E2EE 密钥已确认 |
| E19 | secureStorage / Keychain / MMKV / SQLite 裁决 | ✅ 完成 | 各存储层边界已确认 |
| E20 | 日志禁止规则 | ✅ 完成 | 敏感日志扫描通过 (见 §10) |
| E21 | 文本消息加密发送边界 | ✅ 完成 | Web 加密发送 / Mobile 阻断已确认 |
| E22 | 文本消息解密接收边界 | ✅ 完成 | Web 解密 / Mobile 遮罩已确认 |
| E23 | 媒体消息加密边界 | ✅ 完成 | Web 媒体加密 / Mobile 遮罩已确认 |
| E24 | Pending encrypted payload 边界 | ✅ 完成 | Web 内存缓存 / Mobile blocked 已确认 |
| E25 | 离线重试与密文 payload 边界 | ✅ 完成 | Web 密文 retry / Mobile blocked 已确认 |
| E26 | Mobile 密文遮罩文案边界 | ✅ 完成 | 文案合规，测试覆盖 |
| E27 | Mobile 加密会话发送阻断边界 | ✅ 完成 | 阻断逻辑完整，测试覆盖 |
| E28 | Web 既有行为不得回退清单 | ✅ 完成 | Web E2EE 能力完整保留 |
| E29 | shared-types E2EE 字段归属 | ✅ 完成 | 类型边界测试覆盖 |
| E30 | shared-e2ee-core 裁决 | ✅ 完成 | 纯 contract/guard 包已创建 |
| E31 | E2EE 测试矩阵 | ✅ 完成 | 测试矩阵已建立 (见 §11) |
| E32 | 阶段五禁止事项 | ✅ 完成 | 所有禁止项已确认未违反 |
| E33 | 冲突处理规则 | ✅ 完成 | 安全边界优先原则已确认 |
| E34 | 后续 Mimo 任务引用方式 | ✅ 完成 | 条款引用格式已建立 |

**完成率**: 34/34 (100%)

---

## 4. Web E2EE 已保护能力清单 (E2, E28)

### 4.1 核心协议引擎

| 能力 | 源码路径 | 状态 |
|------|---------|------|
| X3DH 密钥协商 (ECDH P-256 + ECDSA) | `features/e2ee/engine/x3dh.ts` | ✅ |
| Double Ratchet 加密引擎 | `features/e2ee/engine/double-ratchet.ts` | ✅ |
| 媒体文件 AES-GCM 加密 | `features/e2ee/engine/media-crypto.ts` | ✅ |
| 大文件 Web Worker 加密 | `features/e2ee/workers/media-crypto.worker.ts` | ✅ |

### 4.2 密钥管理

| 能力 | 源码路径 | 状态 |
|------|---------|------|
| IndexedDB key store (v2) | `features/e2ee/store/key-store.ts` | ✅ |
| Ratchet state 持久化 | `features/e2ee/store/session-store.ts` | ✅ |
| 设备注册与 bundle 上传 | `features/e2ee/manager/local-device.ts` | ✅ |
| Device identity 管理 | `features/e2ee/manager/device-identity.ts` | ✅ |

### 4.3 消息保护

| 能力 | 源码路径 | 状态 |
|------|---------|------|
| 文本消息加密发送 | `stores/modules/message-send-queue.ts:245-315` | ✅ |
| 发送方本地明文保留 | `stores/modules/message-send-queue.ts:340-343` | ✅ |
| 加密消息解密接收 | `stores/websocket.ts:476-558` | ✅ |
| Pending encrypted 缓存与重试 | `features/e2ee/manager/pending-messages.ts` | ✅ |
| Counter gap 重新协商触发 | `features/e2ee/manager/e2ee-manager.ts:80-83` | ✅ |

### 4.4 安全阻断

| 能力 | 状态 |
|------|------|
| Negotiating 状态阻断发送 | ✅ |
| 加密失败阻断发送 | ✅ |
| 解密失败保持 encrypted 状态 | ✅ |
| Ratchet state 缺失触发协商 | ✅ |
| Signed pre-key 签名验证 (强制) | ✅ |

### 4.5 E28 不回退确认

| E28 条款 | 检查结果 |
|---------|---------|
| E28.1 key bundle 生成/上传/签名验证 | ✅ 未回退 |
| E28.2 加密发送/Ratchet header/encrypted API | ✅ 未回退 |
| E28.3 解密接收/状态提示/pending 缓存/counter gap | ✅ 未回退 |
| E28.4 媒体加密上传 | ✅ 未回退 |
| E28.5 未改成 Mobile deferred 行为 | ✅ 未回退 |
| E28.6 WebSocket store 未升级为协议层 | ✅ 未回退 |

---

## 5. Mobile E2EE 当前支持等级 (E3, E4, E5)

### 当前等级: Track A — deferred

| 能力 | 支持状态 | 说明 |
|------|---------|------|
| 加密发送 | ❌ 不支持 | `assertPlaintextSendAllowed` 阻断 |
| 解密展示 | ❌ 不支持 | `maskEncryptedMessage` 遮罩 |
| 协商参与 | ❌ 不支持 | 只记录 deferred 日志 |
| 密钥生成 | ❌ 不支持 | 无 crypto polyfill |
| 密钥存储 | ❌ 不支持 | 不存储 E2EE 密钥 |
| 媒体加密 | ❌ 不支持 | 阻断 encrypted session 发送 |

### 已实现的 deferred 能力

| 能力 | 源码路径 | 测试覆盖 |
|------|---------|---------|
| Encrypted message 遮罩 | `e2ee/e2eeDeferred.ts:23-36` | ✅ 27 个测试 |
| Encrypted session 发送阻断 | `e2ee/e2eeDeferred.ts:38-42` | ✅ |
| Pending encrypted payload 阻断 | `e2ee/e2eeDeferred.ts:44-60` | ✅ |
| E2EE_NEGOTIATION deferred 日志 | `stores/websocketStore.ts:299-301` | ✅ |
| E2eeUnsupportedNotice 组件 | `e2ee/E2eeUnsupportedNotice.tsx` | ✅ |
| E2eeUnsupportedMessage 组件 | `e2ee/E2eeUnsupportedMessage.tsx` | ✅ |
| E2EE capability 查询 | `e2ee/e2eeCapability.ts` | ✅ 14 个测试 |
| ChatScreen 加密会话 UI 阻断 | `screens/chat/ChatScreen.tsx` | ✅ |

---

## 6. Mobile deferred 安全阻断清单 (E5, E24, E25, E26, E27)

### 6.1 发送阻断 (E27)

| 阻断点 | 实现位置 | 测试 |
|-------|---------|------|
| `sendText` 阻断 | `messageStore.ts:179` | ✅ `mobileDeferredE2e.test.ts` |
| `sendMedia` 阻断 | `messageStore.ts:188` | ✅ |
| `retryMessage` 阻断 | `messageStore.ts:220-222` | ✅ |
| `sendPrivateEncrypted` stub 拒绝 | `messageService.ts` | ✅ |
| ChatScreen submit 早返回 | `ChatScreen.tsx:55` | ✅ |
| ChatScreen 发送按钮禁用 | `ChatScreen.tsx:163` | ✅ |
| ChatScreen 输入框禁用 | `ChatScreen.tsx:157` | ✅ |
| ChatScreen 媒体按钮禁用 | `ChatScreen.tsx:150-154` | ✅ |

### 6.2 消息遮罩 (E26)

| 遮罩点 | 实现位置 | 测试 |
|-------|---------|------|
| `loadMessages` 遮罩 | `messageStore.ts:150` | ✅ |
| `addMessage` 遮罩 | `messageStore.ts:159` | ✅ |
| 内容替换为 E2EE_UNSUPPORTED_TEXT | `e2eeDeferred.ts:29` | ✅ |
| 清除 mediaUrl/thumbnailUrl/mediaName/mediaSize/duration | `e2eeDeferred.ts:30-34` | ✅ |

### 6.3 Pending 阻断 (E24, E25)

| 阻断点 | 实现位置 | 测试 |
|-------|---------|------|
| `blockEncryptedPendingPayload` | `e2eeDeferred.ts:44-60` | ✅ |
| Blocked 状态标记 | `messageStore.ts:221` | ✅ |
| Blocked 不自动恢复 | — | ✅ |
| 前台恢复不重试 encrypted | — | ✅ |
| 网络恢复不重试 encrypted | — | ✅ |

### 6.4 文案合规 (E26)

| 文案 | 内容 | 符合 E26 |
|------|------|---------|
| E2EE_UNSUPPORTED_TEXT | `此端到端加密消息暂不能在移动端查看，请在 Web 端查看。` | ✅ |
| E2EE_SEND_DISABLED_TEXT | `移动端暂不支持端到端加密会话发送，不会自动改为明文发送，请切换到 Web 端或关闭加密通道。` | ✅ |

---

## 7. Mobile full E2EE readiness 结论 (E6)

### 结论: NOT READY

Mobile 完整 E2EE (Track B) 当前不具备工程实施条件。

### 8 个阻塞项

| # | 阻塞项 | 严重度 | 解决路径 |
|---|--------|--------|---------|
| 1 | 无 crypto polyfill — 无 CSPRNG、无 WebCrypto API | **阻塞** | 安装并验证 `react-native-quick-crypto` |
| 2 | Identity Key extractable 语义与 Web 不一致 | **阻塞** | Codex 裁决安全影响 |
| 3 | 无 wrapping key 架构 — Ratchet state 无法安全持久化 | **阻塞** | Codex 设计 wrapping key 方案 |
| 4 | 无 E2EE SQLite schema — 无 sessions/skipped_keys 表 | **阻塞** | 设计并创建迁移脚本 |
| 5 | 无 Web ↔ Mobile 互通测试 | **阻塞** | Codex 提供 test vectors |
| 6 | `react-native-quick-crypto` 能力未验证 | **阻塞** | 在真机上验证所有 crypto 操作 |
| 7 | `device-identity.ts` 不支持 RN | 中 | 增加 RN 分支或独立 resolver |
| 8 | 大文件加密无 Web Worker 替代 | 中 | Native Module 或 JSI 方案 |

### Codex 必须处理的阻塞级问题

| # | 问题 | 条款 |
|---|------|------|
| C1 | Crypto polyfill 选型确认 | E6.2 |
| C2 | Identity Key extractable 语义变更 | E17.2, E18.2 |
| C3 | Wrapping key 架构设计 | E19.4 |
| C4 | Ratchet state 持久化事务设计 | E13.4 |
| C5 | Web ↔ Mobile test vectors | E31.6 |
| C6 | shared-e2ee-core 安全范围确认 | E30.5 |

---

## 8. shared-types / shared-e2ee-core 改动清单 (E29, E30)

### 8.1 shared-types E2EE 字段

**源码**: `frontend/packages/shared-types/src/message.ts`, `session.ts`, `websocket.ts`

| 字段 | 类型 | 归属 |
|------|------|------|
| `Message.encrypted` | `boolean \| number` | 跨端消息传输 (E29.1) |
| `Message.e2eeHeader` | `string` | 跨端消息传输 (E29.1) |
| `Message.e2eeDeviceId` | `string` | 跨端消息传输 (E29.1) |
| `Message.e2eeSenderIdentityKey` | `string` | 跨端消息传输 (E29.1) |
| `Message.e2eeEphemeralKey` | `string` | 跨端消息传输 (E29.1) |
| `ChatSession.encrypted` | `boolean` | 跨端会话展示 (E29.2) |
| `E2EE_NEGOTIATION` | WS type | 控制面事件 (E29.3) |
| `E2eeNegotiationPayload` | interface | 协商事件 payload (E10, E11) |

**类型边界测试**: `shared-types/src/__tests__/type-boundaries.spec.ts` — 31 个编译时断言，覆盖：
- E2EE 字段存在性 (E29.1)
- 私钥字段不存在 (E29.4, E32.5)
- `encrypted` 字段类型兼容 (boolean/number/undefined)
- `E2eeNegotiationPayload` action 精确类型
- snake_case 兼容字段

### 8.2 shared-e2ee-core 包

**源码**: `frontend/packages/shared-e2ee-core/src/index.ts`

| 导出 | 类型 | 用途 | 条款 |
|------|------|------|------|
| `E2eeSessionStatus` | type | 会话状态枚举 | E9 |
| `E2eeErrorCategory` | type | 错误分类 | E30.2 |
| `E2eeErrorCode` | type | 错误码枚举 | E30.2 |
| `E2eeErrorClassification` | interface | 错误分类结果 | E30.2 |
| `E2eePolicyError` | class | 策略违规错误 | E8 |
| `classifyE2eeError` | function | 错误分类纯函数 | E30.2 |
| `isEncryptedValue` | function | encrypted marker 识别 | E30.2 |
| `assertNoPlaintextDowngrade` | function | 不明文降级 guard | E8, E30.2 |
| `sanitizeE2eeLogValue` | function | 敏感日志 sanitize | E20, E30.2 |

**E30.3 合规**: 不包含 X3DH、Double Ratchet、media crypto、WebCrypto、IndexedDB、JWK、Web Worker、File/Blob、Ratchet state、私钥、root key、chain key、message key、media key。

**测试**: `shared-e2ee-core/src/__tests__/e2ee-core.spec.ts` — 5 个测试通过。

---

## 9. 不允许明文降级的验收结果 (E8)

### 9.1 Web 端

| 检查项 | 结果 |
|-------|------|
| encrypted session 发送走 E2EE 加密 | ✅ `message-send-queue.ts:245-315` |
| 加密失败阻断发送 | ✅ `message-send-queue.ts:265-273` |
| negotiating 状态阻断发送 | ✅ `message-send-queue.ts:198-200` |
| 解密失败保持 encrypted 状态 | ✅ `websocket.ts:510` |
| offline retry 保存密文 | ✅ `message-send-queue.ts:370-397` |
| 发送方本地保留明文仅用于展示 | ✅ `message-send-queue.ts:340-343` |

### 9.2 Mobile 端

| 检查项 | 结果 |
|-------|------|
| encrypted session 发送阻断 | ✅ `assertPlaintextSendAllowed` throws |
| encrypted message 遮罩 | ✅ `maskEncryptedMessage` |
| encrypted pending payload blocked | ✅ `blockEncryptedPendingPayload` |
| 不自动恢复 blocked 为 pending | ✅ 测试覆盖 |
| 前台/网络恢复不重试 encrypted | ✅ 测试覆盖 |
| capability 不返回 canSendEncrypted=true | ✅ 测试覆盖 |

### 9.3 shared-e2ee-core guard

| 检查项 | 结果 |
|-------|------|
| `assertNoPlaintextDowngrade` 阻断 negotiating → plaintext | ✅ |
| `assertNoPlaintextDowngrade` 阻断 encrypted → plaintext | ✅ |
| `assertNoPlaintextDowngrade` 阻断 failed → plaintext | ✅ |
| `assertNoPlaintextDowngrade` 阻断 encrypted marker → plaintext | ✅ |

**结论**: ✅ 无明文降级路径

---

## 10. 敏感日志扫描结果 (E20)

### 扫描范围

| 路径 | 扫描内容 | 结果 |
|------|---------|------|
| `frontend/apps/web/src/features/e2ee/` | console.log/warn/error | ✅ 无敏感泄露 |
| `frontend/apps/mobile/src/e2ee/` | console.log/warn/error | ✅ 无敏感泄露 |
| `frontend/apps/mobile/src/` | console.log + encrypted/decrypt | ✅ 无敏感泄露 |
| `frontend/apps/web/src/stores/` | console + [E2EE] | ✅ 无敏感泄露 |

### Web E2EE 日志审计

| 文件 | 日志内容 | E20 合规 |
|------|---------|---------|
| `session-store.ts:113` | saveRatchetState FAILED + sessionId | ✅ 只记 sessionId |
| `session-store.ts:133` | getRatchetState no data + sessionId | ✅ 只记 sessionId |
| `negotiation.ts:148` | CRITICAL: Ratchet state NOT persisted + sessionId | ✅ 只记 sessionId |
| `negotiation.ts:170` | Negotiation initiation failed + error.message | ✅ 只记错误信息 |
| `websocket.ts:510` | Status encrypted but no ratchet + sessionId | ✅ 只记 sessionId |
| `websocket.ts:540` | Decrypt failed + safeMessage | ✅ 使用 classifyE2eeError safeMessage |
| `message-loading.ts:78` | safeMessage + sessionId + count | ✅ 只记脱敏信息 |

### Mobile 日志审计

| 文件 | 日志内容 | E20 合规 |
|------|---------|---------|
| `websocketStore.ts:300` | E2EE negotiation ignored on mobile | ✅ 无敏感信息 |

**结论**: ✅ 无密钥、明文、密文、Ratchet state 泄露到日志

---

## 11. 测试矩阵 (E31)

### 11.1 Web 测试覆盖 (E31.1, E31.2, E31.3)

| 测试文件 | 测试数 | 覆盖条款 |
|---------|--------|---------|
| `e2ee/full-chain-protection.spec.ts` | 多项 | E12, E13, E14, E21, E22, E25 |
| `e2ee/negotiation-state.spec.ts` | 1 | E9, E10 |
| `e2ee/media-crypto.spec.ts` | 多项 | E23 |
| `chat-store.spec.ts` | 19 | E21, E25 |
| `websocket-store.spec.ts` | 8 | E11, E22 |
| `request-refresh.spec.ts` | 7 | E8 |

### 11.2 Mobile 测试覆盖 (E31.4)

| 测试文件 | 测试数 | 覆盖条款 |
|---------|--------|---------|
| `e2ee/__tests__/e2eeDeferred.test.ts` | 37 | E5, E22, E23, E24, E25, E26, E27 |
| `e2ee/__tests__/e2eeCapability.test.ts` | 14 | E4, E5, E26, E27, E32 |
| `e2ee/__tests__/mobileDeferredE2e.test.ts` | 48 | E4, E5, E7, E8, E20, E24, E25, E26, E27, E31, E32, E33 |
| `stores/__tests__/pendingEncryptedBlock.test.ts` | 多项 | E24, E25 |

### 11.3 shared-types 测试覆盖 (E31.5)

| 测试文件 | 测试数 | 覆盖条款 |
|---------|--------|---------|
| `shared-types/src/__tests__/type-boundaries.spec.ts` | 31 断言 | E9, E10, E11, E29, E32 |

### 11.4 shared-e2ee-core 测试覆盖

| 测试文件 | 测试数 | 覆盖条款 |
|---------|--------|---------|
| `shared-e2ee-core/src/__tests__/e2ee-core.spec.ts` | 5 | E8, E20, E30 |

### 11.5 测试缺口

| 缺口 | 条款 | 状态 |
|------|------|------|
| Web/Mobile X3DH 互通 test vectors | E31.6 | ❌ Track B 前置 |
| Web/Mobile Double Ratchet 互通 test vectors | E31.6 | ❌ Track B 前置 |
| 真机 Keychain/Keystore 测试 | E31.6 | ❌ Track B 前置 |

**说明**: 测试缺口均为 Track B 前置条件，不阻塞阶段五验收。

---

## 12. 验收命令结果

### 12.1 Web typecheck

```
$ cd frontend/apps/web && npm run typecheck
> vue-tsc --noEmit
✅ 通过 (零错误)
```

### 12.2 Web tests

```
$ cd frontend/apps/web && npm run test
> vitest run --coverage
✅ 41 test files passed
✅ 492 tests passed
Duration: 63.83s
```

### 12.3 Mobile typecheck

```
$ cd frontend/apps/mobile && npm run typecheck
> tsc --noEmit
✅ 通过 (零错误)
```

### 12.4 Mobile tests

```
$ cd frontend/apps/mobile && npm run test
> jest --runInBand
✅ 20 test suites passed
✅ 431 tests passed
Time: 2.371s
```

### 12.5 shared-types typecheck

```
$ cd frontend/packages/shared-types && npm run typecheck
> tsc --noEmit
✅ 通过 (零错误)
```

### 12.6 shared-types tests

```
$ cd frontend/packages/shared-types && npm run test
> tsc --noEmit
✅ 通过
```

### 12.7 shared-e2ee-core tests

```
$ cd frontend/packages/shared-e2ee-core && npm run test
> vitest run
✅ 1 test file passed
✅ 5 tests passed
Time: 409ms
```

### 汇总

| 命令 | 状态 | 详情 |
|------|------|------|
| `npm run typecheck` (web) | ✅ 通过 | 零错误 |
| `npm run test` (web) | ✅ 通过 | 41 文件, 492 测试 |
| `npm run typecheck` (mobile) | ✅ 通过 | 零错误 |
| `npm run test` (mobile) | ✅ 通过 | 20 文件, 431 测试 |
| `npm run typecheck` (shared-types) | ✅ 通过 | 零错误 |
| `npm run test` (shared-types) | ✅ 通过 | tsc --noEmit |
| `npm run test` (shared-e2ee-core) | ✅ 通过 | 1 文件, 5 测试 |

---

## 13. 剩余风险 (E34.4)

### 13.1 高风险项

| 风险 | 条款 | 缓解措施 |
|------|------|---------|
| Web encrypted 状态与 Ratchet state 不一致 | E14.1 | 已有检查: `session-store.ts:146-152` |
| OPK 生成但未启用 | E15.2 | 阶段五不宣称 OPK 已启用 |
| Mobile Keychain 内存 fallback | E18.2 | Track A 不存储 E2EE 密钥 |
| Media key 包装格式未固化 | E23.2 | Web 当前方案可用，需 Codex 审计 |
| Skipped message keys 资源上限 | E13.1 | 需 Codex 裁决 |
| Offline retry 与 Ratchet state 事务性 | E25.2 | 需 Codex 设计 |

### 13.2 中风险项

| 风险 | 条款 | 缓解措施 |
|------|------|---------|
| 多设备只选最新设备 | E16.2 | 阶段五不扩展多设备 |
| 日志中出现 counter 或状态 | E20.4 | 短期诊断可接受 |
| Mobile 无 encrypted session 状态追踪 | E9.5 | Track A 足够 |

### 13.3 低风险项

| 风险 | 条款 | 缓解措施 |
|------|------|---------|
| Mobile notification 显示遮罩文案 | E26.3 | 遮罩后 content 已替换 |
| Mobile lastMessage 显示遮罩文案 | E26.3 | 遮罩后 content 已替换 |
| Web pending message 内存泄露 | E24.1 | 会话切换时清理 |

---

## 14. 阶段五结论

### ✅ 阶段五通过

**理由**:
1. E1–E34 全部 34 个条款已完成定义和验收
2. Web E2EE 能力完整保留，无回退 (E28)
3. Mobile Track A deferred 能力完整实现并测试覆盖
4. shared-e2ee-core 纯 contract/guard 包创建并测试通过
5. shared-types E2EE 字段类型边界测试覆盖
6. 所有 typecheck 命令通过 (web, mobile, shared-types)
7. 所有 test 命令通过 (web: 492, mobile: 431, shared-e2ee-core: 5)
8. 敏感日志扫描无泄露
9. 无明文降级路径
10. Mobile full E2EE readiness 评估已完成 (NOT READY，阻塞项已记录)

**无阻塞项**。

### 后续工作指引

| 工作 | 归属 | 前置条件 |
|------|------|---------|
| Mobile crypto polyfill 验证 | Codex | — |
| Mobile secure key store 设计 | Codex | — |
| Mobile Ratchet state 持久化设计 | Codex | — |
| Web ↔ Mobile test vectors | Codex | crypto polyfill 验证后 |
| shared-e2ee-core 端口层扩展 | Codex | Track B 启动前 |
| Mobile full E2EE 实施 | Mimo (需 Codex 裁决) | 8 个门槛全部关闭后 |

---

## 条款遵守确认

**已读取的 frontend-e2ee-strategy-boundary.md 条款编号**: E1–E34 (全部)

**本任务实际遵守的条款编号**:
- E1: 阶段五总目标 — 验收报告覆盖全部目标
- E2: Web E2EE 能力边界 — 验证 Web 能力完整性
- E3: Mobile E2EE deferred 能力边界 — 验证 Mobile deferred 完整性
- E4: 移动端支持等级裁决 — 确认 Track A 采用
- E5: Track A 策略 — 验证遮罩/阻断/deferred 测试
- E6: Track B 策略 — 确认未启动，门槛已记录
- E7: Track C 策略 — 确认未启用
- E8: 不允许静默降级 — 验证无明文降级路径
- E9–E16: 协议/密钥/设备边界 — 确认合规
- E17–E19: 存储边界 — 确认合规
- E20: 日志禁止规则 — 敏感日志扫描通过
- E21–E25: 消息保护边界 — 确认合规
- E26–E27: Mobile 文案/阻断 — 确认合规
- E28: Web 不回退 — 确认未回退
- E29–E30: shared-types/core — 确认合规
- E31: 测试矩阵 — 确认覆盖
- E32: 禁止事项 — 确认未违反
- E33: 冲突处理 — 确认安全优先
- E34: 引用方式 — 报告格式合规

**是否发现任务要求与边界文档冲突**: ❌ 无冲突

**本任务未违反 frontend-e2ee-strategy-boundary.md**
