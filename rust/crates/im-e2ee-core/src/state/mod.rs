//! Ratchet state machine types for the Double Ratchet algorithm.
//!
//! This module provides:
//! - Protocol-level key newtypes (`RatchetRootKey`, `ChainKey`, `MessageKey`)
//! - `RatchetHeader` for wire format metadata
//! - `SkippedKeyStore` for out-of-order message key caching with LRU eviction
//! - `RatchetState` as the full ratchet state machine
//! - `export_state` / `restore_state` for bincode persistence
//! - `encode_ratchet_header` / `decode_ratchet_header` for explicit wire format

use serde::{Deserialize, Serialize};
use zeroize::{Zeroize, ZeroizeOnDrop};

use crate::errors::E2eeError;
use crate::primitives::{AesNonce, X25519KeyPair, X25519PublicKey};

// ============================================================================
// Sensitive Newtypes (Protocol-level keys)
// ============================================================================

/// The root key at the top of the KDF chain.
///
/// Derives new chain keys after each DH ratchet step.
#[derive(Zeroize, ZeroizeOnDrop, Serialize, Deserialize)]
pub struct RatchetRootKey(pub [u8; 32]);

/// A chain key in the sending or receiving chain.
///
/// Consumed to produce message keys and the next chain key.
#[derive(Zeroize, ZeroizeOnDrop, Serialize, Deserialize)]
pub struct ChainKey(pub [u8; 32]);

/// A one-time message key used for AES-256-GCM encryption.
///
/// Converted into an `Aes256Key` via `From`, then consumed on use.
#[derive(Zeroize, ZeroizeOnDrop, Serialize, Deserialize)]
pub struct MessageKey(pub [u8; 32]);

/// Consuming conversion: `MessageKey` -> `Aes256Key`.
///
/// The bytes are copied out (array is `Copy`), then the `MessageKey`
/// goes out of scope and is zeroized by `ZeroizeOnDrop`.
impl From<MessageKey> for crate::primitives::Aes256Key {
    fn from(mk: MessageKey) -> Self {
        Self(mk.0)
    }
}

// ============================================================================
// RatchetHeader — wire format metadata
// ============================================================================

/// Header sent alongside each ciphertext message.
///
/// Contains the DH public key, counters, and nonce needed for decryption.
///
/// Wire format (52 bytes, explicit Big-Endian):
///   ratchet_public_key(32) || counter(4 BE) || previous_counter(4 BE) || nonce(12)
pub struct RatchetHeader {
    pub ratchet_public_key: X25519PublicKey,
    pub counter: u32,
    pub previous_counter: u32,
    pub nonce: AesNonce,
}

// ============================================================================
// RatchetHeader — explicit wire format encode / decode
// ============================================================================

/// Encode a [`RatchetHeader`] into the explicit 52-byte wire format.
///
/// Layout: ratchet_public_key(32) || counter(4 BE) || previous_counter(4 BE) || nonce(12)
#[must_use]
pub fn encode_ratchet_header(header: &RatchetHeader) -> [u8; 52] {
    let mut buf = [0u8; 52];
    let (pk_slot, rest) = buf.split_at_mut(32);
    let (counter_slot, rest) = rest.split_at_mut(4);
    let (prev_counter_slot, nonce_slot) = rest.split_at_mut(4);

    pk_slot.copy_from_slice(&header.ratchet_public_key.0);
    counter_slot.copy_from_slice(&header.counter.to_be_bytes());
    prev_counter_slot.copy_from_slice(&header.previous_counter.to_be_bytes());
    nonce_slot.copy_from_slice(&header.nonce.0);

    buf
}

