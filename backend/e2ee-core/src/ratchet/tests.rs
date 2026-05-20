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

fn make_alice_bob_states() -> Result<(RatchetState, RatchetState), E2eeError> {
    let (alice_ik, bob_ik) = make_identity_keys();
    let root = make_root_key();
    let alice = init_sending_chain(&root, alice_ik, bob_ik)?;
    let bob = init_receiving_chain(&root, bob_ik, alice_ik)?;
    Ok((alice, bob))
}

// --- Chain Init Tests ---

#[test]
fn init_sending_chain_creates_valid_state() -> Result<(), E2eeError> {
    let (local_ik, remote_ik) = make_identity_keys();
    let state = init_sending_chain(&make_root_key(), local_ik, remote_ik)?;
    assert!(state.sending_chain_key.is_some());
    assert!(state.receiving_chain_key.is_some());
    assert_eq!(state.send_counter, 0);
    assert_eq!(state.receive_counter, 0);
    assert!(state.remote_public_key.is_none());
    Ok(())
}

#[test]
fn init_receiving_chain_creates_valid_state() -> Result<(), E2eeError> {
    let (local_ik, remote_ik) = make_identity_keys();
    let state = init_receiving_chain(&make_root_key(), local_ik, remote_ik)?;
    assert!(state.sending_chain_key.is_some());
    assert!(state.receiving_chain_key.is_some());
    Ok(())
}

#[test]
fn init_chains_from_same_root_produce_different_keys() -> Result<(), E2eeError> {
    let (local_ik, remote_ik) = make_identity_keys();
    let s = init_sending_chain(&make_root_key(), local_ik, remote_ik)?;
    let r = init_receiving_chain(&make_root_key(), local_ik, remote_ik)?;
    let s_key = s
        .sending_chain_key
        .as_ref()
        .ok_or(E2eeError::SendingChainNotInitialized)?;
    let r_key = r
        .sending_chain_key
        .as_ref()
        .ok_or(E2eeError::SendingChainNotInitialized)?;
    assert_ne!(s_key.0, r_key.0);
    Ok(())
}

// --- Encrypt Tests ---

#[test]
fn ratchet_encrypt_produces_ciphertext() -> Result<(), E2eeError> {
    let (local_ik, remote_ik) = make_identity_keys();
    let mut state = init_sending_chain(&make_root_key(), local_ik, remote_ik)?;
    let (_, ciphertext) = ratchet_encrypt(&mut state, b"hello secret world")?;
    assert!(!ciphertext.is_empty());
    assert_ne!(ciphertext.as_slice(), b"hello secret world");
    assert_eq!(state.send_counter, 1);
    Ok(())
}

#[test]
fn ratchet_encrypt_increments_counter() -> Result<(), E2eeError> {
    let (local_ik, remote_ik) = make_identity_keys();
    let mut state = init_sending_chain(&make_root_key(), local_ik, remote_ik)?;
    ratchet_encrypt(&mut state, b"msg1")?;
    assert_eq!(state.send_counter, 1);
    ratchet_encrypt(&mut state, b"msg2")?;
    assert_eq!(state.send_counter, 2);
    Ok(())
}

#[test]
fn ratchet_encrypt_each_message_unique() -> Result<(), E2eeError> {
    let (local_ik, remote_ik) = make_identity_keys();
    let mut state = init_sending_chain(&make_root_key(), local_ik, remote_ik)?;
    let (h1, _) = ratchet_encrypt(&mut state, b"a")?;
    let (h2, _) = ratchet_encrypt(&mut state, b"b")?;
    assert_ne!(h1.nonce.0, h2.nonce.0);
    assert_ne!(h1.counter, h2.counter);
    Ok(())
}

#[test]
fn ratchet_encrypt_empty_plaintext() -> Result<(), E2eeError> {
    let (local_ik, remote_ik) = make_identity_keys();
    let mut state = init_sending_chain(&make_root_key(), local_ik, remote_ik)?;
    let (_, ciphertext) = ratchet_encrypt(&mut state, b"")?;
    assert!(!ciphertext.is_empty()); // at minimum, the authentication tag
    Ok(())
}

