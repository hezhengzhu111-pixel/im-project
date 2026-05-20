use super::*;
use crate::primitives::{ed25519_verify, generate_x25519_keypair};

// --- Test helpers ---

fn make_bob_bundle() -> Result<(KeyBundle, PreKeyBundleFetch), E2eeError> {
    let kb = generate_key_bundle(1, &[(1, 1)])?;
    let fetch = PreKeyBundleFetch {
        identity_key: kb.bundle.identity_key,
        signing_key: kb.bundle.signing_key,
        signed_pre_key: PreKey {
            id: 1,
            key: kb.bundle.signed_pre_key,
        },
        signed_pre_key_signature: kb.bundle.signed_pre_key_signature,
        one_time_pre_key: kb.bundle.one_time_pre_keys.first().copied(),
    };
    Ok((kb, fetch))
}

// --- Task 15: generate_key_bundle ---

#[test]
fn generate_key_bundle_zero_otk() -> Result<(), E2eeError> {
    let kb = generate_key_bundle(1, &[])?;
    assert!(kb.bundle.one_time_pre_keys.is_empty());
    assert_eq!(kb.one_time_pre_key_pairs.len(), 0);
    Ok(())
}

#[test]
fn generate_key_bundle_with_one_otk() -> Result<(), E2eeError> {
    let kb = generate_key_bundle(1, &[(100, 1)])?;
    assert_eq!(kb.bundle.one_time_pre_keys.len(), 1);
    assert_eq!(kb.one_time_pre_key_pairs.len(), 1);
    assert!(kb.one_time_pre_key_pair(100).is_some());
    Ok(())
}

#[test]
fn generate_key_bundle_with_one_hundred_otks() -> Result<(), E2eeError> {
    let kb = generate_key_bundle(1, &[(100, 100)])?;
    assert_eq!(kb.bundle.one_time_pre_keys.len(), 100);
    assert_eq!(kb.one_time_pre_key_pairs.len(), 100);
    assert!(kb.one_time_pre_key_pair(100).is_some());
    assert!(kb.one_time_pre_key_pair(199).is_some());
    Ok(())
}

#[test]
fn generate_key_bundle_spk_signature_valid() -> Result<(), E2eeError> {
    let kb = generate_key_bundle(42, &[])?;
    let result = ed25519_verify(
        &kb.signing_key_pair.public_key,
        &kb.signed_pre_key_pair.public_key.0,
        &kb.bundle.signed_pre_key_signature,
    );
    assert!(result.is_ok());
    Ok(())
}

// --- Task 16: x3dh_initiate ---

#[test]
fn x3dh_initiate_with_otk_succeeds() -> Result<(), E2eeError> {
    let alice_ik = generate_x25519_keypair();
    let (_bob, fetch) = make_bob_bundle()?;
    let result = x3dh_initiate(&alice_ik, &fetch)?;
    assert_eq!(result.spk_id, 1);
    assert_eq!(result.otk_id, Some(1));
    Ok(())
}

#[test]
fn x3dh_initiate_spk_only_succeeds() -> Result<(), E2eeError> {
    let alice_ik = generate_x25519_keypair();
    let kb = generate_key_bundle(7, &[])?;
    let fetch = PreKeyBundleFetch {
        identity_key: kb.bundle.identity_key,
        signing_key: kb.bundle.signing_key,
        signed_pre_key: PreKey {
            id: 7,
            key: kb.bundle.signed_pre_key,
        },
        signed_pre_key_signature: kb.bundle.signed_pre_key_signature,
        one_time_pre_key: None,
    };
    let result = x3dh_initiate(&alice_ik, &fetch)?;
    assert_eq!(result.spk_id, 7);
    assert_eq!(result.otk_id, None);
    Ok(())
}

