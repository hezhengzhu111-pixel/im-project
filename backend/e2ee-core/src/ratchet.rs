//! Double Ratchet algorithm — KDF internals, chain initialization,
//! DH ratchet step, encrypt, and decrypt.
//!
//! This module implements the core Double Ratchet operations:
//!
//! - **KDF internals**: chain key splitting, root key derivation, AAD building
//! - **Chain initialization**: `init_sending_chain`, `init_receiving_chain`
//! - **DH ratchet**: `perform_dh_ratchet` (internal)
//! - **Encrypt/Decrypt**: `ratchet_encrypt`, `ratchet_decrypt`

use zeroize::Zeroize;

use crate::errors::E2eeError;
use crate::primitives::{
    aes_gcm_decrypt, aes_gcm_encrypt, generate_nonce, generate_x25519_keypair, hkdf_sha256,
    x25519_dh, Aes256Key, X25519PublicKey,
};
use crate::state::{
    ChainKey, MessageKey, RatchetHeader, RatchetRootKey, RatchetState, SkippedKeyStore,
};

// ============================================================================
// Constants
// ============================================================================

/// Maximum number of message keys to skip (DoS protection).
pub const MAX_SKIP: u32 = 2000;

// HKDF info strings — protocol-level domain separation
const INFO_ROOT_KEY: &[u8] = b"RootKey";
const INFO_SENDING_CHAIN: &[u8] = b"SendingChainKey";
const INFO_RECEIVING_CHAIN: &[u8] = b"ReceivingChainKey";
const INFO_MESSAGE_KEYS: &[u8] = b"MessageKeys";
const INFO_CHAIN_KEYS: &[u8] = b"ChainKeys";

// ============================================================================
// Internal KDF Functions
// ============================================================================

/// Split a chain key into a (message_key, next_chain_key) pair.
///
/// Consumes the chain key by ownership — the caller must not reuse it.
fn split_chain_key(chain_key: ChainKey) -> Result<(MessageKey, ChainKey), E2eeError> {
    let msg_bytes: [u8; 32] = hkdf_sha256::<32>(&chain_key.0, &[], INFO_MESSAGE_KEYS)?;
    let chain_bytes: [u8; 32] = hkdf_sha256::<32>(&chain_key.0, &[], INFO_CHAIN_KEYS)?;
    // chain_key goes out of scope -> ZeroizeOnDrop
    Ok((MessageKey(msg_bytes), ChainKey(chain_bytes)))
}

/// Derive a new root key and chain key from a DH output.
///
/// The input is [root_key (32) || dh_output (32)] = 64 bytes of IKM.
fn kdf_root_key(
    root_key: &RatchetRootKey,
    dh_output: &[u8; 32],
    chain_info: &[u8],
) -> Result<(RatchetRootKey, ChainKey), E2eeError> {
    let mut input = [0u8; 64];
    let (first, second) = input.split_at_mut(32);
    first.copy_from_slice(&root_key.0);
    second.copy_from_slice(dh_output);

    let root_bytes: [u8; 32] = hkdf_sha256::<32>(&input, &[], INFO_ROOT_KEY)?;
    let chain_bytes: [u8; 32] = hkdf_sha256::<32>(&input, &[], chain_info)?;

    input.zeroize();
    Ok((RatchetRootKey(root_bytes), ChainKey(chain_bytes)))
}

/// Pick a stable domain label for a sender -> receiver message direction.
///
/// Both peers can compute this from public identity keys, so a DH-derived
/// sending chain on one side matches the receiving chain on the other side
/// without storing an extra local role flag in `RatchetState`.
fn chain_info_for_sender(
    sender_id_key: &X25519PublicKey,
    receiver_id_key: &X25519PublicKey,
) -> &'static [u8] {
    if sender_id_key.0 < receiver_id_key.0 {
        INFO_SENDING_CHAIN
    } else {
        INFO_RECEIVING_CHAIN
    }
}

fn local_sending_chain_info(state: &RatchetState) -> &'static [u8] {
    chain_info_for_sender(&state.local_identity_key, &state.remote_identity_key)
}

fn local_receiving_chain_info(state: &RatchetState) -> &'static [u8] {
    chain_info_for_sender(&state.remote_identity_key, &state.local_identity_key)
}

fn next_counter(counter: u32) -> Result<u32, E2eeError> {
    counter
        .checked_add(1)
        .ok_or_else(|| E2eeError::InvalidCounter("counter overflow".to_string()))
}