// --- Decrypt Tests ---

#[test]
fn ratchet_encrypt_decrypt_roundtrip() -> Result<(), E2eeError> {
    let (local_ik, remote_ik) = make_identity_keys();
    let root = make_root_key();
    let mut alice = init_sending_chain(&root, local_ik, remote_ik)?;
    let mut bob = init_receiving_chain(&root, remote_ik, local_ik)?;
    let (header, ciphertext) = ratchet_encrypt(&mut alice, b"hello bob")?;
    assert_eq!(
        ratchet_decrypt(&mut bob, &header, &ciphertext)?,
        b"hello bob"
    );
    Ok(())
}

#[test]
fn ratchet_alice_first_message_decrypts() -> Result<(), E2eeError> {
    let (mut alice, mut bob) = make_alice_bob_states()?;

    let (header, ciphertext) = ratchet_encrypt(&mut alice, b"hello bob")?;
    assert_eq!(
        ratchet_decrypt(&mut bob, &header, &ciphertext)?,
        b"hello bob"
    );

    assert!(matches!(
        bob.remote_public_key,
        Some(pk) if pk.0 == header.ratchet_public_key.0
    ));
    Ok(())
}

#[test]
fn ratchet_bob_reply_rotates_public_key_and_decrypts() -> Result<(), E2eeError> {
    let (mut alice, mut bob) = make_alice_bob_states()?;

    let (alice_header, alice_ciphertext) = ratchet_encrypt(&mut alice, b"hello bob")?;
    assert_eq!(
        ratchet_decrypt(&mut bob, &alice_header, &alice_ciphertext)?,
        b"hello bob"
    );

    let (bob_header, bob_ciphertext) = ratchet_encrypt(&mut bob, b"hello alice")?;
    assert_ne!(
        alice_header.ratchet_public_key.0,
        bob_header.ratchet_public_key.0
    );
    assert_eq!(
        ratchet_decrypt(&mut alice, &bob_header, &bob_ciphertext)?,
        b"hello alice"
    );

    Ok(())
}

#[test]
fn ratchet_alternating_messages_continue_after_dh_steps() -> Result<(), E2eeError> {
    let (mut alice, mut bob) = make_alice_bob_states()?;

    let (alice_first_header, alice_first_ciphertext) = ratchet_encrypt(&mut alice, b"a0")?;
    assert_eq!(
        ratchet_decrypt(&mut bob, &alice_first_header, &alice_first_ciphertext)?,
        b"a0"
    );

    let (bob_first_header, bob_first_ciphertext) = ratchet_encrypt(&mut bob, b"b0")?;
    assert_eq!(
        ratchet_decrypt(&mut alice, &bob_first_header, &bob_first_ciphertext)?,
        b"b0"
    );

    let (alice_second_header, alice_second_ciphertext) = ratchet_encrypt(&mut alice, b"a1")?;
    assert_ne!(
        alice_first_header.ratchet_public_key.0,
        alice_second_header.ratchet_public_key.0
    );
    assert_eq!(
        ratchet_decrypt(&mut bob, &alice_second_header, &alice_second_ciphertext)?,
        b"a1"
    );

    let (bob_second_header, bob_second_ciphertext) = ratchet_encrypt(&mut bob, b"b1")?;
    assert_ne!(
        bob_first_header.ratchet_public_key.0,
        bob_second_header.ratchet_public_key.0
    );
    assert_eq!(
        ratchet_decrypt(&mut alice, &bob_second_header, &bob_second_ciphertext)?,
        b"b1"
    );

    Ok(())
}

