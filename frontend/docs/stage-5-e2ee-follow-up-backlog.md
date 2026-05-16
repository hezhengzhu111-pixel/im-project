# Stage 5 E2EE Follow-up Backlog

**生成日期**: 2026-05-16
**依据文档**:
- `frontend-e2ee-strategy-boundary.md` (E1–E34)
- `stage-5-e2ee-strategy-and-mobile-capability-report.md`
- `stage-5-mobile-full-e2ee-readiness.md`
- `stage-5-e2ee-current-gap-report.md`
- `stage-5-mobile-track-b-decision.md`

**引用条款**: E4, E5, E6, E7, E18, E19, E30, E31, E32, E33

---

## 1. 必须立即修复的安全阻塞项

### 1.1 E2E-SEC-001: Web Ratchet state 与 localStorage session status 一致性检查

**背景**: 高风险项 — `localStorage` 中 `sessionStatus` 可能标记为 `encrypted`，但 IndexedDB 中对应的 Ratchet state 已丢失（用户清缓存、浏览器数据回收）。现有检查在 `session-store.ts:146-152`，但只在 `getRatchetState` 时触发。若发送路径未先调用 `getRatchetState`，可能导致以 `encrypted` 状态尝试发送但无可用密钥。

**改动范围**: `features/e2ee/store/session-store.ts`, `features/e2ee/manager/e2ee-manager.ts`

**禁止改动范围**: 不得修改 `double-ratchet.ts` 的加密逻辑；不得删除现有检查；不得把 `encrypted` 自动重置为 `plaintext` 后继续发送（E8.3）

**验收标准**:
- 发送前强制检查 Ratchet state 存在性，不存在时阻断发送并标记 `failed`
- 不存在"encrypted 状态 + 无 Ratchet state + 静默明文发送"路径
- 测试覆盖：localStorage=encrypted + IndexedDB 无 state → 发送阻断

**负责人**: Codex
**优先级**: P0
**条款**: E8.1, E8.2, E8.3, E13.4, E14.1

---

### 1.2 E2E-SEC-002: Web skipped message keys 资源上限

**背景**: `double-ratchet.ts` 的 `skippedMessageKeys` 是 `Map<string, CryptoKey>`，无明确容量上限。恶意对端可通过大量跳过消息（counter gap）堆积 skipped keys，导致内存膨胀。

**改动范围**: `features/e2ee/engine/double-ratchet.ts`, `features/e2ee/store/session-store.ts`

**禁止改动范围**: 不得删除 counter gap 检查（E14.2）；不得把 skipped keys 资源耗尽后降级为明文（E8.1）；不得修改 KDF info 或 chain split（E13.3）

**验收标准**:
- 设定 `MAX_SKIPPED_KEYS` 常量（值由 Codex 裁决）
- 超出上限时触发重新协商并阻断当前解密（E14.1）
- 测试覆盖：超出上限 → 触发重协商 + 当前消息解密失败

**负责人**: Codex
**优先级**: P0
**条款**: E13.1, E13.3, E14.1, E14.2, E8.2

---

### 1.3 E2E-SEC-003: Web offline retry 与 Ratchet state 事务性

**背景**: 加密消息发送时，Ratchet state 在加密后被推进（`double-ratchet.ts` encrypt 路径），但网络失败后 pending payload 保存的是已加密的密文。若用户重试，Ratchet state 已推进，不能用同一 counter 重新加密。当前无 rollback 机制。

**改动范围**: `stores/modules/message-send-queue.ts`, `features/e2ee/manager/e2ee-manager.ts`

**禁止改动范围**: 不得在 rollback 时把密文 payload 转为明文重试（E25.1）；不得修改 Double Ratchet counter 推进语义（E13.3）

**验收标准**:
- 加密成功 + 网络失败 → pending 保存密文 + 已推进的 Ratchet state，重试时使用已保存密文
- 不出现"同一明文用不同 counter 加密生成多份 payload"的情况（E25.2）
- 测试覆盖：加密成功 → 网络失败 → 重试 → 使用已保存密文，不重新加密

**负责人**: Codex
**优先级**: P0
**条款**: E25.1, E25.2, E13.4, E8.1

---

### 1.4 E2E-SEC-004: Mobile secureStorage 内存 fallback 不得承载 E2EE 密钥的防护加固

**背景**: `secureStorage.ts` 的 Keychain 失败时回退到 `memorySecure` Map。当前 Track A 不存储 E2EE 密钥（E18.1），但若未来误用，内存 fallback 会承载长期密钥。需在代码层面加固防护。

**改动范围**: `apps/mobile/src/services/storage/secureStorage.ts`

**禁止改动范围**: 不得删除现有 auth 用途的 memory fallback（E18.2 允许 auth 降级）；不得添加 E2EE 密钥存储（E18.1）

