# Stage 5: Mobile Full E2EE Readiness Report

本文档评估 Mobile 端实现完整 E2EE（Track B）的工程条件，不实现加密协议。

**评估日期**: 2026-05-16
**评估范围**: E4, E6, E12, E13, E15, E16, E18, E19, E30, E32, E33
**当前状态**: Track A (deferred) — Mobile 不做加密发送、解密展示、协商参与

---

## 边界确认

### 本任务涉及的 E2EE 规则

| 条款 | 归属类别 | 规则摘要 |
|------|---------|---------|
| E4 | Mobile E2EE 支持等级 | Track A/B/C 裁决；当前采用 Track A |
| E6 | Track B 策略 | crypto runtime、secure key store、IndexedDB 替代、测试门槛 |
| E12 | X3DH 协议边界 | P-256 ECDH/ECDSA、HKDF、SPK 签名验证 |
| E13 | Double Ratchet 协议边界 | root key、chain key、DH ratchet、skipped message keys |
| E15 | identity key / SPK / OPK 边界 | 密钥对生命周期、OPK 未启用 |
| E16 | deviceId 与多设备边界 | device 标识、多设备 fanout 未实现 |
| E18 | Mobile 密钥存储边界 | Keychain/MMKV/SQLite 使用限制 |
| E19 | secureStorage / Keychain / MMKV / SQLite 裁决 | 各存储层适用范围 |
| E30 | shared-e2ee-core 边界 | 纯 contract/guard 包，禁止协议实现 |
| E32 | 阶段五禁止事项 | 禁止协议修改、密钥泄露、静默降级 |
| E33 | 冲突处理规则 | 安全边界优先、端侧分治 |

### 本任务不会越界修改的内容

- 不修改 X3DH / Double Ratchet / media crypto 协议实现
- 不修改 Web E2EE engine / store / manager 代码
- 不修改 Mobile e2eeDeferred.ts / e2eeCapability.ts 行为
- 不新增依赖、不修改 package.json
- 不实现加密发送、解密展示或协商流程

---

## 1. WebCrypto 能力依赖清单

Web E2EE 引擎（`crypto-primitives.ts`）依赖以下 WebCrypto API：

| API | 用途 | 调用位置 |
|-----|------|---------|
| `crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' })` | Identity Key、Ephemeral Key、Ratchet Key、SPK、OPK 生成 | `crypto-primitives.ts:18-74` |
| `crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' })` | Signing Identity Key 生成 | `crypto-primitives.ts:80-86` |
| `crypto.subtle.exportKey('raw', key)` | 公钥导出为 ArrayBuffer | `crypto-primitives.ts:95-97` |
| `crypto.subtle.exportKey('jwk', key)` | CryptoKey 导出为 JWK（用于持久化） | `codec.ts:44-46` |
| `crypto.subtle.importKey('raw', ...)` | 公钥导入 | `crypto-primitives.ts:103-111` |
| `crypto.subtle.importKey('jwk', ...)` | JWK 导入为 CryptoKey | `codec.ts:49-55` |
| `crypto.subtle.importKey('HKDF', ...)` | HKDF key 导入 | `crypto-primitives.ts:159-164` |
| `crypto.subtle.deriveBits({ name: 'ECDH', ... })` | ECDH 共享密钥派生 | `crypto-primitives.ts:134-143` |
| `crypto.subtle.deriveBits({ name: 'HKDF', ... })` | HKDF 派生原始比特 | `crypto-primitives.ts:180-199` |
| `crypto.subtle.deriveKey({ name: 'HKDF', ... })` | HKDF 派生 AES-GCM 密钥 | `crypto-primitives.ts:153-175` |
| `crypto.subtle.deriveKey({ name: 'PBKDF2', ... })` | PBKDF2 派生 | `crypto-primitives.ts:285-305` |
| `crypto.subtle.encrypt({ name: 'AES-GCM', ... })` | AES-256-GCM 加密（含 AAD） | `crypto-primitives.ts:212-225` |
| `crypto.subtle.decrypt({ name: 'AES-GCM', ... })` | AES-256-GCM 解密（含 AAD） | `crypto-primitives.ts:230-241` |
| `crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' })` | SPK 签名、Sender Key 签名 | `crypto-primitives.ts:250-259` |
| `crypto.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' })` | SPK 验签、Sender Key 验签 | `crypto-primitives.ts:264-275` |
| `crypto.getRandomValues()` | CSPRNG 随机字节生成 | `codec.ts:39-41` |

