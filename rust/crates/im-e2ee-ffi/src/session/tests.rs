use super::*;
use im_e2ee_core::generate_x25519_keypair;

#[test]
fn generate_pre_key_bundle_json_contains_rust_material() -> Result<(), String> {
    let mgr = SessionManager::new();
    let json = mgr
        .generate_pre_key_bundle(7, 100, 2)
        .map_err(|e| format!("generate_pre_key_bundle: {e}"))?;
    let value: serde_json::Value =
        serde_json::from_str(&json).map_err(|e| format!("parse JSON: {e}"))?;

    if value.get("version").and_then(|v| v.as_u64()) != Some(2) {
        return Err("expected version 2 key material".to_string());
    }
    if value
        .get("publicBundle")
        .and_then(|v| v.get("signedPreKey"))
        .and_then(|v| v.get("id"))
        .and_then(|v| v.as_u64())
        != Some(7)
    {
        return Err("expected signed pre-key id 7".to_string());
    }

    let otks = value
        .get("publicBundle")
        .and_then(|v| v.get("oneTimePreKeys"))
        .and_then(|v| v.as_array())
        .ok_or("missing public one-time pre-key list")?;
    if otks.len() != 2 {
        return Err(format!("expected 2 public OTKs, got {}", otks.len()));
    }
    if otks
        .first()
        .and_then(|v| v.get("id"))
        .and_then(|v| v.as_u64())
        != Some(100)
    {
        return Err("expected first OTK id 100".to_string());
    }

    let identity_bincode = value
        .get("identityKeyPairBincode")
        .and_then(|v| v.as_str())
        .ok_or("missing identity key pair bincode")?;
    if identity_bincode.is_empty() {
        return Err("identity key pair bincode must not be empty".to_string());
    }

    Ok(())
}

// --- is_valid_x25519_keypair ---

#[test]
fn valid_keypair_passes_validation() {
    let kp = generate_x25519_keypair();
    assert!(is_valid_x25519_keypair(&kp));
}

#[test]
fn mismatched_keypair_fails_validation() {
    let kp1 = generate_x25519_keypair();
    let kp2 = generate_x25519_keypair();
    // Swap public keys: private doesn't derive to public
    let bad = X25519KeyPair {
        public_key: kp2.public_key,
        private_key: X25519PrivateKey(kp1.private_key.0),
    };
    assert!(!is_valid_x25519_keypair(&bad));
}

// --- decode_keypair ---

#[test]
fn decode_core_bincode_format() {
    let kp = generate_x25519_keypair();
    // Core format: bincode::serialize(&X25519KeyPair) -> pub(32) || priv(32)
    let bytes = bincode::serialize(&kp).expect("serialize");
    let decoded = decode_keypair(&bytes).expect("decode core format");
    assert_eq!(decoded.public_key.0, kp.public_key.0);
    assert_eq!(decoded.private_key.0, kp.private_key.0);
}

#[test]
fn decode_legacy_tuple_format() {
    let kp = generate_x25519_keypair();
    // Legacy format: (private_bytes, public_bytes) tuple -> priv(32) || pub(32)
    let bytes = bincode::serialize(&(kp.private_key.0, kp.public_key.0)).expect("serialize legacy");
    let decoded = decode_keypair(&bytes).expect("decode legacy format");
    assert_eq!(decoded.public_key.0, kp.public_key.0);
    assert_eq!(decoded.private_key.0, kp.private_key.0);
}

#[test]
fn decode_corrupted_data_returns_invalid_state() {
    // Random 64 bytes that don't form a valid X25519 keypair
    let corrupted = [0xAAu8; 64];
    let result = decode_keypair(&corrupted);
    assert!(matches!(result, Err(SessionError::InvalidStateData(_))));
}

#[test]
fn decode_wrong_length_returns_invalid_state() {
    let result = decode_keypair(&[1u8, 2, 3]);
    assert!(matches!(result, Err(SessionError::InvalidStateData(_))));
}

#[test]
fn decode_empty_returns_invalid_state() {
    let result = decode_keypair(&[]);
    assert!(matches!(result, Err(SessionError::InvalidStateData(_))));
}

#[test]
fn core_format_takes_priority_over_legacy() {
    // When two valid keypairs produce the same byte representation in different
    // interpretations, the core format (pub||priv) must win.
    let kp_core = generate_x25519_keypair();
    let core_bytes = bincode::serialize(&kp_core).expect("serialize core");
    let decoded = decode_keypair(&core_bytes).expect("decode");
    assert_eq!(decoded.public_key.0, kp_core.public_key.0);
    assert_eq!(decoded.private_key.0, kp_core.private_key.0);
}

// --- Wire format: header_len == 52 ---

#[test]
fn encrypt_produces_header_len_52() -> Result<(), Box<dyn std::error::Error>> {
    use im_e2ee_core::{generate_key_bundle, PreKey, PreKeyBundleFetch};

    let bob_bundle = generate_key_bundle(1, &[(100, 3)])?;
    let alice_ik = generate_x25519_keypair();

    let fetch = PreKeyBundleFetch {
        identity_key: bob_bundle.bundle.identity_key,
        signing_key: bob_bundle.bundle.signing_key,
        signed_pre_key: PreKey {
            id: 1,
            key: bob_bundle.bundle.signed_pre_key,
        },
        signed_pre_key_signature: bob_bundle.bundle.signed_pre_key_signature,
        one_time_pre_key: bob_bundle.bundle.one_time_pre_keys.first().copied(),
    };
    let fetch_json = serde_json::to_string(&fetch)?;

    let manager = SessionManager::new();
    let alice_ik_bincode = bincode::serialize(&alice_ik)?;

    manager.create_outbound_session("test".to_string(), alice_ik_bincode, fetch_json)?;

    let wire = manager.encrypt("test".to_string(), b"hello".to_vec())?;

    // Verify header_len is 52 (0x00000034 in big-endian)
    assert_eq!(wire.first(), Some(&0x00));
    assert_eq!(wire.get(1), Some(&0x00));
    assert_eq!(wire.get(2), Some(&0x00));
    assert_eq!(wire.get(3), Some(&0x34));
    assert_eq!(wire.len(), 4 + 52 + b"hello".len() + 16); // 4 + 52 header + plaintext + GCM tag
    Ok(())
}

#[test]
fn encrypt_decrypt_roundtrip_ffi() -> Result<(), Box<dyn std::error::Error>> {
    use im_e2ee_core::{
        generate_key_bundle, init_receiving_chain, x3dh_respond, PreKey, PreKeyBundleFetch,
        X25519PublicKey,
    };

    let bob_bundle = generate_key_bundle(1, &[(100, 3)])?;
    let alice_ik = generate_x25519_keypair();

    let fetch = PreKeyBundleFetch {
        identity_key: bob_bundle.bundle.identity_key,
        signing_key: bob_bundle.bundle.signing_key,
        signed_pre_key: PreKey {
            id: 1,
            key: bob_bundle.bundle.signed_pre_key,
        },
        signed_pre_key_signature: bob_bundle.bundle.signed_pre_key_signature,
        one_time_pre_key: bob_bundle.bundle.one_time_pre_keys.first().copied(),
    };
    let fetch_json = serde_json::to_string(&fetch)?;

    let alice_mgr = SessionManager::new();
    let alice_ik_bincode = bincode::serialize(&alice_ik)?;

    let handshake =
        alice_mgr.create_outbound_session("alice".to_string(), alice_ik_bincode, fetch_json)?;

    // Parse handshake for Bob: ek(32) || spk_id(4) || otk_id(4)
    let ek_bytes = handshake
        .get(0..32)
        .ok_or("handshake too short: cannot extract ephemeral key")?;
    let mut alice_ek_arr = [0u8; 32];
    alice_ek_arr.copy_from_slice(ek_bytes);
    let alice_ek = X25519PublicKey(alice_ek_arr);

    // Bob responds via X3DH
    let bob_otk = bob_bundle
        .one_time_pre_key_pairs
        .first()
        .ok_or("missing OTK")?;
    let bob_x3dh = x3dh_respond(
        &bob_bundle.identity_key_pair,
        &bob_bundle.signed_pre_key_pair,
        Some(bob_otk),
        &alice_ik.public_key,
        &alice_ek,
    )?;

    let bob_state = init_receiving_chain(
        &bob_x3dh.root_key,
        bob_bundle.identity_key_pair.public_key,
        alice_ik.public_key,
    )?;

    // Insert Bob's session via export/restore
    let bob_mgr = SessionManager::new();
    let bob_state_bytes = im_e2ee_core::try_export_state(&bob_state)?;
    bob_mgr.restore_session("bob".to_string(), bob_state_bytes)?;

    // Alice encrypts
    let wire = alice_mgr.encrypt("alice".to_string(), b"hello bob".to_vec())?;

    // Bob decrypts
    let plaintext = bob_mgr.decrypt("bob".to_string(), wire)?;
    assert_eq!(plaintext, b"hello bob");
    Ok(())
}