/// Build the 104-byte Additional Authenticated Data for ratchet messages.
///
/// Layout: smaller_IK(32) || larger_IK(32) || ratchet_pk(32) || counter(4) || prev_counter(4)
///
/// The two identity keys are sorted lexicographically to ensure both
/// parties (sender and receiver) derive the **same** AAD for a given
/// message. This prevents cross-session replay attacks because the
/// identity keys are fixed per session.
fn build_ratchet_aad(
    local_id_key: &X25519PublicKey,
    remote_id_key: &X25519PublicKey,
    header: &RatchetHeader,
) -> [u8; 104] {
    let mut aad = [0u8; 104];

    // Canonical ordering: smaller key first ensures sender and receiver
    // compute the same AAD despite local/remote role reversal.
    let (first_ik, second_ik) = if local_id_key.0 < remote_id_key.0 {
        (local_id_key, remote_id_key)
    } else {
        (remote_id_key, local_id_key)
    };

    // Write first three 32-byte chunks via chunks_exact_mut (no indexing)
    {
        let mut chunks = aad.chunks_exact_mut(32);
        if let Some(chunk) = chunks.next() {
            chunk.copy_from_slice(&first_ik.0);
        }
        if let Some(chunk) = chunks.next() {
            chunk.copy_from_slice(&second_ik.0);
        }
        if let Some(chunk) = chunks.next() {
            chunk.copy_from_slice(&header.ratchet_public_key.0);
        }
    }

    // Write the 8 remaining bytes (counter + previous_counter) via split_at_mut
    {
        let remainder = aad.split_at_mut(96).1; // [96..104]
        let (counter_bytes, prev_counter_bytes) = remainder.split_at_mut(4);
        counter_bytes.copy_from_slice(&header.counter.to_be_bytes());
        prev_counter_bytes.copy_from_slice(&header.previous_counter.to_be_bytes());
    }

    aad
}

// ============================================================================
// Chain Initialization
// ============================================================================

/// Initialize a sending-side ratchet state from a shared root key.
///
/// Both `sending_chain_key` and `receiving_chain_key` are derived from the
/// root key via HKDF domain separation. The sending party uses
/// `INFO_SENDING_CHAIN` for the sending chain and `INFO_RECEIVING_CHAIN`
/// for the receiving chain.
pub fn init_sending_chain(
    root_key: &RatchetRootKey,
    local_identity_key: X25519PublicKey,
    remote_identity_key: X25519PublicKey,
) -> Result<RatchetState, E2eeError> {
    let sending: [u8; 32] = hkdf_sha256::<32>(&root_key.0, &[], INFO_SENDING_CHAIN)?;
    let receiving: [u8; 32] = hkdf_sha256::<32>(&root_key.0, &[], INFO_RECEIVING_CHAIN)?;
    let dh_key_pair = generate_x25519_keypair();
    Ok(RatchetState {
        root_key: RatchetRootKey(root_key.0),
        sending_chain_key: Some(ChainKey(sending)),
        receiving_chain_key: Some(ChainKey(receiving)),
        send_counter: 0,
        receive_counter: 0,
        previous_counter: 0,
        dh_key_pair,
        remote_public_key: None,
        skipped_message_keys: SkippedKeyStore::new(),
        local_identity_key,
        remote_identity_key,
    })
}

/// Initialize a receiving-side ratchet state from a shared root key.
///
/// The sending and receiving chain keys are swapped relative to
/// `init_sending_chain`: what the sender calls "sending", the receiver
/// calls "receiving", and vice versa.
pub fn init_receiving_chain(
    root_key: &RatchetRootKey,
    local_identity_key: X25519PublicKey,
    remote_identity_key: X25519PublicKey,
) -> Result<RatchetState, E2eeError> {
    // From receiver's perspective, sending and receiving chains are swapped
    let sending: [u8; 32] = hkdf_sha256::<32>(&root_key.0, &[], INFO_RECEIVING_CHAIN)?;
    let receiving: [u8; 32] = hkdf_sha256::<32>(&root_key.0, &[], INFO_SENDING_CHAIN)?;
    let dh_key_pair = generate_x25519_keypair();
    Ok(RatchetState {
        root_key: RatchetRootKey(root_key.0),
        sending_chain_key: Some(ChainKey(sending)),
        receiving_chain_key: Some(ChainKey(receiving)),
        send_counter: 0,
        receive_counter: 0,
        previous_counter: 0,
        dh_key_pair,
        remote_public_key: None,
        skipped_message_keys: SkippedKeyStore::new(),
        local_identity_key,
        remote_identity_key,
    })
}

