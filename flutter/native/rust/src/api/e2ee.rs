use anyhow::{Context, Result};
use e2ee_core::{
    init_receiving_chain, init_sending_chain,
    ratchet_decrypt as core_ratchet_decrypt, ratchet_encrypt as core_ratchet_encrypt,
    restore_state as core_restore_state, try_export_state, decode_ratchet_header,
    encode_ratchet_header, PreKeyBundle, PreKeyBundleFetch, X25519KeyPair, X25519PublicKey,
    Ed25519PublicKey,
};
use e2ee_core::x3dh::{
    generate_key_bundle_with_count, x3dh_initiate as core_x3dh_initiate,
};
use serde::{Deserialize, Serialize};

// ============================================================================
// Serializable bridge types for FFI
// ============================================================================

/// Serializable key bundle returned by `generate_key_bundle`.
///
/// Contains both public (PreKeyBundle) and private key material so the Dart
/// side can store everything needed for later X3DH response and ratchet ops.
#[derive(Serialize, Deserialize)]
pub struct BridgeKeyBundle {
    pub spk_id: u32,
    pub identity_key_pair: X25519KeyPair,
    pub signing_public_key: Ed25519PublicKey,
    /// Ed25519 private key raw bytes (32 bytes). Stored as raw bytes because
    /// `Ed25519PrivateKey` in e2ee-core does not derive Serialize.
    pub signing_private_key_bytes: [u8; 32],
    pub signed_pre_key_pair: X25519KeyPair,
    pub otk_pairs: Vec<BridgeOtkPair>,
    pub bundle: PreKeyBundle,
}

/// Serializable one-time pre-key pair.
#[derive(Serialize, Deserialize)]
pub struct BridgeOtkPair {
    pub id: u32,
    pub key_pair: X25519KeyPair,
}

/// Result of X3DH initiation, returned from the bridge.
///
/// Contains the initial sending RatchetState (serialized) plus metadata
/// the Dart side needs to send to the responder (Bob).
#[derive(Serialize, Deserialize)]
pub struct BridgeX3dhInitiateResult {
    /// Bincode-serialized RatchetState (initial sending chain).
    pub state: Vec<u8>,
    /// Alice's ephemeral X25519 public key (32 bytes).
    pub ephemeral_public_key: [u8; 32],
    /// Signed pre-key ID used.
    pub spk_id: u32,
    /// One-time pre-key ID used (None if no OTK was available).
    pub otk_id: Option<u32>,
}

/// Result of X3DH response, returned from the bridge.
///
/// Contains the initial receiving RatchetState (serialized).
#[derive(Serialize, Deserialize)]
pub struct BridgeX3dhRespondResult {
    /// Bincode-serialized RatchetState (initial receiving chain).
    pub state: Vec<u8>,
    /// One-time pre-key ID consumed (None if no OTK was used).
    pub otk_id: Option<u32>,
}

// ============================================================================
// Bridge functions
// ============================================================================

/// Generate a key bundle for X3DH.
///
/// Creates a fresh identity key pair, signing key pair, signed pre-key,
/// and the requested number of one-time pre-keys. Returns a bincode-
/// serialized `BridgeKeyBundle` containing all public and private key material.
///
/// # Arguments
/// * `otk_count` — Number of one-time pre-keys to generate.
pub fn generate_key_bundle(otk_count: u32) -> Result<Vec<u8>> {
    let key_bundle = generate_key_bundle_with_count(1, otk_count)
        .context("failed to generate key bundle")?;

    // Extract raw bytes from KeyBundle without moving fields (it implements Drop).
    let identity_pk = key_bundle.identity_key_pair.public_key.0;
    let identity_sk = key_bundle.identity_key_pair.private_key.0;
    let signing_pk = key_bundle.signing_key_pair.public_key.0;
    let signing_sk = key_bundle.signing_key_pair.private_key.0;
    let spk_pk = key_bundle.signed_pre_key_pair.public_key.0;
    let spk_sk = key_bundle.signed_pre_key_pair.private_key.0;

    let mut otk_pairs = Vec::with_capacity(key_bundle.one_time_pre_key_pairs.len());
    for otk in &key_bundle.one_time_pre_key_pairs {
        otk_pairs.push(BridgeOtkPair {
            id: otk.id,
            key_pair: X25519KeyPair {
                public_key: e2ee_core::X25519PublicKey(otk.key_pair.public_key.0),
                private_key: e2ee_core::X25519PrivateKey(otk.key_pair.private_key.0),
            },
        });
    }

    // Copy the PreKeyBundle (public-only data, implements Clone via Serialize roundtrip).
    let bundle_bytes =
        bincode::serialize(&key_bundle.bundle).context("failed to serialize PreKeyBundle")?;
    let bundle: PreKeyBundle =
        bincode::deserialize(&bundle_bytes).context("failed to deserialize PreKeyBundle")?;

    let bridge_bundle = BridgeKeyBundle {
        spk_id: key_bundle.spk_id,
        identity_key_pair: X25519KeyPair {
            public_key: e2ee_core::X25519PublicKey(identity_pk),
            private_key: e2ee_core::X25519PrivateKey(identity_sk),
        },
        signing_public_key: Ed25519PublicKey(signing_pk),
        signing_private_key_bytes: signing_sk,
        signed_pre_key_pair: X25519KeyPair {
            public_key: e2ee_core::X25519PublicKey(spk_pk),
            private_key: e2ee_core::X25519PrivateKey(spk_sk),
        },
        otk_pairs,
        bundle,
    };

    bincode::serialize(&bridge_bundle).context("failed to serialize key bundle")
}