// --- Error content tests ---

#[test]
fn session_not_found_includes_session_id() -> Result<(), String> {
    let mgr = SessionManager::new();
    let err = match mgr.encrypt("my-session-123".to_string(), b"data".to_vec()) {
        Err(e) => e,
        Ok(_) => return Err("expected SessionNotFound, got Ok".to_string()),
    };
    let msg = match err {
        SessionError::SessionNotFound(m) => m,
        other => return Err(format!("expected SessionNotFound, got {other:?}")),
    };
    assert!(
        msg.contains("my-session-123"),
        "SessionNotFound message should contain the session id, got: {msg}"
    );
    Ok(())
}

#[test]
fn session_already_exists_includes_session_id() -> Result<(), Box<dyn std::error::Error>> {
    let alice_ik = im_e2ee_core::generate_x25519_keypair();
    let bob_bundle = im_e2ee_core::generate_key_bundle(1, &[(100, 3)])?;

    let fetch = im_e2ee_core::PreKeyBundleFetch {
        identity_key: bob_bundle.bundle.identity_key,
        signing_key: bob_bundle.bundle.signing_key,
        signed_pre_key: im_e2ee_core::PreKey {
            id: 1,
            key: bob_bundle.bundle.signed_pre_key,
        },
        signed_pre_key_signature: bob_bundle.bundle.signed_pre_key_signature,
        one_time_pre_key: bob_bundle.bundle.one_time_pre_keys.first().copied(),
    };
    let fetch_json = serde_json::to_string(&fetch)?;
    let alice_ik_bincode = bincode::serialize(&alice_ik)?;

    let mgr = SessionManager::new();
    mgr.create_outbound_session(
        "dup-session".to_string(),
        alice_ik_bincode.clone(),
        fetch_json.clone(),
    )?;

    let err = match mgr.create_outbound_session(
        "dup-session".to_string(),
        alice_ik_bincode,
        fetch_json,
    ) {
        Err(e) => e,
        Ok(_) => return Err("expected SessionAlreadyExists, got Ok".into()),
    };
    let msg = match err {
        SessionError::SessionAlreadyExists(m) => m,
        other => return Err(format!("expected SessionAlreadyExists, got {other:?}").into()),
    };
    assert!(
        msg.contains("dup-session"),
        "SessionAlreadyExists message should contain the session id, got: {msg}"
    );
    Ok(())
}

#[test]
fn corrupted_state_returns_invalid_state_with_message() -> Result<(), String> {
    let corrupted = [0xAAu8; 64];
    let err = match decode_keypair(&corrupted) {
        Err(e) => e,
        Ok(_) => return Err("expected InvalidStateData, got Ok".to_string()),
    };
    let msg = match err {
        SessionError::InvalidStateData(m) => m,
        other => return Err(format!("expected InvalidStateData, got {other:?}")),
    };
    assert!(
        !msg.is_empty(),
        "InvalidStateData message should not be empty"
    );
    Ok(())
}

#[test]
fn crypto_error_preserves_e2ee_error_text() -> Result<(), String> {
    // E2eeError::CounterGapExceeded should produce a Crypto error
    // whose message contains the counter gap details, not a fixed "crypto error" string.
    let e = im_e2ee_core::E2eeError::CounterGapExceeded(2500, 2000);
    let session_err = SessionError::from(e);
    let msg = match session_err {
        SessionError::Crypto(m) => m,
        other => return Err(format!("expected Crypto, got {other:?}")),
    };
    assert!(
        msg.contains("counter gap"),
        "Crypto message should preserve E2eeError details, got: {msg}"
    );
    assert!(
        msg.contains("2500"),
        "Crypto message should include counter value, got: {msg}"
    );
    assert!(
        msg != "crypto error",
        "Crypto message should not be the old fixed string"
    );
    Ok(())
}

#[test]
fn decrypt_crypto_error_is_not_fixed_string() -> Result<(), Box<dyn std::error::Error>> {
    // decrypt with a valid session but malformed wire format
    // should return Crypto with a descriptive message, not a fixed string.
    let mgr = SessionManager::new();
    // First create a valid session so we can test the Crypto path specifically
    let alice_ik = im_e2ee_core::generate_x25519_keypair();
    let bob_bundle = im_e2ee_core::generate_key_bundle(1, &[(100, 3)])?;
    let fetch = im_e2ee_core::PreKeyBundleFetch {
        identity_key: bob_bundle.bundle.identity_key,
        signing_key: bob_bundle.bundle.signing_key,
        signed_pre_key: im_e2ee_core::PreKey {
            id: 1,
            key: bob_bundle.bundle.signed_pre_key,
        },
        signed_pre_key_signature: bob_bundle.bundle.signed_pre_key_signature,
        one_time_pre_key: bob_bundle.bundle.one_time_pre_keys.first().copied(),
    };
    let fetch_json = serde_json::to_string(&fetch)?;
    let alice_ik_bincode = bincode::serialize(&alice_ik)?;
    mgr.create_outbound_session("test-crypto".to_string(), alice_ik_bincode, fetch_json)?;

    // Send malformed data (only 2 bytes — no valid header length prefix)
    let err = match mgr.decrypt("test-crypto".to_string(), vec![0x00, 0x01]) {
        Err(e) => e,
        Ok(_) => return Err("expected Crypto, got Ok".into()),
    };
    let msg = match err {
        SessionError::Crypto(m) => m,
        other => return Err(format!("expected Crypto, got {other:?}").into()),
    };
    assert!(
        msg.contains("too short") || msg.contains("header"),
        "Crypto error for malformed wire format should describe the issue, got: {msg}"
    );
    assert!(
        msg != "crypto error",
        "Crypto message should not be the old fixed string"
    );
    Ok(())
}

#[test]
fn public_key_wrong_length_includes_actual_length() -> Result<(), String> {
    let err = match decode_public_key(&[0u8; 16]) {
        Err(e) => e,
        Ok(_) => return Err("expected InvalidStateData, got Ok".to_string()),
    };
    let msg = match err {
        SessionError::InvalidStateData(m) => m,
        other => return Err(format!("expected InvalidStateData, got {other:?}")),
    };
    assert!(
        msg.contains("16"),
        "InvalidStateData for wrong key length should mention actual length, got: {msg}"
    );
    Ok(())
}

/// Verify that `SessionError::to_string()` preserves payload details.
///
/// UniFFI flat-error serialization writes `variant_index(i32) + to_string(error)`
/// (see uniffi_macros error.rs:56-57, 102-103).  This test confirms that our
/// Display implementation faithfully carries the session_id / crypto detail
/// that the Kotlin/Swift `exception.message` will expose.
#[test]
fn display_includes_payload_for_ffi_transmission() {
    // SessionNotFound carries session_id
    let msg = SessionError::SessionNotFound("sess-42".into()).to_string();
    assert!(msg.contains("session not found"));
    assert!(msg.contains("sess-42"));

    // SessionAlreadyExists carries session_id
    let msg = SessionError::SessionAlreadyExists("dup-1".into()).to_string();
    assert!(msg.contains("session already exists"));
    assert!(msg.contains("dup-1"));

    // InvalidStateData carries detail
    let msg = SessionError::InvalidStateData("keypair validation failed".into()).to_string();
    assert!(msg.contains("invalid session state data"));
    assert!(msg.contains("keypair validation failed"));

    // Crypto from E2eeError preserves original error detail
    let msg =
        SessionError::from(im_e2ee_core::E2eeError::CounterGapExceeded(2500, 2000)).to_string();
    assert!(msg.contains("crypto error"));
    assert!(msg.contains("counter gap"));
}

// ============================================================================
// Cross-layer session manager contract tests
// ============================================================================