**关键依赖特性**：
- Identity Key 使用 `extractable: false`（`crypto-primitives.ts:21`），IndexedDB structured clone 存储
- Ratchet Key 使用 `extractable: true`（`crypto-primitives.ts:46`），JWK 序列化存储
- Double Ratchet 使用 `exportKey('raw')` 导出链密钥用于 HKDF 派生（`double-ratchet.ts:137`）
- AES-GCM 使用 AAD 绑定 ratchetPublicKey + counter + previousCounter（`double-ratchet.ts:92-96`）

---

## 2. React Native Crypto / Polyfill 缺口

### 当前 Mobile 无任何 crypto polyfill

搜索 `frontend/apps/mobile/` 中 `crypto`, `subtle`, `WebCrypto`, `polyfill`, `getRandomValues` 关键词：**零匹配**。

当前 `package.json` 中无以下关键依赖：
- `react-native-quick-crypto`
- `react-native-get-random-values`
- `expo-crypto`
- `@craftzdog/react-native-buffer`

### 缺口逐项分析

| 能力 | Web 实现 | RN 现状 | 缺口严重度 |
|------|---------|---------|-----------|
| CSPRNG | `crypto.getRandomValues()` | Hermes 无全局 `crypto` | **阻塞** |
| ECDH P-256 密钥生成 | `crypto.subtle.generateKey` | 无 | **阻塞** |
| ECDSA P-256 密钥生成 | `crypto.subtle.generateKey` | 无 | **阻塞** |
| ECDH deriveBits | `crypto.subtle.deriveBits` | 无 | **阻塞** |
| HKDF deriveKey/deriveBits | `crypto.subtle.deriveKey/deriveBits` | 无 | **阻塞** |
| AES-256-GCM encrypt/decrypt | `crypto.subtle.encrypt/decrypt` | 无 | **阻塞** |
| ECDSA sign/verify | `crypto.subtle.sign/verify` | 无 | **阻塞** |
| PBKDF2 deriveKey | `crypto.subtle.deriveKey` | 无 | 低（媒体 key 包装备用） |
| Key export (raw/jwk) | `crypto.subtle.exportKey` | 无 | **阻塞** |
| Key import (raw/jwk/HKDF) | `crypto.subtle.importKey` | 无 | **阻塞** |
| TextEncoder/TextDecoder | 浏览器全局 | RN 0.85+ 内置 | 已满足 |
| ArrayBuffer/Uint8Array | 浏览器全局 | RN/Hermes 支持 | 已满足 |

### 可选 polyfill 方案

| 包名 | 提供能力 | 评估 |
|------|---------|------|
| `react-native-quick-crypto` (v1.x) | `crypto.subtle` 子集（ECDH、AES-GCM、HKDF、SHA） | **首选**，JSI 绑定，性能好。需验证 ECDSA sign/verify 和 HKDF deriveKey 完整性 |
| `react-native-get-random-values` | `crypto.getRandomValues()` | 轻量，必装 |
| `@nicolo-ribaudo/chacha20poly1305` | AEAD 替代方案 | 不适用，需 AES-GCM 与 Web 互通 |

**阻塞点**: `react-native-quick-crypto` 的 `crypto.subtle` 实现是否完整覆盖以下操作：
- `generateKey` (ECDH P-256, ECDSA P-256)
- `deriveBits` / `deriveKey` (ECDH, HKDF)
- `encrypt` / `decrypt` (AES-GCM with AAD)
- `sign` / `verify` (ECDSA SHA-256)
- `importKey` / `exportKey` (raw, jwk, HKDF)

若 `react-native-quick-crypto` 不完整，备选方案为编写自定义 Native Module 桥接 iOS CommonCrypto / Android Keystore+BoringSSL，工程量显著增加。