#[test]
fn ratchet_public_key_changes_at_least_once() -> Result<(), E2eeError> {
    let (mut alice, mut bob) = make_alice_bob_states()?;

    let (alice_header, alice_ciphertext) = ratchet_encrypt(&mut alice, b"hello")?;
    assert_eq!(
        ratchet_decrypt(&mut bob, &alice_header, &alice_ciphertext)?,
        b"hello"
    );

    let (bob_header, bob_ciphertext) = ratchet_encrypt(&mut bob, b"reply")?;
    assert_ne!(
        alice_header.ratchet_public_key.0,
        bob_header.ratchet_public_key.0
    );
    assert_eq!(
        ratchet_decrypt(&mut alice, &bob_header, &bob_ciphertext)?,
        b"reply"
    );

    Ok(())
}

#[test]
fn ratchet_out_of_order_after_dh_step() -> Result<(), E2eeError> {
    let (mut alice, mut bob) = make_alice_bob_states()?;

    let (alice_first_header, alice_first_ciphertext) = ratchet_encrypt(&mut alice, b"initial")?;
    assert_eq!(
        ratchet_decrypt(&mut bob, &alice_first_header, &alice_first_ciphertext)?,
        b"initial"
    );

    let (bob_header, bob_ciphertext) = ratchet_encrypt(&mut bob, b"reply")?;
    assert_eq!(
        ratchet_decrypt(&mut alice, &bob_header, &bob_ciphertext)?,
        b"reply"
    );

    let (alice_new_0_header, alice_new_0_ciphertext) = ratchet_encrypt(&mut alice, b"new-0")?;
    let (alice_new_1_header, alice_new_1_ciphertext) = ratchet_encrypt(&mut alice, b"new-1")?;
    let (alice_new_2_header, alice_new_2_ciphertext) = ratchet_encrypt(&mut alice, b"new-2")?;

    assert_eq!(
        ratchet_decrypt(&mut bob, &alice_new_2_header, &alice_new_2_ciphertext)?,
        b"new-2"
    );
    assert_eq!(
        ratchet_decrypt(&mut bob, &alice_new_0_header, &alice_new_0_ciphertext)?,
        b"new-0"
    );
    assert_eq!(
        ratchet_decrypt(&mut bob, &alice_new_1_header, &alice_new_1_ciphertext)?,
        b"new-1"
    );

    Ok(())
}

#[test]
fn ratchet_duplicate_old_message_rejected() -> Result<(), E2eeError> {
    let (mut alice, mut bob) = make_alice_bob_states()?;

    let (header, ciphertext) = ratchet_encrypt(&mut alice, b"once")?;
    assert_eq!(ratchet_decrypt(&mut bob, &header, &ciphertext)?, b"once");

    let result = ratchet_decrypt(&mut bob, &header, &ciphertext);
    assert!(matches!(result, Err(E2eeError::DuplicateOrExpiredMessage)));
    Ok(())
}

#[test]
fn ratchet_out_of_order_messages() -> Result<(), E2eeError> {
    let (local_ik, remote_ik) = make_identity_keys();
    let root = make_root_key();
    let mut alice = init_sending_chain(&root, local_ik, remote_ik)?;
    let mut bob = init_receiving_chain(&root, remote_ik, local_ik)?;
    let (h0, c0) = ratchet_encrypt(&mut alice, b"m0")?;
    let (h1, c1) = ratchet_encrypt(&mut alice, b"m1")?;
    let (h2, c2) = ratchet_encrypt(&mut alice, b"m2")?;
    // Receive in reverse order
    assert_eq!(ratchet_decrypt(&mut bob, &h2, &c2)?, b"m2");
    assert_eq!(ratchet_decrypt(&mut bob, &h0, &c0)?, b"m0");
    assert_eq!(ratchet_decrypt(&mut bob, &h1, &c1)?, b"m1");
    Ok(())
}