// ============================================================================
// DH Ratchet Step (internal)
// ============================================================================

/// Advance the current receiving chain up to `until_counter`, storing the
/// skipped one-time message keys under `ratchet_public_key`.
fn skip_message_keys(
    state: &mut RatchetState,
    ratchet_public_key: X25519PublicKey,
    until_counter: u32,
) -> Result<(), E2eeError> {
    if until_counter <= state.receive_counter {
        return Ok(());
    }

    let gap = until_counter.saturating_sub(state.receive_counter);
    if gap > MAX_SKIP {
        return Err(E2eeError::CounterGapExceeded(gap, MAX_SKIP));
    }

    let mut chain = state
        .receiving_chain_key
        .take()
        .ok_or(E2eeError::ReceivingChainNotInitialized)?;

    for counter in state.receive_counter..until_counter {
        let (skipped_key, next) = split_chain_key(chain)?;
        state
            .skipped_message_keys
            .insert(ratchet_public_key, counter, skipped_key)?;
        chain = next;
    }

    state.receiving_chain_key = Some(chain);
    state.receive_counter = until_counter;
    Ok(())
}

fn decrypt_with_current_chain(
    state: &mut RatchetState,
    header: &RatchetHeader,
    ciphertext: &[u8],
) -> Result<Vec<u8>, E2eeError> {
    if header.counter < state.receive_counter {
        return Err(E2eeError::DuplicateOrExpiredMessage);
    }

    skip_message_keys(state, header.ratchet_public_key, header.counter)?;

    let chain = state
        .receiving_chain_key
        .take()
        .ok_or(E2eeError::ReceivingChainNotInitialized)?;

    let (msg_key, next_chain) = split_chain_key(chain)?;
    state.receiving_chain_key = Some(next_chain);
    state.receive_counter = next_counter(header.counter)?;

    let aad = build_ratchet_aad(
        &state.local_identity_key,
        &state.remote_identity_key,
        header,
    );
    let aes_key: Aes256Key = msg_key.into();
    aes_gcm_decrypt(&aes_key, &header.nonce, ciphertext, &aad)
}

/// Prepare the passive side's first DH-ratchet reply after decrypting the
/// peer's first message with the symmetric chain seeded by X3DH.
fn prepare_initial_response_ratchet(
    state: &mut RatchetState,
    remote_key: &X25519PublicKey,
) -> Result<(), E2eeError> {
    state.remote_public_key = Some(*remote_key);
    state.previous_counter = state.send_counter;
    state.send_counter = 0;

    let new_dh = generate_x25519_keypair();
    state.dh_key_pair = new_dh;

    let dh = x25519_dh(&state.dh_key_pair.private_key, remote_key)?;
    let chain_info = local_sending_chain_info(state);
    let (root, sending_chain) = kdf_root_key(&state.root_key, &dh, chain_info)?;

    state.root_key = root;
    state.sending_chain_key = Some(sending_chain);
    Ok(())
}

/// Perform a DH ratchet step: rotate keys and derive new chains.
///
/// 1. Derive receiving chain from old DH key + new remote key
/// 2. Generate fresh DH key pair
/// 3. Derive sending chain from new DH key + new remote key
fn perform_dh_ratchet(
    state: &mut RatchetState,
    new_remote_key: &X25519PublicKey,
    previous_counter: u32,
) -> Result<(), E2eeError> {
    if let Some(old_remote_key) = state.remote_public_key {
        skip_message_keys(state, old_remote_key, previous_counter)?;
    }

    state.previous_counter = state.send_counter;
    state.send_counter = 0;
    state.receive_counter = 0;

    let dh1 = x25519_dh(&state.dh_key_pair.private_key, new_remote_key)?;

    // Derive receiving chain — DH1 produces the key material for the
    // receiving chain because the remote party initiated this step.
    let receiving_info = local_receiving_chain_info(state);
    let (root, receiving_chain) = kdf_root_key(&state.root_key, &dh1, receiving_info)?;

    // Rotate DH key pair (old keypair Drop -> Zeroize)
    let new_dh = generate_x25519_keypair();
    state.dh_key_pair = new_dh;

    let dh2 = x25519_dh(&state.dh_key_pair.private_key, new_remote_key)?;

    // Derive sending chain — DH2 uses the fresh key pair so only the
    // local party can derive this chain (forward secrecy).
    let sending_info = local_sending_chain_info(state);
    let (root, sending_chain) = kdf_root_key(&root, &dh2, sending_info)?;

    state.root_key = root;
    state.receiving_chain_key = Some(receiving_chain);
    state.sending_chain_key = Some(sending_chain);
    state.remote_public_key = Some(*new_remote_key);
    Ok(())
}