/// Decode a [`RatchetHeader`] from explicit wire format bytes.
///
/// Expected layout: ratchet_public_key(32) || counter(4 BE) || previous_counter(4 BE) || nonce(12)
///
/// # Errors
///
/// Returns `InvalidHeader` if the byte slice length does not equal 52.
pub fn decode_ratchet_header(bytes: &[u8]) -> Result<RatchetHeader, E2eeError> {
    if bytes.len() != 52 {
        return Err(E2eeError::InvalidHeader(format!(
            "expected 52 bytes, got {}",
            bytes.len()
        )));
    }
    let (pk_bytes, rest) = bytes.split_at(32);
    let (counter_bytes, rest) = rest.split_at(4);
    let (prev_counter_bytes, nonce_bytes) = rest.split_at(4);
    // nonce_bytes is 12 bytes

    let mut ratchet_public_key = [0u8; 32];
    ratchet_public_key.copy_from_slice(pk_bytes);

    let mut counter_arr = [0u8; 4];
    counter_arr.copy_from_slice(counter_bytes);
    let counter = u32::from_be_bytes(counter_arr);

    let mut prev_counter_arr = [0u8; 4];
    prev_counter_arr.copy_from_slice(prev_counter_bytes);
    let previous_counter = u32::from_be_bytes(prev_counter_arr);

    let mut nonce = [0u8; 12];
    nonce.copy_from_slice(nonce_bytes);

    Ok(RatchetHeader {
        ratchet_public_key: X25519PublicKey(ratchet_public_key),
        counter,
        previous_counter,
        nonce: AesNonce(nonce),
    })
}

// ============================================================================
// SkippedKeyStore — out-of-order message key cache
// ============================================================================

/// A single entry in the skipped message key store.
///
/// Does NOT derive `ZeroizeOnDrop` so that `MessageKey` can be moved out
/// on removal. The `MessageKey` field zeroizes itself via its own Drop.
#[derive(Serialize, Deserialize)]
struct SkippedEntry {
    ratchet_public_key: X25519PublicKey,
    counter: u32,
    message_key: MessageKey,
}

/// A bounded store for skipped (out-of-order) message keys.
///
/// Uses LRU eviction when the maximum capacity (`MAX = 2000`) is reached.
/// The store is zeroized on drop via manual `Zeroize` impl.
#[derive(Serialize, Deserialize)]
pub struct SkippedKeyStore(Vec<SkippedEntry>);

impl Default for SkippedKeyStore {
    fn default() -> Self {
        Self::new()
    }
}

impl Zeroize for SkippedKeyStore {
    fn zeroize(&mut self) {
        for entry in &mut self.0 {
            entry.message_key.zeroize();
        }
        self.0.clear();
    }
}

impl ZeroizeOnDrop for SkippedKeyStore {}

impl SkippedKeyStore {
    /// Maximum number of skipped message keys to store.
    pub const MAX: usize = 2000;

    /// Create a new empty skipped key store.
    pub fn new() -> Self {
        Self(Vec::new())
    }

    /// Insert a skipped message key.
    ///
    /// If the store has reached `MAX` capacity, the oldest entry (index 0)
    /// is evicted (LRU semantics).
    pub fn insert(
        &mut self,
        ratchet_public_key: X25519PublicKey,
        counter: u32,
        message_key: MessageKey,
    ) -> Result<(), crate::errors::E2eeError> {
        if self.0.len() >= Self::MAX {
            self.0.remove(0); // LRU eviction -> Drop -> MessageKey zeroized
        }
        self.0.push(SkippedEntry {
            ratchet_public_key,
            counter,
            message_key,
        });
        Ok(())
    }

    /// Remove and return the message key for a given (ratchet_key, counter).
    ///
    /// Returns `None` if no matching entry is found. O(n) linear scan.
    pub fn remove(
        &mut self,
        ratchet_public_key: &X25519PublicKey,
        counter: u32,
    ) -> Option<MessageKey> {
        let pos = self
            .0
            .iter()
            .position(|e| e.ratchet_public_key.0 == ratchet_public_key.0 && e.counter == counter)?;
        // `remove` returns the entry; `.message_key` is moved out because
        // SkippedEntry does NOT implement Drop.
        Some(self.0.remove(pos).message_key)
    }