**验收标准**:
- `secureStorage` 新增 `setE2eeKey` / `getE2eeKey` 方法（或等价 guard），这些方法在 Keychain 失败时**抛出错误**而非回退内存
- 或：添加代码注释 + 类型约束，明确禁止 E2EE 密钥使用 `setGenericPassword` 路径
- 测试覆盖：Keychain 不可用时 → E2EE 密钥操作抛出错误

**负责人**: Mimo
**优先级**: P0
**条款**: E18.1, E18.2, E19.1, E32.3

---

## 2. Track A deferred 后续体验优化

### 2.1 E2E-UX-001: Mobile negotiating 状态发送阻断

**背景**: Mobile `assertPlaintextSendAllowed` 当前只检查 `session.encrypted === true`（`messageStore.ts:179`）。若 Web 发起协商、Mobile 会话状态为 `negotiating`（通过服务端同步），Mobile 不会阻断发送，可能误发明文。

**改动范围**: `apps/mobile/src/e2ee/e2eeDeferred.ts`, `apps/mobile/src/stores/messageStore.ts`

**禁止改动范围**: 不得让 Mobile 参与协商（E5.3）；不得创建 Ratchet state（E32.3）

**验收标准**:
- `assertPlaintextSendAllowed` 同时检查 `session.encrypted === true` 和 `session.status === 'negotiating'`
- negotiating 状态下发送阻断文案：`端到端加密协商进行中，请稍后再试或切换 Web 端。`
- 测试覆盖：session.encrypted=false + session.status=negotiating → 阻断

**负责人**: Mimo
**优先级**: P1
**条款**: E5.2, E5.4, E27.1, E27.4, E9.2

---

### 2.2 E2E-UX-002: Mobile encrypted message 搜索结果遮罩

**背景**: `searchMessages` 在搜索消息时可能匹配到 encrypted message 的原始密文 content。遮罩在 `loadMessages` 和 `addMessage` 路径已覆盖，但搜索路径需确认。

**改动范围**: `apps/mobile/src/stores/messageStore.ts` (searchMessages)

**禁止改动范围**: 不得解密搜索结果（E22.4, E32.3）

**验收标准**:
- 搜索结果中 encrypted message 的 content 显示 E2EE_UNSUPPORTED_TEXT
- 搜索结果中 encrypted message 的媒体字段已清除
- 测试覆盖：搜索命中 encrypted message → content 为遮罩文案

**负责人**: Mimo
**优先级**: P1
**条款**: E22.4, E26.1, E26.3, E5.1

---

### 2.3 E2E-UX-003: Mobile notification 加密消息遮罩确认

**背景**: `displayMessageNotification` 可能直接使用 message.content。若消息已遮罩则无问题，但需确认从 WS 实时到达的 encrypted message 在通知路径上是否先经过 `addMessage` → `maskEncryptedMessage`。

**改动范围**: 确认路径即可，若有缺口则修改 `apps/mobile/src/stores/messageStore.ts` 或 notification 逻辑

**禁止改动范围**: 不得在推送 payload 中包含明文或密文（E8.1）；不得解密消息（E32.3）

**验收标准**:
- 确认：WS 到达 encrypted message → addMessage → maskEncryptedMessage → notification 使用遮罩后 content
- 若路径有缺口：通知中 encrypted message 显示 E2EE_UNSUPPORTED_TEXT
- 测试覆盖：encrypted message 到达 → 通知 content = E2EE_UNSUPPORTED_TEXT

**负责人**: Mimo
**优先级**: P1
**条款**: E26.1, E26.3, E5.1, E8.1

---

### 2.4 E2E-UX-004: Mobile encrypted session 状态提示 UI 增强

**背景**: 当前 `E2eeUnsupportedNotice` 组件在 ChatScreen 顶部显示。但会话列表中 encrypted session 缺少视觉标记（如锁图标），用户进入会话前无法预知该会话已加密。

**改动范围**: `apps/mobile/src/screens/chat/` 或会话列表组件

**禁止改动范围**: 不得添加"关闭加密"按钮（E7.2, E32.3）；不得暗示 Mobile 已解密（E26.4）

**验收标准**:
- 会话列表中 `session.encrypted === true` 的会话显示加密标记（如锁图标 + "端到端加密"标签）
- 点击进入后显示 E2eeUnsupportedNotice
- 不出现"已解密"或"解密中"文案（E26.4）

**负责人**: Mimo
**优先级**: P2
**条款**: E5.1, E26.1, E26.4, E7.1, E9.5

---

### 2.5 E2E-UX-005: Mobile encrypted pending payload blocked 状态 UI

**背景**: encrypted payload 被 block 后，消息状态为 `blocked`，但用户可能不清楚原因。需在消息气泡中显示 blocked 原因提示。

**改动范围**: Mobile 消息气泡组件

**禁止改动范围**: 不得自动恢复 blocked 为 pending（E25.3）；不得把 encrypted payload 转为 plaintext 重试（E24.4）