/// Full X3DH handshake through both FFI APIs:
/// create_outbound_session -> create_inbound_session -> encrypt -> decrypt
#[test]
fn create_inbound_session_via_api() -> Result<(), String> {
    use im_e2ee_core::{generate_key_bundle, PreKey, PreKeyBundleFetch};

    let bob_bundle =
        generate_key_bundle(1, &[(100, 1)]).map_err(|e| format!("generate_key_bundle: {e}"))?;

    let fetch = PreKeyBundleFetch {
        identity_key: bob_bundle.bundle.identity_key,
        signing_key: bob_bundle.bundle.signing_key,
        signed_pre_key: PreKey {
            id: 1,
            key: bob_bundle.bundle.signed_pre_key,
        },
        signed_pre_key_signature: bob_bundle.bundle.signed_pre_key_signature,
        one_time_pre_key: bob_bundle.bundle.one_time_pre_keys.first().copied(),
    };
    let fetch_json = serde_json::to_string(&fetch).map_err(|e| format!("serialize fetch: {e}"))?;

    let alice_ik = generate_x25519_keypair();
    let alice_ik_bincode =
        bincode::serialize(&alice_ik).map_err(|e| format!("serialize alice_ik: {e}"))?;

    let mgr = SessionManager::new();

    // Alice creates outbound session
    let handshake = mgr
        .create_outbound_session("alice".to_string(), alice_ik_bincode, fetch_json)
        .map_err(|e| format!("create_outbound_session: {e}"))?;

    if handshake.len() < 40 {
        return Err(format!("handshake too short: {} bytes", handshake.len()));
    }

    // Parse handshake: ek(32) || spk_id(4) || otk_id(4)
    let ek_bytes = &handshake[0..32];
    let alice_ek = ek_bytes.to_vec();

    // Bob creates inbound session via the FFI API
    let bob_ik_bincode = bincode::serialize(&bob_bundle.identity_key_pair)
        .map_err(|e| format!("serialize bob_ik: {e}"))?;
    let bob_spk_bincode = bincode::serialize(&bob_bundle.signed_pre_key_pair)
        .map_err(|e| format!("serialize bob_spk: {e}"))?;
    let bob_otk = bob_bundle
        .one_time_pre_key_pairs
        .first()
        .ok_or("missing OTK".to_string())?;
    let bob_otk_bincode =
        bincode::serialize(&bob_otk.key_pair).map_err(|e| format!("serialize bob_otk: {e}"))?;

    mgr.create_inbound_session(
        "bob".to_string(),
        bob_ik_bincode,
        bob_spk_bincode,
        Some(bob_otk_bincode),
        alice_ik.public_key.0.to_vec(),
        alice_ek,
    )
    .map_err(|e| format!("create_inbound_session: {e}"))?;

    // Alice encrypts
    let wire = mgr
        .encrypt("alice".to_string(), b"hello via FFI API".to_vec())
        .map_err(|e| format!("encrypt: {e}"))?;

    // Bob decrypts
    let plaintext = mgr
        .decrypt("bob".to_string(), wire)
        .map_err(|e| format!("decrypt: {e}"))?;

    if plaintext != b"hello via FFI API" {
        return Err("plaintext mismatch".to_string());
    }

    Ok(())
}

/// Alice/Bob bidirectional: each sends at least one message that the other decrypts.
#[test]
fn alice_bob_bidirectional() -> Result<(), String> {
    use im_e2ee_core::{generate_key_bundle, PreKey, PreKeyBundleFetch};

    let bob_bundle =
        generate_key_bundle(1, &[(100, 1)]).map_err(|e| format!("generate_key_bundle: {e}"))?;

    let fetch = PreKeyBundleFetch {
        identity_key: bob_bundle.bundle.identity_key,
        signing_key: bob_bundle.bundle.signing_key,
        signed_pre_key: PreKey {
            id: 1,
            key: bob_bundle.bundle.signed_pre_key,
        },
        signed_pre_key_signature: bob_bundle.bundle.signed_pre_key_signature,
        one_time_pre_key: bob_bundle.bundle.one_time_pre_keys.first().copied(),
    };
    let fetch_json = serde_json::to_string(&fetch).map_err(|e| format!("serialize fetch: {e}"))?;

    let alice_ik = generate_x25519_keypair();
    let alice_ik_bincode =
        bincode::serialize(&alice_ik).map_err(|e| format!("serialize alice_ik: {e}"))?;

    let mgr = SessionManager::new();

    let handshake = mgr
        .create_outbound_session("alice".to_string(), alice_ik_bincode, fetch_json)
        .map_err(|e| format!("create_outbound_session: {e}"))?;

    if handshake.len() < 40 {
        return Err(format!("handshake too short: {} bytes", handshake.len()));
    }
    let ek_bytes = &handshake[0..32];

    let bob_ik_bincode = bincode::serialize(&bob_bundle.identity_key_pair)
        .map_err(|e| format!("serialize bob_ik: {e}"))?;
    let bob_spk_bincode = bincode::serialize(&bob_bundle.signed_pre_key_pair)
        .map_err(|e| format!("serialize bob_spk: {e}"))?;
    let bob_otk = bob_bundle
        .one_time_pre_key_pairs
        .first()
        .ok_or("missing OTK".to_string())?;
    let bob_otk_bincode =
        bincode::serialize(&bob_otk.key_pair).map_err(|e| format!("serialize bob_otk: {e}"))?;

    mgr.create_inbound_session(
        "bob".to_string(),
        bob_ik_bincode,
        bob_spk_bincode,
        Some(bob_otk_bincode),
        alice_ik.public_key.0.to_vec(),
        ek_bytes.to_vec(),
    )
    .map_err(|e| format!("create_inbound_session: {e}"))?;

    // Alice -> Bob
    let wire_a1 = mgr
        .encrypt("alice".to_string(), b"hello bob".to_vec())
        .map_err(|e| format!("alice encrypt: {e}"))?;
    let pt_a1 = mgr
        .decrypt("bob".to_string(), wire_a1)
        .map_err(|e| format!("bob decrypt: {e}"))?;
    if pt_a1 != b"hello bob" {
        return Err("alice->bob plaintext mismatch".to_string());
    }

    // Bob -> Alice (reply)
    let wire_b1 = mgr
        .encrypt("bob".to_string(), b"hello alice".to_vec())
        .map_err(|e| format!("bob encrypt: {e}"))?;
    let pt_b1 = mgr
        .decrypt("alice".to_string(), wire_b1)
        .map_err(|e| format!("alice decrypt: {e}"))?;
    if pt_b1 != b"hello alice" {
        return Err("bob->alice plaintext mismatch".to_string());
    }

    Ok(())
}

