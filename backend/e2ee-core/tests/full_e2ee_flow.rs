//! Full end-to-end encryption integration tests.
//!
//! These tests exercise the complete X3DH + Double Ratchet protocol:
//!
//! - Alice fetches Bob's key bundle
//! - Alice initiates X3DH, Bob responds
//! - Both derive the same root key
//! - Alice sends messages through the Double Ratchet
//! - Bob receives them (including out-of-order and with state persistence)
//!
//! Note: Integration tests are a separate crate, so the `#![deny(clippy::unwrap_used)]`
//! and `#![deny(clippy::indexing_slicing)]` lints from `lib.rs` do NOT apply here.

use e2ee_core::*;

#[test]
fn full_e2ee_alice_sends_bob_receives() {
    let bob_bundle = generate_key_bundle(1, 3).unwrap();
    let alice_ik = generate_x25519_keypair();

    let fetch = PreKeyBundleFetch {
        identity_key: bob_bundle.bundle.identity_key,
        signing_key: bob_bundle.bundle.signing_key,
        signed_pre_key: PreKey {
            id: 1,
            key: bob_bundle.bundle.signed_pre_key,
        },
        signed_pre_key_signature: bob_bundle.bundle.signed_pre_key_signature,
        one_time_pre_key: bob_bundle
            .bundle
            .one_time_pre_keys
            .first()
            .copied()
            .map(|k| PreKey { id: 100, key: k }),
    };

    let alice_x3dh = x3dh_initiate(&alice_ik, &fetch).unwrap();

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

    let messages = vec!["Hello Bob!", "How are you?", "This is secure.", "Goodbye!"];
    let mut encrypted: Vec<(RatchetHeader, Vec<u8>)> = Vec::new();
    for msg in &messages {
        encrypted.push(ratchet_encrypt(&mut alice_state, msg.as_bytes()).unwrap());
    }

    // Out-of-order delivery: 2, 0, 3, 1
    assert_eq!(
        ratchet_decrypt(&mut bob_state, &encrypted[2].0, &encrypted[2].1).unwrap(),
        messages[2].as_bytes()
    );
    assert_eq!(
        ratchet_decrypt(&mut bob_state, &encrypted[0].0, &encrypted[0].1).unwrap(),
        messages[0].as_bytes()
    );
    assert_eq!(
        ratchet_decrypt(&mut bob_state, &encrypted[3].0, &encrypted[3].1).unwrap(),
        messages[3].as_bytes()
    );
    assert_eq!(
        ratchet_decrypt(&mut bob_state, &encrypted[1].0, &encrypted[1].1).unwrap(),
        messages[1].as_bytes()
    );
}

#[test]
fn full_e2ee_with_state_persistence() {
    let bob_bundle = generate_key_bundle(1, 0).unwrap();
    let alice_ik = generate_x25519_keypair();

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
    let bob_state = init_receiving_chain(
        &bob_x3dh.root_key,
        bob_bundle.identity_key_pair.public_key,
        alice_ik.public_key,
    )
    .unwrap();

    let (header, ciphertext) = ratchet_encrypt(&mut alice_state, b"persistent test").unwrap();

    // Bob exports state (simulating app restart)
    let bob_bytes = export_state(&bob_state);
    let mut bob_restored = restore_state(&bob_bytes).unwrap();

    assert_eq!(
        ratchet_decrypt(&mut bob_restored, &header, &ciphertext).unwrap(),
        b"persistent test"
    );
}

#[test]
fn full_e2ee_multiple_messages_with_dh_ratchet() {
    let bob_bundle = generate_key_bundle(1, 0).unwrap();
    let alice_ik = generate_x25519_keypair();

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

    for i in 0..20 {
        let msg = format!("message {}", i);
        let (header, ciphertext) = ratchet_encrypt(&mut alice_state, msg.as_bytes()).unwrap();
        let plaintext = ratchet_decrypt(&mut bob_state, &header, &ciphertext).unwrap();
        assert_eq!(plaintext, msg.as_bytes());
    }
}