#[test]
fn ratchet_tampered_ciphertext_rejected() -> Result<(), E2eeError> {
    let (local_ik, remote_ik) = make_identity_keys();
    let root = make_root_key();
    let mut alice = init_sending_chain(&root, local_ik, remote_ik)?;
    let mut bob = init_receiving_chain(&root, remote_ik, local_ik)?;
    let (header, ciphertext) = ratchet_encrypt(&mut alice, b"secret")?;
    // Tamper the ciphertext to test AEAD failure
    let mut tampered_ct = ciphertext;
    if let Some(b) = tampered_ct.last_mut() {
        *b ^= 1;
    }
    let result = ratchet_decrypt(&mut bob, &header, &tampered_ct);
    assert!(result.is_err());
    Ok(())
}

#[test]
fn ratchet_duplicate_message_rejected() -> Result<(), E2eeError> {
    let (local_ik, remote_ik) = make_identity_keys();
    let root = make_root_key();
    let mut alice = init_sending_chain(&root, local_ik, remote_ik)?;
    let mut bob = init_receiving_chain(&root, remote_ik, local_ik)?;
    let (header, ciphertext) = ratchet_encrypt(&mut alice, b"once")?;
    ratchet_decrypt(&mut bob, &header, &ciphertext)?;
    let result = ratchet_decrypt(&mut bob, &header, &ciphertext);
    assert!(matches!(result, Err(E2eeError::DuplicateOrExpiredMessage)));
    Ok(())
}

#[test]
fn ratchet_counter_gap_equal_max_skip_succeeds() -> Result<(), E2eeError> {
    let (mut alice, mut bob) = make_alice_bob_states()?;
    let mut target = None;

    for counter in 0..=MAX_SKIP {
        let (header, ciphertext) = ratchet_encrypt(&mut alice, b"gap-boundary")?;
        if counter == MAX_SKIP {
            target = Some((header, ciphertext));
        }
    }

    let (header, ciphertext) = target.ok_or(E2eeError::EncryptionFailed)?;
    assert_eq!(header.counter, MAX_SKIP);
    assert_eq!(
        ratchet_decrypt(&mut bob, &header, &ciphertext)?,
        b"gap-boundary"
    );
    Ok(())
}

#[test]
fn ratchet_counter_gap_above_max_skip_rejected() -> Result<(), E2eeError> {
    let (mut alice, mut bob) = make_alice_bob_states()?;
    let (header, ciphertext) = ratchet_encrypt(&mut alice, b"gap")?;
    let bad_header = RatchetHeader {
        counter: MAX_SKIP + 1,
        ..header
    };
    let result = ratchet_decrypt(&mut bob, &bad_header, &ciphertext);
    assert!(matches!(result, Err(E2eeError::CounterGapExceeded(_, _))));
    Ok(())
}

#[test]
fn ratchet_dh_step_heals_connection() -> Result<(), E2eeError> {
    let (mut alice, mut bob) = make_alice_bob_states()?;

    let (alice_header, alice_ciphertext) = ratchet_encrypt(&mut alice, b"m0")?;
    assert_eq!(
        ratchet_decrypt(&mut bob, &alice_header, &alice_ciphertext)?,
        b"m0"
    );

    let (bob_header, bob_ciphertext) = ratchet_encrypt(&mut bob, b"m1")?;
    assert_ne!(
        alice_header.ratchet_public_key.0,
        bob_header.ratchet_public_key.0
    );
    assert_eq!(
        ratchet_decrypt(&mut alice, &bob_header, &bob_ciphertext)?,
        b"m1"
    );
    Ok(())
}

#[test]
fn ratchet_cross_session_replay_prevented() -> Result<(), E2eeError> {
    let root = make_root_key();
    let ik_a = generate_x25519_keypair();
    let ik_b = generate_x25519_keypair();
    let ik_c = generate_x25519_keypair();
    let mut alice = init_sending_chain(&root, ik_a.public_key, ik_b.public_key)?;
    let _bob = init_receiving_chain(&root, ik_b.public_key, ik_a.public_key)?;
    let (header, ciphertext) = ratchet_encrypt(&mut alice, b"for bob")?;
    // Carol tries to replay into session A-C
    let mut carol = init_receiving_chain(&root, ik_c.public_key, ik_a.public_key)?;
    let result = ratchet_decrypt(&mut carol, &header, &ciphertext);
    assert!(result.is_err());
    Ok(())
}