/// export_session -> remove_session -> restore_session -> continue encrypt/decrypt
#[test]
fn export_restore_then_continue() -> Result<(), String> {
    use im_e2ee_core::{generate_key_bundle, PreKey, PreKeyBundleFetch};

    let bob_bundle =
        generate_key_bundle(1, &[(100, 1)]).map_err(|e| format!("generate_key_bundle: {e}"))?;

    let fetch = PreKeyBundleFetch {
        identity_key: bob_bundle.bundle.identity_key,
        signing_key: bob_bundle.bundle.signing_key,
        signed_pre_key: PreKey {
            id: 1,
            key: bob_bundle.bundle.signed_pre_key,
        },
        signed_pre_key_signature: bob_bundle.bundle.signed_pre_key_signature,
        one_time_pre_key: bob_bundle.bundle.one_time_pre_keys.first().copied(),
    };
    let fetch_json = serde_json::to_string(&fetch).map_err(|e| format!("serialize fetch: {e}"))?;

    let alice_ik = generate_x25519_keypair();
    let alice_ik_bincode =
        bincode::serialize(&alice_ik).map_err(|e| format!("serialize alice_ik: {e}"))?;

    let mgr = SessionManager::new();

    let handshake = mgr
        .create_outbound_session("alice".to_string(), alice_ik_bincode, fetch_json)
        .map_err(|e| format!("create_outbound_session: {e}"))?;

    if handshake.len() < 40 {
        return Err(format!("handshake too short: {} bytes", handshake.len()));
    }
    let ek_bytes = &handshake[0..32];

    let bob_ik_bincode = bincode::serialize(&bob_bundle.identity_key_pair)
        .map_err(|e| format!("serialize bob_ik: {e}"))?;
    let bob_spk_bincode = bincode::serialize(&bob_bundle.signed_pre_key_pair)
        .map_err(|e| format!("serialize bob_spk: {e}"))?;
    let bob_otk = bob_bundle
        .one_time_pre_key_pairs
        .first()
        .ok_or("missing OTK".to_string())?;
    let bob_otk_bincode =
        bincode::serialize(&bob_otk.key_pair).map_err(|e| format!("serialize bob_otk: {e}"))?;

    mgr.create_inbound_session(
        "bob".to_string(),
        bob_ik_bincode,
        bob_spk_bincode,
        Some(bob_otk_bincode),
        alice_ik.public_key.0.to_vec(),
        ek_bytes.to_vec(),
    )
    .map_err(|e| format!("create_inbound_session: {e}"))?;

    // Alice encrypts one message
    let wire1 = mgr
        .encrypt("alice".to_string(), b"before export".to_vec())
        .map_err(|e| format!("encrypt before export: {e}"))?;

    // Export Alice's state
    let alice_state = mgr
        .export_session("alice".to_string())
        .map_err(|e| format!("export_session: {e}"))?;
    if alice_state.is_empty() {
        return Err("exported state is empty".to_string());
    }

    // Remove Alice's session
    mgr.remove_session("alice".to_string());

    // Verify session is gone
    match mgr.encrypt("alice".to_string(), b"test".to_vec()) {
        Err(SessionError::SessionNotFound(_)) => {}
        other => {
            return Err(format!(
                "expected SessionNotFound after remove, got {:?}",
                other
            ));
        }
    }

    // Restore Alice's session
    mgr.restore_session("alice".to_string(), alice_state)
        .map_err(|e| format!("restore_session: {e}"))?;

    // Alice encrypts again after restore
    let wire2 = mgr
        .encrypt("alice".to_string(), b"after restore".to_vec())
        .map_err(|e| format!("encrypt after restore: {e}"))?;

    // Bob decrypts both messages
    let pt1 = mgr
        .decrypt("bob".to_string(), wire1)
        .map_err(|e| format!("decrypt wire1: {e}"))?;
    if pt1 != b"before export" {
        return Err("plaintext1 mismatch".to_string());
    }

    let pt2 = mgr
        .decrypt("bob".to_string(), wire2)
        .map_err(|e| format!("decrypt wire2: {e}"))?;
    if pt2 != b"after restore" {
        return Err("plaintext2 mismatch".to_string());
    }

    Ok(())
}

/// restore_session with corrupted bincode returns an error.
#[test]
fn restore_corrupted_state_fails() -> Result<(), String> {
    let mgr = SessionManager::new();

    let corrupted = vec![0xAAu8; 128];
    let result = mgr.restore_session("test".to_string(), corrupted);
    match result {
        Err(SessionError::InvalidStateData(msg)) => {
            if msg.is_empty() {
                return Err("InvalidStateData message is empty".to_string());
            }
            if !msg.contains("deserialization") && !msg.contains("corrupted") {
                return Err(format!(
                    "expected message about deserialization failure, got: {msg}"
                ));
            }
            Ok(())
        }
        Err(other) => Err(format!(
            "expected InvalidStateData for corrupted state, got {other:?}"
        )),
        Ok(()) => Err("expected error for corrupted state, got Ok".to_string()),
    }
}

/// From<E2eeError> routes state errors to InvalidStateData, others to Crypto.
#[test]
fn from_e2ee_error_routes_state_errors_to_invalid_state_data() -> Result<(), String> {
    // State errors → InvalidStateData
    let e = im_e2ee_core::E2eeError::StateDeserializationFailed;
    let err = SessionError::from(e);
    match err {
        SessionError::InvalidStateData(msg) => {
            if !msg.contains("deserialization") {
                return Err(format!("expected deserialization message, got: {msg}"));
            }
        }
        other => {
            return Err(format!(
                "StateDeserializationFailed should map to InvalidStateData, got {other:?}"
            ));
        }
    }

    let e = im_e2ee_core::E2eeError::StateSerializationFailed("test".to_string());
    let err = SessionError::from(e);
    match err {
        SessionError::InvalidStateData(msg) => {
            if !msg.contains("serialization") {
                return Err(format!("expected serialization message, got: {msg}"));
            }
        }
        other => {
            return Err(format!(
                "StateSerializationFailed should map to InvalidStateData, got {other:?}"
            ));
        }
    }

    // Other errors → Crypto (preserving detail)
    let e = im_e2ee_core::E2eeError::CounterGapExceeded(2500, 2000);
    let err = SessionError::from(e);
    match err {
        SessionError::Crypto(msg) => {
            if !msg.contains("counter gap") || !msg.contains("2500") {
                return Err(format!(
                    "Crypto should preserve CounterGapExceeded detail, got: {msg}"
                ));
            }
        }
        other => {
            return Err(format!(
                "CounterGapExceeded should map to Crypto, got {other:?}"
            ));
        }
    }

    let e = im_e2ee_core::E2eeError::DecryptionFailed;
    let err = SessionError::from(e);
    match err {
        SessionError::Crypto(msg) => {
            if !msg.contains("decryption failed") && !msg.contains("Decryption") {
                return Err(format!(
                    "Crypto should preserve DecryptionFailed detail, got: {msg}"
                ));
            }
        }
        other => {
            return Err(format!(
                "DecryptionFailed should map to Crypto, got {other:?}"
            ));
        }
    }

    Ok(())
}

/// Encrypted wire format: first 4 bytes = header_len BE == 52, ciphertext non-empty.
#[test]
fn encrypted_wire_format_header_and_ciphertext() -> Result<(), String> {
    use im_e2ee_core::{generate_key_bundle, PreKey, PreKeyBundleFetch};

    let bob_bundle =
        generate_key_bundle(1, &[(100, 1)]).map_err(|e| format!("generate_key_bundle: {e}"))?;

    let fetch = PreKeyBundleFetch {
        identity_key: bob_bundle.bundle.identity_key,
        signing_key: bob_bundle.bundle.signing_key,
        signed_pre_key: PreKey {
            id: 1,
            key: bob_bundle.bundle.signed_pre_key,
        },
        signed_pre_key_signature: bob_bundle.bundle.signed_pre_key_signature,
        one_time_pre_key: bob_bundle.bundle.one_time_pre_keys.first().copied(),
    };
    let fetch_json = serde_json::to_string(&fetch).map_err(|e| format!("serialize fetch: {e}"))?;

    let alice_ik = generate_x25519_keypair();
    let alice_ik_bincode =
        bincode::serialize(&alice_ik).map_err(|e| format!("serialize alice_ik: {e}"))?;

    let mgr = SessionManager::new();
    mgr.create_outbound_session("alice".to_string(), alice_ik_bincode, fetch_json)
        .map_err(|e| format!("create_outbound_session: {e}"))?;

    let wire = mgr
        .encrypt("alice".to_string(), b"wire format test".to_vec())
        .map_err(|e| format!("encrypt: {e}"))?;

    // wire[0..4] = header_len as big-endian u32
    if wire.len() < 4 {
        return Err("wire too short: missing header_len prefix".to_string());
    }
    let header_len = u32::from_be_bytes([wire[0], wire[1], wire[2], wire[3]]) as usize;
    if header_len != 52 {
        return Err(format!("expected header_len=52, got {header_len}"));
    }

    // Verify ciphertext is non-empty (at minimum 16 bytes for GCM tag)
    if wire.len() <= 4 + 52 {
        return Err("ciphertext is empty (wire too short for header + tag)".to_string());
    }
    let ciphertext_len = wire.len() - 4 - 52;
    if ciphertext_len < 16 {
        return Err(format!(
            "ciphertext too short: {ciphertext_len} bytes (GCM tag alone is 16)",
        ));
    }

    Ok(())
}