---

## 3. IndexedDB 替代方案

### Web IndexedDB 使用分析

Web E2EE 使用 IndexedDB `e2ee_keys` (version 2) 的 5 个 object store：

| Store | 存储内容 | 存储格式 | RN 替代方案 |
|-------|---------|---------|------------|
| `identity` | Identity Key Pair (ECDH, extractable: false) | CryptoKey structured clone | **Keychain/Keystore** (E19.1) |
| `prekeys` | SPK (JWK + raw public), OPK bundle metadata | JWK + ArrayBuffer | Keychain (私钥 JWK) + MMKV (公钥元数据) |
| `sessions` | RatchetState (rootKey, chainKey, DH key, counters, skipped keys) | JWK 序列化 | **SQLite + wrapping key** (E19.3) |
| `sender_keys` | Sender Key (chainKey raw, signing keypair JWK) | JWK + ArrayBuffer | SQLite + wrapping key |
| `meta` | deviceId, localPublicBundle | string/JSON | Keychain (deviceId), MMKV (bundle metadata) |

### 核心问题: CryptoKey structured clone 不可用

Web 将 `extractable: false` 的 Identity Key 直接以 CryptoKey 对象存入 IndexedDB（`key-store.ts:81`），依赖 structured clone 语义。RN 没有 IndexedDB，也没有 structured clone。

**解决方案**：
- Identity Key 生成时改为 `extractable: true`，私钥以 JWK 导出
- JWK 用 Keychain 保护的 wrapping key 加密后存入 SQLite
- 这改变了 Web 的安全语义（E17.2: "non-extractable CryptoKey"），需要 Codex 裁决

### SQLite schema 扩展需求

当前 Mobile SQLite schema（`storageMigrations.ts`）无 E2EE 相关表。需新增：

```sql
-- E2EE device identity
CREATE TABLE IF NOT EXISTS e2ee_devices (
  device_id TEXT PRIMARY KEY NOT NULL,
  identity_key_pair_encrypted BLOB NOT NULL,  -- AES-GCM encrypted JWK
  signing_key_pair_encrypted BLOB NOT NULL,
  created_at INTEGER NOT NULL
);

-- Ratchet session state
CREATE TABLE IF NOT EXISTS e2ee_sessions (
  session_id TEXT PRIMARY KEY NOT NULL,
  ratchet_state_encrypted BLOB NOT NULL,  -- AES-GCM encrypted serialized state
  status TEXT NOT NULL DEFAULT 'plaintext',
  updated_at INTEGER NOT NULL
);

-- Skipped message keys
CREATE TABLE IF NOT EXISTS e2ee_skipped_keys (
  session_id TEXT NOT NULL,
  key_id TEXT NOT NULL,
  message_key_encrypted BLOB NOT NULL,
  PRIMARY KEY (session_id, key_id)
);

-- Pre-key metadata
CREATE TABLE IF NOT EXISTS e2ee_prekeys (
  key_id TEXT PRIMARY KEY NOT NULL,
  public_key_raw TEXT NOT NULL,  -- Base64
  type TEXT NOT NULL,  -- 'spk' or 'opk'
  created_at INTEGER NOT NULL
);
```

---

## 4. Secure Key Store 可行性

### 当前 Mobile secureStorage 分析

`secureStorage.ts` 现状：
- 使用 `react-native-keychain` v10.0.0
- 通过 `setGenericPassword` / `getGenericPassword` 存取
- **有内存 fallback**（`secureStorage.ts:36-38`）：Keychain 失败时回退到 `memorySecure` Map
- 只支持 string 类型值（不支持 Binary/Blob）
- 使用 `ACCESSIBLE.WHEN_UNLOCKED_THIS_DEVICE_ONLY`（`secureStorage.ts:19`）

### E18/E19 合规性评估

| 要求 | 现状 | 差距 |
|------|------|------|
| E18.2: 内存 fallback 不得承载 E2EE 密钥 | memory fallback 存在 | **必须为 E2EE 密钥单独创建无 fallback 的 Keychain 访问层** |
| E19.1: Keychain 保存 wrapping key / identity private key | 当前只存 access token | 需扩展用途 |
| E19.2: MMKV 不得保存私钥/root key/chain key | MMKV 只存 UI 状态 | 合规 |
| E19.3: SQLite Ratchet blob 由 wrapping key 加密 | 无 wrapping key | **需生成并持久化 wrapping key** |