**验收标准**:
- blocked 状态消息显示提示：`此消息为端到端加密消息，移动端暂不支持发送，请切换 Web 端。`
- 不显示"重试"按钮
- 测试覆盖：blocked 状态消息 → 显示阻断提示

**负责人**: Mimo
**优先级**: P2
**条款**: E24.3, E25.3, E27.3, E26.2

---

### 2.6 E2E-UX-006: Web pending encrypted message 内存清理

**背景**: `pending-messages.ts` 使用内存 Map 缓存 incoming encrypted messages 等待协商后重试解密。当前无自动清理机制，会话切换或长时间未协商可能导致内存积累。

**改动范围**: `features/e2ee/manager/pending-messages.ts`

**禁止改动范围**: 不得把 pending encrypted 消息持久化到明文存储（E24.1）；不得在清理时把 encrypted message 展示为明文（E22.3）

**验收标准**:
- 会话切换时清理该会话的 pending encrypted 缓存
- 设定 pending 消息 TTL（如 10 分钟），超时自动清理
- 清理后若收到该消息的解密请求，重新从服务端获取
- 测试覆盖：会话切换 → pending 缓存清理；超时 → 自动清理

**负责人**: Mimo
**优先级**: P2
**条款**: E24.1, E22.3

---

## 3. Track B full mobile E2EE 前置依赖

### 3.1 E2E-TB-001: RN crypto polyfill 能力验证

**背景**: Mobile 无任何 WebCrypto polyfill。`react-native-quick-crypto` 是首选方案，但其 `crypto.subtle` 子集是否完整覆盖 ECDH P-256、ECDSA P-256、HKDF、AES-GCM (with AAD)、importKey/exportKey (raw, jwk, HKDF) 尚未验证（E6.2）。

**改动范围**: 验证报告 + 测试代码（不入业务代码）

**禁止改动范围**: 不得在验证完成前将 `react-native-quick-crypto` 加入 `package.json`（E6.6）；不得修改 Web E2EE engine（E6.7, E32.1）

**验收标准**:
- 真机（iOS + Android）运行完整 crypto 操作测试矩阵
- 测试项：ECDH P-256 generateKey, ECDH deriveBits, ECDSA P-256 generateKey, ECDSA sign/verify, HKDF deriveKey/deriveBits, AES-GCM encrypt/decrypt with AAD, importKey/exportKey (raw, jwk, HKDF), crypto.getRandomValues
- 输出能力验证报告，含通过/未通过/边界情况

**负责人**: Codex
**优先级**: P0
**条款**: E6.2, E6.6, E31.6

---

### 3.2 E2E-TB-002: Identity Key extractable 语义变更安全审计

**背景**: Web 使用 `extractable: false` + IndexedDB structured clone 存储 Identity Key（E17.2）。Mobile 需要 `extractable: true` + JWK 导出后 wrapping key 加密存 SQLite（E18.2）。这改变了安全语义。

**改动范围**: 安全审计报告（不改代码）

**禁止改动范围**: 不得自行决定 extractable 语义变更（E32.1, E33.3）

**验收标准**:
- 评估 `extractable: true` 的安全影响（私钥可被 JS 读取）
- 确认补偿措施（wrapping key 加密后立即清除内存中的 JWK）
- 输出裁决：是否可接受，附加什么条件

**负责人**: Codex
**优先级**: P0
**条款**: E17.2, E18.2, E19.4, E33.3

---

### 3.3 E2E-TB-003: Wrapping key 架构设计

**背景**: Ratchet state、Identity Key、skipped message keys 需要加密后存入 SQLite。加密密钥（wrapping key）必须由 Keychain/Keystore 保护（E19.3, E19.4）。当前无 wrapping key 生成、存储、轮换、删除策略。

**改动范围**: 架构设计文档 + SQLite schema 设计

**禁止改动范围**: 不得在设计未批准前编写实现代码（E6.6）；不得使用 memory fallback 承载 wrapping key（E18.2）

**验收标准**:
- 设计文档：wrapping key 生成（首次启动）、Keychain 存储（Base64 编码 32 字节）、轮换策略、删除策略（logout/uninstall）
- SQLite schema：`e2ee_devices`, `e2ee_sessions`, `e2ee_skipped_keys`, `e2ee_prekeys` 表
- 确认 `react-native-keychain` 的 `setGenericPassword` 是否支持 Base64 编码的 32 字节 key

**负责人**: Codex
**优先级**: P0
**条款**: E19.1, E19.3, E19.4, E18.2, E6.3

---

### 3.4 E2E-TB-004: Ratchet state 持久化事务设计

**背景**: 加密/解密后需持久化 Ratchet state（E13.4）。若持久化失败但消息已发送，Ratchet state 与对端不同步。需设计事务性保证和回滚策略。

**改动范围**: 设计文档（不改代码）

**禁止改动范围**: 不得修改 Double Ratchet counter 推进语义（E13.3）；不得在持久化失败时继续发送（E13.4）