#[test]
fn x3dh_initiate_rejects_bad_spk_signature() -> Result<(), E2eeError> {
    let alice_ik = generate_x25519_keypair();
    let kb = generate_key_bundle(1, &[])?;
    let mut bad_sig = kb.bundle.signed_pre_key_signature;
    if let Some(byte) = bad_sig.0.get_mut(0) {
        *byte ^= 1;
    }
    let fetch = PreKeyBundleFetch {
        identity_key: kb.bundle.identity_key,
        signing_key: kb.bundle.signing_key,
        signed_pre_key: PreKey {
            id: 1,
            key: kb.bundle.signed_pre_key,
        },
        signed_pre_key_signature: bad_sig,
        one_time_pre_key: None,
    };
    let result = x3dh_initiate(&alice_ik, &fetch);
    assert!(matches!(result, Err(E2eeError::SpkSignatureRejected)));
    Ok(())
}

// --- Task 17: x3dh_respond ---

#[test]
fn x3dh_full_handshake_with_otk() -> Result<(), E2eeError> {
    let alice_ik = generate_x25519_keypair();
    let bob_bundle = generate_key_bundle(1, &[(100, 1)])?;
    let bob_otk = bob_bundle
        .one_time_pre_key_pair(100)
        .ok_or_else(|| E2eeError::InvalidPreKeyId(String::from("missing OTK 100")))?;

    let fetch = PreKeyBundleFetch {
        identity_key: bob_bundle.bundle.identity_key,
        signing_key: bob_bundle.bundle.signing_key,
        signed_pre_key: PreKey {
            id: 1,
            key: bob_bundle.bundle.signed_pre_key,
        },
        signed_pre_key_signature: bob_bundle.bundle.signed_pre_key_signature,
        one_time_pre_key: Some(bob_otk.pre_key()),
    };

    let alice_result = x3dh_initiate(&alice_ik, &fetch)?;
    let bob_result = x3dh_respond(
        &bob_bundle.identity_key_pair,
        &bob_bundle.signed_pre_key_pair,
        Some(bob_otk),
        &alice_ik.public_key,
        &alice_result.ephemeral_public_key,
    )?;

    assert_eq!(alice_result.root_key.0, bob_result.root_key.0);
    assert_eq!(alice_result.otk_id, Some(100));
    assert_eq!(bob_result.otk_id, Some(100));
    Ok(())
}

#[test]
fn x3dh_otk_ids_100_and_101_roundtrip() -> Result<(), E2eeError> {
    let bob_bundle = generate_key_bundle(1, &[(100, 2)])?;
    for otk_id in [100u32, 101u32] {
        let alice_ik = generate_x25519_keypair();
        let bob_otk = bob_bundle
            .one_time_pre_key_pair(otk_id)
            .ok_or_else(|| E2eeError::InvalidPreKeyId(String::from("missing test OTK")))?;
        let fetch = PreKeyBundleFetch {
            identity_key: bob_bundle.bundle.identity_key,
            signing_key: bob_bundle.bundle.signing_key,
            signed_pre_key: PreKey {
                id: 1,
                key: bob_bundle.bundle.signed_pre_key,
            },
            signed_pre_key_signature: bob_bundle.bundle.signed_pre_key_signature,
            one_time_pre_key: Some(bob_otk.pre_key()),
        };

        let alice_result = x3dh_initiate(&alice_ik, &fetch)?;
        let bob_result = x3dh_respond(
            &bob_bundle.identity_key_pair,
            &bob_bundle.signed_pre_key_pair,
            Some(bob_otk),
            &alice_ik.public_key,
            &alice_result.ephemeral_public_key,
        )?;

        assert_eq!(alice_result.root_key.0, bob_result.root_key.0);
        assert_eq!(alice_result.otk_id, Some(otk_id));
        assert_eq!(bob_result.otk_id, Some(otk_id));
    }
    Ok(())
}