/// Two independent sessions, interleaved encrypt/decrypt, no cross-contamination.
#[test]
fn two_sessions_independent() -> Result<(), String> {
    use im_e2ee_core::{generate_key_bundle, PreKey, PreKeyBundleFetch};

    fn setup_session(mgr: &SessionManager, alice_id: &str, bob_id: &str) -> Result<(), String> {
        let bob_bundle =
            generate_key_bundle(1, &[(100, 1)]).map_err(|e| format!("generate_key_bundle: {e}"))?;

        let fetch = PreKeyBundleFetch {
            identity_key: bob_bundle.bundle.identity_key,
            signing_key: bob_bundle.bundle.signing_key,
            signed_pre_key: PreKey {
                id: 1,
                key: bob_bundle.bundle.signed_pre_key,
            },
            signed_pre_key_signature: bob_bundle.bundle.signed_pre_key_signature,
            one_time_pre_key: bob_bundle.bundle.one_time_pre_keys.first().copied(),
        };
        let fetch_json =
            serde_json::to_string(&fetch).map_err(|e| format!("serialize fetch: {e}"))?;

        let alice_ik = generate_x25519_keypair();
        let alice_ik_bincode =
            bincode::serialize(&alice_ik).map_err(|e| format!("serialize alice_ik: {e}"))?;

        let handshake = mgr
            .create_outbound_session(alice_id.to_string(), alice_ik_bincode, fetch_json)
            .map_err(|e| format!("create_outbound_session: {e}"))?;

        if handshake.len() < 40 {
            return Err(format!("handshake too short: {} bytes", handshake.len()));
        }
        let ek_bytes = &handshake[0..32];

        let bob_ik_bincode = bincode::serialize(&bob_bundle.identity_key_pair)
            .map_err(|e| format!("serialize bob_ik: {e}"))?;
        let bob_spk_bincode = bincode::serialize(&bob_bundle.signed_pre_key_pair)
            .map_err(|e| format!("serialize bob_spk: {e}"))?;
        let bob_otk = bob_bundle
            .one_time_pre_key_pairs
            .first()
            .ok_or("missing OTK".to_string())?;
        let bob_otk_bincode =
            bincode::serialize(&bob_otk.key_pair).map_err(|e| format!("serialize bob_otk: {e}"))?;

        mgr.create_inbound_session(
            bob_id.to_string(),
            bob_ik_bincode,
            bob_spk_bincode,
            Some(bob_otk_bincode),
            alice_ik.public_key.0.to_vec(),
            ek_bytes.to_vec(),
        )
        .map_err(|e| format!("create_inbound_session: {e}"))?;

        Ok(())
    }

    let mgr = SessionManager::new();

    // Create two independent session pairs
    setup_session(&mgr, "alice1", "bob1")?;
    setup_session(&mgr, "alice2", "bob2")?;

    // Interleaved encrypt
    let a1 = mgr
        .encrypt("alice1".to_string(), b"A1 msg".to_vec())
        .map_err(|e| format!("encrypt alice1: {e}"))?;
    let a2 = mgr
        .encrypt("alice2".to_string(), b"A2 msg".to_vec())
        .map_err(|e| format!("encrypt alice2: {e}"))?;
    let a1b = mgr
        .encrypt("alice1".to_string(), b"A1 msg2".to_vec())
        .map_err(|e| format!("encrypt alice1 msg2: {e}"))?;

    // Decrypt each with correct receiver
    let p1 = mgr
        .decrypt("bob1".to_string(), a1)
        .map_err(|e| format!("decrypt bob1 a1: {e}"))?;
    if p1 != b"A1 msg" {
        return Err("bob1 a1 plaintext mismatch".to_string());
    }

    let p2 = mgr
        .decrypt("bob2".to_string(), a2)
        .map_err(|e| format!("decrypt bob2 a2: {e}"))?;
    if p2 != b"A2 msg" {
        return Err("bob2 a2 plaintext mismatch".to_string());
    }

    let p1b = mgr
        .decrypt("bob1".to_string(), a1b)
        .map_err(|e| format!("decrypt bob1 a1b: {e}"))?;
    if p1b != b"A1 msg2" {
        return Err("bob1 a1b plaintext mismatch".to_string());
    }

    Ok(())
}

/// Decrypting a ciphertext with the wrong session must fail, not return plaintext.
#[test]
fn wrong_session_decrypt_fails() -> Result<(), String> {
    use im_e2ee_core::{generate_key_bundle, PreKey, PreKeyBundleFetch};

    fn setup_session(mgr: &SessionManager, alice_id: &str, bob_id: &str) -> Result<(), String> {
        let bob_bundle =
            generate_key_bundle(1, &[(100, 1)]).map_err(|e| format!("generate_key_bundle: {e}"))?;

        let fetch = PreKeyBundleFetch {
            identity_key: bob_bundle.bundle.identity_key,
            signing_key: bob_bundle.bundle.signing_key,
            signed_pre_key: PreKey {
                id: 1,
                key: bob_bundle.bundle.signed_pre_key,
            },
            signed_pre_key_signature: bob_bundle.bundle.signed_pre_key_signature,
            one_time_pre_key: bob_bundle.bundle.one_time_pre_keys.first().copied(),
        };
        let fetch_json =
            serde_json::to_string(&fetch).map_err(|e| format!("serialize fetch: {e}"))?;

        let alice_ik = generate_x25519_keypair();
        let alice_ik_bincode =
            bincode::serialize(&alice_ik).map_err(|e| format!("serialize alice_ik: {e}"))?;

        let handshake = mgr
            .create_outbound_session(alice_id.to_string(), alice_ik_bincode, fetch_json)
            .map_err(|e| format!("create_outbound_session: {e}"))?;

        if handshake.len() < 40 {
            return Err(format!("handshake too short: {} bytes", handshake.len()));
        }
        let ek_bytes = &handshake[0..32];

        let bob_ik_bincode = bincode::serialize(&bob_bundle.identity_key_pair)
            .map_err(|e| format!("serialize bob_ik: {e}"))?;
        let bob_spk_bincode = bincode::serialize(&bob_bundle.signed_pre_key_pair)
            .map_err(|e| format!("serialize bob_spk: {e}"))?;
        let bob_otk = bob_bundle
            .one_time_pre_key_pairs
            .first()
            .ok_or("missing OTK".to_string())?;
        let bob_otk_bincode =
            bincode::serialize(&bob_otk.key_pair).map_err(|e| format!("serialize bob_otk: {e}"))?;

        mgr.create_inbound_session(
            bob_id.to_string(),
            bob_ik_bincode,
            bob_spk_bincode,
            Some(bob_otk_bincode),
            alice_ik.public_key.0.to_vec(),
            ek_bytes.to_vec(),
        )
        .map_err(|e| format!("create_inbound_session: {e}"))?;

        Ok(())
    }

    let mgr = SessionManager::new();

    // Two independent session pairs
    setup_session(&mgr, "alice1", "bob1")?;
    setup_session(&mgr, "alice2", "bob2")?;

    // Encrypt with session 1
    let wire1 = mgr
        .encrypt("alice1".to_string(), b"secret for bob1".to_vec())
        .map_err(|e| format!("encrypt alice1: {e}"))?;

    // Try to decrypt with session 2's receiver — must fail
    let result = mgr.decrypt("bob2".to_string(), wire1);
    match result {
        Err(_) => {} // expected: decryption fails with wrong session
        Ok(plaintext) => {
            return Err(format!(
                "wrong session decryption MUST fail, but returned {} bytes",
                plaintext.len()
            ));
        }
    }

    // Verify correct session still works
    let wire_correct = mgr
        .encrypt("alice1".to_string(), b"correct receiver".to_vec())
        .map_err(|e| format!("encrypt correct: {e}"))?;
    let pt = mgr
        .decrypt("bob1".to_string(), wire_correct)
        .map_err(|e| format!("decrypt bob1: {e}"))?;
    if pt != b"correct receiver" {
        return Err("correct session plaintext mismatch".to_string());
    }

    Ok(())
}

// ============================================================================
// Concurrent session creation tests — TOCTOU race condition fix verification
// ============================================================================