**验收标准**:
- 设计方案：encrypt → persist → send 三步的事务性保证
- 回滚策略：persist 失败时 Ratchet state 如何恢复
- 明确：persist 失败 → 阻断发送 + 标记 failed（不自动重试）

**负责人**: Codex
**优先级**: P0
**条款**: E13.4, E13.5, E25.2

---

### 3.5 E2E-TB-005: Web ↔ Mobile X3DH / Double Ratchet 互通 test vectors

**背景**: E31.6 要求 Track B 启动前必须有 Web/Mobile 互通 test vectors。当前无此测试集。

**改动范围**: test vector 文件 + 测试代码

**禁止改动范围**: 不得修改 Web X3DH/Double Ratchet 实现（E12.3, E13.3, E32.1）

**验收标准**:
- Test vector 集合覆盖：X3DH root key equality, Double Ratchet encrypt/decrypt interop, header/counter compatibility, skipped message keys, counter gap
- Web 端使用 test vectors 验证现有实现不变
- Mobile 端使用 test vectors 验证 polyfill 输出与 Web 一致

**负责人**: Codex
**优先级**: P0
**条款**: E31.6, E12.1, E13.1

---

### 3.6 E2E-TB-006: 真机 Keychain/Keystore 行为测试

**背景**: `react-native-keychain` 在真机上的行为（锁定策略、数据持久化、卸载重装、设备迁移）与模拟器不同。E31.6 要求真机测试。

**改动范围**: 测试方案 + 真机测试脚本

**禁止改动范围**: 不得在测试未通过前实现 E2EE 密钥存储（E6.6）

**验收标准**:
- 测试矩阵：Keychain 写入/读取/删除、设备重启后数据保留、卸载重装后数据清除、锁屏后可访问（WHEN_UNLOCKED_THIS_DEVICE_ONLY）
- iOS + Android 各至少 1 款真机验证
- 输出测试报告

**负责人**: Codex
**优先级**: P1
**条款**: E31.6, E19.1, E6.5

---

### 3.7 E2E-TB-007: shared-e2ee-core 端口层扩展设计

**背景**: E30.5 要求未来迁入可运行加密核心前必须设计端口层（crypto port, secure key store port, session store port, random port, codec port, media port）。当前 `shared-e2ee-core` 只有纯 contract/guard。

**改动范围**: 端口接口设计文档 + `shared-e2ee-core` 类型定义

**禁止改动范围**: 不得在端口层中放入任何加密实现（E30.3）；不得迁移 Web E2EE engine 到 shared（E6.7, E32.2）

**验收标准**:
- 端口接口定义：`CryptoPort`, `SecureKeyStorePort`, `SessionStorePort`, `RandomPort`, `CodecPort`, `MediaPort`
- 接口只定义契约，不含实现
- Web 和 Mobile 可各自实现端口接口

**负责人**: Codex
**优先级**: P1
**条款**: E30.5, E30.3, E6.7, E32.2

---

## 4. shared-e2ee-core 后续抽取任务

### 4.1 E2E-SC-001: Web 和 Mobile 共用 `assertNoPlaintextDowngrade` guard

**背景**: Web `message-send-queue.ts` 和 Mobile `e2eeDeferred.ts` 各自实现了不明文降级检查。`shared-e2ee-core` 已有 `assertNoPlaintextDowngrade` 纯函数（E30.2），但两端尚未统一调用。

**改动范围**: `apps/web/src/stores/modules/message-send-queue.ts`, `apps/mobile/src/e2ee/e2eeDeferred.ts`

**禁止改动范围**: 不得修改 `assertNoPlaintextDowngrade` 的安全语义（E8.1）；不得把加密逻辑放入 shared-e2ee-core（E30.3）

**验收标准**:
- Web 和 Mobile 发送路径统一调用 `@im/shared-e2ee-core` 的 `assertNoPlaintextDowngrade`
- 现有行为不变（Web encrypted 发送、Mobile 阻断）
- 测试覆盖：两端 guard 行为一致

**负责人**: Mimo
**优先级**: P2
**条款**: E30.2, E8.1, E8.2, E34.2

---

### 4.2 E2E-SC-002: Web 和 Mobile 共用 `sanitizeE2eeLogValue` 日志脱敏

**背景**: `shared-e2ee-core` 已有 `sanitizeE2eeLogValue` 纯函数。Web 和 Mobile 的 E2EE 日志可统一使用该函数脱敏，避免重复实现。

**改动范围**: Web/Mobile E2EE 相关日志调用点

**禁止改动范围**: 不得在脱敏函数中添加可逆编码（E20.1）；不得扩大日志记录范围（E20.2）

**验收标准**:
- Web E2EE 日志统一使用 `sanitizeE2eeLogValue`
- Mobile E2EE 日志统一使用 `sanitizeE2eeLogValue`
- 现有日志内容不变，只替换脱敏函数