    /// Number of currently stored skipped keys.
    pub fn len(&self) -> usize {
        self.0.len()
    }

    /// Returns `true` if no skipped keys are stored.
    pub fn is_empty(&self) -> bool {
        self.0.is_empty()
    }
}

// ============================================================================
// RatchetState — full ratchet state machine
// ============================================================================

/// Complete state of a Double Ratchet session.
///
/// Serialization via bincode enables session persistence across restarts.
/// Secret fields are zeroized on drop.
#[derive(Serialize, Deserialize, Zeroize, ZeroizeOnDrop)]
pub struct RatchetState {
    pub root_key: RatchetRootKey,
    pub sending_chain_key: Option<ChainKey>,
    pub receiving_chain_key: Option<ChainKey>,
    pub send_counter: u32,
    pub receive_counter: u32,
    pub previous_counter: u32,
    pub dh_key_pair: X25519KeyPair,
    #[zeroize(skip)]
    pub remote_public_key: Option<X25519PublicKey>,
    pub skipped_message_keys: SkippedKeyStore,
    #[zeroize(skip)]
    pub local_identity_key: X25519PublicKey,
    #[zeroize(skip)]
    pub remote_identity_key: X25519PublicKey,
}

// ============================================================================
// State Persistence (bincode)
// ============================================================================

/// Current serialization format version for persisted ratchet state.
///
/// Version 1: a one-byte version prefix followed by a bincode-encoded
/// `RatchetState`. Version 0 denotes the legacy plain-bincode format with no
/// prefix and is supported as a fallback during import.
pub const STATE_VERSION: u8 = 1;

/// Serialize ratchet state to a byte vector.
///
/// The output is prefixed with [`STATE_VERSION`] so future schema changes can
/// be detected during deserialization.
///
/// Returns `StateSerializationFailed` instead of hiding serialization errors.
pub fn try_export_state(state: &RatchetState) -> Result<Vec<u8>, crate::errors::E2eeError> {
    let payload = bincode::serialize(state).map_err(|_| {
        crate::errors::E2eeError::StateSerializationFailed("bincode serialize failed".to_string())
    })?;
    let mut out = Vec::with_capacity(payload.len().saturating_add(1));
    out.push(STATE_VERSION);
    out.extend_from_slice(&payload);
    Ok(out)
}

/// Compatibility serializer that preserves the original documented signature.
///
/// On serialization failure this returns an empty `Vec<u8>`; new call sites
/// should use `try_export_state`.
#[must_use]
#[allow(clippy::manual_unwrap_or_default)]
pub fn export_state(state: &RatchetState) -> Vec<u8> {
    if let Ok(bytes) = try_export_state(state) {
        bytes
    } else {
        Vec::new()
    }
}

/// Deserialize ratchet state from versioned bincode-encoded bytes.
///
/// # Errors
///
/// Returns `StateDeserializationFailed` if the bytes are corrupted or
/// do not represent a valid `RatchetState` for the detected version.
/// Returns `StateSerializationFailed` with a descriptive message when the
/// version prefix indicates an unsupported format.
pub fn restore_state(bytes: &[u8]) -> Result<RatchetState, crate::errors::E2eeError> {
    let first = bytes
        .first()
        .copied()
        .ok_or(crate::errors::E2eeError::StateDeserializationFailed)?;

    if first == STATE_VERSION {
        let payload = bytes
            .get(1..)
            .ok_or(crate::errors::E2eeError::StateDeserializationFailed)?;
        return bincode::deserialize(payload)
            .map_err(|_| crate::errors::E2eeError::StateDeserializationFailed);
    }

    // Legacy fallback: plain bincode without a version prefix.
    match bincode::deserialize(bytes) {
        Ok(state) => Ok(state),
        Err(_) => Err(crate::errors::E2eeError::StateSerializationFailed(format!(
            "deserialization failed: unsupported or corrupted state version {first}"
        ))),
    }
}

#[cfg(test)]
mod tests;