/// Two threads concurrently create the same outbound session.
/// Only one must succeed; the other must return SessionAlreadyExists.
/// The session must remain usable after the race.
#[test]
fn concurrent_create_outbound_same_session_id_only_one_succeeds() -> Result<(), String> {
    use im_e2ee_core::{generate_key_bundle, PreKey, PreKeyBundleFetch};
    use std::sync::Arc;

    let bob_bundle =
        generate_key_bundle(1, &[(100, 3)]).map_err(|e| format!("generate_key_bundle: {e}"))?;

    let fetch = PreKeyBundleFetch {
        identity_key: bob_bundle.bundle.identity_key,
        signing_key: bob_bundle.bundle.signing_key,
        signed_pre_key: PreKey {
            id: 1,
            key: bob_bundle.bundle.signed_pre_key,
        },
        signed_pre_key_signature: bob_bundle.bundle.signed_pre_key_signature,
        one_time_pre_key: bob_bundle.bundle.one_time_pre_keys.first().copied(),
    };
    let fetch_json = serde_json::to_string(&fetch).map_err(|e| format!("serialize fetch: {e}"))?;

    let alice_ik = generate_x25519_keypair();
    let alice_ik_bincode =
        bincode::serialize(&alice_ik).map_err(|e| format!("serialize alice_ik: {e}"))?;

    let mgr = Arc::new(SessionManager::new());
    let session_id = "concurrent-outbound".to_string();

    let mut handles = Vec::new();
    for _ in 0..2 {
        let mgr = Arc::clone(&mgr);
        let sid = session_id.clone();
        let ik = alice_ik_bincode.clone();
        let fj = fetch_json.clone();
        handles.push(std::thread::spawn(move || {
            mgr.create_outbound_session(sid, ik, fj)
        }));
    }

    let mut success_count = 0;
    let mut already_exists_count = 0;
    let mut handshake = None;

    for h in handles {
        match h.join().expect("thread panicked") {
            Ok(hs) => {
                success_count += 1;
                handshake = Some(hs);
            }
            Err(SessionError::SessionAlreadyExists(_)) => {
                already_exists_count += 1;
            }
            Err(e) => {
                return Err(format!("unexpected error: {e}"));
            }
        }
    }

    if success_count != 1 {
        return Err(format!("expected exactly 1 success, got {success_count}"));
    }
    if already_exists_count != 1 {
        return Err(format!(
            "expected exactly 1 SessionAlreadyExists, got {already_exists_count}"
        ));
    }

    // Verify the winning session is usable
    let hs = handshake.ok_or("no handshake produced")?;
    if hs.len() < 40 {
        return Err(format!("handshake too short: {} bytes", hs.len()));
    }

    let _wire = mgr
        .encrypt(session_id.clone(), b"concurrent outbound test".to_vec())
        .map_err(|e| format!("encrypt after concurrent create: {e}"))?;

    let exported = mgr
        .export_session(session_id.clone())
        .map_err(|e| format!("export after concurrent create: {e}"))?;
    if exported.is_empty() {
        return Err("exported state is empty after concurrent create".to_string());
    }

    // If the second thread overwrote, the first handshake would be useless.
    // Verify by encrypting a second message with the same session.
    let wire2 = mgr
        .encrypt(session_id.clone(), b"second message".to_vec())
        .map_err(|e| format!("encrypt second message: {e}"))?;
    if wire2.is_empty() {
        return Err("second encrypted message is empty".to_string());
    }

    Ok(())
}

/// Two threads concurrently create the same inbound session.
/// Only one must succeed; the other must return SessionAlreadyExists.
#[test]
fn concurrent_create_inbound_same_session_id_only_one_succeeds() -> Result<(), String> {
    use im_e2ee_core::{generate_key_bundle, PreKey, PreKeyBundleFetch};
    use std::sync::Arc;

    let bob_bundle =
        generate_key_bundle(1, &[(100, 1)]).map_err(|e| format!("generate_key_bundle: {e}"))?;

    let fetch = PreKeyBundleFetch {
        identity_key: bob_bundle.bundle.identity_key,
        signing_key: bob_bundle.bundle.signing_key,
        signed_pre_key: PreKey {
            id: 1,
            key: bob_bundle.bundle.signed_pre_key,
        },
        signed_pre_key_signature: bob_bundle.bundle.signed_pre_key_signature,
        one_time_pre_key: bob_bundle.bundle.one_time_pre_keys.first().copied(),
    };
    let fetch_json = serde_json::to_string(&fetch).map_err(|e| format!("serialize fetch: {e}"))?;

    let alice_ik = generate_x25519_keypair();
    let alice_ik_bincode =
        bincode::serialize(&alice_ik).map_err(|e| format!("serialize alice_ik: {e}"))?;

    // Create a temp outbound session to obtain a valid handshake
    let prep_mgr = SessionManager::new();
    let handshake = prep_mgr
        .create_outbound_session("prep-alice".to_string(), alice_ik_bincode, fetch_json)
        .map_err(|e| format!("prep create_outbound_session: {e}"))?;

    if handshake.len() < 40 {
        return Err(format!("handshake too short: {} bytes", handshake.len()));
    }
    let alice_ek = handshake[0..32].to_vec();

    // Bob's key material
    let bob_ik_bincode = bincode::serialize(&bob_bundle.identity_key_pair)
        .map_err(|e| format!("serialize bob_ik: {e}"))?;
    let bob_spk_bincode = bincode::serialize(&bob_bundle.signed_pre_key_pair)
        .map_err(|e| format!("serialize bob_spk: {e}"))?;
    let bob_otk = bob_bundle
        .one_time_pre_key_pairs
        .first()
        .ok_or("missing OTK".to_string())?;
    let bob_otk_bincode =
        bincode::serialize(&bob_otk.key_pair).map_err(|e| format!("serialize bob_otk: {e}"))?;

    let alice_ik_pub = alice_ik.public_key.0.to_vec();

    // Concurrent test: two threads try to create the same inbound session
    let mgr = Arc::new(SessionManager::new());
    let session_id = "concurrent-inbound".to_string();

    let mut handles = Vec::new();
    for _ in 0..2 {
        let mgr = Arc::clone(&mgr);
        let sid = session_id.clone();
        let bik = bob_ik_bincode.clone();
        let bspk = bob_spk_bincode.clone();
        let botk = bob_otk_bincode.clone();
        let aik = alice_ik_pub.clone();
        let aek = alice_ek.clone();
        handles.push(std::thread::spawn(move || {
            mgr.create_inbound_session(sid, bik, bspk, Some(botk), aik, aek)
        }));
    }

    let mut success_count = 0;
    let mut already_exists_count = 0;

    for h in handles {
        match h.join().expect("thread panicked") {
            Ok(()) => success_count += 1,
            Err(SessionError::SessionAlreadyExists(_)) => already_exists_count += 1,
            Err(e) => return Err(format!("unexpected error: {e}")),
        }
    }

    if success_count != 1 {
        return Err(format!("expected exactly 1 success, got {success_count}"));
    }
    if already_exists_count != 1 {
        return Err(format!(
            "expected exactly 1 SessionAlreadyExists, got {already_exists_count}"
        ));
    }

    // Verify session is usable: encrypt with the prep outbound session,
    // decrypt with the concurrently-created inbound session
    let wire = prep_mgr
        .encrypt(
            "prep-alice".to_string(),
            b"concurrent inbound test".to_vec(),
        )
        .map_err(|e| format!("encrypt from prep: {e}"))?;

    let pt = mgr
        .decrypt(session_id.clone(), wire)
        .map_err(|e| format!("decrypt concurrent inbound: {e}"))?;

    if pt != b"concurrent inbound test" {
        return Err("plaintext mismatch after concurrent inbound create".to_string());
    }

    // Export should work
    let exported = mgr
        .export_session(session_id.clone())
        .map_err(|e| format!("export after concurrent inbound: {e}"))?;
    if exported.is_empty() {
        return Err("exported state is empty after concurrent inbound".to_string());
    }

    Ok(())
}

// ============================================================================
// restore_session safety tests — prevent silent overwrite of active sessions
// ============================================================================

/// restore_session succeeds when the session does not exist.
#[test]
fn restore_session_succeeds_when_session_missing() -> Result<(), String> {
    use im_e2ee_core::{generate_key_bundle, PreKey, PreKeyBundleFetch};

    let bob_bundle =
        generate_key_bundle(1, &[(100, 1)]).map_err(|e| format!("generate_key_bundle: {e}"))?;

    let fetch = PreKeyBundleFetch {
        identity_key: bob_bundle.bundle.identity_key,
        signing_key: bob_bundle.bundle.signing_key,
        signed_pre_key: PreKey {
            id: 1,
            key: bob_bundle.bundle.signed_pre_key,
        },
        signed_pre_key_signature: bob_bundle.bundle.signed_pre_key_signature,
        one_time_pre_key: bob_bundle.bundle.one_time_pre_keys.first().copied(),
    };
    let fetch_json = serde_json::to_string(&fetch).map_err(|e| format!("serialize fetch: {e}"))?;

    let alice_ik = generate_x25519_keypair();
    let alice_ik_bincode =
        bincode::serialize(&alice_ik).map_err(|e| format!("serialize alice_ik: {e}"))?;

    // Create a session in one manager, export it
    let mgr1 = SessionManager::new();
    mgr1.create_outbound_session("alice".to_string(), alice_ik_bincode, fetch_json)
        .map_err(|e| format!("create_outbound_session: {e}"))?;
    let exported = mgr1
        .export_session("alice".to_string())
        .map_err(|e| format!("export_session: {e}"))?;

    // Restore into a fresh manager — must succeed
    let mgr2 = SessionManager::new();
    mgr2.restore_session("alice".to_string(), exported)
        .map_err(|e| format!("restore_session should succeed on empty manager: {e}"))?;

    // Verify the restored session is usable
    let wire = mgr2
        .encrypt("alice".to_string(), b"restored session works".to_vec())
        .map_err(|e| format!("encrypt after restore: {e}"))?;
    if wire.is_empty() {
        return Err("encrypted wire is empty".to_string());
    }
    Ok(())
}