**负责人**: Mimo
**优先级**: P2
**条款**: E20.1, E20.2, E30.2, E34.2

---

### 4.3 E2E-SC-003: `isEncryptedValue` 统一 encrypted marker 识别

**背景**: Web 和 Mobile 各自判断 `encrypted === true || encrypted === 1`。`shared-e2ee-core` 已有 `isEncryptedValue` 纯函数，可统一识别逻辑。

**改动范围**: Web/Mobile encrypted marker 判断点

**禁止改动范围**: 不得修改 `isEncryptedValue` 的判定逻辑（E29.1, E30.2）

**验收标准**:
- Web 和 Mobile 统一使用 `isEncryptedValue` 判断 encrypted marker
- 覆盖 `true`, `1`, `false`, `0`, `undefined` 所有情况
- 测试覆盖：共享函数的边界值测试

**负责人**: Mimo
**优先级**: P2
**条款**: E29.1, E30.2, E34.2

---

## 5. 后端协议缺口

### 5.1 E2E-BE-001: Mobile device bundle 注册 API 确认

**背景**: 后端已有 `keyService.uploadBundle` API，理论上 Mobile 可复用。但需确认：Mobile 上传的 bundle 格式是否与 Web 完全兼容（E6.8），deviceId 格式是否有差异。

**改动范围**: 后端 API 文档确认（不改后端代码）

**禁止改动范围**: 不得由 Mimo 修改后端 API（E34.3）

**验收标准**:
- 确认 `uploadBundle` API 接受 Mobile 格式的 bundle
- 确认 deviceId 格式兼容
- 若有不兼容，输出差异清单

**负责人**: Codex
**优先级**: P1
**条款**: E6.8, E16.1

---

### 5.2 E2E-BE-002: OPK 生命周期语义确认

**背景**: Web 当前生成 OPK 但上传空数组（`oneTimePreKeys: []`）。E15.2 要求不得宣称 OPK 已启用。E15.3 要求 OPK 上传、领取、补充、重放防御和服务端接口语义变更必须由 Codex 裁决。

**改动范围**: OPK 生命周期设计文档

**禁止改动范围**: 不得由 Mimo 修改 OPK 相关代码（E15.3, E32.1）

**验收标准**:
- 设计文档：OPK 生成数量、上传时机、服务端存储、领取语义、消耗确认、补充触发、重放防御
- 确认后端 API 是否支持 OPK 字段

**负责人**: Codex
**优先级**: P1
**条款**: E15.2, E15.3, E6.8

---

### 5.3 E2E-BE-003: 多设备 bundle 查询语义

**背景**: E16.2 指出当前只选最新活跃设备。E6.8 要求确认多设备选择语义。后端 `keyService.getDevices` 和 `keyService.getBundle` 的多设备行为需确认。

**改动范围**: 后端 API 行为确认文档

**禁止改动范围**: 不得由 Mimo 扩展多设备语义（E16.4）

**验收标准**:
- 确认 `getDevices` 返回的设备列表排序
- 硽认 `getBundle` 是否支持按 deviceId 查询
- 若需要多设备 fanout，输出设计需求

**负责人**: Codex
**优先级**: P2
**条款**: E16.2, E16.4, E6.8

---

### 5.4 E2E-BE-004: Negotiation 事件 payload 完整性确认

**背景**: `E2EE_NEGOTIATION` 事件的 `requestPayloadJson` 在 Web 发起协商时放入 `senderIdentityKey`、`ephemeralPublicKey`、`deviceId` 等。Mobile 若未来参与协商，需确认事件 payload 是否包含所有必需字段（E6.8）。

**改动范围**: 事件 payload 格式确认文档

**禁止改动范围**: 不得由 Mimo 修改协商事件语义（E10.5, E32.1）

**验收标准**:
- 确认 `request`, `accepted`, `rejected`, `disabled` 四种 action 的 payload 字段
- 确认 Mobile 参与协商时 payload 是否足够
- 若字段不完整，输出差异清单

**负责人**: Codex
**优先级**: P1
**条款**: E10.1, E10.5, E6.8, E11.1

---

## 6. 测试缺口

### 6.1 E2E-TEST-001: Web E2EE 加密发送失败阻断测试

**背景**: E31.2 要求覆盖"加密失败阻断"。当前 `chat-store.spec.ts` 有 19 个测试，但需确认是否覆盖了加密失败时的阻断路径。

**改动范围**: `apps/web/src/test/` 下 E2EE 测试文件

**禁止改动范围**: 不得为通过测试降低安全要求（E32.6）

**验收标准**:
- 测试：加密成功 → 发送 encrypted API
- 测试：加密失败 → 阻断发送 + 标记 pending failed
- 测试：negotiating 状态 → 阻断发送
- 测试：Ratchet state 缺失 → 触发协商 + 阻断发送