#[test]
fn x3dh_full_handshake_spk_only() -> Result<(), E2eeError> {
    let alice_ik = generate_x25519_keypair();
    let bob_bundle = generate_key_bundle(42, &[])?;

    let fetch = PreKeyBundleFetch {
        identity_key: bob_bundle.bundle.identity_key,
        signing_key: bob_bundle.bundle.signing_key,
        signed_pre_key: PreKey {
            id: 42,
            key: bob_bundle.bundle.signed_pre_key,
        },
        signed_pre_key_signature: bob_bundle.bundle.signed_pre_key_signature,
        one_time_pre_key: None,
    };

    let alice_result = x3dh_initiate(&alice_ik, &fetch)?;
    let bob_result = x3dh_respond(
        &bob_bundle.identity_key_pair,
        &bob_bundle.signed_pre_key_pair,
        None,
        &alice_ik.public_key,
        &alice_result.ephemeral_public_key,
    )?;

    assert_eq!(alice_result.root_key.0, bob_result.root_key.0);
    assert_eq!(alice_result.otk_id, None);
    assert_eq!(bob_result.otk_id, None);
    Ok(())
}

#[test]
fn x3dh_different_identity_keys_produce_different_roots() -> Result<(), E2eeError> {
    let alice1 = generate_x25519_keypair();
    let alice2 = generate_x25519_keypair();
    let bob_bundle = generate_key_bundle(1, &[])?;

    let fetch = PreKeyBundleFetch {
        identity_key: bob_bundle.bundle.identity_key,
        signing_key: bob_bundle.bundle.signing_key,
        signed_pre_key: PreKey {
            id: 1,
            key: bob_bundle.bundle.signed_pre_key,
        },
        signed_pre_key_signature: bob_bundle.bundle.signed_pre_key_signature,
        one_time_pre_key: None,
    };

    let r1 = x3dh_initiate(&alice1, &fetch)?;
    let r2 = x3dh_initiate(&alice2, &fetch)?;
    assert_ne!(r1.root_key.0, r2.root_key.0);
    Ok(())
}

// --- T6: KeyBundle → PreKeyBundle (server-publishable) → PreKeyBundleFetch ---

#[test]
fn x3dh_key_bundle_to_fetch_roundtrip() -> Result<(), E2eeError> {
    let bob_bundle = generate_key_bundle(42, &[(1001, 3)])?;

    // Step 1: KeyBundle.bundle is already a PreKeyBundle (server-publishable form)
    let server_bundle: &PreKeyBundle = &bob_bundle.bundle;
    assert_eq!(server_bundle.one_time_pre_keys.len(), 3);
    let first_otk = server_bundle
        .one_time_pre_keys
        .first()
        .ok_or_else(|| E2eeError::InvalidPreKeyId(String::from("missing first OTK")))?;
    assert_eq!(first_otk.id, 1001);

    // Step 2: Server picks an OTK and constructs PreKeyBundleFetch for Alice
    let picked_otk = server_bundle.one_time_pre_keys.first().copied();
    let fetch = PreKeyBundleFetch {
        identity_key: server_bundle.identity_key,
        signing_key: server_bundle.signing_key,
        signed_pre_key: PreKey {
            id: bob_bundle.spk_id,
            key: server_bundle.signed_pre_key,
        },
        signed_pre_key_signature: server_bundle.signed_pre_key_signature,
        one_time_pre_key: picked_otk,
    };

    // Step 3: Full handshake with the constructed fetch
    let alice_ik = generate_x25519_keypair();
    let alice_result = x3dh_initiate(&alice_ik, &fetch)?;

    let bob_otk = bob_bundle
        .one_time_pre_key_pair(1001)
        .ok_or_else(|| E2eeError::InvalidPreKeyId(String::from("missing OTK 1001")))?;
    let bob_result = x3dh_respond(
        &bob_bundle.identity_key_pair,
        &bob_bundle.signed_pre_key_pair,
        Some(bob_otk),
        &alice_ik.public_key,
        &alice_result.ephemeral_public_key,
    )?;

    assert_eq!(alice_result.root_key.0, bob_result.root_key.0);
    assert_eq!(alice_result.spk_id, 42);
    assert_eq!(alice_result.otk_id, Some(1001));
    Ok(())
}

// --- T7: OTK count = 1 full handshake ---