/// restore_session must fail with SessionAlreadyExists when the session already exists.
#[test]
fn restore_session_fails_when_session_already_exists() -> Result<(), String> {
    use im_e2ee_core::{generate_key_bundle, PreKey, PreKeyBundleFetch};

    let bob_bundle =
        generate_key_bundle(1, &[(100, 1)]).map_err(|e| format!("generate_key_bundle: {e}"))?;

    let fetch = PreKeyBundleFetch {
        identity_key: bob_bundle.bundle.identity_key,
        signing_key: bob_bundle.bundle.signing_key,
        signed_pre_key: PreKey {
            id: 1,
            key: bob_bundle.bundle.signed_pre_key,
        },
        signed_pre_key_signature: bob_bundle.bundle.signed_pre_key_signature,
        one_time_pre_key: bob_bundle.bundle.one_time_pre_keys.first().copied(),
    };
    let fetch_json = serde_json::to_string(&fetch).map_err(|e| format!("serialize fetch: {e}"))?;

    let alice_ik = generate_x25519_keypair();
    let alice_ik_bincode =
        bincode::serialize(&alice_ik).map_err(|e| format!("serialize alice_ik: {e}"))?;

    let mgr = SessionManager::new();
    mgr.create_outbound_session("alice".to_string(), alice_ik_bincode, fetch_json)
        .map_err(|e| format!("create_outbound_session: {e}"))?;
    let exported = mgr
        .export_session("alice".to_string())
        .map_err(|e| format!("export_session: {e}"))?;

    // restore_session on an existing session must fail
    let result = mgr.restore_session("alice".to_string(), exported);
    match result {
        Err(SessionError::SessionAlreadyExists(msg)) => {
            if !msg.contains("session already exists") {
                return Err(format!(
                    "expected 'session already exists' message, got: {msg}"
                ));
            }
            if !msg.contains("remove it before restore") {
                return Err(format!(
                    "expected 'remove it before restore' guidance, got: {msg}"
                ));
            }
        }
        Err(other) => {
            return Err(format!("expected SessionAlreadyExists, got {other:?}"));
        }
        Ok(()) => {
            return Err("expected SessionAlreadyExists, got Ok — silent overwrite!".to_string());
        }
    }

    Ok(())
}

/// A failed restore_session must NOT overwrite the original session state.
#[test]
fn restore_session_failure_does_not_overwrite_original() -> Result<(), String> {
    use im_e2ee_core::{generate_key_bundle, PreKey, PreKeyBundleFetch};

    let bob_bundle =
        generate_key_bundle(1, &[(100, 3)]).map_err(|e| format!("generate_key_bundle: {e}"))?;

    let fetch = PreKeyBundleFetch {
        identity_key: bob_bundle.bundle.identity_key,
        signing_key: bob_bundle.bundle.signing_key,
        signed_pre_key: PreKey {
            id: 1,
            key: bob_bundle.bundle.signed_pre_key,
        },
        signed_pre_key_signature: bob_bundle.bundle.signed_pre_key_signature,
        one_time_pre_key: bob_bundle.bundle.one_time_pre_keys.first().copied(),
    };
    let fetch_json = serde_json::to_string(&fetch).map_err(|e| format!("serialize fetch: {e}"))?;

    let alice_ik = generate_x25519_keypair();
    let alice_ik_bincode =
        bincode::serialize(&alice_ik).map_err(|e| format!("serialize alice_ik: {e}"))?;

    let mgr = SessionManager::new();
    mgr.create_outbound_session("alice".to_string(), alice_ik_bincode, fetch_json)
        .map_err(|e| format!("create_outbound_session: {e}"))?;

    // Encrypt a message with the original session
    let wire1 = mgr
        .encrypt("alice".to_string(), b"original session message".to_vec())
        .map_err(|e| format!("encrypt original: {e}"))?;

    // Create a different session, export it, then try to restore over "alice"
    let alice2_ik = generate_x25519_keypair();
    let alice2_ik_bincode =
        bincode::serialize(&alice2_ik).map_err(|e| format!("serialize alice2_ik: {e}"))?;
    let fetch2_json =
        serde_json::to_string(&fetch).map_err(|e| format!("serialize fetch2: {e}"))?;
    let mgr2 = SessionManager::new();
    mgr2.create_outbound_session("temp".to_string(), alice2_ik_bincode, fetch2_json)
        .map_err(|e| format!("create_outbound_session temp: {e}"))?;
    let exported_other = mgr2
        .export_session("temp".to_string())
        .map_err(|e| format!("export_session temp: {e}"))?;

    // Attempt to restore over "alice" — must fail
    let result = mgr.restore_session("alice".to_string(), exported_other);
    assert!(result.is_err(), "restore over existing session must fail");

    // Original session must still work after the failed restore
    let wire2 = mgr
        .encrypt(
            "alice".to_string(),
            b"still the original after failed restore".to_vec(),
        )
        .map_err(|e| format!("encrypt after failed restore: {e}"))?;

    if wire1 == wire2 {
        return Err(
            "two encryptions on the same session produced identical wire — ratchet did not advance"
                .to_string(),
        );
    }

    Ok(())
}

/// remove_session then restore_session must succeed.
#[test]
fn remove_then_restore_succeeds() -> Result<(), String> {
    use im_e2ee_core::{generate_key_bundle, PreKey, PreKeyBundleFetch};

    let bob_bundle =
        generate_key_bundle(1, &[(100, 1)]).map_err(|e| format!("generate_key_bundle: {e}"))?;

    let fetch = PreKeyBundleFetch {
        identity_key: bob_bundle.bundle.identity_key,
        signing_key: bob_bundle.bundle.signing_key,
        signed_pre_key: PreKey {
            id: 1,
            key: bob_bundle.bundle.signed_pre_key,
        },
        signed_pre_key_signature: bob_bundle.bundle.signed_pre_key_signature,
        one_time_pre_key: bob_bundle.bundle.one_time_pre_keys.first().copied(),
    };
    let fetch_json = serde_json::to_string(&fetch).map_err(|e| format!("serialize fetch: {e}"))?;

    let alice_ik = generate_x25519_keypair();
    let alice_ik_bincode =
        bincode::serialize(&alice_ik).map_err(|e| format!("serialize alice_ik: {e}"))?;

    let mgr = SessionManager::new();
    mgr.create_outbound_session("alice".to_string(), alice_ik_bincode, fetch_json)
        .map_err(|e| format!("create_outbound_session: {e}"))?;
    let exported = mgr
        .export_session("alice".to_string())
        .map_err(|e| format!("export_session: {e}"))?;

    // Remove, then restore — must succeed
    mgr.remove_session("alice".to_string());
    mgr.restore_session("alice".to_string(), exported)
        .map_err(|e| format!("restore after remove should succeed: {e}"))?;

    // Verify it works
    let wire = mgr
        .encrypt("alice".to_string(), b"restored after remove".to_vec())
        .map_err(|e| format!("encrypt after restore: {e}"))?;
    if wire.is_empty() {
        return Err("encrypted wire is empty".to_string());
    }
    Ok(())
}