#[test]
fn ratchet_export_restore_preserves_state() -> Result<(), E2eeError> {
    let (local_ik, remote_ik) = make_identity_keys();
    let root = make_root_key();
    let mut alice = init_sending_chain(&root, local_ik, remote_ik)?;
    let bob = init_receiving_chain(&root, remote_ik, local_ik)?;
    let (header, ciphertext) = ratchet_encrypt(&mut alice, b"persistent")?;
    let bytes = crate::state::export_state(&bob);
    let mut bob2 = crate::state::restore_state(&bytes)?;
    assert_eq!(
        ratchet_decrypt(&mut bob2, &header, &ciphertext)?,
        b"persistent"
    );
    Ok(())
}

#[test]
fn ratchet_encrypt_fails_without_sending_chain() {
    let (local_ik, remote_ik) = make_identity_keys();
    let mut state = RatchetState {
        root_key: RatchetRootKey([0u8; 32]),
        sending_chain_key: None,
        receiving_chain_key: None,
        send_counter: 0,
        receive_counter: 0,
        previous_counter: 0,
        dh_key_pair: generate_x25519_keypair(),
        remote_public_key: Some(remote_ik),
        skipped_message_keys: SkippedKeyStore::new(),
        local_identity_key: local_ik,
        remote_identity_key: remote_ik,
    };
    let result = ratchet_encrypt(&mut state, b"test");
    assert!(matches!(result, Err(E2eeError::SendingChainNotInitialized)));
}

#[test]
fn ratchet_encrypt_rejects_send_counter_overflow() -> Result<(), E2eeError> {
    let (local_ik, remote_ik) = make_identity_keys();
    let mut state = init_sending_chain(&make_root_key(), local_ik, remote_ik)?;
    state.send_counter = u32::MAX;

    let result = ratchet_encrypt(&mut state, b"overflow");
    assert!(matches!(result, Err(E2eeError::InvalidCounter(_))));
    assert!(state.sending_chain_key.is_some());
    Ok(())
}

#[test]
fn ratchet_decrypt_rejects_receive_counter_overflow() -> Result<(), E2eeError> {
    let (local_ik, remote_ik) = make_identity_keys();
    let root = make_root_key();
    let mut alice = init_sending_chain(&root, local_ik, remote_ik)?;
    let mut bob = init_receiving_chain(&root, remote_ik, local_ik)?;
    let (mut header, ciphertext) = ratchet_encrypt(&mut alice, b"overflow")?;
    bob.receive_counter = u32::MAX;
    header.counter = u32::MAX;

    let result = ratchet_decrypt(&mut bob, &header, &ciphertext);
    assert!(matches!(result, Err(E2eeError::InvalidCounter(_))));
    Ok(())
}

// --- DH Ratchet Public Key Rotation Tests ---