#[test]
fn x3dh_otk_count_one_full_handshake() -> Result<(), E2eeError> {
    let alice_ik = generate_x25519_keypair();
    let bob_bundle = generate_key_bundle(1, &[(200, 1)])?;
    let bob_otk = bob_bundle
        .one_time_pre_key_pair(200)
        .ok_or_else(|| E2eeError::InvalidPreKeyId(String::from("missing OTK 200")))?;

    let fetch = PreKeyBundleFetch {
        identity_key: bob_bundle.bundle.identity_key,
        signing_key: bob_bundle.bundle.signing_key,
        signed_pre_key: PreKey {
            id: 1,
            key: bob_bundle.bundle.signed_pre_key,
        },
        signed_pre_key_signature: bob_bundle.bundle.signed_pre_key_signature,
        one_time_pre_key: Some(bob_otk.pre_key()),
    };

    let alice_result = x3dh_initiate(&alice_ik, &fetch)?;
    let bob_result = x3dh_respond(
        &bob_bundle.identity_key_pair,
        &bob_bundle.signed_pre_key_pair,
        Some(bob_otk),
        &alice_ik.public_key,
        &alice_result.ephemeral_public_key,
    )?;

    assert_eq!(alice_result.root_key.0, bob_result.root_key.0);
    assert_eq!(alice_result.otk_id, Some(200));
    Ok(())
}

// --- T7: OTK count = 100 full handshake (pick middle OTK) ---

#[test]
fn x3dh_otk_count_hundred_full_handshake() -> Result<(), E2eeError> {
    let alice_ik = generate_x25519_keypair();
    let bob_bundle = generate_key_bundle(1, &[(500, 100)])?;

    // Pick the 51st OTK (id=550)
    let bob_otk = bob_bundle
        .one_time_pre_key_pair(550)
        .ok_or_else(|| E2eeError::InvalidPreKeyId(String::from("missing OTK 550")))?;

    let fetch = PreKeyBundleFetch {
        identity_key: bob_bundle.bundle.identity_key,
        signing_key: bob_bundle.bundle.signing_key,
        signed_pre_key: PreKey {
            id: 1,
            key: bob_bundle.bundle.signed_pre_key,
        },
        signed_pre_key_signature: bob_bundle.bundle.signed_pre_key_signature,
        one_time_pre_key: Some(bob_otk.pre_key()),
    };

    let alice_result = x3dh_initiate(&alice_ik, &fetch)?;
    let bob_result = x3dh_respond(
        &bob_bundle.identity_key_pair,
        &bob_bundle.signed_pre_key_pair,
        Some(bob_otk),
        &alice_ik.public_key,
        &alice_result.ephemeral_public_key,
    )?;

    assert_eq!(alice_result.root_key.0, bob_result.root_key.0);
    assert_eq!(bob_bundle.bundle.one_time_pre_keys.len(), 100);
    assert_eq!(bob_bundle.one_time_pre_key_pairs.len(), 100);
    Ok(())
}

// --- T8: OTK id not array index (id=1001) ---

#[test]
fn x3dh_otk_id_1001_not_array_index() -> Result<(), E2eeError> {
    let alice_ik = generate_x25519_keypair();
    // Single OTK with id=1001 — clearly not an array index
    let bob_bundle = generate_key_bundle(7, &[(1001, 1)])?;

    let bob_otk = bob_bundle
        .one_time_pre_key_pair(1001)
        .ok_or_else(|| E2eeError::InvalidPreKeyId(String::from("missing OTK 1001")))?;

    let fetch = PreKeyBundleFetch {
        identity_key: bob_bundle.bundle.identity_key,
        signing_key: bob_bundle.bundle.signing_key,
        signed_pre_key: PreKey {
            id: 7,
            key: bob_bundle.bundle.signed_pre_key,
        },
        signed_pre_key_signature: bob_bundle.bundle.signed_pre_key_signature,
        one_time_pre_key: Some(bob_otk.pre_key()),
    };

    let alice_result = x3dh_initiate(&alice_ik, &fetch)?;
    let bob_result = x3dh_respond(
        &bob_bundle.identity_key_pair,
        &bob_bundle.signed_pre_key_pair,
        Some(bob_otk),
        &alice_ik.public_key,
        &alice_result.ephemeral_public_key,
    )?;

    assert_eq!(alice_result.root_key.0, bob_result.root_key.0);
    assert_eq!(alice_result.otk_id, Some(1001));
    assert_eq!(bob_result.otk_id, Some(1001));
    Ok(())
}