**负责人**: Mimo
**优先级**: P1
**条款**: E31.2, E21.1, E21.2, E8.1, E8.2

---

### 6.2 E2E-TEST-002: Web WebSocket E2EE_NEGOTIATION 事件分发测试

**背景**: E31.3 要求覆盖 `E2EE_NEGOTIATION` 只分发控制事件、不执行 crypto。当前 `websocket-store.spec.ts` 有 8 个测试，需确认是否覆盖此场景。

**改动范围**: `apps/web/src/test/websocket-store.spec.ts`

**禁止改动范围**: 不得修改 WebSocket store 的事件分发逻辑（E28.6, E11.2）

**验收标准**:
- 测试：收到 E2EE_NEGOTIATION → 调用 negotiation event bus emit
- 测试：收到 E2EE_NEGOTIATION → 不调用任何 crypto 函数
- 测试：payload 缺失 → 静默忽略

**负责人**: Mimo
**优先级**: P1
**条款**: E31.3, E11.1, E11.2, E28.6

---

### 6.3 E2E-TEST-003: Mobile encrypted session 发送阻断端到端测试

**背景**: E31.4 要求覆盖 "encrypted session send block"。当前 `mobileDeferredE2e.test.ts` 有 48 个测试，需确认覆盖 `sendText` + `sendMedia` + `retryMessage` 的阻断路径。

**改动范围**: `apps/mobile/src/e2ee/__tests__/mobileDeferredE2e.test.ts`

**禁止改动范围**: 不得为测试创建真正的加密发送路径（E32.3）

**验收标准**:
- 测试：sendText + session.encrypted=true → 抛出错误 + 不调用 sendPrivate
- 测试：sendMedia + session.encrypted=true → 抛出错误 + 不调用 upload
- 测试：retryMessage + payload.encrypted=true → blocked + 不调用 sendPrivate

**负责人**: Mimo
**优先级**: P1
**条款**: E31.4, E27.1, E27.2, E27.3, E5.2

---

### 6.4 E2E-TEST-004: Mobile encrypted message 遮罩覆盖测试

**背景**: E31.4 要求覆盖 "lastMessage/search/notification 不泄露密文"。当前测试覆盖了 `loadMessages` 和 `addMessage`，但搜索和通知路径需确认。

**改动范围**: `apps/mobile/src/e2ee/__tests__/` 下测试文件

**禁止改动范围**: 不得解密消息（E32.3）

**验收标准**:
- 测试：搜索结果中 encrypted message → content = E2EE_UNSUPPORTED_TEXT
- 测试：lastMessage 为 encrypted → content = E2EE_UNSUPPORTED_TEXT
- 测试：notification 为 encrypted → content = E2EE_UNSUPPORTED_TEXT
- 测试：所有媒体字段（mediaUrl, thumbnailUrl, mediaName, mediaSize, duration）已清除

**负责人**: Mimo
**优先级**: P1
**条款**: E31.4, E26.1, E26.3, E22.4

---

### 6.5 E2E-TEST-005: shared normalizer E2EE 字段测试

**背景**: E31.5 要求覆盖 camelCase/snake_case E2EE 字段和 `encrypted: true/1/0/undefined` 归一化。当前 `type-boundaries.spec.ts` 有 31 个编译时断言，但需确认运行时 normalizer 测试。

**改动范围**: `packages/shared-types/src/__tests__/` 或 normalizer 测试文件

**禁止改动范围**: 不得修改 E2EE 字段类型定义（E29.4）

**验收标准**:
- 测试：`encrypted: true` → isEncryptedValue = true
- 测试：`encrypted: 1` → isEncryptedValue = true
- 测试：`encrypted: false/0/undefined` → isEncryptedValue = false
- 测试：snake_case `e2ee_header` → 归一化为 `e2eeHeader`
- 测试：`ChatSession.encrypted` boolean 归一化

**负责人**: Mimo
**优先级**: P1
**条款**: E31.5, E29.1, E29.2

---

### 6.6 E2E-TEST-006: 日志脱敏扫描定期回归

**背景**: E20 敏感日志扫描已通过，但新增代码可能引入新的日志泄露。需建立定期扫描机制。

**改动范围**: 扫描脚本或 CI 配置

**禁止改动范围**: 不得放宽扫描规则（E20.1）

**验收标准**:
- 扫描脚本检查：console.log/warn/error 中是否包含 `privateKey`, `rootKey`, `chainKey`, `messageKey`, `mediaKey`, `ratchetState`, `plaintext`, `ciphertext` 关键词
- 可集成到 CI 或手动运行
- 扫描结果无新增敏感泄露

**负责人**: Mimo
**优先级**: P2
**条款**: E20.1, E20.2, E20.3

---

## 7. 文档缺口

### 7.1 E2E-DOC-001: E2EE 架构概览文档

**背景**: 当前 E2EE 相关信息分散在策略边界文档、gap 报告、readiness 报告中。缺少一份面向开发者的架构概览文档，描述 Web E2EE 整体架构、数据流和关键模块关系。