### Wrapping Key 方案

```
Keychain (hardware-backed)
  └── wrapping_key (AES-256, non-exportable)
        ├── encrypts → identity_key_pair JWK → SQLite
        ├── encrypts → signing_key_pair JWK → SQLite
        ├── encrypts → ratchet_state JWK → SQLite
        └── encrypts → skipped_message_keys JWK → SQLite
```

- wrapping_key 通过 `react-native-keychain` 的 `setGenericPassword` 生成
- 首次生成后写入 Keychain，后续只读
- **关键**: 需要验证 `react-native-keychain` 是否支持存储二进制 key（当前只存 string）

**阻塞点**: `react-native-keychain` 的 `setGenericPassword` 只支持 string。存储 AES-256 wrapping key 需要：
- 方案 A: 将 32 字节 key 编码为 Base64 string 存入 Keychain ✅ 可行
- 方案 B: 使用 `react-native-keychain` 的 `setInternetCredentials` 的 `storage` 参数
- 方案 C: 自定义 Native Module 直接调用 iOS SecItemAdd / Android KeyStore

---

## 5. Ratchet State 持久化方案

### Web RatchetState 结构（`double-ratchet.ts:32-53`）

```typescript
interface RatchetState {
  rootKey: CryptoKey;              // AES-GCM-256, extractable
  sendingChainKey: CryptoKey | null; // AES-GCM-256, extractable
  receivingChainKey: CryptoKey | null; // AES-GCM-256, extractable
  sendCounter: number;
  receiveCounter: number;
  previousCounter: number;
  dhKeyPair: CryptoKeyPair;        // ECDH P-256, extractable: true
  remotePublicKey: CryptoKey | null; // ECDH P-256
  skippedMessageKeys: Map<string, CryptoKey>; // AES-GCM-256
}
```

### 持久化流程（Web 现状，`session-store.ts:84-117`）

Web 将所有 CryptoKey 通过 `cryptoKeyToJwk()` 导出为 JWK，序列化为 JSON 存入 IndexedDB。反序列化时通过 `jwkToCryptoKey()` 还原。

### Mobile 替代方案

```
序列化: RatchetState → JWK JSON → AES-256-GCM(wrapping_key) → SQLite BLOB
反序列化: SQLite BLOB → AES-256-GCM decrypt → JWK JSON → RatchetState
```

**风险点**：
1. `exportKey('raw', chainKey)` 在 `double-ratchet.ts:137` 用于 HKDF 派生 — polyfill 必须支持
2. skippedMessageKeys 是 `Map<string, CryptoKey>`，需序列化为数组
3. 每次 encrypt/decrypt 后都需持久化（`e2ee-manager.ts:50,86`），性能敏感
4. 事务性: 持久化失败必须视为安全失败（E13.4），不得继续发送

---

## 6. Device Identity 持久化方案

### Web 现状（`device-identity.ts`）

优先级: 内存缓存 → IndexedDB → Capacitor Device.getId() → localStorage UUID → 全新生成

### Mobile 适配需求

| 组件 | Web | Mobile 需要 |
|------|-----|------------|
| deviceId 持久化 | IndexedDB `meta` store | Keychain（E19.1: 高价值 secret） |
| UUID 生成 | `crypto.randomUUID()` | `react-native-device-info` 已在依赖中 |
| 重装检测 | Capacitor SecureStorage | Keychain `WHEN_UNLOCKED_THIS_DEVICE_ONLY` 语义已支持 |
| 设备标识 | `@capacitor/device` | `react-native-device-info` `getUniqueId()` |

**当前 Mobile 已有 `react-native-device-info` v14.1.1**，可直接用于 deviceId 生成。

**阻塞点**: `device-identity.ts` 的 Capacitor 动态导入（`_dynamicImport`）不适用于 RN。需为 Mobile 编写独立的 device identity resolver，或在 `device-identity.ts` 中增加 RN 分支。