// --- T9: Wrong OTK private key produces different root key ---

#[test]
fn x3dh_wrong_otk_private_key_produces_different_root() -> Result<(), E2eeError> {
    let alice_ik = generate_x25519_keypair();
    let bob_bundle = generate_key_bundle(1, &[(300, 2)])?;

    // Alice uses OTK 300's public key
    let bob_otk_300 = bob_bundle
        .one_time_pre_key_pair(300)
        .ok_or_else(|| E2eeError::InvalidPreKeyId(String::from("missing OTK 300")))?;

    let fetch = PreKeyBundleFetch {
        identity_key: bob_bundle.bundle.identity_key,
        signing_key: bob_bundle.bundle.signing_key,
        signed_pre_key: PreKey {
            id: 1,
            key: bob_bundle.bundle.signed_pre_key,
        },
        signed_pre_key_signature: bob_bundle.bundle.signed_pre_key_signature,
        one_time_pre_key: Some(bob_otk_300.pre_key()),
    };

    let alice_result = x3dh_initiate(&alice_ik, &fetch)?;

    // Bob uses OTK 301 (wrong private key) instead of 300
    let bob_wrong_otk = bob_bundle
        .one_time_pre_key_pair(301)
        .ok_or_else(|| E2eeError::InvalidPreKeyId(String::from("missing OTK 301")))?;

    let bob_result = x3dh_respond(
        &bob_bundle.identity_key_pair,
        &bob_bundle.signed_pre_key_pair,
        Some(bob_wrong_otk),
        &alice_ik.public_key,
        &alice_result.ephemeral_public_key,
    )?;

    // Root keys must differ because DH4 used different private keys
    assert_ne!(alice_result.root_key.0, bob_result.root_key.0);
    Ok(())
}

// --- T10: root_key not all zero ---

#[test]
fn x3dh_root_key_not_all_zero() -> Result<(), E2eeError> {
    let alice_ik = generate_x25519_keypair();

    // With OTK
    let bob_with_otk = generate_key_bundle(1, &[(1, 1)])?;
    let otk = bob_with_otk.bundle.one_time_pre_keys.first().copied();
    let fetch_with_otk = PreKeyBundleFetch {
        identity_key: bob_with_otk.bundle.identity_key,
        signing_key: bob_with_otk.bundle.signing_key,
        signed_pre_key: PreKey {
            id: 1,
            key: bob_with_otk.bundle.signed_pre_key,
        },
        signed_pre_key_signature: bob_with_otk.bundle.signed_pre_key_signature,
        one_time_pre_key: otk,
    };
    let result_with_otk = x3dh_initiate(&alice_ik, &fetch_with_otk)?;
    assert!(result_with_otk.root_key.0.iter().any(|&b| b != 0));

    // SPK-only (without OTK)
    let bob_spk_only = generate_key_bundle(1, &[])?;
    let fetch_spk_only = PreKeyBundleFetch {
        identity_key: bob_spk_only.bundle.identity_key,
        signing_key: bob_spk_only.bundle.signing_key,
        signed_pre_key: PreKey {
            id: 1,
            key: bob_spk_only.bundle.signed_pre_key,
        },
        signed_pre_key_signature: bob_spk_only.bundle.signed_pre_key_signature,
        one_time_pre_key: None,
    };
    let result_spk_only = x3dh_initiate(&alice_ik, &fetch_spk_only)?;
    assert!(result_spk_only.root_key.0.iter().any(|&b| b != 0));

    Ok(())
}

// --- Legacy helper: generate_key_bundle_with_count ---

