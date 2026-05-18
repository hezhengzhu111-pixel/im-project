//! Ratchet state machine types for the Double Ratchet algorithm.
//!
//! This module provides:
//! - Protocol-level key newtypes (`RatchetRootKey`, `ChainKey`, `MessageKey`)
//! - `RatchetHeader` for wire format metadata
//! - `SkippedKeyStore` for out-of-order message key caching with LRU eviction
//! - `RatchetState` as the full ratchet state machine
//! - `export_state` / `restore_state` for bincode persistence

use serde::{Deserialize, Serialize};
use zeroize::{Zeroize, ZeroizeOnDrop};

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
#[derive(Serialize, Deserialize)]
pub struct RatchetHeader {
    pub ratchet_public_key: X25519PublicKey,
    pub counter: u32,
    pub previous_counter: u32,
    pub nonce: AesNonce,
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

/// Serialize ratchet state to a byte vector via bincode.
///
/// Returns `StateSerializationFailed` instead of hiding serialization errors.
pub fn try_export_state(state: &RatchetState) -> Result<Vec<u8>, crate::errors::E2eeError> {
    bincode::serialize(state).map_err(|_| crate::errors::E2eeError::StateSerializationFailed)
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

/// Deserialize ratchet state from bincode-encoded bytes.
///
/// # Errors
///
/// Returns `StateDeserializationFailed` if the bytes are corrupted or
/// do not represent a valid `RatchetState`.
pub fn restore_state(bytes: &[u8]) -> Result<RatchetState, crate::errors::E2eeError> {
    bincode::deserialize(bytes).map_err(|_| crate::errors::E2eeError::StateDeserializationFailed)
}

// ============================================================================
// Tests
// ============================================================================

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
    fn export_restore_roundtrip() -> Result<(), crate::errors::E2eeError> {
        let state = make_test_state();
        let bytes = export_state(&state);
        assert!(!bytes.is_empty());
        let restored = restore_state(&bytes)?;
        assert_eq!(restored.send_counter, 42);
        assert_eq!(restored.receive_counter, 7);
        Ok(())
    }

    #[test]
    fn restore_corrupted_data_fails() {
        let result = restore_state(&[0xFFu8; 8]);
        assert!(matches!(
            result,
            Err(crate::errors::E2eeError::StateDeserializationFailed)
        ));
    }

    #[test]
    fn skipped_key_store_insert_remove() -> Result<(), crate::errors::E2eeError> {
        let mut store = SkippedKeyStore::new();
        let kp = generate_x25519_keypair();
        store.insert(kp.public_key, 0, MessageKey([1u8; 32]))?;
        assert_eq!(store.len(), 1);
        let mk = store.remove(&kp.public_key, 0);
        assert!(mk.is_some());
        assert_eq!(store.len(), 0);
        Ok(())
    }

    #[test]
    fn skipped_key_store_remove_nonexistent() {
        let mut store = SkippedKeyStore::new();
        let kp = generate_x25519_keypair();
        assert!(store.remove(&kp.public_key, 999).is_none());
    }

    #[test]
    fn skipped_key_store_lru_eviction() {
        let mut store = SkippedKeyStore::new();
        for i in 0..2000 {
            let kp = generate_x25519_keypair();
            let _ = store.insert(kp.public_key, i as u32, MessageKey([i as u8; 32]));
        }
        assert_eq!(store.len(), 2000);
    }
}