---

## 7. Media Encryption 可行性

### Web 现状（`media-crypto.ts`）

- 小文件（≤5MB）: 主线程 AES-GCM 加密
- 大文件（>5MB）: Web Worker 加密
- 分块大小: 5MB
- 使用 `File` / `Blob` API

### Mobile 缺口

| 能力 | Web | Mobile | 差距 |
|------|-----|--------|------|
| 文件读取 | `File.arrayBuffer()` / `FileReader` | `react-native-blob-util` 已有 | 需适配 |
| AES-GCM 加密 | `crypto.subtle.encrypt` | 无 | **依赖 crypto polyfill** |
| Web Worker | `new Worker(url)` | 不可用 | **需替代方案** |
| Blob 构造 | `new Blob([data])` | RN 无原生 Blob | 需 `react-native-blob-util` |

**大文件加密替代方案**：
- 方案 A: Native Module 在 C++/Java 层执行分块加密（最佳性能）
- 方案 B: JSI 直接调用 `react-native-quick-crypto` 的 AES-GCM（中等性能）
- 方案 C: 纯 JS 循环分块加密（性能差，阻塞 UI）

---

## 8. 后台 / 离线 / 推送场景影响

### 后台执行限制

| 场景 | Web | Mobile 影响 |
|------|-----|------------|
| 收到加密消息后解密 | 主线程即时处理 | 前台可用；后台推送无法解密 |
| 离线消息同步恢复 | 页面加载时批量解密 | App 前台恢复时批量解密 |
| 推送通知内容 | 可显示解密后内容 | **无法在推送中解密**（E8.1: 不降级为明文） |
| Pending 重试 | 网络恢复后自动重试 | 前台恢复后重试 |

**推送影响**：
- 加密消息的推送通知只能显示 "收到一条新消息" 或 E26.1 文案
- 不得在推送 payload 中包含明文或密文
- FCM/APNs payload 只能携带 metadata（senderId, conversationId）

### 离线重试

- Mobile pending queue 中 encrypted payload 必须 blocked（E24.3, E25.3）
- 不能自动恢复为 pending 发送
- 需要在 UI 中明确提示用户

---

## 9. 测试环境支持情况

### 当前 Mobile 测试基础设施

- 测试框架: Jest + `@react-native/jest-preset`
- 测试文件: 15 个 spec 文件
- Mock 模式: `vi.mock()`, `vi.hoisted()`
- 存储 mock: `__mocks__/messageRepository.ts`, `__mocks__/pendingMessageRepository.ts`

### E2EE 测试缺口

| 测试类型 | Web 已有 | Mobile 需要 | 阻塞度 |
|---------|---------|------------|--------|
| X3DH 互通测试 | ✅ | Web ↔ Mobile X3DH | **阻塞** |
| Double Ratchet 互通测试 | ✅ | Web ↔ Mobile Ratchet | **阻塞** |
| 乱序消息测试 | ✅ | 需 Mobile 实现 | **阻塞** |
| 重复消息测试 | ✅ | 需 Mobile 实现 | **阻塞** |
| Counter gap 测试 | ✅ | 需 Mobile 实现 | **阻塞** |
| 重启恢复测试 | ✅ | 需真机 Keychain 测试 | **阻塞** |
| 密钥删除测试 | ✅ | 需 Mobile 实现 | **阻塞** |
| 日志脱敏测试 | ✅ (shared-e2ee-core) | 已有 `sanitizeE2eeLogValue` | 已满足 |
| 真机 Keychain/Keystore 测试 | N/A | **必须** | **阻塞** |

**测试环境阻塞**:
- Jest + jsdom 不支持 WebCrypto API
- 需要在真机或模拟器上运行 crypto 测试
- 需要 Web ↔ Mobile 互通 test vectors（E31.6）

---

## 10. 需要新增依赖清单

