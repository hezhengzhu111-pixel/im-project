use super::*;
use crate::primitives::generate_x25519_keypair;
use bincode;

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
    // Version 1 prefix with garbage payload must produce a deserialization error.
    let mut corrupted = vec![super::STATE_VERSION];
    corrupted.extend_from_slice(&[0xFFu8; 8]);
    let result = restore_state(&corrupted);
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
        nonce: AesNonce([
            0x10, 0x11, 0x12, 0x13, 0x14, 0x15, 0x16, 0x17, 0x18, 0x19, 0x1A, 0x1B,
        ]),
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

#[test]
fn exported_state_starts_with_version_byte() -> Result<(), crate::errors::E2eeError> {
    let state = make_test_state();
    let bytes = export_state(&state);
    assert!(!bytes.is_empty());
    assert_eq!(
        bytes.first().copied(),
        Some(super::STATE_VERSION),
        "exported state must begin with the format version"
    );
    Ok(())
}

#[test]
fn versioned_export_restore_roundtrip() -> Result<(), crate::errors::E2eeError> {
    let state = make_test_state();
    let bytes = try_export_state(&state)?;
    let restored = restore_state(&bytes)?;
    assert_eq!(restored.send_counter, state.send_counter);
    assert_eq!(restored.receive_counter, state.receive_counter);
    assert_eq!(restored.previous_counter, state.previous_counter);
    Ok(())
}

#[test]
fn restore_legacy_plain_bincode_state() -> Result<(), crate::errors::E2eeError> {
    let state = make_test_state();
    // Simulate a legacy state blob produced before STATE_VERSION was introduced.
    let legacy_bytes = bincode::serialize(&state).map_err(|_| {
        crate::errors::E2eeError::StateSerializationFailed("test serialize".to_string())
    })?;
    let restored = restore_state(&legacy_bytes)?;
    assert_eq!(restored.send_counter, state.send_counter);
    Ok(())
}

#[test]
fn restore_unsupported_version_fails() {
    let mut bad_bytes = vec![2u8]; // version 2 is not supported
    bad_bytes.extend_from_slice(&[0xFFu8; 64]);
    let result = restore_state(&bad_bytes);
    assert!(
        matches!(
            result,
            Err(crate::errors::E2eeError::StateSerializationFailed(_))
        ),
        "expected StateSerializationFailed for unsupported version, got {}",
        result
            .as_ref()
            .err()
            .map(|e| e.to_string())
            .unwrap_or_else(|| "Ok".to_string())
    );
}