/// Verify that each party's DH public key actually changes at every DH
/// ratchet step (both initial-response and full DH ratchet).
///
/// This is a focused step-by-step test: it records the DH public key
/// before and after each ratchet event so the assertions prove the key
/// bytes rotated, not merely that two different parties have different
/// keys.
#[test]
fn ratchet_dh_public_key_rotates_on_each_dh_step() -> Result<(), E2eeError> {
    let (mut alice, mut bob) = make_alice_bob_states()?;

    // Record initial DH public keys
    let alice_initial_pk = alice.dh_key_pair.public_key;
    let bob_initial_pk = bob.dh_key_pair.public_key;

    // Step 1: Alice encrypts — DH key must NOT change (encrypt only
    // consumes chain keys).
    let (a0_header, a0_ct) = ratchet_encrypt(&mut alice, b"a0")?;
    assert_eq!(alice.dh_key_pair.public_key.0, alice_initial_pk.0);

    // Step 2: Bob decrypts Alice's first message — triggers
    // prepare_initial_response_ratchet which generates a fresh DH keypair.
    assert_eq!(ratchet_decrypt(&mut bob, &a0_header, &a0_ct)?, b"a0");
    assert_ne!(bob.dh_key_pair.public_key.0, bob_initial_pk.0);
    let bob_after_first_ratchet_pk = bob.dh_key_pair.public_key;

    // Step 3: Bob encrypts a reply — header carries his new DH key.
    let (b0_header, b0_ct) = ratchet_encrypt(&mut bob, b"b0")?;
    assert_eq!(b0_header.ratchet_public_key.0, bob_after_first_ratchet_pk.0);

    // Step 4: Alice decrypts Bob's reply — Bob's ratchet key differs from
    // Alice's initial key, so perform_dh_ratchet fires and rotates Alice's
    // DH keypair. (Alice has sent before, so she takes the
    // perform_dh_ratchet path, not prepare_initial_response_ratchet.)
    assert_ne!(
        a0_header.ratchet_public_key.0,
        b0_header.ratchet_public_key.0
    );
    assert_eq!(ratchet_decrypt(&mut alice, &b0_header, &b0_ct)?, b"b0");
    assert_ne!(alice.dh_key_pair.public_key.0, alice_initial_pk.0);
    let alice_after_dh_pk = alice.dh_key_pair.public_key;

    // Step 5: Alice sends a second message with her new DH key.
    let (a1_header, a1_ct) = ratchet_encrypt(&mut alice, b"a1")?;
    assert_eq!(a1_header.ratchet_public_key.0, alice_after_dh_pk.0);
    assert_ne!(
        a1_header.ratchet_public_key.0,
        a0_header.ratchet_public_key.0
    );

    // Step 6: Bob decrypts Alice's second message — Alice's new key
    // differs from Bob's stored remote key, triggering perform_dh_ratchet
    // on Bob's side. Bob's DH key must change again.
    assert_eq!(ratchet_decrypt(&mut bob, &a1_header, &a1_ct)?, b"a1");
    assert_ne!(bob.dh_key_pair.public_key.0, bob_after_first_ratchet_pk.0);

    Ok(())
}

// --- Stress Tests ---

/// Send 1000 messages, deliver in reverse order.
///
/// The first message to arrive (counter 999) causes 999 message keys to
/// be stored in the skipped-key store via `skip_message_keys`.  Each
/// subsequent earlier message is found and removed from the store.
/// After all 1000 messages, the store must be empty and a fresh
/// in-order message must still decrypt correctly.
#[test]
fn ratchet_stress_out_of_order_1000() -> Result<(), E2eeError> {
    let (local_ik, remote_ik) = make_identity_keys();
    let root = make_root_key();
    let mut alice = init_sending_chain(&root, local_ik, remote_ik)?;
    let mut bob = init_receiving_chain(&root, remote_ik, local_ik)?;

    let n: usize = 1000;
    let mut encrypted: Vec<(RatchetHeader, Vec<u8>)> = Vec::with_capacity(n);
    for i in 0..n {
        let msg = format!("stress-msg-{}", i);
        let (header, ct) = ratchet_encrypt(&mut alice, msg.as_bytes())?;
        encrypted.push((header, ct));
    }

    // Deliver in reverse order — worst case for skipped-key store
    for i in (0..n).rev() {
        let (ref header, ref ct) = encrypted.get(i).ok_or(E2eeError::EncryptionFailed)?;
        let expected = format!("stress-msg-{}", i);
        assert_eq!(ratchet_decrypt(&mut bob, header, ct)?, expected.as_bytes());
    }

    // Verify all skipped keys were consumed
    assert!(bob.skipped_message_keys.is_empty());

    // Bob must still be able to receive a new in-order message
    let (new_header, new_ct) = ratchet_encrypt(&mut alice, b"after-stress")?;
    assert_eq!(
        ratchet_decrypt(&mut bob, &new_header, &new_ct)?,
        b"after-stress"
    );

    Ok(())
}