**改动范围**: 新建文档 `frontend/docs/e2ee-architecture-overview.md`

**禁止改动范围**: 不得在文档中包含密钥材料、私钥示例或可复原的密文（E20.1）

**验收标准**:
- 文档覆盖：X3DH 握手流程、Double Ratchet 加解密流程、密钥存储架构、消息发送/接收流程、协商状态机、媒体加密流程
- 所有流程图使用脱敏数据
- 不包含任何私钥、root key、chain key 示例

**负责人**: Mimo
**优先级**: P2
**条款**: E20.1, E34.5

---

### 7.2 E2E-DOC-002: Negotiation 事件语义文档

**背景**: E10 定义了 request/accepted/rejected/disabled 四种协商事件语义，但缺少面向实现者的详细文档，包括每种事件的 payload 格式、端侧行为和状态转换。

**改动范围**: 新建文档 `frontend/docs/e2ee-negotiation-semantics.md`

**禁止改动范围**: 不得修改 E10 的语义定义（E32.1）

**验收标准**:
- 文档覆盖：4 种 action 的 payload 格式、Web 端行为、Mobile Track A 行为、状态转换图
- 明确哪些行为属于 Codex 保留事项

**负责人**: Mimo
**优先级**: P2
**条款**: E10.1, E10.2, E10.3, E10.4, E10.5, E34.5

---

### 7.3 E2E-DOC-003: Track B 启动门槛清单文档

**背景**: `stage-5-mobile-full-e2ee-readiness.md` 评估了 8 个阻塞项，但缺少一份简洁的门槛清单文档，便于后续 Codex 逐项关闭。

**改动范围**: 新建文档 `frontend/docs/track-b-gate-checklist.md`

**禁止改动范围**: 不得降低门槛标准（E6.1）

**验收标准**:
- 8 个门槛逐项列出：当前状态、通过标准、验证方法
- 每个门槛有明确的"通过/未通过"判定
- 可作为 Codex 裁决的输入文档

**负责人**: Mimo
**优先级**: P2
**条款**: E6.1, E6.2, E6.3, E6.4, E6.5

---

## 8. 不建议 Mimo 执行、必须由 Codex 执行的任务

以下任务涉及协议核心、安全架构或 Codex 保留事项，Mimo 不得自行实施。

| 编号 | 任务 | 条款 | 优先级 | 说明 |
|------|------|------|--------|------|
| C-001 | RN crypto polyfill 能力验证 | E6.2, E6.6 | P0 | 需真机验证 crypto.subtle 完整性 |
| C-002 | Identity Key extractable 语义变更审计 | E17.2, E18.2 | P0 | 安全语义变更需裁决 |
| C-003 | Wrapping key 架构设计 | E19.3, E19.4 | P0 | Keychain + SQLite 加密方案 |
| C-004 | Ratchet state 持久化事务设计 | E13.4, E13.5 | P0 | 失败回滚策略 |
| C-005 | Web ↔ Mobile test vectors | E31.6 | P0 | X3DH/Double Ratchet 互通验证 |
| C-006 | shared-e2ee-core 安全范围确认 | E30.5 | P0 | 端口层扩展范围 |
| C-007 | skipped message keys 资源上限裁决 | E13.1 | P0 | MAX_SKIPPED_KEYS 值确定 |
| C-008 | offline retry 与 Ratchet state 事务性 | E25.2 | P0 | 加密后网络失败的处理策略 |
| C-009 | Ratchet state 与 session status 一致性 | E14.1 | P0 | 发送前强制检查设计 |
| C-010 | Device identity resolver RN 分支 | E16.1 | P1 | Capacitor 动态导入适配 |
| C-011 | 大文件加密策略 | E23.1 | P1 | Native Module vs JSI vs 纯 JS |
| C-012 | OPK 生命周期设计 | E15.3 | P1 | 上传/领取/补充/重放防御 |
| C-013 | Negotiation 事件 payload 完整性 | E10.5, E6.8 | P1 | Mobile 参与协商的 payload 确认 |
| C-014 | Mobile device bundle 注册 API 确认 | E6.8 | P1 | Web/Mobile bundle 格式兼容 |
| C-015 | 真机 Keychain/Keystore 行为测试 | E31.6, E19.1 | P1 | iOS + Android 真机验证 |
| C-016 | shared-e2ee-core 端口层扩展设计 | E30.5 | P1 | crypto/key-store/session-store/random/codec/media port |
| C-017 | 推送通知加密消息展示策略 | E26.1 | P1 | FCM/APNs payload 策略 |
| C-018 | 后台解密时机设计 | E8.1 | P1 | App 从后台恢复时批量解密 |
| C-019 | Media key 跨端包装格式 | E23.2 | P2 | 确定 media key 随消息传输格式 |
| C-020 | MMKV/SQLite E2EE flag 边界 | E19.2 | P2 | 明确哪些 flag 可存 MMKV |
| C-021 | 多设备 bundle 查询语义 | E16.4 | P2 | 多设备 fanout 设计 |
| C-022 | Web E2EE engine 迁移评估 | E6.7, E32.2 | P2 | 未来可运行协议抽包可行性 |
| C-023 | 最终 E2EE 安全审计 | E34.3 | P2 | Track B 启动前全面审计 |