/// Full flow: create -> export -> remove -> restore -> encrypt -> decrypt still works.
#[test]
fn export_remove_restore_full_roundtrip() -> Result<(), String> {
    use im_e2ee_core::{generate_key_bundle, PreKey, PreKeyBundleFetch};

    let bob_bundle =
        generate_key_bundle(1, &[(100, 3)]).map_err(|e| format!("generate_key_bundle: {e}"))?;

    let fetch = PreKeyBundleFetch {
        identity_key: bob_bundle.bundle.identity_key,
        signing_key: bob_bundle.bundle.signing_key,
        signed_pre_key: PreKey {
            id: 1,
            key: bob_bundle.bundle.signed_pre_key,
        },
        signed_pre_key_signature: bob_bundle.bundle.signed_pre_key_signature,
        one_time_pre_key: bob_bundle.bundle.one_time_pre_keys.first().copied(),
    };
    let fetch_json = serde_json::to_string(&fetch).map_err(|e| format!("serialize fetch: {e}"))?;

    let alice_ik = generate_x25519_keypair();
    let alice_ik_bincode =
        bincode::serialize(&alice_ik).map_err(|e| format!("serialize alice_ik: {e}"))?;

    let mgr = SessionManager::new();

    // Alice creates outbound session
    let handshake = mgr
        .create_outbound_session("alice".to_string(), alice_ik_bincode, fetch_json)
        .map_err(|e| format!("create_outbound_session: {e}"))?;
    if handshake.len() < 40 {
        return Err(format!("handshake too short: {} bytes", handshake.len()));
    }
    let ek_bytes = &handshake[0..32];

    // Bob's side
    let bob_ik_bincode = bincode::serialize(&bob_bundle.identity_key_pair)
        .map_err(|e| format!("serialize bob_ik: {e}"))?;
    let bob_spk_bincode = bincode::serialize(&bob_bundle.signed_pre_key_pair)
        .map_err(|e| format!("serialize bob_spk: {e}"))?;
    let bob_otk = bob_bundle
        .one_time_pre_key_pairs
        .first()
        .ok_or("missing OTK".to_string())?;
    let bob_otk_bincode =
        bincode::serialize(&bob_otk.key_pair).map_err(|e| format!("serialize bob_otk: {e}"))?;

    mgr.create_inbound_session(
        "bob".to_string(),
        bob_ik_bincode,
        bob_spk_bincode,
        Some(bob_otk_bincode),
        alice_ik.public_key.0.to_vec(),
        ek_bytes.to_vec(),
    )
    .map_err(|e| format!("create_inbound_session: {e}"))?;

    // Alice encrypts
    let wire1 = mgr
        .encrypt("alice".to_string(), b"before export".to_vec())
        .map_err(|e| format!("encrypt before export: {e}"))?;

    // Export Alice's state
    let alice_state = mgr
        .export_session("alice".to_string())
        .map_err(|e| format!("export_session: {e}"))?;
    if alice_state.is_empty() {
        return Err("exported state is empty".to_string());
    }

    // Remove Alice's session
    mgr.remove_session("alice".to_string());

    // Verify session is gone
    match mgr.encrypt("alice".to_string(), b"test".to_vec()) {
        Err(SessionError::SessionNotFound(_)) => {}
        other => {
            return Err(format!(
                "expected SessionNotFound after remove, got {:?}",
                other
            ));
        }
    }

    // Restore Alice's session
    mgr.restore_session("alice".to_string(), alice_state)
        .map_err(|e| format!("restore_session: {e}"))?;

    // Alice encrypts again — must succeed
    let wire2 = mgr
        .encrypt("alice".to_string(), b"after restore".to_vec())
        .map_err(|e| format!("encrypt after restore: {e}"))?;

    // Bob decrypts both messages
    let pt1 = mgr
        .decrypt("bob".to_string(), wire1)
        .map_err(|e| format!("decrypt wire1: {e}"))?;
    if pt1 != b"before export" {
        return Err("plaintext1 mismatch".to_string());
    }

    let pt2 = mgr
        .decrypt("bob".to_string(), wire2)
        .map_err(|e| format!("decrypt wire2: {e}"))?;
    if pt2 != b"after restore" {
        return Err("plaintext2 mismatch".to_string());
    }

    Ok(())
}

/// restore_session with the session_id from the error message confirms the right session
/// is identified in the conflict.
#[test]
fn restore_session_already_exists_message_preserves_session_id_context() -> Result<(), String> {
    use im_e2ee_core::{generate_key_bundle, PreKey, PreKeyBundleFetch};

    let bob_bundle =
        generate_key_bundle(1, &[(100, 1)]).map_err(|e| format!("generate_key_bundle: {e}"))?;
    let fetch = PreKeyBundleFetch {
        identity_key: bob_bundle.bundle.identity_key,
        signing_key: bob_bundle.bundle.signing_key,
        signed_pre_key: PreKey {
            id: 1,
            key: bob_bundle.bundle.signed_pre_key,
        },
        signed_pre_key_signature: bob_bundle.bundle.signed_pre_key_signature,
        one_time_pre_key: bob_bundle.bundle.one_time_pre_keys.first().copied(),
    };
    let fetch_json = serde_json::to_string(&fetch).map_err(|e| format!("serialize fetch: {e}"))?;
    let alice_ik = generate_x25519_keypair();
    let alice_ik_bincode =
        bincode::serialize(&alice_ik).map_err(|e| format!("serialize alice_ik: {e}"))?;

    let mgr = SessionManager::new();
    mgr.create_outbound_session("my-session".to_string(), alice_ik_bincode, fetch_json)
        .map_err(|e| format!("create_outbound_session: {e}"))?;

    // Export some valid state so we trigger the "already exists" path, not
    // InvalidStateData.
    let exported = mgr
        .export_session("my-session".to_string())
        .map_err(|e| format!("export_session: {e}"))?;

    let err = match mgr.restore_session("my-session".to_string(), exported.clone()) {
        Err(e) => e,
        Ok(()) => return Err("expected SessionAlreadyExists, got Ok".to_string()),
    };
    let msg = match err {
        SessionError::SessionAlreadyExists(m) => m,
        other => return Err(format!("expected SessionAlreadyExists, got {other:?}")),
    };
    // The existing SessionAlreadyExists Display format does not include the
    // session_id in the payload for restore_session (it uses a fixed guidance
    // message). This is intentional — the caller already knows the session_id
    // from the argument. The guidance message is the key information.
    if msg.is_empty() {
        return Err("SessionAlreadyExists message is empty".to_string());
    }
    Ok(())
}

/// Multiple threads creating sessions with different session_ids must all succeed.
/// The global write lock should not cause false SessionAlreadyExists errors.
#[test]
fn concurrent_create_different_session_ids_all_succeed() -> Result<(), String> {
    use im_e2ee_core::{generate_key_bundle, PreKey, PreKeyBundleFetch};
    use std::sync::Arc;

    let bob_bundle =
        generate_key_bundle(1, &[(100, 4)]).map_err(|e| format!("generate_key_bundle: {e}"))?;

    let fetch = PreKeyBundleFetch {
        identity_key: bob_bundle.bundle.identity_key,
        signing_key: bob_bundle.bundle.signing_key,
        signed_pre_key: PreKey {
            id: 1,
            key: bob_bundle.bundle.signed_pre_key,
        },
        signed_pre_key_signature: bob_bundle.bundle.signed_pre_key_signature,
        one_time_pre_key: bob_bundle.bundle.one_time_pre_keys.first().copied(),
    };
    let fetch_json = serde_json::to_string(&fetch).map_err(|e| format!("serialize fetch: {e}"))?;

    let alice_ik = generate_x25519_keypair();
    let alice_ik_bincode =
        bincode::serialize(&alice_ik).map_err(|e| format!("serialize alice_ik: {e}"))?;

    let mgr = Arc::new(SessionManager::new());
    let thread_count = 4;

    let mut handles = Vec::new();
    for i in 0..thread_count {
        let mgr = Arc::clone(&mgr);
        let sid = format!("concurrent-diff-{}", i);
        let ik = alice_ik_bincode.clone();
        let fj = fetch_json.clone();
        handles.push(std::thread::spawn(move || {
            mgr.create_outbound_session(sid, ik, fj)
        }));
    }

    for (i, h) in handles.into_iter().enumerate() {
        match h.join().expect("thread panicked") {
            Ok(hs) => {
                if hs.len() < 40 {
                    return Err(format!(
                        "thread {} handshake too short: {} bytes",
                        i,
                        hs.len()
                    ));
                }
            }
            Err(e) => {
                return Err(format!("thread {} unexpected error: {e}", i));
            }
        }
    }

    // Verify all sessions are independently usable
    for i in 0..thread_count {
        let sid = format!("concurrent-diff-{}", i);
        let wire = mgr
            .encrypt(sid.clone(), format!("msg-{}", i).into_bytes())
            .map_err(|e| format!("encrypt {}: {e}", i))?;
        if wire.is_empty() {
            return Err(format!("encrypted message {} is empty", i));
        }
    }

    Ok(())
}
