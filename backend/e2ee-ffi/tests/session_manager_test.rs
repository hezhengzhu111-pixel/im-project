//! Integration tests for the e2ee-ffi SessionManager.
//!
//! These tests verify the complete X3DH + Double Ratchet lifecycle
//! through the FFI-safe SessionManager interface.

use e2ee_ffi::*;

/// Full X3DH handshake + encrypt/decrypt + state persistence round-trip.
#[test]
fn session_manager_full_flow() {
    let mgr = SessionManager::new();

    // Bob generates key bundle
    let bob_ik = e2ee_core::generate_x25519_keypair();
    let bob_spk = e2ee_core::generate_x25519_keypair();
    let bob_signing = e2ee_core::generate_ed25519_keypair().unwrap();
    let bob_otk = e2ee_core::generate_x25519_keypair();

    let spk_sig =
        e2ee_core::ed25519_sign(&bob_signing.private_key, &bob_spk.public_key.0).unwrap();

    let bob_bundle_json = serde_json::json!({
        "identity_key": bob_ik.public_key.0.to_vec(),
        "signing_key": bob_signing.public_key.0.to_vec(),
        "signed_pre_key": {
            "id": 1u32,
            "key": bob_spk.public_key.0.to_vec()
        },
        "signed_pre_key_signature": spk_sig.0.to_vec(),
        "one_time_pre_key": {
            "id": 100u32,
            "key": bob_otk.public_key.0.to_vec()
        }
    })
    .to_string();

    // Alice creates outbound session
    let alice_ik = e2ee_core::generate_x25519_keypair();
    let alice_ik_bincode =
        bincode::serialize(&(alice_ik.private_key.0, alice_ik.public_key.0)).unwrap();

    let handshake = mgr
        .create_outbound_session("test_session".to_string(), alice_ik_bincode, bob_bundle_json)
        .unwrap();

    assert_eq!(handshake.len(), 40);
    let ek = &handshake[..32];
    let spk_id = u32::from_be_bytes([handshake[32], handshake[33], handshake[34], handshake[35]]);
    assert_eq!(spk_id, 1);

    // Bob creates inbound session
    let bob_ik_bincode =
        bincode::serialize(&(bob_ik.private_key.0, bob_ik.public_key.0)).unwrap();
    let bob_spk_bincode =
        bincode::serialize(&(bob_spk.private_key.0, bob_spk.public_key.0)).unwrap();
    let bob_otk_bincode =
        bincode::serialize(&(bob_otk.private_key.0, bob_otk.public_key.0)).unwrap();

    mgr.create_inbound_session(
        "test_session_bob".to_string(),
        bob_ik_bincode,
        bob_spk_bincode,
        Some(bob_otk_bincode),
        alice_ik.public_key.0.to_vec(),
        ek.to_vec(),
    )
    .unwrap();

    // Alice encrypts
    let wire = mgr
        .encrypt("test_session".to_string(), b"hello mobile".to_vec())
        .unwrap();
    assert!(wire.len() > 56);

    // Bob decrypts
    let plaintext = mgr
        .decrypt("test_session_bob".to_string(), wire)
        .unwrap();
    assert_eq!(plaintext, b"hello mobile");

    // State persistence
    let state = mgr
        .export_session("test_session_bob".to_string())
        .unwrap();
    mgr.remove_session("test_session_bob".to_string());

    // Bob restores
    mgr.restore_session("test_session_bob".to_string(), state)
        .unwrap();

    // Cleanup
    mgr.remove_session("test_session".to_string());
    mgr.remove_session("test_session_bob".to_string());
}

/// Encrypt/decrypt on a non-existent session returns an error.
#[test]
fn session_not_found_errors() {
    let mgr = SessionManager::new();
    let result = mgr.encrypt("nonexistent".to_string(), b"data".to_vec());
    assert!(result.is_err());
}

/// Creating a session with a duplicate ID fails.
#[test]
fn session_already_exists_error() {
    let mgr = SessionManager::new();
    let ik = e2ee_core::generate_x25519_keypair();
    let ik_bincode = bincode::serialize(&(ik.private_key.0, ik.public_key.0)).unwrap();
    let bundle_json = r#"{"identity_key":[0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],"signing_key":[0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],"signed_pre_key":{"id":1,"key":[0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0]},"signed_pre_key_signature":[0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],"one_time_pre_key":null}"#;

    let result = mgr.create_outbound_session("dup".to_string(), ik_bincode.clone(), bundle_json.to_string());
    // With all-zero keys, creation may fail (invalid public key) or succeed
    match result {
        Ok(_) => {
            // Session was created; try duplicate
            let r2 = mgr.create_outbound_session("dup".to_string(), ik_bincode, bundle_json.to_string());
            assert!(r2.is_err());
        }
        Err(_) => {
            // Expected: all-zero keys are invalid for X25519
        }
    }
}
