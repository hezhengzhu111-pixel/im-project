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
            let counter: u32 = i.try_into().ok().unwrap_or(0);
            let key_byte: u8 = (i % 256).try_into().ok().unwrap_or(0);
            let _ = store.insert(kp.public_key, counter, MessageKey([key_byte; 32]));
        }
        assert_eq!(store.len(), 2000);
    }

    /// Verify that inserting beyond MAX capacity triggers LRU eviction of the
    /// oldest entry.
    ///
    /// Fills the store to 2000 entries with a single ratchet public key and
    /// sequential counters, then inserts the 2001st entry.  The oldest entry
    /// (counter=0) must be evicted, while the newest (counter=2000) must be
    /// retrievable.
    #[test]
    fn skipped_key_store_lru_eviction_evicts_oldest() -> Result<(), crate::errors::E2eeError> {
        let mut store = SkippedKeyStore::new();
        let pk = generate_x25519_keypair().public_key;

        // Fill to exactly MAX capacity (2000)
        for counter in 0..2000u32 {
            store.insert(pk, counter, MessageKey([0x42u8; 32]))?;
        }
        assert_eq!(store.len(), 2000);

        // Insert one more — triggers LRU eviction of the oldest (counter=0)
        store.insert(pk, 2000u32, MessageKey([0xFFu8; 32]))?;

        // Store must stay at MAX (2000)
        assert_eq!(store.len(), 2000);

        // The oldest entry (counter=0) must have been evicted
        assert!(store.remove(&pk, 0).is_none());

        // The newest entry (counter=2000) must be present
        match store.remove(&pk, 2000u32) {
            Some(key) => assert_eq!(key.0, [0xFFu8; 32]),
            None => return Err(crate::errors::E2eeError::StateDeserializationFailed),
        }

        Ok(())
    }

    // --- RatchetHeader encode / decode ---

    fn make_test_header() -> RatchetHeader {
        let kp = generate_x25519_keypair();
        RatchetHeader {
            ratchet_public_key: kp.public_key,
            counter: 0x01020304,
            previous_counter: 0x05060708,
            nonce: AesNonce([0x10, 0x11, 0x12, 0x13, 0x14, 0x15, 0x16, 0x17, 0x18, 0x19, 0x1A, 0x1B]),
        }
    }

    #[test]
    fn encode_header_length_is_52() {
        let header = make_test_header();
        let encoded = encode_ratchet_header(&header);
        assert_eq!(encoded.len(), 52);
    }

    #[test]
    fn encode_header_counter_big_endian() {
        let header = make_test_header();
        let encoded = encode_ratchet_header(&header);
        // counter bytes at offset 32..36
        assert_eq!(encoded.get(32), Some(&0x01));
        assert_eq!(encoded.get(33), Some(&0x02));
        assert_eq!(encoded.get(34), Some(&0x03));
        assert_eq!(encoded.get(35), Some(&0x04));
        // previous_counter bytes at offset 36..40
        assert_eq!(encoded.get(36), Some(&0x05));
        assert_eq!(encoded.get(37), Some(&0x06));
        assert_eq!(encoded.get(38), Some(&0x07));
        assert_eq!(encoded.get(39), Some(&0x08));
    }

    #[test]
    fn decode_header_length_52_rejects_51() {
        let short = [0u8; 51];
        let result = decode_ratchet_header(&short);
        assert!(matches!(
            result,
            Err(crate::errors::E2eeError::InvalidHeader(_))
        ));
    }

    #[test]
    fn decode_header_length_52_rejects_53() {
        let long = [0u8; 53];
        let result = decode_ratchet_header(&long);
        assert!(matches!(
            result,
            Err(crate::errors::E2eeError::InvalidHeader(_))
        ));
    }

    #[test]
    fn decode_header_length_52_rejects_empty() {
        let result = decode_ratchet_header(&[]);
        assert!(matches!(
            result,
            Err(crate::errors::E2eeError::InvalidHeader(_))
        ));
    }

    #[test]
    fn encode_decode_roundtrip() -> Result<(), crate::errors::E2eeError> {
        let header = make_test_header();
        let encoded = encode_ratchet_header(&header);
        let decoded = decode_ratchet_header(&encoded)?;
        assert_eq!(decoded.ratchet_public_key.0, header.ratchet_public_key.0);
        assert_eq!(decoded.counter, header.counter);
        assert_eq!(decoded.previous_counter, header.previous_counter);
        assert_eq!(decoded.nonce.0, header.nonce.0);
        Ok(())
    }

    #[test]
    fn encode_header_public_key_at_offset_zero() {
        let header = make_test_header();
        let encoded = encode_ratchet_header(&header);
        assert_eq!(encoded.get(0..32), Some(&header.ratchet_public_key.0[..]));
    }

    #[test]
    fn encode_header_nonce_at_offset_40() {
        let header = make_test_header();
        let encoded = encode_ratchet_header(&header);
        assert_eq!(encoded.get(40..52), Some(&header.nonce.0[..]));
    }
}
