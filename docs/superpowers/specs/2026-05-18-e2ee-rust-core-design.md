# E2EE Rust 核心重写：架构设计文档

**日期**: 2026-05-18
**状态**: 已批准
**作者**: 架构评审委员会
**目标**: 将 `frontend/packages/shared-e2ee-core` (TypeScript, P-256) 完整重写为纯 Rust E2EE 核心 (Curve25519)，实现全平台（服务端/移动端/Web）统一，不保留历史 P-256 兼容性。

---

## 目录

1. [核心原则与安全底线](#1-核心原则与安全底线)
2. [Crate 结构与依赖](#2-crate-结构与依赖)
3. [密码学原语层 (primitives.rs)](#3-密码学原语层-primitivesrs)
4. [X3DH 协议层 (x3dh.rs)](#4-x3dh-协议层-x3dhrs)
5. [Double Ratchet 引擎 (ratchet.rs)](#5-double-ratchet-引擎-ratchetrs)
6. [FFI 导出层 (e2ee-ffi + e2ee-wasm)](#6-ffi-导出层-e2ee-ffi--e2ee-wasm)
7. [宿主集成规范](#7-宿主集成规范)
8. [测试策略](#8-测试策略)
9. [迁移路径](#9-迁移路径)

---

## 1. 核心原则与安全底线

### 1.1 零容忍铁律

| # | 铁律 | 实现 |
|---|------|------|
| 1 | **零 unsafe** | `#![forbid(unsafe_code)]` at lib.rs root |
| 2 | **强制 Zeroize** | 所有密钥结构体 `#[derive(Zeroize, ZeroizeOnDrop)]` |
| 3 | **DoS 防护** | `const MAX_SKIP: u32 = 2000`，超限即终止 |
| 4 | **零 Panic** | 无 `.unwrap()`/`.expect()`/`panic!()`；所有函数返回 `Result<T, E2eeError>` |

### 1.2 架构决策记录 (ADR)

| ID | 决策 | 理由 |
|----|------|------|
| ADR-1 | Curve25519 (X25519 + Ed25519) 替代 P-256 | 现代标准，更快的运算，更简化的安全假设 |
| ADR-2 | 三层 crate 架构 (core/ffi/wasm) | UniFFI 与 wasm-bindgen 的 proc-macro 互不兼容 |
| ADR-3 | 核心零 I/O | 纯函数状态机，跨语言异步恢复避免死锁 |
| ADR-4 | bincode 紧凑序列化 | 极小的状态体积（< 10KB），MMKV/IndexedDB 友好 |
| ADR-5 | 完整 X3DH with OTK | 提供前向安全性 (Forward Secrecy) |
| ADR-6 | 无自动修复机制 | 依赖 DH 棘轮步进自愈，不破坏协议形式化验证 |
| ADR-7 | AAD 混入 Identity Keys | 防跨会话重放攻击 |
| ADR-8 | AAD 使用 canonical IK ordering (lexicographic) | 无需角色协商即可跨端一致派生 AAD |

---

## 2. Crate 结构与依赖

```
backend/
├── e2ee-core/                    # 纯密码学引擎，零 FFI，零 I/O
│   ├── Cargo.toml
│   └── src/
│       ├── lib.rs                # #![forbid(unsafe_code)], 模块声明 + re-export
│       ├── errors.rs             # E2eeError 枚举 (thiserror)
│       ├── primitives.rs         # AES-256-GCM, HKDF-SHA256, X25519 DH, Ed25519 sign/verify
│       ├── x3dh.rs               # KeyBundle 生成, x3dh_initiate, x3dh_respond
│       ├── ratchet.rs            # Double Ratchet 状态机, MAX_SKIP
│       └── state.rs              # RatchetState + bincode 序列化/反序列化
│
├── e2ee-ffi/                     # UniFFI → Kotlin (Android) + Swift (iOS)
│   ├── Cargo.toml
│   ├── build.rs                  # uniffi::generate_scaffolding
│   └── src/
│       ├── lib.rs                # uniffi::setup_scaffolding!()
│       └── session.rs            # SessionManager
│
└── e2ee-wasm/                    # wasm-bindgen → Web WASM
    ├── Cargo.toml
    └── src/
        ├── lib.rs
        └── session.rs            # WasmSessionManager (单线程, &mut self)
```

**依赖方向**: `e2ee-core` ← `e2ee-ffi` / `e2ee-wasm`（核心不知道 FFI 层的存在）

### 2.1 e2ee-core Cargo.toml 依赖清单

| Crate | 版本 | 用途 |
|---|---|---|
| `x25519-dalek` | 2.x | ECDH 密钥协商 |
| `ed25519-dalek` | 2.x | 身份签名/验证 |
| `aes-gcm` | 0.10 | 消息对称加密 (AEAD) |
| `hkdf` | 0.12 | 密钥派生 |
| `sha2` | 0.10 | SHA-256 |
| `hmac` | 0.12 | HMAC 原语 |
| `rand_core` + `getrandom` | 0.6 / 0.2 | 安全随机数 |
| `zeroize` | 1.x (derive feature) | Zeroize + ZeroizeOnDrop |
| `serde` + `bincode` | 1.x / 1.3 | 状态序列化 |
| `thiserror` | 1.x | 错误枚举 |

**不在 e2ee-core 中的依赖**: `uniffi`, `wasm-bindgen`, `tokio`, 任何网络/存储库

---

## 3. 密码学原语层 (primitives.rs)

### 3.1 Newtype 强类型隔离

采用元组结构体 Newtype 模式，禁止类型别名以避免跨上下文密钥误用。

```rust
// ===== 对称密钥 =====
#[derive(Zeroize, ZeroizeOnDrop)]
pub struct Aes256Key(pub [u8; 32]);

// ===== X25519 密钥对 =====
// public key: Serializable + Copy + Eq for ergonomic use
#[derive(Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub struct X25519PublicKey(pub [u8; 32]);

#[derive(Zeroize, ZeroizeOnDrop, Serialize, Deserialize)]
pub struct X25519PrivateKey(pub [u8; 32]);

// bincode 序列化顺序：public_key(32) || private_key(32)（字段声明顺序）
#[derive(Zeroize, ZeroizeOnDrop, Serialize, Deserialize)]
pub struct X25519KeyPair {
    #[zeroize(skip)]
    pub public_key: X25519PublicKey,
    pub private_key: X25519PrivateKey,
}

// ===== Ed25519 密钥对 =====
#[derive(Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub struct Ed25519PublicKey(pub [u8; 32]);

#[derive(Zeroize, ZeroizeOnDrop)]
pub struct Ed25519PrivateKey(pub [u8; 32]);

#[derive(Zeroize, ZeroizeOnDrop)]
pub struct Ed25519KeyPair {
    #[zeroize(skip)]
    pub public_key: Ed25519PublicKey,
    pub private_key: Ed25519PrivateKey,
}

// ===== Nonce 和签名（无敏感信息，不需 Zeroize） =====
pub struct AesNonce(pub [u8; 12]);

// Ed25519Signature: 手动 Serialize/Deserialize（serde 不支持 [u8; 64]）
#[derive(Clone, Copy)]
pub struct Ed25519Signature(pub [u8; 64]);
```

### 3.2 编译期安全约束

| 约束 | 实现 |
|------|------|
| 禁止私钥隐式复制 | 私钥类型不派生 `Copy` / `Clone` |
| AES key 不能传入 X25519 DH | newtype 隔离，编译报错 |
| `RatchetRootKey` 不能当 `Aes256Key` | 各自 Newtype |
| HKDF 定长零堆分配 | Const generics `fn hkdf_sha256<const N: usize>` |
| 密钥析构时物理擦除 | `ZeroizeOnDrop` 编译器保证 |

### 3.3 函数签名

```rust
// === 密钥生成（纯函数，栈返回） ===
// generate_x25519_keypair: OsRng 在主流平台上不会失败，返回非 Result
pub fn generate_x25519_keypair() -> X25519KeyPair;
// generate_ed25519_keypair / generate_aes_256_key / generate_nonce:
// getrandom 在极端无 OS 环境可能失败，返回 Result
pub fn generate_ed25519_keypair() -> Result<Ed25519KeyPair, E2eeError>;
pub fn generate_aes_256_key() -> Result<Aes256Key, E2eeError>;
pub fn generate_nonce() -> Result<AesNonce, E2eeError>;

// === X25519 ECDH ===
#[must_use]
pub fn x25519_dh(
    private_key: &X25519PrivateKey,
    public_key: &X25519PublicKey,
) -> Result<[u8; 32], E2eeError>;

// === Ed25519 签名/验签 ===
#[must_use]
pub fn ed25519_sign(
    private_key: &Ed25519PrivateKey,
    message: &[u8],
) -> Result<Ed25519Signature, E2eeError>;

#[must_use]
pub fn ed25519_verify(
    public_key: &Ed25519PublicKey,
    message: &[u8],
    signature: &Ed25519Signature,
) -> Result<(), E2eeError>;
// Ok(()) — 验签通过
// Err(SignatureMismatch) — 签名不匹配（正常协议行为）
// Err(InvalidSignature) — 格式损坏

// === HKDF-SHA256（Const Generics，零堆分配） ===
#[must_use]
pub fn hkdf_sha256<const N: usize>(
    ikm: &[u8],
    salt: &[u8],
    info: &[u8],
) -> Result<[u8; N], E2eeError>;

// === AES-256-GCM (AEAD) ===
#[must_use]
pub fn aes_gcm_encrypt(
    key: &Aes256Key,
    nonce: &AesNonce,
    plaintext: &[u8],
    aad: &[u8],
) -> Result<Vec<u8>, E2eeError>;

#[must_use]
pub fn aes_gcm_decrypt(
    key: &Aes256Key,
    nonce: &AesNonce,
    ciphertext: &[u8],
    aad: &[u8],
) -> Result<Vec<u8>, E2eeError>;
```

---

## 4. X3DH 协议层 (x3dh.rs)

### 4.1 结构体定义

```rust
// ===== 带 ID 的预密钥 =====
#[derive(Clone, Copy, Serialize, Deserialize)]
pub struct PreKey {
    pub id: u32,
    pub key: X25519PublicKey,
}

// ===== 一次性预密钥对（含 host 分配的 OTK id） =====
#[derive(Zeroize, ZeroizeOnDrop)]
pub struct OneTimePreKeyPair {
    #[zeroize(skip)]
    pub id: u32,
    pub key_pair: X25519KeyPair,
}

// ===== 公钥包（本地生成 → 上传到服务端） =====
// 注意：one_time_pre_keys 包含 PreKey (id + key)，而非裸 X25519PublicKey，
// 因此服务端可以知道每个 OTK 的宿主分配 ID
#[derive(Serialize, Deserialize)]
pub struct PreKeyBundle {
    pub identity_key: X25519PublicKey,
    pub signing_key: Ed25519PublicKey,
    pub signed_pre_key: X25519PublicKey,
    pub signed_pre_key_signature: Ed25519Signature,
    pub one_time_pre_keys: Vec<PreKey>,
}

// ===== 从服务端拉取的 Bundle（SPK 和 OTK 带 ID） =====
#[derive(Serialize, Deserialize)]
pub struct PreKeyBundleFetch {
    pub identity_key: X25519PublicKey,
    pub signing_key: Ed25519PublicKey,
    pub signed_pre_key: PreKey,
    pub signed_pre_key_signature: Ed25519Signature,
    pub one_time_pre_key: Option<PreKey>,
}

// ===== 完整密钥包（本地持有，含所有私钥 + OTK id） =====
#[derive(Zeroize, ZeroizeOnDrop)]
pub struct KeyBundle {
    #[zeroize(skip)]
    pub spk_id: u32,
    pub identity_key_pair: X25519KeyPair,
    pub signing_key_pair: Ed25519KeyPair,
    pub signed_pre_key_pair: X25519KeyPair,
    pub one_time_pre_key_pairs: Vec<OneTimePreKeyPair>,
    #[zeroize(skip)]
    pub bundle: PreKeyBundle,
}

// ===== X3DH 输出 =====
pub struct X3dhInitiateResult {
    pub root_key: RatchetRootKey,
    pub ephemeral_public_key: X25519PublicKey,
    pub spk_id: u32,
    pub otk_id: Option<u32>,
}

pub struct X3dhRespondResult {
    pub root_key: RatchetRootKey,
    pub otk_id: Option<u32>,
}
```

### 4.2 函数签名

```rust
// 主 API：batch-based OTK id 分配
// one_time_pre_keys: &[(start_id, count)] — 每个批次指定起始 ID 和数量
// OTK id 是 host 分配的 u32 值，非数组索引
#[must_use]
pub fn generate_key_bundle(
    spk_id: u32,
    one_time_pre_keys: &[(u32, u32)],
) -> Result<KeyBundle, E2eeError>;

// 兼容包装：OTK count only，id 从 1 起连续分配
#[must_use]
pub fn generate_key_bundle_with_count(
    spk_id: u32,
    one_time_pre_key_count: u32,
) -> Result<KeyBundle, E2eeError>;

#[must_use]
pub fn x3dh_initiate(
    identity_key_pair: &X25519KeyPair,
    remote_bundle: &PreKeyBundleFetch,
) -> Result<X3dhInitiateResult, E2eeError>;

// x3dh_respond 使用 OneTimePreKeyPair（含 host 分配的 OTK id）
// 返回的 X3dhRespondResult.otk_id 直接从 OneTimePreKeyPair.id 传递
#[must_use]
pub fn x3dh_respond(
    identity_key_pair: &X25519KeyPair,
    signed_pre_key_pair: &X25519KeyPair,
    one_time_pre_key_pair: Option<&OneTimePreKeyPair>,
    remote_identity_key: &X25519PublicKey,
    remote_ephemeral_key: &X25519PublicKey,
) -> Result<X3dhRespondResult, E2eeError>;

// 兼容包装：接受裸 X25519KeyPair 作为 OTK
// 功能与 x3dh_respond 相同，但 otk_id 始终为 None
#[must_use]
pub fn x3dh_respond_with_raw_otk(
    identity_key_pair: &X25519KeyPair,
    signed_pre_key_pair: &X25519KeyPair,
    one_time_pre_key_pair: Option<&X25519KeyPair>,
    remote_identity_key: &X25519PublicKey,
    remote_ephemeral_key: &X25519PublicKey,
) -> Result<X3dhRespondResult, E2eeError>;
```

### 4.3 协议计算 (DH1-DH4)

```
x3dh_initiate (Alice):
  1. ed25519_verify(SK_B, SPK_B_signature, SPK_B)
  2. 生成 EK_A = generate_x25519_keypair()
  3. DH1 = x25519_dh(IK_A_priv, SPK_B)        ┐
     DH2 = x25519_dh(EK_A_priv, IK_B)         ├── 96 bytes (SPK-only)
     DH3 = x25519_dh(EK_A_priv, SPK_B)        │   128 bytes (with OTK)
     DH4 = x25519_dh(EK_A_priv, OTK_B)        ┘

x3dh_respond (Bob):
  1. DH1 = x25519_dh(SPK_B_priv, IK_A)        ┐
     DH2 = x25519_dh(IK_B_priv, EK_A)         ├── 对称计算
     DH3 = x25519_dh(SPK_B_priv, EK_A)        │
     DH4 = x25519_dh(OTK_B_priv, EK_A)        ┘
```

### 4.4 栈上 DH 拼接 (零堆分配，零索引访问)

```rust
const DH_OUTPUT_LEN: usize = 32;
const MAX_DH_COUNT: usize = 4;
let mut dh_buffer = [0u8; DH_OUTPUT_LEN * MAX_DH_COUNT]; // 128 bytes 栈分配
let mut offset: usize = 0;

// 使用 dh_copy_to_stack 辅助函数，通过 .get_mut() 避免索引 panic
dh_copy_to_stack(&mut dh_buffer, &mut offset, &dh1)?;
dh_copy_to_stack(&mut dh_buffer, &mut offset, &dh2)?;
dh_copy_to_stack(&mut dh_buffer, &mut offset, &dh3)?;
if let Some(ref dh4) = dh4_opt {
    dh_copy_to_stack(&mut dh_buffer, &mut offset, dh4)?;
}

let root_key: [u8; 32] = hkdf_sha256::<32>(dh_buffer.get(..offset).ok_or(...)?, &X3DH_SALT, X3DH_INFO)?;
dh_buffer.zeroize();
```

---

## 5. Double Ratchet 引擎 (ratchet.rs)

### 5.1 敏感 newtype

```rust
#[derive(Zeroize, ZeroizeOnDrop)]
pub struct ChainKey(pub [u8; 32]);

#[derive(Zeroize, ZeroizeOnDrop)]
pub struct MessageKey(pub [u8; 32]);

impl From<MessageKey> for Aes256Key {
    fn from(mk: MessageKey) -> Self { Self(mk.0) }
}
// consuming conversion: MessageKey → 消费 → Aes256Key → 加密后 Drop → Zeroize
```

### 5.2 RatchetState（完整状态机）

```rust
#[derive(Serialize, Deserialize, Zeroize, ZeroizeOnDrop)]
pub struct RatchetState {
    pub root_key: RatchetRootKey,
    pub sending_chain_key: Option<ChainKey>,
    pub receiving_chain_key: Option<ChainKey>,
    pub send_counter: u32,
    pub receive_counter: u32,
    pub previous_counter: u32,
    pub dh_key_pair: X25519KeyPair,
    pub remote_public_key: Option<X25519PublicKey>,
    pub skipped_message_keys: SkippedKeyStore,
    // === 混入 AAD 防跨会话重放 ===
    // identity keys 在 AAD 中按 canonical ordering (lexicographic) 排列，
    // 而非 local || remote。原因参见 §5.4.5 AAD 构建。
    #[zeroize(skip)]
    pub local_identity_key: X25519PublicKey,
    #[zeroize(skip)]
    pub remote_identity_key: X25519PublicKey,
}
// 绝不导出 Clone。快照通过 export_state/restore_state (bincode)
```

### 5.3 SkippedKeyStore

```rust
#[derive(Zeroize, ZeroizeOnDrop)]
struct SkippedEntry {
    ratchet_public_key: X25519PublicKey,
    counter: u32,
    message_key: MessageKey,
}

#[derive(Zeroize, ZeroizeOnDrop)]
pub struct SkippedKeyStore(Vec<SkippedEntry>);

impl SkippedKeyStore {
    const MAX: usize = 2000;

    fn insert(&mut self, ...) -> Result<(), E2eeError> {
        if self.0.len() >= Self::MAX {
            self.0.remove(0);              // ← LRU 淘汰最老条目（保持时间顺序）
        }
        self.0.push(SkippedEntry { ... });
        Ok(())
    }

    fn remove(&mut self, pk: &X25519PublicKey, counter: u32) -> Option<MessageKey> {
        self.0.iter().position(|e| e.ratchet_public_key == *pk && e.counter == counter)
            .map(|pos| self.0.remove(pos).message_key)  // ← O(n) remove 保持顺序
    }
}
```

### 5.4 控制流

#### 5.4.1 常数

```rust
pub const MAX_SKIP: u32 = 2000;

// KDF info 标签
const INFO_ROOT_KEY:       &[u8] = b"RootKey";
const INFO_SENDING_CHAIN:  &[u8] = b"SendingChainKey";
const INFO_RECEIVING_CHAIN: &[u8] = b"ReceivingChainKey";
const INFO_MESSAGE_KEYS:   &[u8] = b"MessageKeys";
const INFO_CHAIN_KEYS:     &[u8] = b"ChainKeys";
```

#### 5.4.2 加密控制流

```
ratchet_encrypt(&mut state, plaintext) → Result<(RatchetHeader, Vec<u8>)>
  1. chain = state.sending_chain_key.take()?                 ← 消费所有权
  2. (msg_key, next_chain) = split_chain_key(chain)?         ← 旧 chain 被 consum
  3. nonce = generate_nonce()
  4. header = RatchetHeader { ratchet_public_key, counter, previous_counter, nonce }
  5. aad = build_ratchet_aad(local_ik, remote_ik, &header)  ← 104 bytes 栈分配
  6. aes_key = Aes256Key::from(msg_key)                      ← consuming conversion
  7. ciphertext = aes_gcm_encrypt(&aes_key, &nonce, plaintext, &aad)?
  8. state.sending_chain_key = Some(next_chain)
  9. state.send_counter += 1
  10. return (header, ciphertext)
  // aes_key, msg_key 析构 → ZeroizeOnDrop
```

#### 5.4.3 解密控制流

```
ratchet_decrypt(&mut state, header, ciphertext) → Result<Vec<u8>>
  1. counter = header.counter
  2. if counter.abs_diff(state.receive_counter) > MAX_SKIP → Err(CounterGapExceeded)
  2. 检查 skipped_message_keys 缓存 → 命中则直接解密返回
  3. first_remote_key = state.remote_public_key.is_none(); has_sent = send_counter > 0
  4. needs_ratchet: remote_pk.is_none() && has_sent → true (initial response);
     remote_pk != header.ratchet_public_key → true (DH step); else → false
  5. if needs_ratchet && counter > MAX_SKIP → Err(CounterGapExceeded)

  # 分支 A: DH ratchet
  6a. perform_dh_ratchet(state, header.ratchet_public_key, header.previous_counter)
      → 跳过旧远程密钥消息键 → DH1→receiving chain, DH2→sending chain
      → decrypt_with_current_chain(state, header, ciphertext)

  # 分支 B: 当前链
  6b. skip_message_keys(state, header.ratchet_public_key, counter)
      → 消费 chain key → split → decrypt
      → if first_remote_key: prepare_initial_response_ratchet
        (设置 remote_public_key, 重新生成 DH keypair, 派发新 sending chain)
```

#### 5.4.4 DH 棘轮步进

```
perform_dh_ratchet(state, remote_key) → Result<()>
  1. old_ik = state.dh_key_pair.public_key
  2. state.previous_counter = state.send_counter
  3. state.send_counter = 0; state.receive_counter = 0
  4. dh1 = x25519_dh(&state.dh_key_pair.private_key, remote_key)?
  5. (root, receiving_chain) = kdf_root_key(&state.root_key, &dh1, INFO_RECEIVING_CHAIN)?
  6. state.dh_key_pair = generate_x25519_keypair()  ← 旧 keypair Drop → Zeroize
  7. dh2 = x25519_dh(&state.dh_key_pair.private_key, remote_key)?
  8. (root, sending_chain) = kdf_root_key(&root, &dh2, INFO_SENDING_CHAIN)?
  9. state.root_key = root
  10. state.receiving_chain_key = Some(receiving_chain)
  11. state.sending_chain_key = Some(sending_chain)
  12. state.remote_public_key = Some(*remote_key)
```

#### 5.4.5 AAD 构建

```rust
// AAD = smaller_IK(32) || larger_IK(32) || ratchet_pub_key(32) || counter(4 BE) || previous_counter(4 BE)
// = 104 bytes，零堆分配，零索引访问
//
// 使用词法序 (lexicographic ordering) 而非 local || remote 顺序：
//   - 发送方和接收方对同一消息必须推导出相同的 AAD
//   - local/remote 角色天然互换——加密时我方是 local，解密时我方也是 local
//   - 若 AAD 使用 local||remote，双方 AAD 里的前 64 bytes 将互换，
//     解密方 AEAD 认证失败（AAD 不匹配）
//   - 改用 canonical ordering（min IK first）后，双方无需协商角色，
//     仅凭公开的 identity key 即可确定一致的 AAD
//   - 兼容影响：此约定是跨端互操作的必要条件，所有平台的实现
//     （Rust core、前端 TypeScript、移动端 FFI）必须遵守同一排序规则
fn build_ratchet_aad(
    local_id_key: &X25519PublicKey,
    remote_id_key: &X25519PublicKey,
    header: &RatchetHeader,
) -> [u8; 104];
```

### 5.5 RatchetHeader 与线格式编解码

```rust
pub struct RatchetHeader {
    pub ratchet_public_key: X25519PublicKey,
    pub counter: u32,
    pub previous_counter: u32,
    pub nonce: AesNonce,
}

// 显式 52-byte 线格式编解码（非 bincode，跨语言无歧义）
pub fn encode_ratchet_header(header: &RatchetHeader) -> [u8; 52];
pub fn decode_ratchet_header(bytes: &[u8]) -> Result<RatchetHeader, E2eeError>;
```

### 5.6 核心函数签名

```rust
pub fn init_sending_chain(
    root_key: &RatchetRootKey,
    local_identity_key: X25519PublicKey,
    remote_identity_key: X25519PublicKey,
) -> Result<RatchetState, E2eeError>;

pub fn init_receiving_chain(
    root_key: &RatchetRootKey,
    local_identity_key: X25519PublicKey,
    remote_identity_key: X25519PublicKey,
) -> Result<RatchetState, E2eeError>;

pub fn ratchet_encrypt(
    state: &mut RatchetState,
    plaintext: &[u8],
) -> Result<(RatchetHeader, Vec<u8>), E2eeError>;

pub fn ratchet_decrypt(
    state: &mut RatchetState,
    header: &RatchetHeader,
    ciphertext: &[u8],
) -> Result<Vec<u8>, E2eeError>;

pub fn try_export_state(state: &RatchetState) -> Result<Vec<u8>, E2eeError>;
// 兼容包装：序列化失败返回空 Vec（新代码应使用 try_export_state）
pub fn export_state(state: &RatchetState) -> Vec<u8>;
pub fn restore_state(bytes: &[u8]) -> Result<RatchetState, E2eeError>;
```

### 5.7 安全约束表

| 约束 | 实现方式 |
|------|----------|
| 链密钥不可重用 | `split_chain_key` 消费所有权 (move) |
| DH 私钥轮换时旧值擦除 | 赋值覆盖触发 Drop → Zeroize |
| 跳过密钥持有上限 | `SkippedKeyStore::MAX = 2000`, LRU 淘汰 |
| 恶意超大 counter 拒绝 | `counter - receive_counter > MAX_SKIP` → Err |
| Snapshot 不泄漏 | export_state 返回 bincode → 宿主加密后存入 MMKV/IndexedDB |
| AAD 防篡改 + 防跨会话 | 显式 104 bytes 编码绑定 Identity Keys (canonical ordering) |
| **无自动修复机制** | 解密失败即返回 Err，等待 DH 棘轮自愈 |

---

## 6. FFI 导出层 (e2ee-ffi + e2ee-wasm)

### 6.1 线格式（跨语言二进制契约）

```
┌──────────────────────────────────────────────────────────┐
│ header_len (4 bytes BE) │ bincode(RatchetHeader) 52 bytes │ AES-GCM ciphertext │
└──────────────────────────────────────────────────────────┘
```

**RatchetHeader 显式编码** (52 bytes，固定格式，非 bincode)：

通过 `encode_ratchet_header` / `decode_ratchet_header` 编解码：

| 偏移 | 长度 | 字段 | 编码 |
|------|------|------|------|
| 0 | 32 | `ratchet_public_key` | X25519 公钥，原始 32 bytes |
| 32 | 4 | `counter` | u32, Big-Endian |
| 36 | 4 | `previous_counter` | u32, Big-Endian |
| 40 | 12 | `nonce` | AES-GCM nonce, 原始 12 bytes |

**总计**：52 bytes。

`header_len` 前缀固定为 `0x00000034` (52 in BE)，保留用于向前兼容
（未来协议版本可改变 header 长度）。当前实现严格验证 `header_len == 52`，
不匹配则拒绝解密。

### 6.2 e2ee-ffi (UniFFI → Kotlin/Swift)

#### X25519 KeyPair Bincode 契约 (跨端互操作关键)

Host 端（Kotlin/Swift/JS）向 FFI 传入密钥对时使用 bincode 编码：

**Core format** (首选)：`bincode::serialize(&X25519KeyPair{..})` → `public_key(32) || private_key(32)`
与结构体字段声明顺序一致。

**Legacy format** (兼容回退)：`bincode::serialize(&(priv, pub))` → `private_key(32) || public_key(32)`
仅当 core format 解密失败后尝试。

**验证方式**：两种格式都通过 `x25519_dalek` 从私钥派生出公钥并比对，
因此损坏数据永远不会被接受。

**Ed25519 KeyPair** (用于签名密钥)：同样使用 bincode 序列化 `Ed25519KeyPair` 结构体，
字段顺序 `public_key(32) || private_key(32)`。

#### 错误类型

```rust
#[derive(Debug, thiserror::Error)]
pub enum SessionError {
    #[error("session not found: {0}")]
    SessionNotFound(String),
    #[error("session already exists: {0}")]
    SessionAlreadyExists(String),
    #[error("invalid session state data: {0}")]
    InvalidStateData(String),
    #[error("crypto error: {0}")]
    Crypto(String),
}

impl From<E2eeError> for SessionError {
    fn from(e: E2eeError) -> Self {
        match e {
            E2eeError::StateSerializationFailed
            | E2eeError::StateDeserializationFailed => {
                SessionError::InvalidStateData(e.to_string())
            }
            other => SessionError::Crypto(other.to_string()),
        }
    }
}
```

#### SessionManager（细粒度锁优化）

```rust
pub struct SessionManager {
    // RwLock 保护 session 集合的增删
    // 每个 session 内部有独立的 Mutex，不同 session 可并行加解密
    sessions: RwLock<HashMap<String, Mutex<RatchetState>>>,
}

#[uniffi::export]
impl SessionManager {
    #[uniffi::constructor]
    fn new() -> Self { ... }

    // Alice: 发起会话
    fn create_outbound_session(
        &self,
        session_id: String,
        identity_key_pair_bincode: Vec<u8>,
        remote_bundle_json: String,
    ) -> Result<Vec<u8>, SessionError>;
    // 返回: ephemeral_pk(32) || spk_id(4 BE) || otk_id(4 BE)
    // otk_id = 0xFFFFFFFF 表示未使用

    // Bob: 接受会话
    fn create_inbound_session(
        &self,
        session_id: String,
        identity_key_pair_bincode: Vec<u8>,
        signed_pre_key_pair_bincode: Vec<u8>,
        one_time_pre_key_pair_bincode: Option<Vec<u8>>,
        remote_identity_key_bytes: Vec<u8>,
        remote_ephemeral_key_bytes: Vec<u8>,
    ) -> Result<(), SessionError>;

    // 加密 (内部: ratchet_encrypt + 打包为线格式)
    fn encrypt(&self, session_id: String, plaintext: Vec<u8>) -> Result<Vec<u8>, SessionError>;

    // 解密 (内部: 解包线格式 + ratchet_decrypt)
    fn decrypt(&self, session_id: String, encrypted: Vec<u8>) -> Result<Vec<u8>, SessionError>;

    // 状态持久化
    fn export_session(&self, session_id: String) -> Result<Vec<u8>, SessionError>;
    fn restore_session(&self, session_id: String, state_bincode: Vec<u8>) -> Result<(), SessionError>;
    fn remove_session(&self, session_id: String);
}
```

### 6.3 e2ee-wasm (wasm-bindgen → Web)

```rust
#[wasm_bindgen]
pub struct WasmSessionManager {
    sessions: HashMap<String, RatchetState>,  // JS 单线程, 无锁
}

#[wasm_bindgen]
impl WasmSessionManager {
    #[wasm_bindgen(constructor)]
    pub fn new() -> Self { ... }

    // API 与 UniFFI 版本相同, 但使用 &mut self (无 Mutex)
    pub fn create_outbound_session(&mut self, ...) -> Result<Vec<u8>, JsValue>;
    pub fn create_inbound_session(&mut self, ...) -> Result<(), JsValue>;
    pub fn encrypt(&mut self, ...) -> Result<Vec<u8>, JsValue>;
    pub fn decrypt(&mut self, ...) -> Result<Vec<u8>, JsValue>;
    pub fn export_session(&self, ...) -> Result<Vec<u8>, JsValue>;
    pub fn restore_session(&mut self, ...) -> Result<(), JsValue>;
    pub fn remove_session(&mut self, session_id: String);
}
```

### 6.4 平台差异

| | e2ee-ffi (UniFFI) | e2ee-wasm (wasm-bindgen) |
|---|---|---|
| 并发模型 | `RwLock<HashMap<K, Mutex<RatchetState>>>` | `&mut self` (JS 单线程) |
| 复杂类型 | JSON 字符串 (PreKeyBundleFetch) | JSON 字符串 |
| 密钥对 | bincode `Vec<u8>` | bincode `Vec<u8>` |
| 错误 | `SessionError` enum → 平台原生异常 | `JsValue` → JS Error |
| 所有权 | UniFFI 管理指针 | JS GC 管理 |
| 跨 session 并行 | 支持 (细粒度锁) | N/A (单线程) |

---

## 7. 宿主集成规范

### 7.1 状态持久化契约

```
export_session → Vec<u8> (bincode) → 宿主加密 (KeyStore/Keychain) → 写入 MMKV/IndexedDB
restore_session ← Vec<u8> ← 宿主解密 ← 读取 MMKV/IndexedDB
```

### 7.2 批量处理优化

宿主在批量接收离线消息时：

1. 从存储解密 RaschetState → `restore_session()`
2. 在内存中连续调用 `decrypt()` (N 次), 不进行 IO
3. 批量处理结束后调用 `export_session()` → 加密 → 一次性落盘
4. App 挂起 (onPause) / 退到后台时, 同样只做一次落盘

### 7.3 服务端集成

`backend/api-server-rs/src/e2ee/` 模块需要更新：

| 文件 | 变更 |
|------|------|
| `key_api.rs` | PreKeyBundle 字段从 P-256 (65bytes) 切换到 X25519 (32bytes) |
| `session_api.rs` | 握手消息中的 EK/SPK_ID/OTK_ID 传递 |
| `group_api.rs` | (后续阶段) Sender Key 需要同步升级 |

### 7.4 宿主端调用示例

```kotlin
// Kotlin (Android)
val mgr = SessionManager()
val handshake = mgr.createOutboundSession(
    "private_1_2",
    identityBincode,
    remoteBundleJson
)
// 发送 handshake 给 Bob: bytes[0..32]=EK, bytes[32..36]=spk_id, bytes[36..40]=otk_id
val encrypted = mgr.encrypt("private_1_2", "hello".toByteArray())
mgr.exportSession("private_1_2")?.let { encryptedState ->
    keyStore.encrypt("session_private_1_2", encryptedState)
}
```

```swift
// Swift (iOS)
let mgr = SessionManager()
let state = mgr.exportSession(sessionId: "private_1_2")
// → 加密存入 Keychain
```

```js
// Web (WASM)
const mgr = new WasmSessionManager();
const state = mgr.export_session("private_1_2");
await indexedDB.put("sessions", state, "private_1_2");
```

---

## 8. 测试策略

### 8.1 单元测试体系

#### 层 1: 密码学原语 (primitives.rs)

| 测试用例 | 验证目标 |
|----------|----------|
| AES-GCM 加解密往返 | round-trip with random keys/nonces/plaintexts |
| AES-GCM 篡改 ciphertext 应失败 | AEAD 认证标签校验 |
| AES-GCM 错误 key 解密应失败 | 密钥隔离保证 |
| AES-GCM 空 plaintext / 大 plaintext (10MB) | 边界条件 |
| HKDF 输出长度正确 | `hkdf_sha256::<32>()` / `::<64>()` / `::<80>()` |
| HKDF 不同 salt/info 产生不同输出 | 派生独立性 |
| X25519 DH 两端计算一致 | 共享密钥相同 |
| X25519 DH 错误 key 产生不同结果 | 协商唯一性 |
| Ed25519 签名/验签往返 | round-trip sign → verify |
| Ed25519 错误签名应返回 Err | 防伪造 |
| 密钥生成无 panic (1000 次循环) | 随机源可靠性 |
| Newtype 不能互换 (编译期测试) | `compile_fail` doctest 或 trybuild |

#### 层 2: X3DH 协议 (x3dh.rs)

| 测试用例 | 验证目标 |
|----------|----------|
| Alice initiate + Bob respond→ 相同 RootKey | DH1-DH4 完全对称 |
| SPK-only (OTK=None) → 双方一致 | 降级路径正确 |
| OTK 存在 → 双方一致且 otk_id 匹配 | 完整 X3DH |
| SPK 签名伪造 → `SpkSignatureRejected` | 签名校验 |
| 不同身份密钥 → 不同 RootKey | 密钥唯一性 |
| KeyBundle 生成 → bundle 可 JSON 序列化 | 服务端上传格式 |
| OTK 数量 = 0/1/100 | 边界条件 |
| generate_key_bundle 零 OTK | 降级模式 |

#### 层 3: Double Ratchet (ratchet.rs)

| 测试用例 | 验证目标 |
|----------|----------|
| 加密 → 解密往返 (纯文本) | 正常流程 |
| 乱序消息: m2 m0 m1 顺序接收 | SkippedKeyStore 正确 |
| 篡改 AAD → 解密失败 | AEAD 上下文绑定 |
| 重复消息 → DuplicateOrExpired | 防重放 |
| Counter gap = MAX_SKIP → 成功 | 边界值 |
| Counter gap = MAX_SKIP + 1 → CounterGapExceeded | DoS 防御 |
| DH 棘轮步进后新旧消息共存 | 轮换正确 |
| SkippedKeyStore 超过 2000 条 → LRU 淘汰 | 内存边界 |
| export_state → restore_state → 加密 → 解密 | 序列化往返 |
| restore_state 损坏数据 → StateDeserializationFailed | 错误处理 |
| 连续 1000 条乱序消息 (fuzzing) | 压力测试 |
| Identity Keys 在 AAD 中 => 不同 IK 解密失败 | 跨会话防重放 |

#### 层 4: FFI 层 (e2ee-ffi / e2ee-wasm)

| 测试用例 | 验证目标 |
|----------|----------|
| create_outbound → encrypt → export → restore → decrypt | 全链路 |
| 2 个 session 并行加密 | 并发安全 (FFI) |
| SessionNotFound 错误传播 | 错误翻译 |
| InvalidStateData 反序列化损坏 | 错误检查 |
| WASM: 单线程正常流程 | wasm-bindgen 集成 |

### 8.2 兼容性测试 (WebCrypto 互操作)

使用 Rust 生成的密钥对，通过 E2EE 测试套件验证前端仍可正常通信（协议层 V2 标记）。

### 8.3 模糊测试 (Fuzzing)

- **ratchet_decrypt**: 随机 RatchetHeader + ciphertext 输入, 确保无 panic 无 OOM
- **restore_state**: 随机二进制数据 → 确保只返回 Err 而不 panic
- **aes_gcm_decrypt**: 随机 key/nonce/ciphertext → 确保不 panic

### 8.4 覆盖状态与待补充测试

**已实现测试 (~85 tests across 5 core modules + 2 FFI/WASM layers + integration):**

| 模块 | 测试数 | 状态 |
|------|--------|------|
| `errors.rs` | 3 (Display/format/equality) | ✅ |
| `primitives.rs` | 30+ (newtype, keygen, DH, sign/verify, HKDF, AES-GCM) | ✅ |
| `state.rs` | 13 (roundtrip, corrupted, skipped keys, LRU eviction, header encode/decode) | ✅ |
| `ratchet.rs` | 25+ (chain init, encrypt, decrypt, out-of-order, DH rotation, MAX_SKIP, stress 1000) | ✅ |
| `x3dh.rs` | 18+ (key bundle, OTK ids, SPK sig reject, SPK-only, full handshake, OTK mismatch, legacy compat) | ✅ |
| `tests/full_e2ee_flow.rs` | 3 (full flow, state persistence, multi-message DH) | ✅ |
| `e2ee-ffi` + `e2ee-wasm` | 35+ (SessionManager, wire format, error routing, bidirectional, multi-session) | ✅ |

**待补充测试：**

| 缺失项 | 优先级 | 说明 |
|--------|--------|------|
| Fuzzing: `ratchet_decrypt` 随机输入 | 高 | 确保 DecryptionFailed，无 panic/OOM |
| Fuzzing: `restore_state` 随机 bytes | 高 | 确保 StateDeserializationFailed，无 panic |
| trybuild/compile_fail: Newtype 不可互换 | 低 | 验证类型隔离在编译期生效 |
| WebCrypto 互操作 | 中 | Rust ↔ TypeScript engine 加解密互认 |
| Bench: 10000 消息加密吞吐 | 低 | 性能回归基线 |

### 8.5 CI 防线

```bash
cd backend && cargo test -p e2ee-core
cd backend && cargo clippy -p e2ee-core -- -D warnings
cd backend && cargo fmt --check
# AST 扫描: grep -rn "unsafe" backend/e2ee-core/src/ → 必须零结果
# grep -rn "unreachable!\|panic!\|unwrap()\|expect(" backend/e2ee-core/src/ → 必须零结果
```

---

## 9. 迁移路径

### 阶段 1: Rust 核心实现 (本设计范围)

- 实现 `e2ee-core` + `e2ee-ffi` + `e2ee-wasm`
- 所有单元测试 + 模糊测试通过
- CI 集成

### 阶段 2: 后端升级

- 更新 `api-server-rs/src/e2ee/key_api.rs` 支持 X25519 密钥格式
- 更新 `session_api.rs` 握手协议
- 部署 `e2ee-core` 同后端一起构建

### 阶段 3: 前端迁移

- Web: 引入 `e2ee-wasm` WASM 模块, 替换 `shared-e2ee-core` import
- Mobile: 引入 `e2ee-ffi` Native 模块, 替换 `shared-e2ee-core` import
- 协议版本字段 `e2ee_protocol_version = 2` 切换到 Rust 实现

### 阶段 4: 清理

- 删除 `frontend/packages/shared-e2ee-core/` (TypeScript P-256 旧实现)
- 删除各前端 app 中的旧 E2EE engine 代码

---

## 附录: E2eeError 完整枚举

```rust
#[derive(Error, Debug, PartialEq, Eq)]
pub enum E2eeError {
    // === 加密 ===
    #[error("AES-GCM encryption failed")]
    EncryptionFailed,
    #[error("AES-GCM decryption failed: authentication tag mismatch or corrupted data")]
    DecryptionFailed,

    // === 密钥 ===
    #[error("HKDF expand operation failed")]
    HkdfExpandFailed,
    #[error("invalid X25519 public key")]
    InvalidPublicKey,
    #[error("invalid Ed25519 signature")]
    InvalidSignature,
    #[error("Ed25519 signature mismatch")]
    SignatureMismatch,

    // === X3DH ===
    #[error("X3DH: signed pre-key signature verification rejected")]
    SpkSignatureRejected,
    #[error("invalid pre-key id: {0}")]
    InvalidPreKeyId(String),

    // === Ratchet ===
    #[error("sending chain not initialized")]
    SendingChainNotInitialized,
    #[error("receiving chain not initialized")]
    ReceivingChainNotInitialized,
    #[error("counter gap {0} exceeds max skip {1}")]
    CounterGapExceeded(u32, u32),
    #[error("duplicate or expired message")]
    DuplicateOrExpiredMessage,
    #[error("invalid counter: {0}")]
    InvalidCounter(String),
    #[error("max skipped message keys limit reached")]
    MaxSkippedKeysExceeded,

    // === 序列化 ===
    #[error("ratchet state serialization failed")]
    StateSerializationFailed,
    #[error("ratchet state deserialization failed: corrupted data")]
    StateDeserializationFailed,

    // === 线格式 ===
    #[error("invalid header format: {0}")]
    InvalidHeader(String),
}
```

---

**文档版本**: 1.1
**最后更新**: 2026-05-19
**变更**: 同步实现期修复 (canonical AAD, OTK id, wire format, keypair bincode contract)
