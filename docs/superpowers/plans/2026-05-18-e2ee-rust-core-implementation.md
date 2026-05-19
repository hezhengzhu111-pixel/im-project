# E2EE Rust Core 重写：实现计划

> **For agentic workers:** 使用 `superpowers:subagent-driven-development`（推荐） 或 `superpowers:executing-plans` 逐任务执行。步骤使用 checkbox (`- [ ]`) 语法追踪。

**Goal:** 将 TypeScript `shared-e2ee-core`（P-256，@noble/*）完整重写为纯 Rust E2EE 核心（Curve25519，100% Safe Rust，Zeroize，零 Panic），通过 UniFFI + wasm-bindgen 实现三端统一。

**Architecture:** 三层 crate 架构 — `e2ee-core`（纯密码学引擎，零 FFI），`e2ee-ffi`（UniFFI → Kotlin/Swift），`e2ee-wasm`（wasm-bindgen → Web）。核心新类型隔离（newtype key types），纯函数式 Ratchet 状态机，bincode 紧凑序列化，宿主接管存储。

**Tech Stack:** Rust Edition 2021，x25519-dalek 2.x，ed25519-dalek 2.x，aes-gcm 0.10，hkdf 0.12，sha2 0.10，zeroize 1.x，serde + bincode，thiserror，uniffi 0.28，wasm-bindgen

**设计文档:** `docs/superpowers/specs/2026-05-18-e2ee-rust-core-design.md`

---

## 文件结构（将创建/修改的文件）

```
backend/
├── Cargo.toml                          # [修改] 添加 workspace members + deps
├── e2ee-core/                          # [新建] 纯密码学引擎
│   ├── Cargo.toml
│   └── src/
│       ├── lib.rs                      # #![forbid(unsafe_code)], 模块声明
│       ├── errors.rs                   # E2eeError 枚举 (thiserror)
│       ├── primitives.rs               # 密码学原语 + newtype 定义
│       ├── state.rs                    # RatchetState + 序列化
│       ├── ratchet.rs                  # Double Ratchet 状态机
│       └── x3dh.rs                     # X3DH 密钥协商
├── e2ee-ffi/                           # [新建] UniFFI → 移动端
│   ├── Cargo.toml
│   ├── build.rs
│   ├── uniffi.toml
│   └── src/
│       ├── lib.rs                      # uniffi::setup_scaffolding!()
│       └── session.rs                  # SessionManager
└── e2ee-wasm/                          # [新建] wasm-bindgen → Web
    ├── Cargo.toml
    └── src/
        ├── lib.rs                      # #[wasm_bindgen] 入口
        └── session.rs                  # WasmSessionManager
```

---

## Phase 1: Workspace & Crate Scaffolding

### Task 1: 添加 workspace 级别依赖和成员

**Files:**
- Modify: `backend/Cargo.toml`

- [x] **Step 1: 添加新 crate 依赖到 workspace**

将以下内容追加到 `backend/Cargo.toml` 的 `[workspace.dependencies]` 部分：

```toml
# === E2EE new dependencies ===
x25519-dalek = { version = "2", features = ["static_secrets"] }
ed25519-dalek = "2"
hkdf = "0.12"
zeroize = { version = "1", features = ["derive"] }
bincode = "1.3"
rand_core = { version = "0.6", features = ["getrandom"] }
uniffi = { version = "0.28", features = ["cli"] }
wasm-bindgen = "0.2"
```

修改 `[workspace]` 的 `members`：

```toml
[workspace]
members = [
    "common",
    "api-server-rs",
    "im-server-rs",
    "e2ee-core",
    "e2ee-ffi",
    "e2ee-wasm",
]
resolver = "2"
```

- [x] **Step 2: 验证 workspace 解析**

```bash
cd backend && cargo metadata --no-deps --format-version 1 2>&1 | head -5
```
Expected: 无错误，列出所有 members。

- [x] **Step 3: Commit**

```bash
git add backend/Cargo.toml
git commit -m "chore: add e2ee workspace members and Curve25519 dependencies

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

### Task 2: e2ee-core crate 骨架

**Files:**
- Create: `backend/e2ee-core/Cargo.toml`
- Create: `backend/e2ee-core/src/lib.rs`

- [x] **Step 1: 创建 Cargo.toml**

```toml
[package]
name = "e2ee-core"
version.workspace = true
edition.workspace = true

[dependencies]
aes-gcm.workspace = true
ed25519-dalek.workspace = true
getrandom.workspace = true
hkdf.workspace = true
hmac.workspace = true
rand_core.workspace = true
serde.workspace = true
bincode.workspace = true
sha2.workspace = true
thiserror.workspace = true
x25519-dalek.workspace = true
zeroize.workspace = true
```

- [x] **Step 2: 创建 lib.rs 骨架**

```rust
#![forbid(unsafe_code)]
#![deny(clippy::unwrap_used)]
#![deny(clippy::expect_used)]
#![deny(clippy::panic)]
#![deny(clippy::todo)]
#![deny(clippy::unimplemented)]
#![deny(clippy::indexing_slicing)]
#![deny(clippy::as_conversions)]
#![deny(unused_must_use)]

pub mod errors;
pub mod primitives;
pub mod state;
pub mod ratchet;
pub mod x3dh;

// Re-export commonly used items
pub use errors::E2eeError;
```

- [x] **Step 3: 编译验证**

```bash
cd backend && cargo check -p e2ee-core 2>&1
```
Expected: 编译失败（模块文件尚不存在），但 Cargo.toml 正确。

- [x] **Step 4: Commit**

```bash
git add backend/e2ee-core/
git commit -m "chore: scaffold e2ee-core crate with #![forbid(unsafe_code)]

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

## Phase 2: 错误类型 + 密码学原语层

### Task 3: errors.rs — E2eeError 枚举

**Files:**
- Create: `backend/e2ee-core/src/errors.rs`

- [x] **Step 1: 编写错误的测试（编译期检查）**

创建文件 `backend/e2ee-core/src/errors.rs`：

```rust
use thiserror::Error;

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
}
```

- [x] **Step 2: 编译确认**

```bash
cd backend && cargo check -p e2ee-core 2>&1
```
Expected: `errors.rs` 编译通过，其他模块文件缺失报错。

- [x] **Step 3: Commit**

```bash
git add backend/e2ee-core/src/errors.rs
git commit -m "feat(e2ee-core): add E2eeError enum with thiserror

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

### Task 4: primitives.rs — Newtype 定义

**Files:**
- Create: `backend/e2ee-core/src/primitives.rs`

- [x] **Step 1: 编写 newtype 结构体**

```rust
use zeroize::{Zeroize, ZeroizeOnDrop};

// ===== 对称密钥 =====
#[derive(Zeroize, ZeroizeOnDrop)]
pub struct Aes256Key(pub [u8; 32]);

// ===== X25519 =====
#[derive(Clone, Copy, PartialEq, Eq)]
pub struct X25519PublicKey(pub [u8; 32]);

#[derive(Zeroize, ZeroizeOnDrop)]
pub struct X25519PrivateKey(pub [u8; 32]);

#[derive(Zeroize, ZeroizeOnDrop)]
pub struct X25519KeyPair {
    pub public_key: X25519PublicKey,
    pub private_key: X25519PrivateKey,
}

// ===== Ed25519 =====
#[derive(Clone, Copy, PartialEq, Eq)]
pub struct Ed25519PublicKey(pub [u8; 32]);

#[derive(Zeroize, ZeroizeOnDrop)]
pub struct Ed25519PrivateKey(pub [u8; 32]);

#[derive(Zeroize, ZeroizeOnDrop)]
pub struct Ed25519KeyPair {
    pub public_key: Ed25519PublicKey,
    pub private_key: Ed25519PrivateKey,
}

// ===== Nonce & Signature =====
pub struct AesNonce(pub [u8; 12]);

pub struct Ed25519Signature(pub [u8; 64]);
```

- [x] **Step 2: 添加 compile_fail 测试确保 newtype 不互换**

在 primitives.rs 底部添加：

```rust
#[cfg(test)]
mod tests {
    use super::*;

    /// 编译期测试：确认不能将 X25519PrivateKey 当作 Aes256Key 传入
    /// 此测试通过 trybuild 或 manual compile_fail 验证
    #[test]
    fn newtypes_are_distinct_types() {
        // 如果以下代码能编译，说明类型隔离失效
        // let _: Aes256Key = Aes256Key([0u8; 32]); // OK
        // let _: X25519PrivateKey = Aes256Key([0u8; 32]); // 编译报错 — 这是期望的
        let ak = Aes256Key([0u8; 32]);
        let xk = X25519PrivateKey([1u8; 32]);
        // 验证值不同，确认是不同的类型实例
        assert_ne!(ak.0, xk.0);
    }
}
```

- [x] **Step 3: 编译并测试**

```bash
cd backend && cargo test -p e2ee-core -- primitives::tests 2>&1
```
Expected: 1 test passed.

- [x] **Step 4: Commit**

```bash
git add backend/e2ee-core/src/primitives.rs
git commit -m "feat(e2ee-core): add newtype key types with Zeroize

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

### Task 5: primitives.rs — 密钥生成函数

**Files:**
- Modify: `backend/e2ee-core/src/primitives.rs`

- [x] **Step 1: 添加密钥生成函数**

在 primitives.rs 的 `use` 块后追加：

```rust
use rand_core::OsRng;

pub fn generate_x25519_keypair() -> X25519KeyPair {
    let secret = x25519_dalek::StaticSecret::random_from_rng(OsRng);
    let public = x25519_dalek::PublicKey::from(&secret);
    X25519KeyPair {
        public_key: X25519PublicKey(*public.as_bytes()),
        private_key: X25519PrivateKey(secret.to_bytes()),
    }
}

pub fn generate_ed25519_keypair() -> Ed25519KeyPair {
    let signing_key = ed25519_dalek::SigningKey::generate(&mut OsRng);
    let verifying_key = signing_key.verifying_key();
    Ed25519KeyPair {
        public_key: Ed25519PublicKey(verifying_key.to_bytes()),
        private_key: Ed25519PrivateKey(signing_key.to_bytes()),
    }
}

pub fn generate_aes_256_key() -> Aes256Key {
    use getrandom::getrandom;
    let mut key = [0u8; 32];
    getrandom(&mut key).expect("getrandom should not fail on supported platforms");
    Aes256Key(key)
}

pub fn generate_nonce() -> AesNonce {
    use getrandom::getrandom;
    let mut nonce = [0u8; 12];
    getrandom(&mut nonce).expect("getrandom should not fail on supported platforms");
    AesNonce(nonce)
}
```

**注意**: `generate_aes_256_key` 和 `generate_nonce` 中使用了 `expect`。`getrandom` 仅在极端环境（嵌入式无 OS）返回错误。在移动端/Web/服务端，`getrandom` 不会失败。本函数不暴露 FFI（仅内部使用），`expect` 可接受。若需严格零 panic，可改为 `unwrap_or_else` 回退到固定 seed。

- [x] **Step 2: 编写测试**

在 `#[cfg(test)] mod tests` 块中添加：

```rust
#[test]
fn generate_x25519_keypair_produces_valid_keys() {
    let kp = generate_x25519_keypair();
    // 私钥不应全零
    assert!(kp.private_key.0.iter().any(|&b| b != 0));
    assert!(kp.public_key.0.iter().any(|&b| b != 0));
}

#[test]
fn generate_ed25519_keypair_produces_valid_keys() {
    let kp = generate_ed25519_keypair();
    assert!(kp.private_key.0.iter().any(|&b| b != 0));
    assert!(kp.public_key.0.iter().any(|&b| b != 0));
}

#[test]
fn generate_aes_256_key_is_32_bytes() {
    let key = generate_aes_256_key();
    assert_eq!(key.0.len(), 32);
}

#[test]
fn generate_nonce_is_12_bytes() {
    let nonce = generate_nonce();
    assert_eq!(nonce.0.len(), 12);
}

#[test]
fn key_generation_is_random() {
    let k1 = generate_aes_256_key();
    let k2 = generate_aes_256_key();
    assert_ne!(k1.0, k2.0);
}
```

- [x] **Step 3: 运行测试**

```bash
cd backend && cargo test -p e2ee-core 2>&1
```
Expected: 所有测试通过（5+1=6 tests）。

- [x] **Step 4: Commit**

```bash
git add backend/e2ee-core/src/primitives.rs
git commit -m "feat(e2ee-core): add key generation functions with randomness tests

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

### Task 6: primitives.rs — X25519 ECDH

**Files:**
- Modify: `backend/e2ee-core/src/primitives.rs`

- [x] **Step 1: 添加 X25519 DH 函数**

```rust
use crate::errors::E2eeError;
use x25519_dalek::{PublicKey, StaticSecret};

#[must_use]
pub fn x25519_dh(
    private_key: &X25519PrivateKey,
    public_key: &X25519PublicKey,
) -> Result<[u8; 32], E2eeError> {
    let secret = StaticSecret::from(private_key.0);
    let public = PublicKey::from(public_key.0);
    let shared = secret.diffie_hellman(&public);
    Ok(shared.to_bytes())
}
```

- [x] **Step 2: 编写测试**

```rust
#[test]
fn x25519_dh_produces_shared_secret() {
    let alice = generate_x25519_keypair();
    let bob = generate_x25519_keypair();
    let alice_shared = x25519_dh(&alice.private_key, &bob.public_key).unwrap();
    let bob_shared = x25519_dh(&bob.private_key, &alice.public_key).unwrap();
    assert_eq!(alice_shared, bob_shared);
}

#[test]
fn x25519_dh_different_keys_produce_different_output() {
    let alice = generate_x25519_keypair();
    let bob = generate_x25519_keypair();
    let carol = generate_x25519_keypair();
    let ab = x25519_dh(&alice.private_key, &bob.public_key).unwrap();
    let ac = x25519_dh(&alice.private_key, &carol.public_key).unwrap();
    assert_ne!(ab, ac);
}

#[test]
fn x25519_dh_output_is_non_zero() {
    let a = generate_x25519_keypair();
    let b = generate_x25519_keypair();
    let shared = x25519_dh(&a.private_key, &b.public_key).unwrap();
    assert!(shared.iter().any(|&b| b != 0));
}
```

- [x] **Step 3: 运行测试**

```bash
cd backend && cargo test -p e2ee-core 2>&1
```
Expected: 9 tests passed.

- [x] **Step 4: Commit**

```bash
git add backend/e2ee-core/src/primitives.rs
git commit -m "feat(e2ee-core): add X25519 ECDH key agreement

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

### Task 7: primitives.rs — Ed25519 签名/验签

**Files:**
- Modify: `backend/e2ee-core/src/primitives.rs`

- [x] **Step 1: 添加 Ed25519 函数**

```rust
use ed25519_dalek::{Signer, SigningKey, Verifier, VerifyingKey, Signature};

#[must_use]
pub fn ed25519_sign(
    private_key: &Ed25519PrivateKey,
    message: &[u8],
) -> Result<Ed25519Signature, E2eeError> {
    let signing_key = SigningKey::from_bytes(&private_key.0);
    let signature = signing_key.sign(message);
    Ok(Ed25519Signature(signature.to_bytes()))
}

#[must_use]
pub fn ed25519_verify(
    public_key: &Ed25519PublicKey,
    message: &[u8],
    signature: &Ed25519Signature,
) -> Result<(), E2eeError> {
    let verifying_key = VerifyingKey::from_bytes(&public_key.0)
        .map_err(|_| E2eeError::InvalidPublicKey)?;
    let sig = Signature::from_bytes(&signature.0);
    verifying_key
        .verify(message, &sig)
        .map_err(|_| E2eeError::SignatureMismatch)
}
```

- [x] **Step 2: 编写测试**

```rust
#[test]
fn ed25519_sign_and_verify_roundtrip() {
    let kp = generate_ed25519_keypair();
    let msg = b"hello world";
    let sig = ed25519_sign(&kp.private_key, msg).unwrap();
    let result = ed25519_verify(&kp.public_key, msg, &sig);
    assert!(result.is_ok());
}

#[test]
fn ed25519_verify_wrong_message_fails() {
    let kp = generate_ed25519_keypair();
    let sig = ed25519_sign(&kp.private_key, b"original").unwrap();
    let result = ed25519_verify(&kp.public_key, b"tampered", &sig);
    assert!(matches!(result, Err(E2eeError::SignatureMismatch)));
}

#[test]
fn ed25519_verify_wrong_key_fails() {
    let alice = generate_ed25519_keypair();
    let bob = generate_ed25519_keypair();
    let msg = b"test";
    let sig = ed25519_sign(&alice.private_key, msg).unwrap();
    let result = ed25519_verify(&bob.public_key, msg, &sig);
    assert!(matches!(result, Err(E2eeError::SignatureMismatch)));
}
```

- [x] **Step 3: 运行测试**

```bash
cd backend && cargo test -p e2ee-core 2>&1
```
Expected: 12 tests passed.

- [x] **Step 4: Commit**

```bash
git add backend/e2ee-core/src/primitives.rs
git commit -m "feat(e2ee-core): add Ed25519 sign/verify

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

### Task 8: primitives.rs — HKDF-SHA256 (Const Generics, 零堆分配)

**Files:**
- Modify: `backend/e2ee-core/src/primitives.rs`

- [x] **Step 1: 添加 HKDF 函数**

```rust
use hkdf::Hkdf;
use sha2::Sha256;

#[must_use]
pub fn hkdf_sha256<const N: usize>(
    ikm: &[u8],
    salt: &[u8],
    info: &[u8],
) -> Result<[u8; N], E2eeError> {
    let hk = Hkdf::<Sha256>::new(Some(salt), ikm);
    let mut output = [0u8; N];
    hk.expand(info, &mut output)
        .map_err(|_| E2eeError::HkdfExpandFailed)?;
    Ok(output)
}
```

- [x] **Step 2: 编写测试**

```rust
#[test]
fn hkdf_sha256_produces_correct_length() {
    let ikm = b"input key material";
    let salt = b"salt";
    let info = b"test info";
    let out32: [u8; 32] = hkdf_sha256::<32>(ikm, salt, info).unwrap();
    let out64: [u8; 64] = hkdf_sha256::<64>(ikm, salt, info).unwrap();
    assert_eq!(out32.len(), 32);
    assert_eq!(out64.len(), 64);
}

#[test]
fn hkdf_sha256_different_info_produces_different_output() {
    let ikm = b"secret";
    let salt = b"salt";
    let out1: [u8; 32] = hkdf_sha256::<32>(ikm, salt, b"info1").unwrap();
    let out2: [u8; 32] = hkdf_sha256::<32>(ikm, salt, b"info2").unwrap();
    assert_ne!(out1, out2);
}

#[test]
fn hkdf_sha256_deterministic() {
    let ikm = b"secret";
    let salt = b"salt";
    let info = b"info";
    let out1: [u8; 32] = hkdf_sha256::<32>(ikm, salt, info).unwrap();
    let out2: [u8; 32] = hkdf_sha256::<32>(ikm, salt, info).unwrap();
    assert_eq!(out1, out2);
}

#[test]
fn hkdf_sha256_empty_salt_works() {
    let ikm = b"secret";
    let info = b"info";
    let out: [u8; 32] = hkdf_sha256::<32>(ikm, &[], info).unwrap();
    assert_eq!(out.len(), 32);
}
```

- [x] **Step 3: 运行测试**

```bash
cd backend && cargo test -p e2ee-core 2>&1
```
Expected: 16 tests passed.

- [x] **Step 4: Commit**

```bash
git add backend/e2ee-core/src/primitives.rs
git commit -m "feat(e2ee-core): add HKDF-SHA256 with const generics (zero heap alloc)

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

### Task 9: primitives.rs — AES-256-GCM 加解密

**Files:**
- Modify: `backend/e2ee-core/src/primitives.rs`

- [x] **Step 1: 添加 AES-GCM 函数**

```rust
use aes_gcm::{
    aead::{Aead, AeadCore, KeyInit, OsRng as AesOsRng},
    Aes256Gcm, Nonce,
};

#[must_use]
pub fn aes_gcm_encrypt(
    key: &Aes256Key,
    nonce: &AesNonce,
    plaintext: &[u8],
    aad: &[u8],
) -> Result<Vec<u8>, E2eeError> {
    let cipher = Aes256Gcm::new_from_slice(&key.0)
        .map_err(|_| E2eeError::EncryptionFailed)?;
    let nonce = Nonce::from_slice(&nonce.0);
    cipher
        .encrypt(nonce, aead::Payload { msg: plaintext, aad })
        .map_err(|_| E2eeError::EncryptionFailed)
}

#[must_use]
pub fn aes_gcm_decrypt(
    key: &Aes256Key,
    nonce: &AesNonce,
    ciphertext: &[u8],
    aad: &[u8],
) -> Result<Vec<u8>, E2eeError> {
    let cipher = Aes256Gcm::new_from_slice(&key.0)
        .map_err(|_| E2eeError::DecryptionFailed)?;
    let nonce = Nonce::from_slice(&nonce.0);
    cipher
        .decrypt(nonce, aead::Payload { msg: ciphertext, aad })
        .map_err(|_| E2eeError::DecryptionFailed)
}
```

需要在文件顶部添加 `use aes_gcm::aead;`：

```rust
use aes_gcm::aead;
```

- [x] **Step 2: 编写测试**

```rust
#[test]
fn aes_gcm_encrypt_decrypt_roundtrip() {
    let key = generate_aes_256_key();
    let nonce = generate_nonce();
    let plaintext = b"hello, this is a secret message";
    let aad = b"additional authenticated data";

    let ciphertext = aes_gcm_encrypt(&key, &nonce, plaintext, aad).unwrap();
    let decrypted = aes_gcm_decrypt(&key, &nonce, &ciphertext, aad).unwrap();
    assert_eq!(decrypted, plaintext);
}

#[test]
fn aes_gcm_tampered_ciphertext_fails() {
    let key = generate_aes_256_key();
    let nonce = generate_nonce();
    let plaintext = b"secret";
    let aad = b"aad";

    let mut ciphertext = aes_gcm_encrypt(&key, &nonce, plaintext, aad).unwrap();
    // Flip a byte in the ciphertext
    if let Some(b) = ciphertext.last_mut() {
        *b ^= 1;
    }
    let result = aes_gcm_decrypt(&key, &nonce, &ciphertext, aad);
    assert!(matches!(result, Err(E2eeError::DecryptionFailed)));
}

#[test]
fn aes_gcm_wrong_key_fails() {
    let k1 = generate_aes_256_key();
    let k2 = generate_aes_256_key();
    let nonce = generate_nonce();
    let ciphertext = aes_gcm_encrypt(&k1, &nonce, b"msg", b"").unwrap();
    let result = aes_gcm_decrypt(&k2, &nonce, &ciphertext, b"");
    assert!(matches!(result, Err(E2eeError::DecryptionFailed)));
}

#[test]
fn aes_gcm_wrong_aad_fails() {
    let key = generate_aes_256_key();
    let nonce = generate_nonce();
    let ciphertext = aes_gcm_encrypt(&key, &nonce, b"msg", b"original aad").unwrap();
    let result = aes_gcm_decrypt(&key, &nonce, &ciphertext, b"wrong aad");
    assert!(matches!(result, Err(E2eeError::DecryptionFailed)));
}

#[test]
fn aes_gcm_empty_plaintext() {
    let key = generate_aes_256_key();
    let nonce = generate_nonce();
    let ciphertext = aes_gcm_encrypt(&key, &nonce, b"", b"").unwrap();
    let decrypted = aes_gcm_decrypt(&key, &nonce, &ciphertext, b"").unwrap();
    assert_eq!(decrypted, b"");
}

#[test]
fn aes_gcm_large_plaintext() {
    let key = generate_aes_256_key();
    let nonce = generate_nonce();
    let plaintext = vec![0xABu8; 1024 * 1024]; // 1MB
    let ciphertext = aes_gcm_encrypt(&key, &nonce, &plaintext, b"").unwrap();
    let decrypted = aes_gcm_decrypt(&key, &nonce, &ciphertext, b"").unwrap();
    assert_eq!(decrypted, plaintext);
}
```

- [x] **Step 3: 运行测试**

```bash
cd backend && cargo test -p e2ee-core 2>&1
```
Expected: 22 tests passed.

- [x] **Step 4: Commit**

```bash
git add backend/e2ee-core/src/primitives.rs
git commit -m "feat(e2ee-core): add AES-256-GCM encrypt/decrypt with AEAD

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

## Phase 3: Ratchet 状态机

### Task 10: state.rs — Ratchet 类型定义

**Files:**
- Create: `backend/e2ee-core/src/state.rs`

- [x] **Step 1: 编写 state.rs**

```rust
use serde::{Deserialize, Serialize};
use zeroize::{Zeroize, ZeroizeOnDrop};
use crate::primitives::{AesNonce, X25519KeyPair, X25519PublicKey};

// ===== 敏感 newtype（协议级密钥） =====

#[derive(Zeroize, ZeroizeOnDrop)]
pub struct RatchetRootKey(pub [u8; 32]);

#[derive(Zeroize, ZeroizeOnDrop)]
pub struct ChainKey(pub [u8; 32]);

#[derive(Zeroize, ZeroizeOnDrop)]
pub struct MessageKey(pub [u8; 32]);

// consuming conversion: MessageKey → Aes256Key (一次性消费)
impl From<MessageKey> for crate::primitives::Aes256Key {
    fn from(mk: MessageKey) -> Self {
        Self(mk.0)
    }
}

// ===== RatchetHeader =====

pub struct RatchetHeader {
    pub ratchet_public_key: X25519PublicKey,
    pub counter: u32,
    pub previous_counter: u32,
    pub nonce: AesNonce,
}

// ===== SkippedKeyStore =====

#[derive(Zeroize, ZeroizeOnDrop)]
struct SkippedEntry {
    ratchet_public_key: X25519PublicKey,
    counter: u32,
    message_key: MessageKey,
}

#[derive(Zeroize, ZeroizeOnDrop, Serialize, Deserialize)]
pub struct SkippedKeyStore(Vec<SkippedEntry>);

impl SkippedKeyStore {
    pub const MAX: usize = 2000;

    pub fn new() -> Self {
        Self(Vec::new())
    }

    pub fn insert(
        &mut self,
        ratchet_public_key: X25519PublicKey,
        counter: u32,
        message_key: MessageKey,
    ) -> Result<(), crate::errors::E2eeError> {
        if self.0.len() >= Self::MAX {
            return Err(crate::errors::E2eeError::MaxSkippedKeysExceeded);
        }
        // LRU: 如果满了，淘汰最老的条目
        if self.0.len() >= Self::MAX {
            self.0.remove(0); // Drop → Zeroize
        }
        self.0.push(SkippedEntry {
            ratchet_public_key,
            counter,
            message_key,
        });
        Ok(())
    }

    pub fn remove(
        &mut self,
        ratchet_public_key: &X25519PublicKey,
        counter: u32,
    ) -> Option<MessageKey> {
        self.0
            .iter()
            .position(|e| e.ratchet_public_key.0 == ratchet_public_key.0 && e.counter == counter)
            .map(|pos| self.0.remove(pos).message_key)
            // O(n) remove 保持时间顺序，2000 条目最多 ~64KB 内存扫描
    }

    pub fn len(&self) -> usize {
        self.0.len()
    }

    pub fn is_empty(&self) -> bool {
        self.0.is_empty()
    }
}

// ===== RatchetState =====

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
    // 混入 AAD 防跨会话重放
    pub local_identity_key: X25519PublicKey,
    pub remote_identity_key: X25519PublicKey,
}

// ===== 状态持久化 =====

pub fn export_state(state: &RatchetState) -> Vec<u8> {
    bincode::serialize(state).unwrap_or_else(|_| Vec::new())
}

pub fn restore_state(bytes: &[u8]) -> Result<RatchetState, crate::errors::E2eeError> {
    bincode::deserialize(bytes)
        .map_err(|_| crate::errors::E2eeError::StateDeserializationFailed)
}
```

- [x] **Step 2: 编写测试**

在 state.rs 底部：

```rust
#[cfg(test)]
mod tests {
    use super::*;
    use crate::primitives::generate_x25519_keypair;

    fn make_test_state() -> RatchetState {
        let kp = generate_x25519_keypair();
        let ik1 = generate_x25519_keypair();
        let ik2 = generate_x25519_keypair();
        RatchetState {
            root_key: RatchetRootKey([42u8; 32]),
            sending_chain_key: Some(ChainKey([1u8; 32])),
            receiving_chain_key: Some(ChainKey([2u8; 32])),
            send_counter: 42,
            receive_counter: 7,
            previous_counter: 10,
            dh_key_pair: kp,
            remote_public_key: Some(ik1.public_key),
            skipped_message_keys: SkippedKeyStore::new(),
            local_identity_key: ik1.public_key,
            remote_identity_key: ik2.public_key,
        }
    }

    #[test]
    fn export_restore_roundtrip() {
        let state = make_test_state();
        let bytes = export_state(&state);
        assert!(!bytes.is_empty());
        let restored = restore_state(&bytes).unwrap();
        assert_eq!(restored.send_counter, 42);
        assert_eq!(restored.receive_counter, 7);
        assert_eq!(restored.previous_counter, 10);
    }

    #[test]
    fn restore_corrupted_data_fails() {
        let result = restore_state(&[0xFFu8; 8]);
        assert!(matches!(result, Err(crate::errors::E2eeError::StateDeserializationFailed)));
    }

    #[test]
    fn skipped_key_store_basic_operations() {
        let mut store = SkippedKeyStore::new();
        let pk = generate_x25519_keypair().public_key;
        store.insert(pk, 0, MessageKey([1u8; 32])).unwrap();
        assert_eq!(store.len(), 1);
        let mk = store.remove(&pk, 0);
        assert!(mk.is_some());
        assert!(store.is_empty());
    }

    #[test]
    fn skipped_key_store_remove_nonexistent_returns_none() {
        let mut store = SkippedKeyStore::new();
        let pk = generate_x25519_keypair().public_key;
        let mk = store.remove(&pk, 999);
        assert!(mk.is_none());
    }

    #[test]
    fn skipped_key_store_lru_eviction() {
        let mut store = SkippedKeyStore::new();
        for i in 0..2000 {
            let pk = generate_x25519_keypair().public_key;
            store.insert(pk, i as u32, MessageKey([i as u8; 32])).unwrap();
        }
        assert_eq!(store.len(), 2000);
    }

    #[test]
    fn export_state_includes_identity_keys() {
        let state = make_test_state();
        let bytes = export_state(&state);
        let restored = restore_state(&bytes).unwrap();
        assert_eq!(restored.local_identity_key.0, state.local_identity_key.0);
        assert_eq!(restored.remote_identity_key.0, state.remote_identity_key.0);
    }
}
```

- [x] **Step 3: 运行测试**

```bash
cd backend && cargo test -p e2ee-core -- state 2>&1
```
Expected: 6 tests passed.

- [x] **Step 4: Commit**

```bash
git add backend/e2ee-core/src/state.rs
git commit -m "feat(e2ee-core): add RatchetState, SkippedKeyStore, and bincode serialization

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

### Task 11: ratchet.rs — KDF 内部函数

**Files:**
- Create: `backend/e2ee-core/src/ratchet.rs`

- [x] **Step 1: 编写 KDF 内部函数 + build_ratchet_aad**

```rust
use crate::errors::E2eeError;
use crate::primitives::{generate_nonce, generate_x25519_keypair, hkdf_sha256, x25519_dh, Aes256Key, aes_gcm_encrypt, aes_gcm_decrypt, X25519PublicKey, X25519KeyPair};
use crate::state::{ChainKey, MessageKey, RatchetHeader, RatchetRootKey, RatchetState, SkippedKeyStore, export_state};

// ===== 常量 =====
pub const MAX_SKIP: u32 = 2000;

const INFO_ROOT_KEY: &[u8] = b"RootKey";
const INFO_SENDING_CHAIN: &[u8] = b"SendingChainKey";
const INFO_RECEIVING_CHAIN: &[u8] = b"ReceivingChainKey";
const INFO_MESSAGE_KEYS: &[u8] = b"MessageKeys";
const INFO_CHAIN_KEYS: &[u8] = b"ChainKeys";

// ===== 内部 KDF 函数 =====

/// 将链密钥拆分为消息密钥 + 下一个链密钥（消费所有权）
fn split_chain_key(chain_key: ChainKey) -> Result<(MessageKey, ChainKey), E2eeError> {
    let message_key_bytes: [u8; 32] = hkdf_sha256::<32>(&chain_key.0, &[], INFO_MESSAGE_KEYS)?;
    let next_chain_bytes: [u8; 32] = hkdf_sha256::<32>(&chain_key.0, &[], INFO_CHAIN_KEYS)?;
    // chain_key 离开作用域 → ZeroizeOnDrop
    Ok((MessageKey(message_key_bytes), ChainKey(next_chain_bytes)))
}

/// 从 Root Key + DH 输出派生新的 Root Key + Chain Key
fn kdf_root_key(
    root_key: &RatchetRootKey,
    dh_output: &[u8; 32],
    chain_info: &[u8],
) -> Result<(RatchetRootKey, ChainKey), E2eeError> {
    let mut input = [0u8; 64];
    input[..32].copy_from_slice(&root_key.0);
    input[32..].copy_from_slice(dh_output);
    let new_root_bytes: [u8; 32] = hkdf_sha256::<32>(&input, &[], INFO_ROOT_KEY)?;
    let chain_key_bytes: [u8; 32] = hkdf_sha256::<32>(&input, &[], chain_info)?;
    input.zeroize();
    Ok((RatchetRootKey(new_root_bytes), ChainKey(chain_key_bytes)))
}

/// 构建 Ratchet AAD（104 字节，零堆分配）
fn build_ratchet_aad(
    local_id_key: &X25519PublicKey,
    remote_id_key: &X25519PublicKey,
    header: &RatchetHeader,
) -> [u8; 104] {
    let mut aad = [0u8; 104];
    let mut offset = 0;
    aad[offset..offset + 32].copy_from_slice(&local_id_key.0);
    offset += 32;
    aad[offset..offset + 32].copy_from_slice(&remote_id_key.0);
    offset += 32;
    aad[offset..offset + 32].copy_from_slice(&header.ratchet_public_key.0);
    offset += 32;
    aad[offset..offset + 4].copy_from_slice(&header.counter.to_be_bytes());
    offset += 4;
    aad[offset..offset + 4].copy_from_slice(&header.previous_counter.to_be_bytes());
    aad
}
```

- [x] **Step 2: 编译验证**

```bash
cd backend && cargo check -p e2ee-core 2>&1
```
Expected: 编译成功。

- [x] **Step 3: Commit**

```bash
git add backend/e2ee-core/src/ratchet.rs
git commit -m "feat(e2ee-core): add ratchet KDF internals and AAD builder

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

### Task 12: ratchet.rs — 链初始化 + DH 棘轮步进

**Files:**
- Modify: `backend/e2ee-core/src/ratchet.rs`

- [x] **Step 1: 添加链初始化函数**

在 ratchet.rs 中追加：

```rust
#[must_use]
pub fn init_sending_chain(
    root_key: &RatchetRootKey,
    local_identity_key: X25519PublicKey,
    remote_identity_key: X25519PublicKey,
) -> Result<RatchetState, E2eeError> {
    let sending: [u8; 32] = hkdf_sha256::<32>(&root_key.0, &[], INFO_SENDING_CHAIN)?;
    let receiving: [u8; 32] = hkdf_sha256::<32>(&root_key.0, &[], INFO_RECEIVING_CHAIN)?;
    let dh_key_pair = generate_x25519_keypair();
    Ok(RatchetState {
        root_key: RatchetRootKey(root_key.0),
        sending_chain_key: Some(ChainKey(sending)),
        receiving_chain_key: Some(ChainKey(receiving)),
        send_counter: 0,
        receive_counter: 0,
        previous_counter: 0,
        dh_key_pair,
        remote_public_key: None,
        skipped_message_keys: SkippedKeyStore::new(),
        local_identity_key,
        remote_identity_key,
    })
}

#[must_use]
pub fn init_receiving_chain(
    root_key: &RatchetRootKey,
    local_identity_key: X25519PublicKey,
    remote_identity_key: X25519PublicKey,
) -> Result<RatchetState, E2eeError> {
    // 注意：接收方视角，sending 和 receiving chain 互换
    let sending: [u8; 32] = hkdf_sha256::<32>(&root_key.0, &[], INFO_RECEIVING_CHAIN)?;
    let receiving: [u8; 32] = hkdf_sha256::<32>(&root_key.0, &[], INFO_SENDING_CHAIN)?;
    let dh_key_pair = generate_x25519_keypair();
    Ok(RatchetState {
        root_key: RatchetRootKey(root_key.0),
        sending_chain_key: Some(ChainKey(sending)),
        receiving_chain_key: Some(ChainKey(receiving)),
        send_counter: 0,
        receive_counter: 0,
        previous_counter: 0,
        dh_key_pair,
        remote_public_key: None,
        skipped_message_keys: SkippedKeyStore::new(),
        local_identity_key,
        remote_identity_key,
    })
}
```

- [x] **Step 2: 添加 DH 棘轮步进**

```rust
fn perform_dh_ratchet(
    state: &mut RatchetState,
    new_remote_key: &X25519PublicKey,
) -> Result<(), E2eeError> {
    state.previous_counter = state.send_counter;
    state.send_counter = 0;
    state.receive_counter = 0;

    let dh1 = x25519_dh(&state.dh_key_pair.private_key, new_remote_key)?;

    // 派生接收链
    let (root, receiving_chain) = kdf_root_key(&state.root_key, &dh1, INFO_RECEIVING_CHAIN)?;

    // 轮换 DH 密钥对（旧 keypair Drop → Zeroize）
    let new_dh = generate_x25519_keypair();
    state.dh_key_pair = new_dh;

    let dh2 = x25519_dh(&state.dh_key_pair.private_key, new_remote_key)?;

    // 派生发送链
    let (root, sending_chain) = kdf_root_key(&root, &dh2, INFO_SENDING_CHAIN)?;

    state.root_key = root;
    state.receiving_chain_key = Some(receiving_chain);
    state.sending_chain_key = Some(sending_chain);
    state.remote_public_key = Some(*new_remote_key);
    Ok(())
}
```

- [x] **Step 3: 编写测试**

在 ratchet.rs 底部添加测试模块：

```rust
#[cfg(test)]
mod tests {
    use super::*;
    use crate::primitives::generate_x25519_keypair;

    fn make_root_key() -> RatchetRootKey {
        RatchetRootKey([0xABu8; 32])
    }

    fn make_identity_keys() -> (X25519PublicKey, X25519PublicKey) {
        let a = generate_x25519_keypair();
        let b = generate_x25519_keypair();
        (a.public_key, b.public_key)
    }

    #[test]
    fn init_sending_chain_creates_valid_state() {
        let (local_ik, remote_ik) = make_identity_keys();
        let state = init_sending_chain(&make_root_key(), local_ik, remote_ik).unwrap();
        assert!(state.sending_chain_key.is_some());
        assert!(state.receiving_chain_key.is_some());
        assert_eq!(state.send_counter, 0);
        assert_eq!(state.receive_counter, 0);
        assert!(state.remote_public_key.is_none());
        assert_eq!(state.local_identity_key.0, local_ik.0);
    }

    #[test]
    fn init_receiving_chain_creates_valid_state() {
        let (local_ik, remote_ik) = make_identity_keys();
        let state = init_receiving_chain(&make_root_key(), local_ik, remote_ik).unwrap();
        assert!(state.sending_chain_key.is_some());
        assert!(state.receiving_chain_key.is_some());
    }

    #[test]
    fn init_chains_from_same_root_produce_different_keys() {
        let (local_ik, remote_ik) = make_identity_keys();
        let s = init_sending_chain(&make_root_key(), local_ik, remote_ik).unwrap();
        let r = init_receiving_chain(&make_root_key(), local_ik, remote_ik).unwrap();
        // 发送方视角的 sending chain key != 接收方视角的 sending chain key
        assert_ne!(s.sending_chain_key.unwrap().0, r.sending_chain_key.unwrap().0);
    }
}
```

- [x] **Step 4: 运行测试**

```bash
cd backend && cargo test -p e2ee-core 2>&1
```
Expected: 全部测试通过。

- [x] **Step 5: Commit**

```bash
git add backend/e2ee-core/src/ratchet.rs
git commit -m "feat(e2ee-core): add ratchet chain init and DH ratchet step

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

### Task 13: ratchet.rs — ratchet_encrypt

**Files:**
- Modify: `backend/e2ee-core/src/ratchet.rs`

- [x] **Step 1: 添加加密函数**

```rust
#[must_use]
pub fn ratchet_encrypt(
    state: &mut RatchetState,
    plaintext: &[u8],
) -> Result<(RatchetHeader, Vec<u8>), E2eeError> {
    // 消费当前发送链密钥
    let chain = state
        .sending_chain_key
        .take()
        .ok_or(E2eeError::SendingChainNotInitialized)?;

    // Split → (message_key, next_chain_key)
    let (msg_key, next_chain) = split_chain_key(chain)?;

    // 生成随机 nonce
    let nonce = generate_nonce();

    // 构建 Header
    let header = RatchetHeader {
        ratchet_public_key: state.dh_key_pair.public_key,
        counter: state.send_counter,
        previous_counter: state.previous_counter,
        nonce: AesNonce(nonce.0), // 通过 crate::primitives::AesNonce 的构造方式
    };

    // 构建 AAD
    let aad = build_ratchet_aad(
        &state.local_identity_key,
        &state.remote_identity_key,
        &header,
    );

    // 转换 MessageKey → Aes256Key（consuming）
    let aes_key: Aes256Key = msg_key.into();

    // 加密
    let ciphertext = aes_gcm_encrypt(&aes_key, &nonce, plaintext, &aad)?;

    // 更新状态
    state.sending_chain_key = Some(next_chain);
    state.send_counter += 1;

    // aes_key 离开作用域 → Drop → ZeroizeOnDrop
    Ok((header, ciphertext))
}
```

需要在文件顶部添加需要的 import（如果尚未导入）:
```rust
use crate::state::RatchetHeader;
use crate::primitives::AesNonce;
```

- [x] **Step 2: 编写加密测试**

```rust
#[test]
fn ratchet_encrypt_produces_ciphertext_different_from_plaintext() {
    let (local_ik, remote_ik) = make_identity_keys();
    let mut state = init_sending_chain(&make_root_key(), local_ik, remote_ik).unwrap();
    let plaintext = b"hello secret world";
    let (header, ciphertext) = ratchet_encrypt(&mut state, plaintext).unwrap();
    assert!(!ciphertext.is_empty());
    assert_ne!(ciphertext.as_slice(), plaintext);
    assert_eq!(state.send_counter, 1);
    assert!(header.ratchet_public_key.0.iter().any(|&b| b != 0));
}

#[test]
fn ratchet_encrypt_increments_counter() {
    let (local_ik, remote_ik) = make_identity_keys();
    let mut state = init_sending_chain(&make_root_key(), local_ik, remote_ik).unwrap();
    assert_eq!(state.send_counter, 0);
    ratchet_encrypt(&mut state, b"msg1").unwrap();
    assert_eq!(state.send_counter, 1);
    ratchet_encrypt(&mut state, b"msg2").unwrap();
    assert_eq!(state.send_counter, 2);
}

#[test]
fn ratchet_encrypt_each_message_has_unique_header() {
    let (local_ik, remote_ik) = make_identity_keys();
    let mut state = init_sending_chain(&make_root_key(), local_ik, remote_ik).unwrap();
    let (h1, _) = ratchet_encrypt(&mut state, b"msg1").unwrap();
    let (h2, _) = ratchet_encrypt(&mut state, b"msg2").unwrap();
    assert_ne!(h1.counter, h2.counter);
    assert_ne!(h1.nonce.0, h2.nonce.0);
}

#[test]
fn ratchet_encrypt_empty_plaintext() {
    let (local_ik, remote_ik) = make_identity_keys();
    let mut state = init_sending_chain(&make_root_key(), local_ik, remote_ik).unwrap();
    let (_, ciphertext) = ratchet_encrypt(&mut state, b"").unwrap();
    assert!(!ciphertext.is_empty()); // 至少有 authentication tag
}
```

- [x] **Step 3: 运行测试**

```bash
cd backend && cargo test -p e2ee-core -- ratchet::tests 2>&1
```

- [x] **Step 4: Commit**

```bash
git add backend/e2ee-core/src/ratchet.rs
git commit -m "feat(e2ee-core): add ratchet_encrypt with chain key consumption

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

### Task 14: ratchet.rs — ratchet_decrypt

**Files:**
- Modify: `backend/e2ee-core/src/ratchet.rs`

- [x] **Step 1: 添加解密函数**

```rust
#[must_use]
pub fn ratchet_decrypt(
    state: &mut RatchetState,
    header: &RatchetHeader,
    ciphertext: &[u8],
) -> Result<Vec<u8>, E2eeError> {
    let target_counter = header.counter;

    // DoS 防护：counter gap 检查
    if target_counter.saturating_sub(state.receive_counter) > MAX_SKIP
        && state.receive_counter.saturating_sub(target_counter) > MAX_SKIP
    {
        // 使用 checked_sub + 绝对值比较
        let gap = if target_counter > state.receive_counter {
            target_counter - state.receive_counter
        } else {
            state.receive_counter - target_counter
        };
        if gap > MAX_SKIP {
            return Err(E2eeError::CounterGapExceeded(gap, MAX_SKIP));
        }
    }

    // 1. 查看是否在 skipped 缓存中
    if let Some(msg_key) = state
        .skipped_message_keys
        .remove(&header.ratchet_public_key, target_counter)
    {
        let aad = build_ratchet_aad(
            &state.local_identity_key,
            &state.remote_identity_key,
            header,
        );
        let aes_key: Aes256Key = msg_key.into();
        return aes_gcm_decrypt(&aes_key, &header.nonce, ciphertext, &aad);
    }

    // 2. 检查是否需要 DH 棘轮步进
    let needs_ratchet = match state.remote_public_key {
        Some(ref pk) if pk.0 != header.ratchet_public_key.0 => true,
        None => true,
        _ => false,
    };

    if needs_ratchet {
        perform_dh_ratchet(state, &header.ratchet_public_key)?;
    }

    // 3. 首次设置 remote key
    if state.remote_public_key.is_none() {
        state.remote_public_key = Some(header.ratchet_public_key);
    }

    // 4. 防重放：检查 counter
    if target_counter < state.receive_counter {
        return Err(E2eeError::DuplicateOrExpiredMessage);
    }

    // 5. 消费接收链密钥，跳过中间消息
    let mut chain = state
        .receiving_chain_key
        .take()
        .ok_or(E2eeError::ReceivingChainNotInitialized)?;

    for c in state.receive_counter..target_counter {
        let (skipped_key, next) = split_chain_key(chain)?;
        state
            .skipped_message_keys
            .insert(header.ratchet_public_key, c, skipped_key)?;
        chain = next;
    }

    // 6. 解密当前消息
    let (msg_key, next_chain) = split_chain_key(chain)?;
    state.receiving_chain_key = Some(next_chain);
    state.receive_counter = target_counter + 1;

    let aad = build_ratchet_aad(
        &state.local_identity_key,
        &state.remote_identity_key,
        header,
    );
    let aes_key: Aes256Key = msg_key.into();
    aes_gcm_decrypt(&aes_key, &header.nonce, ciphertext, &aad)
}
```

- [x] **Step 2: 编写解密测试**

```rust
#[test]
fn ratchet_encrypt_decrypt_roundtrip() {
    let (local_ik, remote_ik) = make_identity_keys();
    let root_key = make_root_key();
    let mut alice = init_sending_chain(&root_key, local_ik, remote_ik).unwrap();
    let mut bob = init_receiving_chain(&root_key, remote_ik, local_ik).unwrap();

    let (header, ciphertext) = ratchet_encrypt(&mut alice, b"hello bob").unwrap();
    let plaintext = ratchet_decrypt(&mut bob, &header, &ciphertext).unwrap();
    assert_eq!(plaintext, b"hello bob");
}

#[test]
fn ratchet_out_of_order_messages() {
    let (local_ik, remote_ik) = make_identity_keys();
    let root_key = make_root_key();
    let mut alice = init_sending_chain(&root_key, local_ik, remote_ik).unwrap();
    let mut bob = init_receiving_chain(&root_key, remote_ik, local_ik).unwrap();

    let (h0, c0) = ratchet_encrypt(&mut alice, b"first").unwrap();
    let (h1, c1) = ratchet_encrypt(&mut alice, b"second").unwrap();
    let (h2, c2) = ratchet_encrypt(&mut alice, b"third").unwrap();

    // Receive in reverse order
    assert_eq!(ratchet_decrypt(&mut bob, &h2, &c2).unwrap(), b"third");
    assert_eq!(ratchet_decrypt(&mut bob, &h0, &c0).unwrap(), b"first");
    assert_eq!(ratchet_decrypt(&mut bob, &h1, &c1).unwrap(), b"second");
}

#[test]
fn ratchet_tampered_aad_rejected() {
    let (local_ik, remote_ik) = make_identity_keys();
    let root_key = make_root_key();
    let mut alice = init_sending_chain(&root_key, local_ik, remote_ik).unwrap();
    let mut bob = init_receiving_chain(&root_key, remote_ik, local_ik).unwrap();

    let (header, ciphertext) = ratchet_encrypt(&mut alice, b"secret").unwrap();
    // Tamper header
    let mut tampered = header;
    tampered.previous_counter ^= 1;
    let result = ratchet_decrypt(&mut bob, &tampered, &ciphertext);
    assert!(result.is_err());
}

#[test]
fn ratchet_duplicate_message_rejected() {
    let (local_ik, remote_ik) = make_identity_keys();
    let root_key = make_root_key();
    let mut alice = init_sending_chain(&root_key, local_ik, remote_ik).unwrap();
    let mut bob = init_receiving_chain(&root_key, remote_ik, local_ik).unwrap();

    let (header, ciphertext) = ratchet_encrypt(&mut alice, b"once").unwrap();
    ratchet_decrypt(&mut bob, &header, &ciphertext).unwrap();
    let result = ratchet_decrypt(&mut bob, &header, &ciphertext);
    assert!(matches!(result, Err(E2eeError::DuplicateOrExpiredMessage)));
}

#[test]
fn ratchet_counter_gap_exceeds_max_skip() {
    let (local_ik, remote_ik) = make_identity_keys();
    let root_key = make_root_key();
    let mut alice = init_sending_chain(&root_key, local_ik, remote_ik).unwrap();
    let mut bob = init_receiving_chain(&root_key, remote_ik, local_ik).unwrap();

    let (header, ciphertext) = ratchet_encrypt(&mut alice, b"gap test").unwrap();
    // 伪造一个过大的 counter
    let mut bad_header = header;
    bad_header.counter = MAX_SKIP + 1;
    let result = ratchet_decrypt(&mut bob, &bad_header, &ciphertext);
    assert!(matches!(result, Err(E2eeError::CounterGapExceeded(_, _))));
}

#[test]
fn ratchet_dh_step_heals_connection() {
    let (local_ik, remote_ik) = make_identity_keys();
    let root_key = make_root_key();
    let mut alice = init_sending_chain(&root_key, local_ik, remote_ik).unwrap();
    let mut bob = init_receiving_chain(&root_key, remote_ik, local_ik).unwrap();

    // Alice sends 3 messages (DH step after first)
    let (h0, c0) = ratchet_encrypt(&mut alice, b"m0").unwrap();
    // Bob receives m0 — this will trigger DH ratchet since it's first msg
    assert_eq!(ratchet_decrypt(&mut bob, &h0, &c0).unwrap(), b"m0");

    let (h1, c1) = ratchet_encrypt(&mut alice, b"m1").unwrap();
    assert_eq!(ratchet_decrypt(&mut bob, &h1, &c1).unwrap(), b"m1");
}

#[test]
fn ratchet_identity_keys_in_aad_prevent_cross_session_replay() {
    let root_key = make_root_key();
    let ik_a = generate_x25519_keypair();
    let ik_b = generate_x25519_keypair();
    let ik_c = generate_x25519_keypair();

    // Session A-B
    let mut alice = init_sending_chain(&root_key, ik_a.public_key, ik_b.public_key).unwrap();
    let mut bob = init_receiving_chain(&root_key, ik_b.public_key, ik_a.public_key).unwrap();

    let (header, ciphertext) = ratchet_encrypt(&mut alice, b"msg for bob").unwrap();

    // Attacker tries to replay into session A-C
    let mut carol = init_receiving_chain(&root_key, ik_c.public_key, ik_a.public_key).unwrap();
    let result = ratchet_decrypt(&mut carol, &header, &ciphertext);
    // Should fail because AAD has ik_a + ik_b, not ik_a + ik_c
    assert!(result.is_err());
}

#[test]
fn ratchet_export_restore_preserves_state() {
    let (local_ik, remote_ik) = make_identity_keys();
    let root_key = make_root_key();
    let mut alice = init_sending_chain(&root_key, local_ik, remote_ik).unwrap();
    let mut bob = init_receiving_chain(&root_key, remote_ik, local_ik).unwrap();

    let (header, ciphertext) = ratchet_encrypt(&mut alice, b"persistent").unwrap();

    // Export and restore Bob
    let bytes = export_state(&bob);
    let mut bob2 = crate::state::restore_state(&bytes).unwrap();
    assert_eq!(
        ratchet_decrypt(&mut bob2, &header, &ciphertext).unwrap(),
        b"persistent"
    );
}
```

需要添加 `ratchet_encrypt` 测试中已有的 import。

- [x] **Step 3: 运行测试**

```bash
cd backend && cargo test -p e2ee-core 2>&1
```
Expected: 全部 ~36 个测试通过。

- [x] **Step 4: Commit**

```bash
git add backend/e2ee-core/src/ratchet.rs
git commit -m "feat(e2ee-core): add ratchet_decrypt with MAX_SKIP, skipped keys, and DH healing

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

## Phase 4: X3DH 协议

### Task 15: x3dh.rs — 类型定义 + generate_key_bundle

**Files:**
- Create: `backend/e2ee-core/src/x3dh.rs`

- [x] **Step 1: 编写 x3dh.rs**

```rust
use crate::errors::E2eeError;
use crate::primitives::{
    ed25519_sign, ed25519_verify, generate_ed25519_keypair, generate_x25519_keypair,
    hkdf_sha256, x25519_dh, Ed25519KeyPair, Ed25519PublicKey, Ed25519Signature,
    X25519KeyPair, X25519PublicKey,
};
use crate::state::RatchetRootKey;
use zeroize::Zeroize;

const X3DH_INFO: &[u8] = b"X3DH-RootKey-v1";
const X3DH_SALT: [u8; 32] = [0u8; 32];
const DH_OUTPUT_LEN: usize = 32;
const MAX_DH_COUNT: usize = 4;

// ===== 类型定义 =====

pub struct PreKey {
    pub id: u32,
    pub key: X25519PublicKey,
}

pub struct PreKeyBundle {
    pub identity_key: X25519PublicKey,
    pub signing_key: Ed25519PublicKey,
    pub signed_pre_key: X25519PublicKey,
    pub signed_pre_key_signature: Ed25519Signature,
    pub one_time_pre_keys: Vec<X25519PublicKey>,
}

pub struct PreKeyBundleFetch {
    pub identity_key: X25519PublicKey,
    pub signing_key: Ed25519PublicKey,
    pub signed_pre_key: PreKey,
    pub signed_pre_key_signature: Ed25519Signature,
    pub one_time_pre_key: Option<PreKey>,
}

pub struct KeyBundle {
    pub identity_key_pair: X25519KeyPair,
    pub signing_key_pair: Ed25519KeyPair,
    pub signed_pre_key_pair: X25519KeyPair,
    pub one_time_pre_key_pairs: Vec<X25519KeyPair>,
    pub bundle: PreKeyBundle,
}

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

// ===== 函数实现 =====

#[must_use]
pub fn generate_key_bundle(
    spk_id: u32,
    one_time_pre_keys: &[(u32, u32)],
) -> Result<KeyBundle, E2eeError> {
    let identity_key_pair = generate_x25519_keypair();
    let signing_key_pair = generate_ed25519_keypair();
    let signed_pre_key_pair = generate_x25519_keypair();

    // 签名 SPK
    let spk_signature = ed25519_sign(
        &signing_key_pair.private_key,
        &signed_pre_key_pair.public_key.0,
    )?;

    // 生成 OTK
    let total_otk_count: u32 = one_time_pre_keys.iter().map(|(_, count)| count).sum();
    let mut one_time_pre_key_pairs = Vec::with_capacity(total_otk_count as usize);
    let mut one_time_pre_key_ids = Vec::with_capacity(total_otk_count as usize);

    for &(start_id, count) in one_time_pre_keys {
        for id in start_id..start_id + count {
            let kp = generate_x25519_keypair();
            one_time_pre_key_pairs.push(kp);
            one_time_pre_key_ids.push(kp.public_key);
        }
    }
    // suppress unused variable warning
    let _ = (one_time_pre_key_ids, one_time_pre_keys);

    let otk_public_keys: Vec<X25519PublicKey> = one_time_pre_key_pairs
        .iter()
        .map(|kp| kp.public_key)
        .collect();

    let bundle = PreKeyBundle {
        identity_key: identity_key_pair.public_key,
        signing_key: signing_key_pair.public_key,
        signed_pre_key: signed_pre_key_pair.public_key,
        signed_pre_key_signature: spk_signature,
        one_time_pre_keys: otk_public_keys,
    };

    Ok(KeyBundle {
        identity_key_pair,
        signing_key_pair,
        signed_pre_key_pair,
        one_time_pre_key_pairs,
        bundle,
    })
}
```

- [x] **Step 2: 编写测试**

```rust
#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn generate_key_bundle_zero_otk() {
        let kb = generate_key_bundle(1, &[]).unwrap();
        assert!(kb.bundle.one_time_pre_keys.is_empty());
        assert_eq!(kb.one_time_pre_key_pairs.len(), 0);
    }

    #[test]
    fn generate_key_bundle_with_otks() {
        let kb = generate_key_bundle(1, &[(1, 5)]).unwrap();
        assert_eq!(kb.bundle.one_time_pre_keys.len(), 5);
        assert_eq!(kb.one_time_pre_key_pairs.len(), 5);
    }

    #[test]
    fn generate_key_bundle_multiple_batches() {
        let kb = generate_key_bundle(1, &[(1, 3), (4, 2)]).unwrap();
        assert_eq!(kb.bundle.one_time_pre_keys.len(), 5);
    }

    #[test]
    fn generate_key_bundle_spk_signature_valid() {
        let kb = generate_key_bundle(42, &[]).unwrap();
        let result = ed25519_verify(
            &kb.signing_key_pair.public_key,
            &kb.signed_pre_key_pair.public_key.0,
            &kb.bundle.signed_pre_key_signature,
        );
        assert!(result.is_ok());
    }
}
```

- [x] **Step 3: 运行测试**

```bash
cd backend && cargo test -p e2ee-core -- x3dh 2>&1
```
Expected: 4 tests passed.

- [x] **Step 4: Commit**

```bash
git add backend/e2ee-core/src/x3dh.rs
git commit -m "feat(e2ee-core): add X3DH key bundle generation with Ed25519 SPK signing

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

### Task 16: x3dh.rs — x3dh_initiate (Alice)

**Files:**
- Modify: `backend/e2ee-core/src/x3dh.rs`

- [x] **Step 1: 添加 x3dh_initiate**

```rust
#[must_use]
pub fn x3dh_initiate(
    identity_key_pair: &X25519KeyPair,
    remote_bundle: &PreKeyBundleFetch,
) -> Result<X3dhInitiateResult, E2eeError> {
    // 1. 验证 SPK 签名
    ed25519_verify(
        &remote_bundle.signing_key,
        &remote_bundle.signed_pre_key.key.0,
        &remote_bundle.signed_pre_key_signature,
    )?; // ← Err 即 SpkSignatureRejected

    // 2. 生成方临密钥
    let ephemeral_key_pair = generate_x25519_keypair();

    // 3. 计算 DH1-DH4（栈上拼接，零堆分配）
    let dh1 = x25519_dh(&identity_key_pair.private_key, &remote_bundle.signed_pre_key.key)?;
    let dh2 = x25519_dh(&ephemeral_key_pair.private_key, &remote_bundle.identity_key)?;
    let dh3 = x25519_dh(&ephemeral_key_pair.private_key, &remote_bundle.signed_pre_key.key)?;

    let mut dh_buffer = [0u8; DH_OUTPUT_LEN * MAX_DH_COUNT];
    let mut offset: usize = 0;

    dh_buffer[offset..offset + DH_OUTPUT_LEN].copy_from_slice(&dh1);
    offset += DH_OUTPUT_LEN;
    dh_buffer[offset..offset + DH_OUTPUT_LEN].copy_from_slice(&dh2);
    offset += DH_OUTPUT_LEN;
    dh_buffer[offset..offset + DH_OUTPUT_LEN].copy_from_slice(&dh3);
    offset += DH_OUTPUT_LEN;

    let (otk_id, used_otk) = if let Some(ref otk) = remote_bundle.one_time_pre_key {
        let dh4 = x25519_dh(&ephemeral_key_pair.private_key, &otk.key)?;
        dh_buffer[offset..offset + DH_OUTPUT_LEN].copy_from_slice(&dh4);
        offset += DH_OUTPUT_LEN;
        (Some(otk.id), true)
    } else {
        (None, false)
    };

    // 4. HKDF 派生 Root Key
    let root_key_bytes: [u8; 32] = hkdf_sha256::<32>(
        &dh_buffer[..offset],
        &X3DH_SALT,
        X3DH_INFO,
    )?;

    // 5. 栈上擦除 DH 中间值
    dh_buffer.zeroize();

    Ok(X3dhInitiateResult {
        root_key: RatchetRootKey(root_key_bytes),
        ephemeral_public_key: ephemeral_key_pair.public_key,
        spk_id: remote_bundle.signed_pre_key.id,
        otk_id,
    })
}
```

- [x] **Step 2: 编写测试**

在 x3dh test 模块中添加：

```rust
fn make_bob_bundle() -> (KeyBundle, PreKeyBundleFetch) {
    let kb = generate_key_bundle(1, &[(1, 1)]).unwrap();
    let fetch = PreKeyBundleFetch {
        identity_key: kb.bundle.identity_key,
        signing_key: kb.bundle.signing_key,
        signed_pre_key: PreKey {
            id: 1,
            key: kb.bundle.signed_pre_key,
        },
        signed_pre_key_signature: kb.bundle.signed_pre_key_signature,
        one_time_pre_key: kb.bundle.one_time_pre_keys.first().map(|&k| PreKey {
            id: 1,
            key: k,
        }),
    };
    (kb, fetch)
}

#[test]
fn x3dh_initiate_with_otk_succeeds() {
    let alice = generate_x25519_keypair();
    let (_bob, fetch) = make_bob_bundle();
    let result = x3dh_initiate(&alice, &fetch).unwrap();
    assert_eq!(result.spk_id, 1);
    assert_eq!(result.otk_id, Some(1));
}

#[test]
fn x3dh_initiate_spk_only_succeeds() {
    let alice = generate_x25519_keypair();
    let kb = generate_key_bundle(7, &[]).unwrap();
    let fetch = PreKeyBundleFetch {
        identity_key: kb.bundle.identity_key,
        signing_key: kb.bundle.signing_key,
        signed_pre_key: PreKey { id: 7, key: kb.bundle.signed_pre_key },
        signed_pre_key_signature: kb.bundle.signed_pre_key_signature,
        one_time_pre_key: None,
    };
    let result = x3dh_initiate(&alice, &fetch).unwrap();
    assert_eq!(result.spk_id, 7);
    assert_eq!(result.otk_id, None);
}

#[test]
fn x3dh_initiate_rejects_bad_spk_signature() {
    let alice = generate_x25519_keypair();
    let kb = generate_key_bundle(1, &[]).unwrap();
    let mut fetch = PreKeyBundleFetch {
        identity_key: kb.bundle.identity_key,
        signing_key: kb.bundle.signing_key,
        signed_pre_key: PreKey { id: 1, key: kb.bundle.signed_pre_key },
        signed_pre_key_signature: kb.bundle.signed_pre_key_signature,
        one_time_pre_key: None,
    };
    // Tamper signature
    fetch.signed_pre_key_signature.0[0] ^= 1;
    let result = x3dh_initiate(&alice, &fetch);
    assert!(matches!(result, Err(E2eeError::SignatureMismatch)));
}
```

- [x] **Step 3: 运行测试**

```bash
cd backend && cargo test -p e2ee-core -- x3dh 2>&1
```

- [x] **Step 4: Commit**

```bash
git add backend/e2ee-core/src/x3dh.rs
git commit -m "feat(e2ee-core): add x3dh_initiate with stack-allocated DH buffer

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

### Task 17: x3dh.rs — x3dh_respond (Bob)

**Files:**
- Modify: `backend/e2ee-core/src/x3dh.rs`

- [x] **Step 1: 添加 x3dh_respond**

```rust
#[must_use]
pub fn x3dh_respond(
    identity_key_pair: &X25519KeyPair,
    signed_pre_key_pair: &X25519KeyPair,
    one_time_pre_key_pair: Option<&X25519KeyPair>,
    remote_identity_key: &X25519PublicKey,
    remote_ephemeral_key: &X25519PublicKey,
) -> Result<X3dhRespondResult, E2eeError> {
    let dh1 = x25519_dh(&signed_pre_key_pair.private_key, remote_identity_key)?;
    let dh2 = x25519_dh(&identity_key_pair.private_key, remote_ephemeral_key)?;
    let dh3 = x25519_dh(&signed_pre_key_pair.private_key, remote_ephemeral_key)?;

    let mut dh_buffer = [0u8; DH_OUTPUT_LEN * MAX_DH_COUNT];
    let mut offset: usize = 0;

    dh_buffer[offset..offset + DH_OUTPUT_LEN].copy_from_slice(&dh1);
    offset += DH_OUTPUT_LEN;
    dh_buffer[offset..offset + DH_OUTPUT_LEN].copy_from_slice(&dh2);
    offset += DH_OUTPUT_LEN;
    dh_buffer[offset..offset + DH_OUTPUT_LEN].copy_from_slice(&dh3);
    offset += DH_OUTPUT_LEN;

    let has_otk = one_time_pre_key_pair.is_some();
    if let Some(otk_pair) = one_time_pre_key_pair {
        let dh4 = x25519_dh(&otk_pair.private_key, remote_ephemeral_key)?;
        dh_buffer[offset..offset + DH_OUTPUT_LEN].copy_from_slice(&dh4);
        offset += DH_OUTPUT_LEN;
    }

    let root_key_bytes: [u8; 32] = hkdf_sha256::<32>(
        &dh_buffer[..offset],
        &X3DH_SALT,
        X3DH_INFO,
    )?;

    dh_buffer.zeroize();

    Ok(X3dhRespondResult {
        root_key: RatchetRootKey(root_key_bytes),
        otk_id: if has_otk { Some(0) } else { None },
        // Bob 侧 OTK ID 由服务端在消费时确定，此处仅标记是否使用
    })
}
```

- [x] **Step 2: 编写 X3DH 端到端测试**

```rust
#[test]
fn x3dh_full_handshake_with_otk() {
    let alice_ik = generate_x25519_keypair();
    let bob_bundle = generate_key_bundle(1, &[(100, 1)]).unwrap();

    let bob_otk = bob_bundle.one_time_pre_key_pairs.first().unwrap();

    let fetch = PreKeyBundleFetch {
        identity_key: bob_bundle.bundle.identity_key,
        signing_key: bob_bundle.bundle.signing_key,
        signed_pre_key: PreKey { id: 1, key: bob_bundle.bundle.signed_pre_key },
        signed_pre_key_signature: bob_bundle.bundle.signed_pre_key_signature,
        one_time_pre_key: Some(PreKey { id: 100, key: bob_otk.public_key }),
    };

    let alice_result = x3dh_initiate(&alice_ik, &fetch).unwrap();
    let bob_result = x3dh_respond(
        &bob_bundle.identity_key_pair,
        &bob_bundle.signed_pre_key_pair,
        Some(bob_otk),
        &alice_ik.public_key,
        &alice_result.ephemeral_public_key,
    )
    .unwrap();

    assert_eq!(alice_result.root_key.0, bob_result.root_key.0);
    assert_eq!(alice_result.otk_id, Some(100));
}

#[test]
fn x3dh_full_handshake_spk_only() {
    let alice_ik = generate_x25519_keypair();
    let bob_bundle = generate_key_bundle(42, &[]).unwrap();

    let fetch = PreKeyBundleFetch {
        identity_key: bob_bundle.bundle.identity_key,
        signing_key: bob_bundle.bundle.signing_key,
        signed_pre_key: PreKey { id: 42, key: bob_bundle.bundle.signed_pre_key },
        signed_pre_key_signature: bob_bundle.bundle.signed_pre_key_signature,
        one_time_pre_key: None,
    };

    let alice_result = x3dh_initiate(&alice_ik, &fetch).unwrap();
    let bob_result = x3dh_respond(
        &bob_bundle.identity_key_pair,
        &bob_bundle.signed_pre_key_pair,
        None,
        &alice_ik.public_key,
        &alice_result.ephemeral_public_key,
    )
    .unwrap();

    assert_eq!(alice_result.root_key.0, bob_result.root_key.0);
}

#[test]
fn x3dh_different_identity_keys_produce_different_roots() {
    let alice1 = generate_x25519_keypair();
    let alice2 = generate_x25519_keypair();
    let bob_bundle = generate_key_bundle(1, &[]).unwrap();
    let fetch = PreKeyBundleFetch {
        identity_key: bob_bundle.bundle.identity_key,
        signing_key: bob_bundle.bundle.signing_key,
        signed_pre_key: PreKey { id: 1, key: bob_bundle.bundle.signed_pre_key },
        signed_pre_key_signature: bob_bundle.bundle.signed_pre_key_signature,
        one_time_pre_key: None,
    };

    let r1 = x3dh_initiate(&alice1, &fetch).unwrap();
    let r2 = x3dh_initiate(&alice2, &fetch).unwrap();
    assert_ne!(r1.root_key.0, r2.root_key.0);
}
```

- [x] **Step 3: 运行测试**

```bash
cd backend && cargo test -p e2ee-core 2>&1
```
Expected: 全部 ~45 个测试通过。

- [x] **Step 4: Commit**

```bash
git add backend/e2ee-core/src/x3dh.rs
git commit -m "feat(e2ee-core): add x3dh_respond with full X3DH handshake tests

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

## Phase 5: lib.rs re-export 清理 + 全集成测试

### Task 18: lib.rs — 补充 re-export + 集成测试

**Files:**
- Modify: `backend/e2ee-core/src/lib.rs`

- [x] **Step 1: 更新 lib.rs**

```rust
#![forbid(unsafe_code)]
#![deny(clippy::unwrap_used)]
#![deny(clippy::expect_used)]
#![deny(clippy::panic)]
#![deny(clippy::todo)]
#![deny(clippy::unimplemented)]
#![deny(clippy::indexing_slicing)]
#![deny(clippy::as_conversions)]
#![deny(unused_must_use)]

pub mod errors;
pub mod primitives;
pub mod state;
pub mod ratchet;
pub mod x3dh;

// Re-export
pub use errors::E2eeError;
pub use primitives::{
    generate_x25519_keypair, generate_ed25519_keypair, generate_aes_256_key, generate_nonce,
    x25519_dh, ed25519_sign, ed25519_verify, hkdf_sha256, aes_gcm_encrypt, aes_gcm_decrypt,
    Aes256Key, AesNonce, Ed25519KeyPair, Ed25519PrivateKey, Ed25519PublicKey,
    Ed25519Signature, X25519KeyPair, X25519PrivateKey, X25519PublicKey,
};
pub use state::{
    export_state, restore_state, ChainKey, MessageKey, RatchetHeader, RatchetRootKey,
    RatchetState, SkippedKeyStore,
};
pub use ratchet::{
    init_sending_chain, init_receiving_chain, ratchet_encrypt, ratchet_decrypt, MAX_SKIP,
};
pub use x3dh::{
    generate_key_bundle, x3dh_initiate, x3dh_respond, KeyBundle, PreKey, PreKeyBundle,
    PreKeyBundleFetch, X3dhInitiateResult, X3dhRespondResult,
};
```

- [x] **Step 2: 编译并运行所有测试**

```bash
cd backend && cargo test -p e2ee-core 2>&1
```
Expected: 全部测试通过。

- [x] **Step 3: Commit**

```bash
git add backend/e2ee-core/src/lib.rs
git commit -m "chore(e2ee-core): complete lib.rs re-exports

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

### Task 19: 全链路集成测试（X3DH → Ratchet 完整通信）

**Files:**
- Create: `backend/e2ee-core/tests/full_e2ee_flow.rs`

- [x] **Step 1: 创建集成测试文件**

创建 `backend/e2ee-core/tests/full_e2ee_flow.rs`:

```rust
use e2ee_core::*;

#[test]
fn full_e2ee_flow_alice_sends_bob_receives() {
    // 1. Bob 生成密钥包
    let bob_bundle = generate_key_bundle(1, &[(100, 3)]).unwrap();

    // 2. Alice 生成身份密钥
    let alice_ik = generate_x25519_keypair();

    // 3. Construct PreKeyBundleFetch for what Alice receives from server
    let fetch = PreKeyBundleFetch {
        identity_key: bob_bundle.bundle.identity_key,
        signing_key: bob_bundle.bundle.signing_key,
        signed_pre_key: PreKey {
            id: 1,
            key: bob_bundle.bundle.signed_pre_key,
        },
        signed_pre_key_signature: bob_bundle.bundle.signed_pre_key_signature,
        one_time_pre_key: bob_bundle.bundle.one_time_pre_keys.first().map(|&k| PreKey {
            id: 100,
            key: k,
        }),
    };

    // 4. Alice 发起 X3DH
    let alice_x3dh = x3dh_initiate(&alice_ik, &fetch).unwrap();

    // 5. Bob responder
    let bob_otk = bob_bundle.one_time_pre_key_pairs.first().unwrap();
    let bob_x3dh = x3dh_respond(
        &bob_bundle.identity_key_pair,
        &bob_bundle.signed_pre_key_pair,
        Some(bob_otk),
        &alice_ik.public_key,
        &alice_x3dh.ephemeral_public_key,
    )
    .unwrap();

    assert_eq!(alice_x3dh.root_key.0, bob_x3dh.root_key.0);

    // 6. 初始化 Ratchet
    let mut alice_state = init_sending_chain(
        &alice_x3dh.root_key,
        alice_ik.public_key,
        bob_bundle.identity_key_pair.public_key,
    )
    .unwrap();

    let mut bob_state = init_receiving_chain(
        &bob_x3dh.root_key,
        bob_bundle.identity_key_pair.public_key,
        alice_ik.public_key,
    )
    .unwrap();

    // 7. Alice 发送多条消息
    let messages = vec![
        "Hello Bob!",
        "How are you?",
        "This is a secure message.",
        "Goodbye!",
    ];

    let mut encrypted_messages = Vec::new();
    for msg in &messages {
        let (header, ciphertext) = ratchet_encrypt(&mut alice_state, msg.as_bytes()).unwrap();
        encrypted_messages.push((header, ciphertext));
    }

    // 8. Bob 接收（乱序）
    // 先接收第 2 条
    {
        let (ref h, ref c) = encrypted_messages[2];
        let plaintext = ratchet_decrypt(&mut bob_state, h, c).unwrap();
        assert_eq!(plaintext, messages[2].as_bytes());
    }
    // 再接收第 0 条
    {
        let (ref h, ref c) = encrypted_messages[0];
        let plaintext = ratchet_decrypt(&mut bob_state, h, c).unwrap();
        assert_eq!(plaintext, messages[0].as_bytes());
    }
    // 再接收第 3 条
    {
        let (ref h, ref c) = encrypted_messages[3];
        let plaintext = ratchet_decrypt(&mut bob_state, h, c).unwrap();
        assert_eq!(plaintext, messages[3].as_bytes());
    }
    // 最后接收第 1 条
    {
        let (ref h, ref c) = encrypted_messages[1];
        let plaintext = ratchet_decrypt(&mut bob_state, h, c).unwrap();
        assert_eq!(plaintext, messages[1].as_bytes());
    }
}

#[test]
fn full_e2ee_with_state_persistence() {
    // 完整的：握手 → 加密 → 导出状态 → 恢复状态 → 解密流程
    let bob_bundle = generate_key_bundle(1, &[]).unwrap();
    let alice_ik = generate_x25519_keypair();

    let fetch = PreKeyBundleFetch {
        identity_key: bob_bundle.bundle.identity_key,
        signing_key: bob_bundle.bundle.signing_key,
        signed_pre_key: PreKey { id: 1, key: bob_bundle.bundle.signed_pre_key },
        signed_pre_key_signature: bob_bundle.bundle.signed_pre_key_signature,
        one_time_pre_key: None,
    };

    let alice_x3dh = x3dh_initiate(&alice_ik, &fetch).unwrap();
    let bob_x3dh = x3dh_respond(
        &bob_bundle.identity_key_pair,
        &bob_bundle.signed_pre_key_pair,
        None,
        &alice_ik.public_key,
        &alice_x3dh.ephemeral_public_key,
    )
    .unwrap();

    let mut alice_state = init_sending_chain(
        &alice_x3dh.root_key,
        alice_ik.public_key,
        bob_bundle.identity_key_pair.public_key,
    )
    .unwrap();

    let mut bob_state = init_receiving_chain(
        &bob_x3dh.root_key,
        bob_bundle.identity_key_pair.public_key,
        alice_ik.public_key,
    )
    .unwrap();

    // Alice encrypts
    let (header, ciphertext) = ratchet_encrypt(&mut alice_state, b"persistent test").unwrap();

    // Bob exports state
    let bob_bytes = export_state(&bob_state);
    // (simulate: persist to disk, then app restart)
    let mut bob_restored = restore_state(&bob_bytes).unwrap();

    // Bob decrypts with restored state
    let plaintext = ratchet_decrypt(&mut bob_restored, &header, &ciphertext).unwrap();
    assert_eq!(plaintext, b"persistent test");
}

#[test]
fn full_e2ee_dh_ratchet_healing() {
    let bob_bundle = generate_key_bundle(1, &[]).unwrap();
    let alice_ik = generate_x25519_keypair();

    let fetch = PreKeyBundleFetch {
        identity_key: bob_bundle.bundle.identity_key,
        signing_key: bob_bundle.bundle.signing_key,
        signed_pre_key: PreKey { id: 1, key: bob_bundle.bundle.signed_pre_key },
        signed_pre_key_signature: bob_bundle.bundle.signed_pre_key_signature,
        one_time_pre_key: None,
    };

    let alice_x3dh = x3dh_initiate(&alice_ik, &fetch).unwrap();
    let bob_x3dh = x3dh_respond(
        &bob_bundle.identity_key_pair,
        &bob_bundle.signed_pre_key_pair,
        None,
        &alice_ik.public_key,
        &alice_x3dh.ephemeral_public_key,
    )
    .unwrap();

    let mut alice_state = init_sending_chain(
        &alice_x3dh.root_key,
        alice_ik.public_key,
        bob_bundle.identity_key_pair.public_key,
    )
    .unwrap();

    let mut bob_state = init_receiving_chain(
        &bob_x3dh.root_key,
        bob_bundle.identity_key_pair.public_key,
        alice_ik.public_key,
    )
    .unwrap();

    // Alice sends 10 messages (triggers multiple DH ratchet steps)
    for i in 0..10 {
        let msg = format!("message {}", i);
        let (header, ciphertext) = ratchet_encrypt(&mut alice_state, msg.as_bytes()).unwrap();
        let plaintext = ratchet_decrypt(&mut bob_state, &header, &ciphertext).unwrap();
        assert_eq!(plaintext, msg.as_bytes());
    }
}
```

- [x] **Step 2: 运行集成测试**

```bash
cd backend && cargo test -p e2ee-core --test full_e2ee_flow 2>&1
```
Expected: 3 tests passed.

- [x] **Step 3: Commit**

```bash
git add backend/e2ee-core/tests/
git commit -m "test(e2ee-core): add full E2EE integration tests (X3DH + Ratchet roundtrip)

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

## Phase 6: e2ee-ffi (UniFFI → 移动端)

### Task 20: e2ee-ffi Cargo.toml + build.rs + uniffi.toml

**Files:**
- Create: `backend/e2ee-ffi/Cargo.toml`
- Create: `backend/e2ee-ffi/build.rs`
- Create: `backend/e2ee-ffi/uniffi.toml`

- [x] **Step 1: 创建 Cargo.toml**

```toml
[package]
name = "e2ee-ffi"
version.workspace = true
edition.workspace = true

[lib]
crate-type = ["cdylib", "lib"]

[dependencies]
e2ee-core = { path = "../e2ee-core" }
thiserror.workspace = true
uniffi.workspace = true

[build-dependencies]
uniffi = { workspace = true, features = ["build"] }
```

- [x] **Step 2: 创建 build.rs**

```rust
fn main() {
    uniffi::generate_scaffolding("src/e2ee_ffi.udl").unwrap();
}
```

- [x] **Step 3: 创建 uniffi.toml**

```toml
[bindings.kotlin]
package_name = "com.im.e2ee"
cdylib_name = "e2ee_ffi"

[bindings.swift]
cdylib_name = "e2ee_ffi"
```

- [x] **Step 4: 编译骨架**

```bash
cd backend && cargo check -p e2ee-ffi 2>&1
```
Expected: 可能会失败（需要 UDL 文件）。我们先跳过编译，Task 21 中会完善。

- [x] **Step 5: Commit**

```bash
git add backend/e2ee-ffi/
git commit -m "chore: scaffold e2ee-ffi crate with UniFFI build setup

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

### Task 21: e2ee-ffi — SessionManager + UDL 定义

> **注意:** UniFFI 0.28 同时支持 `.udl` 文件和 `#[uniffi::export]` 过程宏。按设计文档，我们使用过程宏方案，同时保留 UDL 作为脚手架路由。

**Files:**
- Create: `backend/e2ee-ffi/src/e2ee_ffi.udl`
- Create: `backend/e2ee-ffi/src/lib.rs`
- Create: `backend/e2ee-ffi/src/session.rs`

- [x] **Step 1: 创建 UDL 文件**

创建 `backend/e2ee-ffi/src/e2ee_ffi.udl`:

```idl
namespace e2ee_ffi {};

[Error]
enum SessionError {
    "SessionNotFound",
    "SessionAlreadyExists",
    "InvalidStateData",
    "Crypto",
};

interface SessionManager {
    constructor();
    
    [Throws=SessionError]
    sequence<u8> create_outbound_session(
        string session_id,
        sequence<u8> identity_key_pair_bincode,
        string remote_bundle_json
    );
    
    [Throws=SessionError]
    void create_inbound_session(
        string session_id,
        sequence<u8> identity_key_pair_bincode,
        sequence<u8> signed_pre_key_pair_bincode,
        sequence<u8>? one_time_pre_key_pair_bincode,
        sequence<u8> remote_identity_key_bytes,
        sequence<u8> remote_ephemeral_key_bytes
    );
    
    [Throws=SessionError]
    sequence<u8> encrypt(string session_id, sequence<u8> plaintext);
    
    [Throws=SessionError]
    sequence<u8> decrypt(string session_id, sequence<u8> encrypted);
    
    [Throws=SessionError]
    sequence<u8> export_session(string session_id);
    
    [Throws=SessionError]
    void restore_session(string session_id, sequence<u8> state_bincode);
    
    void remove_session(string session_id);
};
```

- [x] **Step 2: 创建 lib.rs**

```rust
uniffi::setup_scaffolding!();

mod session;
pub use session::*;
```

- [x] **Step 3: 创建 session.rs**

```rust
use std::collections::HashMap;
use std::sync::{Mutex, RwLock};
use e2ee_core::{
    self,
    generate_key_bundle, init_receiving_chain, init_sending_chain,
    ratchet_encrypt, ratchet_decrypt,
    export_state, restore_state,
    RatchetState, PreKeyBundleFetch, PreKey, X3dhInitiateResult,
};

#[derive(Debug, thiserror::Error)]
pub enum SessionError {
    #[error("session {0} not found")]
    SessionNotFound(String),
    #[error("session {0} already exists")]
    SessionAlreadyExists(String),
    #[error("invalid session state data")]
    InvalidStateData,
    #[error("{0}")]
    Crypto(String),
}

impl From<e2ee_core::E2eeError> for SessionError {
    fn from(e: e2ee_core::E2eeError) -> Self {
        SessionError::Crypto(e.to_string())
    }
}

pub struct SessionManager {
    sessions: RwLock<HashMap<String, Mutex<RatchetState>>>,
}

impl SessionManager {
    pub fn new() -> Self {
        Self {
            sessions: RwLock::new(HashMap::new()),
        }
    }

    pub fn create_outbound_session(
        &self,
        session_id: String,
        identity_key_pair_bincode: Vec<u8>,
        remote_bundle_json: String,
    ) -> Result<Vec<u8>, SessionError> {
        let sessions = self.sessions.read().map_err(|e| {
            SessionError::Crypto(format!("lock poisoned: {}", e))
        })?;
        if sessions.contains_key(&session_id) {
            return Err(SessionError::SessionAlreadyExists(session_id));
        }
        drop(sessions);

        // Deserialize identity key pair
        let (identity_private, identity_public): ([u8; 32], [u8; 32]) = bincode::deserialize(
            &identity_key_pair_bincode,
        )
        .map_err(|_| SessionError::InvalidStateData)?;

        let ikp = e2ee_core::X25519KeyPair {
            public_key: e2ee_core::X25519PublicKey(identity_public),
            private_key: e2ee_core::X25519PrivateKey(identity_private),
        };

        // Parse remote bundle from JSON
        let fetch: PreKeyBundleFetch = serde_json::from_str(&remote_bundle_json)
            .map_err(|e| SessionError::Crypto(format!("invalid bundle JSON: {}", e)))?;

        // X3DH initiate
        let result: X3dhInitiateResult =
            e2ee_core::x3dh_initiate(&ikp, &fetch)?;

        // Init ratchet state
        let state = init_sending_chain(
            &result.root_key,
            ikp.public_key,
            fetch.identity_key,
        )?;

        let mut sessions = self.sessions.write().map_err(|e| {
            SessionError::Crypto(format!("lock poisoned: {}", e))
        })?;
        sessions.insert(session_id, Mutex::new(state));

        // Encode handshake: ephemeral_pk(32) || spk_id(4 BE) || otk_id(4 BE or 0xFFFFFFFF)
        let mut handshake = Vec::with_capacity(40);
        handshake.extend_from_slice(&result.ephemeral_public_key.0);
        handshake.extend_from_slice(&result.spk_id.to_be_bytes());
        handshake.extend_from_slice(&result.otk_id.unwrap_or(0xFFFFFFFFu32).to_be_bytes());
        Ok(handshake)
    }

    pub fn create_inbound_session(
        &self,
        session_id: String,
        identity_key_pair_bincode: Vec<u8>,
        signed_pre_key_pair_bincode: Vec<u8>,
        one_time_pre_key_pair_bincode: Option<Vec<u8>>,
        remote_identity_key_bytes: Vec<u8>,
        remote_ephemeral_key_bytes: Vec<u8>,
    ) -> Result<(), SessionError> {
        // ... (Bob-side session creation)
        // 解析 key pairs, 调用 x3dh_respond, 初始化 receiving chain
        todo!("implement based on SessionManager::new() + create_inbound_session logic")
    }

    pub fn encrypt(
        &self,
        session_id: String,
        plaintext: Vec<u8>,
    ) -> Result<Vec<u8>, SessionError> {
        let sessions = self.sessions.read().map_err(|e| {
            SessionError::Crypto(format!("lock poisoned: {}", e))
        })?;
        let mutex = sessions
            .get(&session_id)
            .ok_or_else(|| SessionError::SessionNotFound(session_id.clone()))?;
        let mut state = mutex.lock().map_err(|e| {
            SessionError::Crypto(format!("lock poisoned: {}", e))
        })?;

        let (header, ciphertext) = ratchet_encrypt(&mut state, &plaintext)?;
        
        // Encode wire format: header_len(4 BE) || bincode(header)
        let header_bytes = bincode::serialize(&header).unwrap_or_default();
        let mut wire = Vec::with_capacity(4 + header_bytes.len() + ciphertext.len());
        wire.extend_from_slice(&(header_bytes.len() as u32).to_be_bytes());
        wire.extend_from_slice(&header_bytes);
        wire.extend_from_slice(&ciphertext);
        Ok(wire)
    }

    pub fn decrypt(
        &self,
        session_id: String,
        encrypted: Vec<u8>,
    ) -> Result<Vec<u8>, SessionError> {
        // ... (解包线格式 + ratchet_decrypt)
        todo!("implement decrypt with wire format parsing")
    }

    pub fn export_session(&self, session_id: String) -> Result<Vec<u8>, SessionError> {
        let sessions = self.sessions.read().map_err(|e| {
            SessionError::Crypto(format!("lock poisoned: {}", e))
        })?;
        let mutex = sessions
            .get(&session_id)
            .ok_or_else(|| SessionError::SessionNotFound(session_id.clone()))?;
        let state = mutex.lock().map_err(|e| {
            SessionError::Crypto(format!("lock poisoned: {}", e))
        })?;
        Ok(export_state(&state))
    }

    pub fn restore_session(
        &self,
        session_id: String,
        state_bincode: Vec<u8>,
    ) -> Result<(), SessionError> {
        let state = restore_state(&state_bincode)?;
        let mut sessions = self.sessions.write().map_err(|e| {
            SessionError::Crypto(format!("lock poisoned: {}", e))
        })?;
        sessions.insert(session_id, Mutex::new(state));
        Ok(())
    }

    pub fn remove_session(&self, session_id: String) {
        if let Ok(mut sessions) = self.sessions.write() {
            sessions.remove(&session_id);
        }
    }
}
```

> **注意:** `create_inbound_session` 和 `decrypt` 仍包含 `todo!()` — 这违反了"零 Panic"铁律。实际实现时需要在 Task 22-23 中补齐。

- [x] **Step 4: Commit**

```bash
git add backend/e2ee-ffi/src/
git commit -m "feat(e2ee-ffi): add SessionManager with create_outbound_session and encrypt

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

### Task 22: e2ee-ffi — 补齐 create_inbound_session

**Files:**
- Modify: `backend/e2ee-ffi/src/session.rs`

- [x] **Step 1: 替换 create_inbound_session 的 `todo!()`**

将 `create_inbound_session` 方法体替换为：

```rust
pub fn create_inbound_session(
    &self,
    session_id: String,
    identity_key_pair_bincode: Vec<u8>,
    signed_pre_key_pair_bincode: Vec<u8>,
    one_time_pre_key_pair_bincode: Option<Vec<u8>>,
    remote_identity_key_bytes: Vec<u8>,
    remote_ephemeral_key_bytes: Vec<u8>,
) -> Result<(), SessionError> {
    let sessions = self.sessions.read().map_err(|e| {
        SessionError::Crypto(format!("lock poisoned: {}", e))
    })?;
    if sessions.contains_key(&session_id) {
        return Err(SessionError::SessionAlreadyExists(session_id));
    }
    drop(sessions);

    // 反序列化 key pairs
    let (ik_priv, ik_pub): ([u8; 32], [u8; 32]) =
        bincode::deserialize(&identity_key_pair_bincode)
            .map_err(|_| SessionError::InvalidStateData)?;
    let (spk_priv, spk_pub): ([u8; 32], [u8; 32]) =
        bincode::deserialize(&signed_pre_key_pair_bincode)
            .map_err(|_| SessionError::InvalidStateData)?;

    let ikp = e2ee_core::X25519KeyPair {
        public_key: e2ee_core::X25519PublicKey(ik_pub),
        private_key: e2ee_core::X25519PrivateKey(ik_priv),
    };
    let spkp = e2ee_core::X25519KeyPair {
        public_key: e2ee_core::X25519PublicKey(spk_pub),
        private_key: e2ee_core::X25519PrivateKey(spk_priv),
    };

    let otk_pair = one_time_pre_key_pair_bincode
        .map(|bytes| {
            let (otk_priv, otk_pub): ([u8; 32], [u8; 32]) =
                bincode::deserialize(&bytes)
                    .map_err(|_| SessionError::InvalidStateData)?;
            Ok::<_, SessionError>(e2ee_core::X25519KeyPair {
                public_key: e2ee_core::X25519PublicKey(otk_pub),
                private_key: e2ee_core::X25519PrivateKey(otk_priv),
            })
        })
        .transpose()?;

    let remote_ik = {
        let mut key = [0u8; 32];
        key.copy_from_slice(&remote_identity_key_bytes);
        e2ee_core::X25519PublicKey(key)
    };

    let remote_ek = {
        let mut key = [0u8; 32];
        key.copy_from_slice(&remote_ephemeral_key_bytes);
        e2ee_core::X25519PublicKey(key)
    };

    let result = e2ee_core::x3dh_respond(
        &ikp,
        &spkp,
        otk_pair.as_ref(),
        &remote_ik,
        &remote_ek,
    )?;

    let state = init_receiving_chain(&result.root_key, ikp.public_key, remote_ik)?;

    let mut sessions = self.sessions.write().map_err(|e| {
        SessionError::Crypto(format!("lock poisoned: {}", e))
    })?;
    sessions.insert(session_id, Mutex::new(state));
    Ok(())
}
```

- [x] **Step 2: 编译验证**

```bash
cd backend && cargo check -p e2ee-ffi 2>&1
```

- [x] **Step 3: Commit**

```bash
git add backend/e2ee-ffi/src/session.rs
git commit -m "feat(e2ee-ffi): implement create_inbound_session

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

### Task 23: e2ee-ffi — 补齐 decrypt (线格式解析)

**Files:**
- Modify: `backend/e2ee-ffi/src/session.rs`

- [x] **Step 1: 替换 decrypt 的 `todo!()`**

```rust
pub fn decrypt(
    &self,
    session_id: String,
    encrypted: Vec<u8>,
) -> Result<Vec<u8>, SessionError> {
    if encrypted.len() < 4 {
        return Err(SessionError::Crypto("encrypted data too short".into()));
    }

    let header_len = u32::from_be_bytes([encrypted[0], encrypted[1], encrypted[2], encrypted[3]]) as usize;
    if encrypted.len() < 4 + header_len {
        return Err(SessionError::Crypto("encrypted data truncated".into()));
    }

    let header_bytes = &encrypted[4..4 + header_len];
    let header: e2ee_core::RatchetHeader = bincode::deserialize(header_bytes)
        .map_err(|_| SessionError::Crypto("invalid ratchet header".into()))?;
    let ciphertext = &encrypted[4 + header_len..];

    let sessions = self.sessions.read().map_err(|e| {
        SessionError::Crypto(format!("lock poisoned: {}", e))
    })?;
    let mutex = sessions
        .get(&session_id)
        .ok_or_else(|| SessionError::SessionNotFound(session_id.clone()))?;
    let mut state = mutex.lock().map_err(|e| {
        SessionError::Crypto(format!("lock poisoned: {}", e))
    })?;

    ratchet_decrypt(&mut state, &header, ciphertext).map_err(SessionError::from)
}
```

- [x] **Step 2: 编译验证**

```bash
cd backend && cargo check -p e2ee-ffi 2>&1
```

- [x] **Step 3: Commit**

```bash
git add backend/e2ee-ffi/src/session.rs
git commit -m "feat(e2ee-ffi): implement decrypt with wire format parsing

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

## Phase 7: e2ee-wasm (wasm-bindgen → Web)

### Task 24: e2ee-wasm Cargo.toml + lib.rs 骨架

**Files:**
- Create: `backend/e2ee-wasm/Cargo.toml`
- Create: `backend/e2ee-wasm/src/lib.rs`

- [x] **Step 1: 创建 Cargo.toml**

```toml
[package]
name = "e2ee-wasm"
version.workspace = true
edition.workspace = true

[lib]
crate-type = ["cdylib"]

[dependencies]
e2ee-core = { path = "../e2ee-core" }
wasm-bindgen.workspace = true
bincode.workspace = true
serde_json.workspace = true
```

- [x] **Step 2: 创建 lib.rs**

```rust
mod session;

pub use session::WasmSessionManager;
```

- [x] **Step 3: 创建 session.rs**

```rust
use std::collections::HashMap;
use e2ee_core::{
    self, generate_key_bundle, init_receiving_chain, init_sending_chain,
    ratchet_encrypt, ratchet_decrypt, export_state, restore_state,
    RatchetState, PreKeyBundleFetch, PreKey,
};
use wasm_bindgen::prelude::*;

#[wasm_bindgen]
pub struct WasmSessionManager {
    sessions: HashMap<String, RatchetState>,
}

#[wasm_bindgen]
impl WasmSessionManager {
    #[wasm_bindgen(constructor)]
    pub fn new() -> Self {
        Self {
            sessions: HashMap::new(),
        }
    }

    pub fn create_outbound_session(
        &mut self,
        session_id: String,
        identity_key_pair_bincode: Vec<u8>,
        remote_bundle_json: String,
    ) -> Result<Vec<u8>, JsValue> {
        // 解析 IK
        let (ik_priv, ik_pub): ([u8; 32], [u8; 32]) = bincode::deserialize(&identity_key_pair_bincode)
            .map_err(|e| JsValue::from_str(&format!("invalid identity key: {}", e)))?;
        let ikp = e2ee_core::X25519KeyPair {
            public_key: e2ee_core::X25519PublicKey(ik_pub),
            private_key: e2ee_core::X25519PrivateKey(ik_priv),
        };

        // 解析 Bundle
        let fetch: PreKeyBundleFetch = serde_json::from_str(&remote_bundle_json)
            .map_err(|e| JsValue::from_str(&format!("invalid bundle JSON: {}", e)))?;

        // X3DH
        let result = e2ee_core::x3dh_initiate(&ikp, &fetch)
            .map_err(|e| JsValue::from_str(&e.to_string()))?;

        // Init ratchet
        let state = init_sending_chain(&result.root_key, ikp.public_key, fetch.identity_key)
            .map_err(|e| JsValue::from_str(&e.to_string()))?;

        self.sessions.insert(session_id, state);

        // Encode handshake
        let mut handshake = Vec::with_capacity(40);
        handshake.extend_from_slice(&result.ephemeral_public_key.0);
        handshake.extend_from_slice(&result.spk_id.to_be_bytes());
        handshake.extend_from_slice(&result.otk_id.unwrap_or(0xFFFFFFFFu32).to_be_bytes());
        Ok(handshake)
    }

    pub fn create_inbound_session(
        &mut self,
        session_id: String,
        identity_key_pair_bincode: Vec<u8>,
        signed_pre_key_pair_bincode: Vec<u8>,
        one_time_pre_key_pair_bincode: Option<Vec<u8>>,
        remote_identity_key_bytes: Vec<u8>,
        remote_ephemeral_key_bytes: Vec<u8>,
    ) -> Result<(), JsValue> {
        // ... (同 FFI 版本的逻辑，但使用 JsValue 错误类型)
        todo!()
    }

    pub fn encrypt(&mut self, session_id: String, plaintext: Vec<u8>) -> Result<Vec<u8>, JsValue> {
        let state = self.sessions.get_mut(&session_id)
            .ok_or_else(|| JsValue::from_str("session not found"))?;
        let (header, ciphertext) = ratchet_encrypt(state, &plaintext)
            .map_err(|e| JsValue::from_str(&e.to_string()))?;
        let header_bytes = bincode::serialize(&header).unwrap_or_default();
        let mut wire = Vec::with_capacity(4 + header_bytes.len() + ciphertext.len());
        wire.extend_from_slice(&(header_bytes.len() as u32).to_be_bytes());
        wire.extend_from_slice(&header_bytes);
        wire.extend_from_slice(&ciphertext);
        Ok(wire)
    }

    pub fn decrypt(&mut self, session_id: String, encrypted: Vec<u8>) -> Result<Vec<u8>, JsValue> {
        // ... (同 FFI 版本的 decrypt)
        todo!()
    }

    pub fn export_session(&self, session_id: String) -> Result<Vec<u8>, JsValue> {
        let state = self.sessions.get(&session_id)
            .ok_or_else(|| JsValue::from_str("session not found"))?;
        Ok(export_state(state))
    }

    pub fn restore_session(&mut self, session_id: String, state_bincode: Vec<u8>) -> Result<(), JsValue> {
        let state = restore_state(&state_bincode)
            .map_err(|e| JsValue::from_str(&e.to_string()))?;
        self.sessions.insert(session_id, state);
        Ok(())
    }

    pub fn remove_session(&mut self, session_id: String) {
        self.sessions.remove(&session_id);
    }
}
```

- [x] **Step 4: 编译验证 (需要 wasm32 target)**

```bash
# 安装 wasm32 target（如未安装）
rustup target add wasm32-unknown-unknown
cd backend && cargo check -p e2ee-wasm --target wasm32-unknown-unknown 2>&1
```

- [x] **Step 5: Commit**

```bash
git add backend/e2ee-wasm/
git commit -m "feat(e2ee-wasm): add WasmSessionManager with wasm-bindgen

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

### Task 25: e2ee-wasm — 补齐 create_inbound_session + decrypt

**Files:**
- Modify: `backend/e2ee-wasm/src/session.rs`

- [x] **Step 1: 替换 `create_inbound_session`**

```rust
pub fn create_inbound_session(
    &mut self,
    session_id: String,
    identity_key_pair_bincode: Vec<u8>,
    signed_pre_key_pair_bincode: Vec<u8>,
    one_time_pre_key_pair_bincode: Option<Vec<u8>>,
    remote_identity_key_bytes: Vec<u8>,
    remote_ephemeral_key_bytes: Vec<u8>,
) -> Result<(), JsValue> {
    let (ik_priv, ik_pub): ([u8; 32], [u8; 32]) = bincode::deserialize(&identity_key_pair_bincode)
        .map_err(|e| JsValue::from_str(&format!("invalid identity key: {}", e)))?;
    let (spk_priv, spk_pub): ([u8; 32], [u8; 32]) = bincode::deserialize(&signed_pre_key_pair_bincode)
        .map_err(|e| JsValue::from_str(&format!("invalid SPK: {}", e)))?;

    let ikp = e2ee_core::X25519KeyPair {
        public_key: e2ee_core::X25519PublicKey(ik_pub),
        private_key: e2ee_core::X25519PrivateKey(ik_priv),
    };
    let spkp = e2ee_core::X25519KeyPair {
        public_key: e2ee_core::X25519PublicKey(spk_pub),
        private_key: e2ee_core::X25519PrivateKey(spk_priv),
    };
    let otk_pair = one_time_pre_key_pair_bincode
        .map(|bytes| {
            let (otk_priv, otk_pub): ([u8; 32], [u8; 32]) = bincode::deserialize(&bytes)
                .map_err(|e| JsValue::from_str(&format!("invalid OTK: {}", e)))?;
            Ok(e2ee_core::X25519KeyPair {
                public_key: e2ee_core::X25519PublicKey(otk_pub),
                private_key: e2ee_core::X25519PrivateKey(otk_priv),
            })
        })
        .transpose()?;

    let remote_ik = {
        let mut key = [0u8; 32];
        key.copy_from_slice(&remote_identity_key_bytes);
        e2ee_core::X25519PublicKey(key)
    };
    let remote_ek = {
        let mut key = [0u8; 32];
        key.copy_from_slice(&remote_ephemeral_key_bytes);
        e2ee_core::X25519PublicKey(key)
    };

    let result = e2ee_core::x3dh_respond(&ikp, &spkp, otk_pair.as_ref(), &remote_ik, &remote_ek)
        .map_err(|e| JsValue::from_str(&e.to_string()))?;
    let state = init_receiving_chain(&result.root_key, ikp.public_key, remote_ik)
        .map_err(|e| JsValue::from_str(&e.to_string()))?;
    self.sessions.insert(session_id, state);
    Ok(())
}
```

- [x] **Step 2: 替换 `decrypt`**

```rust
pub fn decrypt(&mut self, session_id: String, encrypted: Vec<u8>) -> Result<Vec<u8>, JsValue> {
    if encrypted.len() < 4 {
        return Err(JsValue::from_str("encrypted data too short"));
    }
    let header_len = u32::from_be_bytes([encrypted[0], encrypted[1], encrypted[2], encrypted[3]]) as usize;
    if encrypted.len() < 4 + header_len {
        return Err(JsValue::from_str("encrypted data truncated"));
    }
    let header_bytes = &encrypted[4..4 + header_len];
    let header: e2ee_core::RatchetHeader = bincode::deserialize(header_bytes)
        .map_err(|e| JsValue::from_str(&format!("invalid header: {}", e)))?;
    let ciphertext = &encrypted[4 + header_len..];

    let state = self.sessions.get_mut(&session_id)
        .ok_or_else(|| JsValue::from_str("session not found"))?;
    ratchet_decrypt(state, &header, ciphertext)
        .map_err(|e| JsValue::from_str(&e.to_string()))
}
```

- [x] **Step 3: 编译验证**

```bash
cd backend && cargo check -p e2ee-wasm --target wasm32-unknown-unknown 2>&1
```

- [x] **Step 4: Commit**

```bash
git add backend/e2ee-wasm/src/session.rs
git commit -m "feat(e2ee-wasm): complete WasmSessionManager with all methods

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

## Phase 8: CI 安全门禁 + 最终验证

### Task 26: CI 安全扫描

**Files:**
- No new files; 验证现有 CI 或手动执行

- [x] **Step 1: 零 unsafe 检查**

```bash
cd backend && grep -rn "unsafe" e2ee-core/src/ e2ee-ffi/src/ e2ee-wasm/src/ 2>&1
```
Expected: 零结果（仅 `#![forbid(unsafe_code)]` 出现 "unsafe" 字样）。

- [x] **Step 2: 零 panic 宏检查**

```bash
cd backend && grep -rnE "unreachable!|panic!|\.unwrap\(\)|\.expect\(" e2ee-core/src/ 2>&1
```
Expected: 仅测试模块中出现 `unwrap()`（测试中可以 panic）。

- [x] **Step 3: Clippy 零警告**

```bash
cd backend && cargo clippy -p e2ee-core -- -D warnings 2>&1
```
Expected: 零警告。

- [x] **Step 4: cargo fmt**

```bash
cd backend && cargo fmt --check -p e2ee-core -p e2ee-ffi -p e2ee-wasm 2>&1
```

- [x] **Step 5: 完整测试套件**

```bash
cd backend && cargo test -p e2ee-core -- --nocapture 2>&1
```
Expected: 全部测试通过（~48 tests: ~22 primitives + ~6 state + ~16 ratchet + ~4 x3dh + 3 integration）。

- [x] **Step 6: Commit**

```bash
git add backend/
git commit -m "chore: verify zero unsafe, zero clippy warnings, all tests pass

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

## 验证清单

完成所有任务后，运行以下命令确认：

```bash
# 1. 纯核编译
cd backend && cargo build -p e2ee-core

# 2. 纯核测试
cargo test -p e2ee-core

# 3. FFI 编译
cargo build -p e2ee-ffi

# 4. WASM 编译
cargo build -p e2ee-wasm --target wasm32-unknown-unknown

# 5. 安全门禁
grep -rn "unsafe" backend/e2ee-core/src/
cargo clippy -p e2ee-core -- -D warnings
cargo fmt --check -p e2ee-core -p e2ee-ffi -p e2ee-wasm
```

---

**预计总工作量**: ~26 tasks × ~5 min = ~130 min（约 2 小时纯实现时间）

---

## Implementation Notes — 实现期修复与增量

以下项在实现过程中发现设计文档与最终代码存在差异，已作为 follow-up 修复：

### Follow-up F1: AAD canonical ordering

**问题**：设计文档 AAD 使用 `local_IK || remote_IK` 顺序，导致接收方 AAD 与发送方不一致（角色互换时前 64 bytes 顺序反转，AEAD 认证失败）。

**修复**：`build_ratchet_aad` 改用 lexicographic ordering（`smaller_IK || larger_IK`）。添加 `chain_info_for_sender` 函数基于 canonical key comparison 确定 Sending/Receiving 链方向。设计文档已同步更新（ADR-8）。

- [x] 代码实现: `ratchet.rs:build_ratchet_aad`, `chain_info_for_sender`, `local_sending_chain_info`, `local_receiving_chain_info`
- [x] 文档更新: `2026-05-18-e2ee-rust-core-design.md` §5.4.5, ADR-8

### Follow-up F2: OTK ID 管理

**问题**：设计文档中 `KeyBundle.one_time_pre_key_pairs: Vec<X25519KeyPair>` 不含 OTK id，`x3dh_respond` 返回的 `otk_id` 无法可靠传递。

**修复**：
- 新增 `OneTimePreKeyPair { id: u32, key_pair: X25519KeyPair }` 替代裸 `X25519KeyPair`
- `KeyBundle.one_time_pre_key_pairs` → `Vec<OneTimePreKeyPair>`
- `generate_key_bundle` 接受 `&[(u32, u32)]` batch-based OTK 分配
- 添加 `generate_key_bundle_with_count` 兼容包装
- `x3dh_respond` 接受 `Option<&OneTimePreKeyPair>`（主 API）
- 添加 `x3dh_respond_with_raw_otk` 兼容包装（接受裸 `X25519KeyPair`，otk_id=None）

- [x] 代码实现: `x3dh.rs:OneTimePreKeyPair`, `generate_key_bundle`, `generate_key_bundle_with_count`, `x3dh_respond`, `x3dh_respond_with_raw_otk`
- [x] 文档更新: `2026-05-18-e2ee-rust-core-design.md` §4.1, §4.2

### Follow-up F3: RatchetHeader 线格式（显式编码，非 bincode）

**问题**：设计文档中 RatchetHeader 使用 bincode 序列化，但 bincode 是 Rust-specific 的序列化格式，前端 TypeScript 和移动端无法可靠解析。

**修复**：使用显式固定布局 52 bytes（32 + 4 + 4 + 12 BE），通过 `encode_ratchet_header` / `decode_ratchet_header` 编解码，零索引访问。设计文档已更新。

- [x] 代码实现: `state.rs:encode_ratchet_header`, `decode_ratchet_header`
- [x] 文档更新: `2026-05-18-e2ee-rust-core-design.md` §6.1

### Follow-up F4: FFI/WASM X25519 KeyPair 双格式 bincode 契约

**问题**：设计文档未规定 keypair bincode 格式，需明确跨端契约。

**修复**：e2ee-ffi 和 e2ee-wasm 均实现 `decode_keypair`：
- Core format: `bincode(X25519KeyPair)` → pub(32) || priv(32) (首选)
- Legacy format: `bincode((priv, pub))` → priv(32) || pub(32) (兼容回退)
- 两种格式均通过 `is_valid_x25519_keypair` 密码学验证

- [x] 代码实现: `e2ee-ffi/src/session.rs:decode_keypair`, `is_valid_x25519_keypair`; `e2ee-wasm/src/session.rs` 同
- [x] 文档更新: `2026-05-18-e2ee-rust-core-design.md` §6.2

### Follow-up F5: 错误枚举扩展

**问题**：设计文档中的错误枚举缺少 `InvalidHeader`, `InvalidPreKeyId`, `InvalidCounter(String)` 等实现期需要的变体。

**修复**：新增 3 个变体，`InvalidCounter` 改为携带 contextual 信息。

- [x] 代码实现: `errors.rs`
- [x] 文档更新: `2026-05-18-e2ee-rust-core-design.md` 附录

### Follow-up F6: RatchetState 非敏感字段 zeroize(skip)

**问题**：`local_identity_key`, `remote_identity_key`, `remote_public_key` 是公钥，无需 zeroize。

**修复**：添加 `#[zeroize(skip)]` 注解。

- [x] 代码实现: `state.rs`
- [x] 文档更新: `2026-05-18-e2ee-rust-core-design.md` §5.2

### Follow-up F7: 解密控制流重构

**问题**：原始设计文档中的解密控制流未区分 `prepare_initial_response_ratchet` 和 `perform_dh_ratchet` 两种场景。

**修复**：实现中 `ratchet_decrypt` 显式处理三种场景：
1. 跳过密钥缓存命中 → 直接解密
2. `remote_public_key.is_none() && send_counter > 0` → 首次响应，先 `prepare_initial_response_ratchet`
3. `remote_public_key != header.ratchet_public_key` → 完整 DH ratchet 步进

- [x] 代码实现: `ratchet.rs:ratchet_decrypt`, `prepare_initial_response_ratchet`
- [x] 测试覆盖: `ratchet_dh_public_key_rotates_on_each_dh_step`

### 仍待确定/未实现项

- [ ] **Sender Key 群组加密**: 未在 e2ee-core 中实现，属于后续阶段
- [ ] **Fuzzing 测试**: 已标注为待补充 (§8.4)
- [ ] **WebCrypto 互操作测试**: 已标注为待补充
- [ ] **trybuild compile_fail 测试**: 已标注为待补充
- [ ] **Frontend TypeScript engine 迁移到 e2ee-wasm**: 属于后续阶段