/// Initiate X3DH key agreement (Alice side).
///
/// # Arguments
/// * `identity_key` — Alice's identity key pair, bincode-serialized `X25519KeyPair`.
/// * `signed_pre_key` — Bob's pre-key bundle, bincode-serialized `PreKeyBundleFetch`.
/// * `one_time_pre_key` — Unused (OTK is already inside `PreKeyBundleFetch`).
///
/// Returns a bincode-serialized `BridgeX3dhInitiateResult` containing the
/// initial sending RatchetState and metadata to send to Bob.
pub fn x3dh_initiate(
    identity_key: Vec<u8>,
    signed_pre_key: Vec<u8>,
    _one_time_pre_key: Option<Vec<u8>>,
) -> Result<Vec<u8>> {
    let alice_identity: X25519KeyPair =
        bincode::deserialize(&identity_key).context("failed to deserialize Alice's identity key")?;

    let remote_bundle: PreKeyBundleFetch = bincode::deserialize(&signed_pre_key)
        .context("failed to deserialize Bob's pre-key bundle")?;

    let initiate_result = core_x3dh_initiate(&alice_identity, &remote_bundle)
        .context("X3DH initiation failed")?;

    // Create initial sending RatchetState from the derived root key.
    let sending_state = init_sending_chain(
        &initiate_result.root_key,
        alice_identity.public_key,
        remote_bundle.identity_key,
    )
    .context("failed to initialize sending ratchet chain")?;

    let state_bytes = try_export_state(&sending_state).context("failed to serialize ratchet state")?;

    let result = BridgeX3dhInitiateResult {
        state: state_bytes,
        ephemeral_public_key: initiate_result.ephemeral_public_key.0,
        spk_id: initiate_result.spk_id,
        otk_id: initiate_result.otk_id,
    };

    bincode::serialize(&result).context("failed to serialize X3DH initiate result")
}

/// Respond to X3DH key agreement (Bob side).
///
/// # Arguments
/// * `identity_key` — Bob's identity key pair, bincode-serialized `X25519KeyPair`.
/// * `ephemeral_key` — 64 bytes: Alice's identity public key (32) || Alice's ephemeral public key (32).
/// * `signed_pre_key` — Bob's signed pre-key pair, bincode-serialized `X25519KeyPair`.
/// * `one_time_pre_key` — Bob's one-time pre-key pair, bincode-serialized `X25519KeyPair` (optional).
///
/// Returns a bincode-serialized `BridgeX3dhRespondResult` containing the
/// initial receiving RatchetState.
pub fn x3dh_respond(
    identity_key: Vec<u8>,
    ephemeral_key: Vec<u8>,
    signed_pre_key: Vec<u8>,
    one_time_pre_key: Option<Vec<u8>>,
) -> Result<Vec<u8>> {
    let bob_identity: X25519KeyPair =
        bincode::deserialize(&identity_key).context("failed to deserialize Bob's identity key")?;

    // ephemeral_key = Alice's identity public key (32 bytes) || Alice's ephemeral public key (32 bytes)
    if ephemeral_key.len() != 64 {
        anyhow::bail!(
            "ephemeral_key must be 64 bytes (identity_pk || ephemeral_pk), got {}",
            ephemeral_key.len()
        );
    }
    let alice_identity_pk = {
        let mut buf = [0u8; 32];
        buf.copy_from_slice(&ephemeral_key[..32]);
        X25519PublicKey(buf)
    };
    let alice_ephemeral_pk = {
        let mut buf = [0u8; 32];
        buf.copy_from_slice(&ephemeral_key[32..64]);
        X25519PublicKey(buf)
    };

    let bob_spk: X25519KeyPair =
        bincode::deserialize(&signed_pre_key).context("failed to deserialize Bob's signed pre-key")?;

    let bob_otk: Option<X25519KeyPair> = match one_time_pre_key {
        Some(bytes) => Some(
            bincode::deserialize(&bytes)
                .context("failed to deserialize Bob's one-time pre-key")?,
        ),
        None => None,
    };

    // Use x3dh_respond_with_raw_otk since we have raw X25519KeyPair (no OneTimePreKeyPair with ID).
    let respond_result = e2ee_core::x3dh::x3dh_respond_with_raw_otk(
        &bob_identity,
        &bob_spk,
        bob_otk.as_ref(),
        &alice_identity_pk,
        &alice_ephemeral_pk,
    )
    .context("X3DH response failed")?;

    // Create initial receiving RatchetState from the derived root key.
    let receiving_state = init_receiving_chain(
        &respond_result.root_key,
        bob_identity.public_key,
        alice_identity_pk,
    )
    .context("failed to initialize receiving ratchet chain")?;

    let state_bytes =
        try_export_state(&receiving_state).context("failed to serialize ratchet state")?;

    let result = BridgeX3dhRespondResult {
        state: state_bytes,
        otk_id: respond_result.otk_id,
    };

    bincode::serialize(&result).context("failed to serialize X3DH respond result")
}