// ============================================================================
// ratchet_encrypt
// ============================================================================

/// Encrypt a plaintext message using the Double Ratchet.
///
/// Consumes the current sending chain key to produce a one-time message key,
/// encrypts the plaintext, and advances the sending chain.
///
/// # Errors
///
/// - `SendingChainNotInitialized` if no sending chain key is set
/// - `EncryptionFailed` if AES-GCM encryption fails
pub fn ratchet_encrypt(
    state: &mut RatchetState,
    plaintext: &[u8],
) -> Result<(RatchetHeader, Vec<u8>), E2eeError> {
    let next_send_counter = state
        .send_counter
        .checked_add(1)
        .ok_or_else(|| E2eeError::InvalidCounter(String::from("send counter overflow")))?;

    let chain = state
        .sending_chain_key
        .take()
        .ok_or(E2eeError::SendingChainNotInitialized)?;

    let (msg_key, next_chain) = split_chain_key(chain)?;

    let nonce = generate_nonce()?;

    let header = RatchetHeader {
        ratchet_public_key: state.dh_key_pair.public_key,
        counter: state.send_counter,
        previous_counter: state.previous_counter,
        nonce,
    };

    let aad = build_ratchet_aad(
        &state.local_identity_key,
        &state.remote_identity_key,
        &header,
    );

    let aes_key: Aes256Key = msg_key.into();
    let ciphertext = aes_gcm_encrypt(&aes_key, &header.nonce, plaintext, &aad)?;

    state.sending_chain_key = Some(next_chain);
    state.send_counter = next_send_counter;

    // aes_key goes out of scope -> Drop -> ZeroizeOnDrop
    Ok((header, ciphertext))
}

// ============================================================================
// ratchet_decrypt
// ============================================================================

/// Decrypt a ciphertext message using the Double Ratchet.
///
/// Handles skipped (out-of-order) messages, DH ratchet steps for
/// new remote keys, duplicate/expired message rejection, and
/// DoS protection via `MAX_SKIP`.
///
/// # Errors
///
/// - `CounterGapExceeded` if the counter gap exceeds `MAX_SKIP`
/// - `DuplicateOrExpiredMessage` if the counter is below the receive counter
/// - `ReceivingChainNotInitialized` if no receiving chain key is available
/// - `DecryptionFailed` if AES-GCM authentication fails
pub fn ratchet_decrypt(
    state: &mut RatchetState,
    header: &RatchetHeader,
    ciphertext: &[u8],
) -> Result<Vec<u8>, E2eeError> {
    let target_counter = header.counter;
    let _ = next_counter(target_counter)?;

    // 1. Check skipped message key cache before counter-gap checks so cached
    // out-of-order old-chain messages remain decryptable after the DH step.
    if let Some(msg_key) = state
        .skipped_message_keys
        .remove(&header.ratchet_public_key, target_counter)
    {
        let aad = build_ratchet_aad(
            &state.local_identity_key,
            &state.remote_identity_key,
            header,
        );
        let aes_key: Aes256Key = msg_key.into();
        return aes_gcm_decrypt(&aes_key, &header.nonce, ciphertext, &aad);
    }

    let first_remote_key = state.remote_public_key.is_none();
    let has_sent_before_first_remote_key = state.send_counter > 0;
    let needs_ratchet = match state.remote_public_key {
        Some(ref pk) => pk.0 != header.ratchet_public_key.0,
        None => has_sent_before_first_remote_key,
    };

    if needs_ratchet && target_counter > MAX_SKIP {
        return Err(E2eeError::CounterGapExceeded(target_counter, MAX_SKIP));
    }

    if needs_ratchet {
        perform_dh_ratchet(state, &header.ratchet_public_key, header.previous_counter)?;
        return decrypt_with_current_chain(state, header, ciphertext);
    }

    let plaintext = decrypt_with_current_chain(state, header, ciphertext)?;

    if first_remote_key {
        prepare_initial_response_ratchet(state, &header.ratchet_public_key)?;
    }

    Ok(plaintext)
}

// ============================================================================
// Tests
// ============================================================================

#[cfg(test)]
mod tests {
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
}