| 包名 | 版本 | 用途 | 必要性 |
|------|------|------|--------|
| `react-native-quick-crypto` | ^1.x | WebCrypto polyfill (ECDH, ECDSA, AES-GCM, HKDF) | **必须** |
| `react-native-get-random-values` | ^1.x | CSPRNG `crypto.getRandomValues()` | **必须** |
| `@craftzdog/react-native-buffer` | ^1.x | Buffer polyfill (crypto 操作依赖) | **必须** |

**注意**: `react-native-quick-crypto` 需要 native linking（JSI）。安装后需重新编译 iOS/Android。

**不需要新增的依赖**:
- `react-native-keychain` — 已有 v10.0.0
- `react-native-mmkv` — 已有 v4.0.0
- `react-native-quick-sqlite` — 已有 v8.2.7
- `react-native-blob-util` — 已有 v0.24.7
- `react-native-device-info` — 已有 v14.1.1

---

## 11. 需要后端支持清单

| 需求 | 描述 | 优先级 |
|------|------|--------|
| Mobile device 注册 API | 允许 Mobile 端注册 E2EE device 并上传 key bundle | 阻塞 |
| Key bundle 格式兼容 | Mobile 上传的 bundle 格式与 Web 一致（E12.1） | 阻塞 |
| Negotiation 事件语义 | `E2EE_NEGOTIATION` 事件 Mobile 可参与协商 | 阻塞 |
| 多设备 bundle 查询 | 同一用户多设备的 bundle 查询支持 | 可延后（E16.2: 当前只选最新设备） |

**当前后端已支持**:
- Key bundle 上传 API（`keyService.uploadBundle`）
- Key bundle 查询 API（`keyService.getBundle`）
- Device 列表查询 API（`keyService.getDevices`）
- Negotiation 请求 API（`keyService.requestEncryption`）

后端 API 本身不区分 Web/Mobile，理论上 Mobile 可直接复用。

---

## 12. 不建议 Mimo 实现的协议核心清单

以下属于 E32 / E34.3 保留事项，Mimo 不得自行实现：

| 组件 | 原因 | 归属 |
|------|------|------|
| X3DH 密钥协商 | DH 顺序、HKDF info/salt、曲线、签名算法不可修改（E12.3） | Codex |
| Double Ratchet 加解密 | KDF info、chain split、counter 推进、DH ratchet 时机不可修改（E13.3） | Codex |
| Media crypto 分块加密 | 分块大小、media key 包装、跨端格式不可修改（E23.4） | Codex |
| Sender Key 群聊加密 | 协议未完整实现（E2.5） | Codex |
| Identity Key 生成策略 | extractable 语义变更需裁决（E17.2 vs E18.2） | Codex |
| Ratchet state 持久化事务 | 持久化失败语义、rollback 设计需审计（E13.4） | Codex |
| Wrapping key 生命周期 | 生成、轮换、删除策略需设计（E19.4） | Codex |
| OPK 生命周期 | 上传、领取、补充、重放防御需裁决（E15.3） | Codex |
| Counter gap 重新协商 | 安全恢复流程不可自行修改（E14.3） | Codex |

---

## 13. Codex 必须处理的问题清单

### 阻塞级（必须在 Track B 启动前解决）

| # | 问题 | 条款 | 描述 |
|---|------|------|------|
| C1 | Crypto polyfill 选型确认 | E6.2 | `react-native-quick-crypto` 的 `crypto.subtle` 是否完整覆盖 ECDH P-256、ECDSA P-256、HKDF、AES-GCM (with AAD)、importKey/exportKey (raw, jwk, HKDF) |
| C2 | Identity Key extractable 语义变更 | E17.2, E18.2 | Web 使用 `extractable: false` + IndexedDB structured clone；Mobile 需 `extractable: true` + JWK 导出。这是否可接受？是否需要补偿安全措施？ |
| C3 | Wrapping key 架构设计 | E19.4 | Keychain wrapping key 的生成、存储、轮换、备份、删除策略 |
| C4 | Ratchet state 持久化事务设计 | E13.4 | 加密 → 写入 SQLite 的事务性保证；写入失败时的 Ratchet state 回滚或阻断策略 |
| C5 | Web ↔ Mobile test vectors | E31.6 | 确定互通测试的 test vector 集合和验证标准 |
| C6 | shared-e2ee-core 安全范围确认 | E30.5 | Mobile 端口层（crypto port, secure key store port, session store port）是否需要扩展 shared-e2ee-core |