**Codex 任务总数**: 23

---

## 9. 可由 Mimo 执行的小任务

| 编号 | 任务 | 条款 | 优先级 | 对应上游 |
|------|------|------|--------|---------|
| M-001 | Mobile secureStorage E2EE 密钥防护加固 | E18.1, E18.2 | P0 | SEC-004 |
| M-002 | Mobile negotiating 状态发送阻断 | E5.2, E27.1 | P1 | UX-001 |
| M-003 | Mobile encrypted message 搜索结果遮罩 | E22.4, E26.3 | P1 | UX-002 |
| M-004 | Mobile notification 加密消息遮罩确认 | E26.1, E26.3 | P1 | UX-003 |
| M-005 | Web E2EE 加密发送失败阻断测试 | E31.2, E21.1 | P1 | TEST-001 |
| M-006 | Web WebSocket E2EE_NEGOTIATION 分发测试 | E31.3, E11.1 | P1 | TEST-002 |
| M-007 | Mobile encrypted session 发送阻断测试 | E31.4, E27.1 | P1 | TEST-003 |
| M-008 | Mobile encrypted message 遮罩覆盖测试 | E31.4, E26.1 | P1 | TEST-004 |
| M-009 | shared normalizer E2EE 字段测试 | E31.5, E29.1 | P1 | TEST-005 |
| M-010 | Mobile encrypted session 状态提示 UI 增强 | E5.1, E26.1 | P2 | UX-004 |
| M-011 | Mobile encrypted pending blocked 状态 UI | E24.3, E27.3 | P2 | UX-005 |
| M-012 | Web pending encrypted message 内存清理 | E24.1, E22.3 | P2 | UX-006 |
| M-013 | Web/Mobile 共用 assertNoPlaintextDowngrade | E30.2, E8.1 | P2 | SC-001 |
| M-014 | Web/Mobile 共用 sanitizeE2eeLogValue | E20.1, E30.2 | P2 | SC-002 |
| M-015 | isEncryptedValue 统一调用 | E29.1, E30.2 | P2 | SC-003 |
| M-016 | 日志脱敏扫描定期回归 | E20.1, E20.2 | P2 | TEST-006 |
| M-017 | E2EE 架构概览文档 | E20.1, E34.5 | P2 | DOC-001 |
| M-018 | Negotiation 事件语义文档 | E10.1–E10.5 | P2 | DOC-002 |
| M-019 | Track B 启动门槛清单文档 | E6.1–E6.5 | P2 | DOC-003 |

**Mimo 任务总数**: 19

---

## 优先级汇总

| 优先级 | 数量 | 说明 |
|--------|------|------|
| **P0** | 9 | 安全阻塞项 + Track B 前置核心依赖 |
| **P1** | 16 | 体验优化 + 测试补充 + 后端确认 |
| **P2** | 17 | 共用抽取 + 文档 + 长期设计 |

---

## 负责人汇总

| 负责人 | 任务数 | 说明 |
|--------|--------|------|
| **Codex** | 23 | 协议核心、安全架构、裁决、真机验证 |
| **Mimo** | 19 | 测试、文案、遮罩、guard 抽取、文档 |

---

## 条款遵守确认

**已读取的 frontend-e2ee-strategy-boundary.md 条款编号**: E1–E34 (全部)

**本任务实际遵守的条款编号**:
- E4: 移动端支持等级裁决 — backlog 不包含 Track B 实施任务，只包含前置依赖
- E5: Track A 策略 — Mimo 任务限于 deferred 范围内的测试/文案/遮罩/guard
- E6: Track B 策略 — Codex 任务覆盖 8 个阻塞门槛
- E7: Track C 策略 — 不包含 Track C 升级任务
- E18: Mobile 密钥存储边界 — Mimo 任务不涉及 E2EE 密钥存储实现
- E19: secureStorage/Keychain/MMKV/SQLite 裁决 — Codex 负责 wrapping key 设计
- E30: shared-e2ee-core 裁决 — shared-e2ee-core 任务限于纯 contract/guard 调用统一
- E31: E2EE 测试矩阵 — 测试任务覆盖 E31.1–E31.6
- E32: 阶段五禁止事项 — 无任务要求 Mimo 修改协议、密钥或加密核心
- E33: 冲突处理规则 — 所有安全敏感任务归 Codex

**是否发现任务要求与边界文档冲突**: ❌ 无冲突

**本任务未违反 frontend-e2ee-strategy-boundary.md**