#[test]
fn x3dh_generate_key_bundle_with_count_legacy_handshake() -> Result<(), E2eeError> {
    let alice_ik = generate_x25519_keypair();

    // Legacy API: single count, OTK ids start from 1
    let bob_bundle = generate_key_bundle_with_count(5, 3)?;

    assert_eq!(bob_bundle.spk_id, 5);
    assert_eq!(bob_bundle.bundle.one_time_pre_keys.len(), 3);
    assert_eq!(bob_bundle.one_time_pre_key_pairs.len(), 3);

    // OTK ids should be 1, 2, 3 (contiguous starting at 1)
    assert!(bob_bundle.one_time_pre_key_pair(1).is_some());
    assert!(bob_bundle.one_time_pre_key_pair(2).is_some());
    assert!(bob_bundle.one_time_pre_key_pair(3).is_some());
    assert!(bob_bundle.one_time_pre_key_pair(4).is_none());

    // SPK signature is valid
    ed25519_verify(
        &bob_bundle.signing_key_pair.public_key,
        &bob_bundle.signed_pre_key_pair.public_key.0,
        &bob_bundle.bundle.signed_pre_key_signature,
    )?;

    // Full handshake using legacy bundle
    let bob_otk = bob_bundle
        .one_time_pre_key_pair(2)
        .ok_or_else(|| E2eeError::InvalidPreKeyId(String::from("missing OTK 2")))?;
    let fetch = PreKeyBundleFetch {
        identity_key: bob_bundle.bundle.identity_key,
        signing_key: bob_bundle.bundle.signing_key,
        signed_pre_key: PreKey {
            id: 5,
            key: bob_bundle.bundle.signed_pre_key,
        },
        signed_pre_key_signature: bob_bundle.bundle.signed_pre_key_signature,
        one_time_pre_key: Some(bob_otk.pre_key()),
    };

    let alice_result = x3dh_initiate(&alice_ik, &fetch)?;
    let bob_result = x3dh_respond(
        &bob_bundle.identity_key_pair,
        &bob_bundle.signed_pre_key_pair,
        Some(bob_otk),
        &alice_ik.public_key,
        &alice_result.ephemeral_public_key,
    )?;

    assert_eq!(alice_result.root_key.0, bob_result.root_key.0);
    assert_eq!(alice_result.spk_id, 5);
    assert_eq!(alice_result.otk_id, Some(2));
    Ok(())
}

// --- Legacy helper: x3dh_respond_with_raw_otk ---

#[test]
fn x3dh_respond_with_raw_otk_legacy_handshake() -> Result<(), E2eeError> {
    let alice_ik = generate_x25519_keypair();
    let bob_bundle = generate_key_bundle(1, &[(500, 1)])?;
    let bob_otk = bob_bundle
        .one_time_pre_key_pair(500)
        .ok_or_else(|| E2eeError::InvalidPreKeyId(String::from("missing OTK 500")))?;

    let fetch = PreKeyBundleFetch {
        identity_key: bob_bundle.bundle.identity_key,
        signing_key: bob_bundle.bundle.signing_key,
        signed_pre_key: PreKey {
            id: 1,
            key: bob_bundle.bundle.signed_pre_key,
        },
        signed_pre_key_signature: bob_bundle.bundle.signed_pre_key_signature,
        one_time_pre_key: Some(bob_otk.pre_key()),
    };

    let alice_result = x3dh_initiate(&alice_ik, &fetch)?;

    // Use legacy raw OTK API — provides the same X25519 key pair
    // but otk_id will be None since raw keypair doesn't carry the id
    let bob_result = x3dh_respond_with_raw_otk(
        &bob_bundle.identity_key_pair,
        &bob_bundle.signed_pre_key_pair,
        Some(&bob_otk.key_pair),
        &alice_ik.public_key,
        &alice_result.ephemeral_public_key,
    )?;

    // Root keys match — legacy API computes the same DH
    assert_eq!(alice_result.root_key.0, bob_result.root_key.0);
    // Legacy API does not preserve otk_id
    assert_eq!(bob_result.otk_id, None);
    Ok(())
}