/// Encrypt a plaintext message using the Double Ratchet.
///
/// # Arguments
/// * `state_bytes` — Bincode-serialized `RatchetState`.
/// * `plaintext` — The message bytes to encrypt.
///
/// Returns `(new_state_bytes, header_and_ciphertext)`:
/// - `new_state_bytes`: Updated serialized RatchetState (must be stored for next operation).
/// - `header_and_ciphertext`: 52-byte ratchet header || AES-GCM ciphertext (to send to peer).
pub fn ratchet_encrypt(
    state_bytes: Vec<u8>,
    plaintext: Vec<u8>,
) -> Result<(Vec<u8>, Vec<u8>)> {
    let mut state: e2ee_core::RatchetState =
        bincode::deserialize(&state_bytes).context("failed to deserialize ratchet state")?;

    let (header, ciphertext) =
        core_ratchet_encrypt(&mut state, &plaintext).context("ratchet encryption failed")?;

    let new_state_bytes =
        try_export_state(&state).context("failed to serialize updated ratchet state")?;

    // Encode header (52 bytes) and prepend to ciphertext.
    let header_bytes = encode_ratchet_header(&header);
    let mut header_and_ciphertext = Vec::with_capacity(52 + ciphertext.len());
    header_and_ciphertext.extend_from_slice(&header_bytes);
    header_and_ciphertext.extend_from_slice(&ciphertext);

    Ok((new_state_bytes, header_and_ciphertext))
}

/// Decrypt a ciphertext message using the Double Ratchet.
///
/// # Arguments
/// * `state_bytes` — Bincode-serialized `RatchetState`.
/// * `ciphertext` — 52-byte ratchet header || AES-GCM ciphertext (from peer).
///
/// Returns `(new_state_bytes, plaintext)`:
/// - `new_state_bytes`: Updated serialized RatchetState (must be stored for next operation).
/// - `plaintext`: The decrypted message bytes.
pub fn ratchet_decrypt(
    state_bytes: Vec<u8>,
    ciphertext: Vec<u8>,
) -> Result<(Vec<u8>, Vec<u8>)> {
    let mut state: e2ee_core::RatchetState =
        bincode::deserialize(&state_bytes).context("failed to deserialize ratchet state")?;

    // Split header (52 bytes) from ciphertext.
    if ciphertext.len() < 52 {
        anyhow::bail!(
            "ciphertext too short: expected at least 52 bytes for header, got {}",
            ciphertext.len()
        );
    }
    let (header_bytes, actual_ciphertext) = ciphertext.split_at(52);
    let header = decode_ratchet_header(header_bytes).context("failed to decode ratchet header")?;

    let plaintext =
        core_ratchet_decrypt(&mut state, &header, actual_ciphertext).context("ratchet decryption failed")?;

    let new_state_bytes =
        try_export_state(&state).context("failed to serialize updated ratchet state")?;

    Ok((new_state_bytes, plaintext))
}

/// Validate and re-export ratchet state bytes.
///
/// Deserializes the state, then re-serializes it to ensure canonical format.
/// Returns the validated, canonical bincode bytes.
pub fn export_state(state_bytes: Vec<u8>) -> Result<Vec<u8>> {
    let state: e2ee_core::RatchetState =
        bincode::deserialize(&state_bytes).context("failed to deserialize ratchet state")?;

    try_export_state(&state).context("failed to re-export ratchet state")
}

/// Restore ratchet state from previously exported bytes.
///
/// Validates and deserializes the state, then re-exports in canonical form.
/// Returns the validated, canonical bincode bytes.
pub fn restore_state(state_bytes: Vec<u8>) -> Result<Vec<u8>> {
    let state = core_restore_state(&state_bytes).context("failed to restore ratchet state")?;

    try_export_state(&state).context("failed to re-export restored ratchet state")
}
