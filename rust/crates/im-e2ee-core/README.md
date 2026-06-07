# im-e2ee-core

Pure Rust E2EE (End-to-End Encryption) engine — zero I/O, zero unsafe, zero panics.

Curve25519 (X25519 + Ed25519) based. Implements X3DH key agreement → Double Ratchet messaging.

## Safety guarantees (compile-enforced)

| # | Rule | Mechanism |
|---|------|-----------|
| 1 | Zero `unsafe` | `#![forbid(unsafe_code)]` |
| 2 | Zero panics | `#![deny(clippy::panic, clippy::unwrap_used, clippy::expect_used)]` |
| 3 | Secret zeroization | `#[derive(Zeroize, ZeroizeOnDrop)]` on all key types |
| 4 | DoS protection | `MAX_SKIP = 2000` — counter gap exceeding this is rejected |
| 5 | No slice indexing | `#![deny(clippy::indexing_slicing)]` — all access via `.get()` / iterators |
| 6 | No `as` casts | `#![deny(clippy::as_conversions)]` — `From`/`TryFrom` only |
| 7 | Must-use results | `#![deny(unused_must_use)]` — all `Result` values consumed |

## Core I/O free

This crate contains NO network, filesystem, database, or threading code.
Host is responsible for:

- Transport (HTTP/WebSocket)
- Key storage (encrypted at rest — KeyStore/Keychain/IndexedDB)
- Session state persistence (`export_state` / `restore_state` — bincode bytes)
- OTK ID assignment and pre-key bundle publishing

## Local verification

```bash
# Run all core tests
cd rust && cargo test -p im-e2ee-core

# Clippy — must pass with zero warnings
cd rust && cargo clippy -p im-e2ee-core -- -D warnings

# Format check
cd backend && cargo fmt --check

# Full CI gate (all 3 checks)
cd rust && cargo test -p im-e2ee-core && cargo clippy -p im-e2ee-core -- -D warnings && cargo fmt --check
```

## Module overview

| Module | Purpose |
|--------|---------|
| `errors.rs` | `E2eeError` enum (thiserror, `PartialEq + Eq`) |
| `primitives.rs` | Newtype key types, X25519 DH, Ed25519 sign/verify, HKDF-SHA256, AES-256-GCM |
| `state.rs` | `RatchetState`, `SkippedKeyStore`, `RatchetHeader` encode/decode, bincode persistence |
| `ratchet.rs` | Double Ratchet state machine — encrypt, decrypt, DH ratchet step, MAX_SKIP |
| `x3dh.rs` | X3DH key agreement — key bundle generation, initiate, respond |

## Key wire contracts

### RatchetHeader (52 bytes explicit)

```
ratchet_public_key(32) ‖ counter(4 BE) ‖ previous_counter(4 BE) ‖ nonce(12)
```

Encoded/decoded via `encode_ratchet_header` / `decode_ratchet_header` — NOT bincode.

### X25519 keypair bincode

Core format: `bincode(X25519KeyPair)` → `public_key(32) ‖ private_key(32)` (field declaration order).
Legacy fallback: `bincode((priv, pub))` → `private_key(32) ‖ public_key(32)`. Both cryptographically validated.

### AAD ordering (104 bytes)

```
smaller_IK(32) ‖ larger_IK(32) ‖ ratchet_pk(32) ‖ counter(4 BE) ‖ previous_counter(4 BE)
```

Identity keys sorted lexicographically (canonical ordering), NOT local ‖ remote.
This ensures both parties derive the same AAD without role negotiation.

### Encrypted message wire format

```
header_len(4 BE = 0x00000034) ‖ RatchetHeader(52) ‖ AES-256-GCM ciphertext
```

## Dependencies

All dependencies are pure Rust with no C/C++ linkage required:

- `x25519-dalek` — X25519 ECDH
- `ed25519-dalek` — Ed25519 signatures
- `aes-gcm` — AES-256-GCM AEAD
- `hkdf` / `sha2` / `hmac` — key derivation
- `rand_core` / `getrandom` — OS entropy
- `zeroize` — memory sanitization
- `serde` / `bincode` — state serialization
- `thiserror` — error derive

## License

Proprietary — all rights reserved.