### 重要级（Track B 开发过程中解决）

| # | 问题 | 条款 | 描述 |
|---|------|------|------|
| C7 | Device identity resolver 分支 | E16.1 | `device-identity.ts` 的 Capacitor 动态导入需增加 RN 分支，或 Mobile 编写独立 resolver |
| C8 | 大文件加密策略 | E23.1 | Native Module vs JSI vs 纯 JS 的性能和安全权衡 |
| C9 | 推送通知加密消息展示 | E26.1 | FCM/APNs payload 策略：只传 metadata，不传内容 |
| C10 | 后台解密时机 | E8.1 | App 从后台恢复时的批量解密策略和性能影响 |
| C11 | MMKV/SQLite E2EE flag 边界 | E19.2 | 明确哪些 E2EE 状态 flag 可以存 MMKV（如 `session.encrypted` boolean） |
| C12 | Media key 跨端包装格式 | E23.2 | 确定 media key 如何随 encrypted message 安全传输 |

---

## Readiness 结论

### Full E2EE 当前状态: NOT READY

Mobile 完整 E2EE（Track B）当前**不具备**工程实施条件。

### 阻塞项列表

| # | 阻塞项 | 严重度 | 解决路径 |
|---|--------|--------|---------|
| 1 | 无 crypto polyfill — 无 CSPRNG、无 WebCrypto API | **阻塞** | 安装并验证 `react-native-quick-crypto` |
| 2 | Identity Key extractable 语义与 Web 不一致 | **阻塞** | Codex 裁决安全影响 |
| 3 | 无 wrapping key 架构 — Ratchet state 无法安全持久化 | **阻塞** | Codex 设计 wrapping key 方案 |
| 4 | 无 E2EE SQLite schema — 无 sessions/skipped_keys 表 | **阻塞** | 设计并创建迁移脚本 |
| 5 | 无 Web ↔ Mobile 互通测试 | **阻塞** | Codex 提供 test vectors |
| 6 | `react-native-quick-crypto` 能力未验证 | **阻塞** | 在真机上验证所有 crypto 操作 |
| 7 | `device-identity.ts` 不支持 RN | **中** | 增加 RN 分支或独立 resolver |
| 8 | 大文件加密无 Web Worker 替代 | **中** | Native Module 或 JSI 方案 |
| 9 | 推送通知无法展示加密内容 | **低** | UX 设计决定 |

### Codex 后续裁决项

1. **C1**: `react-native-quick-crypto` 能力验证 — 需在真机上运行完整 crypto 操作测试
2. **C2**: Identity Key `extractable` 语义变更安全审计
3. **C3**: Wrapping key 架构设计（Keychain + SQLite 加密方案）
4. **C4**: Ratchet state 持久化事务设计（失败回滚策略）
5. **C5**: Web ↔ Mobile X3DH / Double Ratchet 互通 test vectors
6. **C6**: `shared-e2ee-core` 端口层扩展范围确认

---

## 已读取条款

本报告已读取 `frontend-e2ee-strategy-boundary.md` 全部条款 E1–E34。

## 本任务实际遵守的条款

E4.1/E4.3 (Track A 继续，Track B 未启用), E6.1 (Track B 不是阶段五策略), E12.1/E12.5 (X3DH 边界), E13.1/E13.4/E13.5 (Double Ratchet 边界), E15.1/E15.3 (identity key/OPK 边界), E16.1/E16.2/E16.4 (deviceId 边界), E18.1–E18.4 (Mobile 密钥存储边界), E19.1–E19.4 (存储层裁决), E30.1–E30.5 (shared-e2ee-core 边界), E32.1–E32.6 (禁止事项), E33.1–E33.4 (冲突处理)

## 冲突检查

**未发现**任务要求与 `frontend-e2ee-strategy-boundary.md` 冲突。本任务为纯评估报告，未修改任何代码、依赖或协议实现。

**本任务未违反 `frontend-e2ee-strategy-boundary.md`。**
