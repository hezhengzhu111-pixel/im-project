use anyhow::{Context, Result};
use base64::Engine as _;
use im_e2ee_core::x3dh::{generate_key_bundle_with_count, x3dh_initiate as core_x3dh_initiate};
use im_e2ee_core::{
    decode_ratchet_header, encode_ratchet_header, init_receiving_chain, init_sending_chain,
    ratchet_decrypt as core_ratchet_decrypt, ratchet_encrypt as core_ratchet_encrypt,
    restore_state as core_restore_state, try_export_state, Ed25519PublicKey, Ed25519Signature,
    PreKey, PreKeyBundle, PreKeyBundleFetch, X25519KeyPair, X25519PublicKey,
};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};

const RATCHET_HEADER_LEN: usize = 52;
const WIRE_HEADER_LEN_PREFIX_SIZE: usize = 4;

// ============================================================================
// Serializable bridge types for FFI
// ============================================================================

/// Serializable key bundle returned by `generate_key_bundle`.
///
/// Contains both public (PreKeyBundle) and private key material so the Dart
/// side can store everything needed for later X3DH response and ratchet ops.
/// flutter_rust_bridge:ignore
#[derive(Serialize, Deserialize)]
pub struct BridgeKeyBundle {
    pub spk_id: u32,
    pub identity_key_pair: X25519KeyPair,
    pub signing_public_key: Ed25519PublicKey,
    /// Ed25519 private key raw bytes (32 bytes). Stored as raw bytes because
    /// `Ed25519PrivateKey` in im-e2ee-core does not derive Serialize.
    pub signing_private_key_bytes: [u8; 32],
    pub signed_pre_key_pair: X25519KeyPair,
    pub otk_pairs: Vec<BridgeOtkPair>,
    pub bundle: PreKeyBundle,
}

/// Serializable one-time pre-key pair.
/// flutter_rust_bridge:ignore
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

fn decode_base64_32(value: &str, label: &str) -> Result<[u8; 32]> {
    let bytes = base64::engine::general_purpose::STANDARD
        .decode(value)
        .with_context(|| format!("invalid {label} base64"))?;
    if bytes.len() != 32 {
        anyhow::bail!("{label} must be 32 bytes, got {}", bytes.len());
    }
    let mut out = [0u8; 32];
    out.copy_from_slice(&bytes);
    Ok(out)
}

fn json_key_bytes(value: &serde_json::Value, label: &str) -> Result<[u8; 32]> {
    if let Some(text) = value.as_str() {
        return decode_base64_32(text, label);
    }
    let array = value
        .as_array()
        .with_context(|| format!("{label} must be base64 string or byte array"))?;
    if array.len() != 32 {
        anyhow::bail!("{label} must be 32 bytes, got {}", array.len());
    }
    let mut out = [0u8; 32];
    for (idx, item) in array.iter().enumerate() {
        let byte = item
            .as_u64()
            .with_context(|| format!("{label}[{idx}] must be a byte"))?;
        if byte > u8::MAX as u64 {
            anyhow::bail!("{label}[{idx}] must be in 0..=255");
        }
        out[idx] = byte as u8;
    }
    Ok(out)
}

fn json_pre_key(value: &serde_json::Value, label: &str) -> Result<PreKey> {
    let id = value["id"]
        .as_u64()
        .with_context(|| format!("{label}.id is required"))?;
    if id > u32::MAX as u64 {
        anyhow::bail!("{label}.id out of range");
    }
    Ok(PreKey {
        id: id as u32,
        key: X25519PublicKey(json_key_bytes(&value["key"], &format!("{label}.key"))?),
    })
}

fn parse_remote_bundle_json(bundle_json: &str) -> Result<PreKeyBundleFetch> {
    let value: serde_json::Value =
        serde_json::from_str(bundle_json).context("failed to parse remote bundle JSON")?;
    let one_time_pre_key = match value.get("one_time_pre_key") {
        Some(v) if !v.is_null() => Some(json_pre_key(v, "one_time_pre_key")?),
        _ => None,
    };
    let sig_bytes = base64::engine::general_purpose::STANDARD
        .decode(value["signed_pre_key_signature"].as_str().unwrap_or(""))
        .context("invalid signed_pre_key_signature base64")?;
    if sig_bytes.len() != 64 {
        anyhow::bail!(
            "signed_pre_key_signature must be 64 bytes, got {}",
            sig_bytes.len()
        );
    }
    let mut sig = [0u8; 64];
    sig.copy_from_slice(&sig_bytes);

    Ok(PreKeyBundleFetch {
        identity_key: X25519PublicKey(json_key_bytes(&value["identity_key"], "identity_key")?),
        signing_key: Ed25519PublicKey(json_key_bytes(&value["signing_key"], "signing_key")?),
        signed_pre_key: json_pre_key(&value["signed_pre_key"], "signed_pre_key")?,
        signed_pre_key_signature: Ed25519Signature(sig),
        one_time_pre_key,
    })
}

fn encode_wire(header_and_ciphertext: &[u8]) -> Result<Vec<u8>> {
    if header_and_ciphertext.len() < RATCHET_HEADER_LEN {
        anyhow::bail!(
            "ratchet payload too short: expected at least {} bytes, got {}",
            RATCHET_HEADER_LEN,
            header_and_ciphertext.len()
        );
    }
    let header_len = u32::try_from(RATCHET_HEADER_LEN).context("ratchet header length overflow")?;
    let mut wire = Vec::with_capacity(WIRE_HEADER_LEN_PREFIX_SIZE + header_and_ciphertext.len());
    wire.extend_from_slice(&header_len.to_be_bytes());
    wire.extend_from_slice(header_and_ciphertext);
    Ok(wire)
}

fn decode_wire(wire: &[u8]) -> Result<Vec<u8>> {
    if wire.len() < RATCHET_HEADER_LEN {
        anyhow::bail!(
            "wire too short: expected at least {} bytes, got {}",
            RATCHET_HEADER_LEN,
            wire.len()
        );
    }

    if wire.len() >= WIRE_HEADER_LEN_PREFIX_SIZE + RATCHET_HEADER_LEN {
        let prefix = wire
            .get(..WIRE_HEADER_LEN_PREFIX_SIZE)
            .context("missing wire header length prefix")?;
        let header_len = u32::from_be_bytes(
            prefix
                .try_into()
                .context("invalid wire header length prefix")?,
        );
        let header_len = usize::try_from(header_len).context("wire header length overflow")?;
        if header_len == RATCHET_HEADER_LEN {
            return Ok(wire[WIRE_HEADER_LEN_PREFIX_SIZE..].to_vec());
        }
    }

    // Compatibility for older local envelopes produced before the network
    // wire prefix was enforced.
    Ok(wire.to_vec())
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
    let key_bundle =
        generate_key_bundle_with_count(1, otk_count).context("failed to generate key bundle")?;

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
                public_key: im_e2ee_core::X25519PublicKey(otk.key_pair.public_key.0),
                private_key: im_e2ee_core::X25519PrivateKey(otk.key_pair.private_key.0),
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
            public_key: im_e2ee_core::X25519PublicKey(identity_pk),
            private_key: im_e2ee_core::X25519PrivateKey(identity_sk),
        },
        signing_public_key: Ed25519PublicKey(signing_pk),
        signing_private_key_bytes: signing_sk,
        signed_pre_key_pair: X25519KeyPair {
            public_key: im_e2ee_core::X25519PublicKey(spk_pk),
            private_key: im_e2ee_core::X25519PrivateKey(spk_sk),
        },
        otk_pairs,
        bundle,
    };

    bincode::serialize(&bridge_bundle).context("failed to serialize key bundle")
}

/// Generate a key bundle and return it as JSON (for Dart consumption).
///
/// Returns a JSON string with all key material encoded as base64, so the Dart
/// side can parse individual fields without needing bincode deserialization.
///
/// Output JSON:
/// ```json
/// {
///   "identity_key_pair_bincode": "<base64>",
///   "signing_public_key": "<base64 32 bytes>",
///   "signing_private_key_bytes": "<base64 32 bytes>",
///   "signed_pre_key_pair_bincode": "<base64>",
///   "signed_pre_key_id": 1,
///   "public_bundle": {
///     "identity_key": "<base64 32 bytes>",
///     "signing_key": "<base64 32 bytes>",
///     "signed_pre_key": { "id": 1, "key": "<base64 32 bytes>" },
///     "signed_pre_key_signature": "<base64>",
///     "one_time_pre_keys": [ { "id": 1, "key": "<base64 32 bytes>" }, ... ]
///   },
///   "otk_pairs": [ { "id": 1, "key_pair_bincode": "<base64>" }, ... ]
/// }
/// ```
pub fn generate_key_bundle_json(otk_count: u32) -> Result<String> {
    let key_bundle =
        generate_key_bundle_with_count(1, otk_count).context("failed to generate key bundle")?;

    let identity_key_pair_bytes = bincode::serialize(&key_bundle.identity_key_pair)
        .context("failed to serialize identity key pair")?;
    let signed_pre_key_pair_bytes = bincode::serialize(&key_bundle.signed_pre_key_pair)
        .context("failed to serialize signed pre-key pair")?;

    let b64 = |bytes: &[u8]| base64::engine::general_purpose::STANDARD.encode(bytes);

    let mut otk_pairs_json = Vec::with_capacity(key_bundle.one_time_pre_key_pairs.len());
    let mut one_time_pre_keys_json = Vec::with_capacity(key_bundle.one_time_pre_key_pairs.len());
    for otk in &key_bundle.one_time_pre_key_pairs {
        let otk_pair_bytes =
            bincode::serialize(&otk.key_pair).context("failed to serialize OTK pair")?;
        otk_pairs_json.push(serde_json::json!({
            "id": otk.id,
            "key_pair_bincode": b64(&otk_pair_bytes),
        }));
        one_time_pre_keys_json.push(serde_json::json!({
            "id": otk.id,
            "key": b64(&otk.key_pair.public_key.0),
        }));
    }

    let result = serde_json::json!({
        "identity_key_pair_bincode": b64(&identity_key_pair_bytes),
        "signing_public_key": b64(&key_bundle.signing_key_pair.public_key.0),
        "signing_private_key_bytes": b64(&key_bundle.signing_key_pair.private_key.0),
        "signed_pre_key_pair_bincode": b64(&signed_pre_key_pair_bytes),
        "signed_pre_key_id": key_bundle.spk_id,
        "public_bundle": {
            "identity_key": b64(&key_bundle.bundle.identity_key.0),
            "signing_key": b64(&key_bundle.signing_key_pair.public_key.0),
            "signed_pre_key": {
                "id": key_bundle.spk_id,
                "key": b64(&key_bundle.signed_pre_key_pair.public_key.0),
            },
            "signed_pre_key_signature": b64(&key_bundle.bundle.signed_pre_key_signature.0),
            "one_time_pre_keys": one_time_pre_keys_json,
        },
        "otk_pairs": otk_pairs_json,
    });

    Ok(result.to_string())
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
    let alice_identity: X25519KeyPair = bincode::deserialize(&identity_key)
        .context("failed to deserialize Alice's identity key")?;

    let remote_bundle: PreKeyBundleFetch = bincode::deserialize(&signed_pre_key)
        .context("failed to deserialize Bob's pre-key bundle")?;

    let initiate_result =
        core_x3dh_initiate(&alice_identity, &remote_bundle).context("X3DH initiation failed")?;

    // Create initial sending RatchetState from the derived root key.
    let sending_state = init_sending_chain(
        &initiate_result.root_key,
        alice_identity.public_key,
        remote_bundle.identity_key,
    )
    .context("failed to initialize sending ratchet chain")?;

    let state_bytes =
        try_export_state(&sending_state).context("failed to serialize ratchet state")?;

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

    let bob_spk: X25519KeyPair = bincode::deserialize(&signed_pre_key)
        .context("failed to deserialize Bob's signed pre-key")?;

    let bob_otk: Option<X25519KeyPair> = match one_time_pre_key {
        Some(bytes) => Some(
            bincode::deserialize(&bytes).context("failed to deserialize Bob's one-time pre-key")?,
        ),
        None => None,
    };

    // Use x3dh_respond_with_raw_otk since we have raw X25519KeyPair (no OneTimePreKeyPair with ID).
    let respond_result = im_e2ee_core::x3dh::x3dh_respond_with_raw_otk(
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
pub fn ratchet_encrypt(state_bytes: Vec<u8>, plaintext: Vec<u8>) -> Result<(Vec<u8>, Vec<u8>)> {
    let mut state: im_e2ee_core::RatchetState =
        bincode::deserialize(&state_bytes).context("failed to deserialize ratchet state")?;

    let (header, ciphertext) =
        core_ratchet_encrypt(&mut state, &plaintext).context("ratchet encryption failed")?;

    let new_state_bytes =
        try_export_state(&state).context("failed to serialize updated ratchet state")?;

    // Encode header (52 bytes) and prepend to ciphertext. The high-level
    // envelope API adds the network wire header_len prefix.
    let header_bytes = encode_ratchet_header(&header);
    let mut header_and_ciphertext = Vec::with_capacity(RATCHET_HEADER_LEN + ciphertext.len());
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
pub fn ratchet_decrypt(state_bytes: Vec<u8>, ciphertext: Vec<u8>) -> Result<(Vec<u8>, Vec<u8>)> {
    let mut state: im_e2ee_core::RatchetState =
        bincode::deserialize(&state_bytes).context("failed to deserialize ratchet state")?;

    // Split header (52 bytes) from ciphertext.
    if ciphertext.len() < RATCHET_HEADER_LEN {
        anyhow::bail!(
            "ciphertext too short: expected at least 52 bytes for header, got {}",
            ciphertext.len()
        );
    }
    let (header_bytes, actual_ciphertext) = ciphertext.split_at(RATCHET_HEADER_LEN);
    let header = decode_ratchet_header(header_bytes).context("failed to decode ratchet header")?;

    let plaintext = core_ratchet_decrypt(&mut state, &header, actual_ciphertext)
        .context("ratchet decryption failed")?;

    let new_state_bytes =
        try_export_state(&state).context("failed to serialize updated ratchet state")?;

    Ok((new_state_bytes, plaintext))
}

/// Validate and re-export ratchet state bytes.
///
/// Deserializes the state, then re-serializes it to ensure canonical format.
/// Returns the validated, canonical bincode bytes.
pub fn export_state(state_bytes: Vec<u8>) -> Result<Vec<u8>> {
    let state: im_e2ee_core::RatchetState =
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

// ============================================================================
// High-level SessionManager functions (JSON in/out)
// ============================================================================

/// Create outbound X3DH session (Alice side).
/// Input JSON: {"session_id": "...", "local_identity_key_pair": "<base64 bincode X25519KeyPair>", "remote_bundle_json": "{...}"}
/// Output JSON: {"state": "<base64>", "handshake": "<base64>", "otk_id": <u32|null>}
#[allow(dead_code)]
pub fn create_outbound_session(config_json: String) -> Result<String> {
    let config: serde_json::Value = serde_json::from_str(&config_json)
        .context("failed to parse create_outbound_session config")?;

    let identity_bytes = base64::engine::general_purpose::STANDARD
        .decode(config["local_identity_key_pair"].as_str().unwrap_or(""))
        .context("invalid local_identity_key_pair base64")?;
    let alice_identity: X25519KeyPair = bincode::deserialize(&identity_bytes)
        .context("failed to deserialize local identity key pair")?;

    let bundle_json = config["remote_bundle_json"]
        .as_str()
        .context("remote_bundle_json is required")?;
    let remote_bundle = parse_remote_bundle_json(bundle_json)?;

    let initiate_result =
        core_x3dh_initiate(&alice_identity, &remote_bundle).context("X3DH initiation failed")?;

    let sending_state = init_sending_chain(
        &initiate_result.root_key,
        alice_identity.public_key,
        remote_bundle.identity_key,
    )
    .context("failed to initialize sending ratchet chain")?;

    let state_bytes =
        try_export_state(&sending_state).context("failed to serialize ratchet state")?;

    let mut handshake = Vec::with_capacity(40);
    handshake.extend_from_slice(&initiate_result.ephemeral_public_key.0);
    handshake.extend_from_slice(&initiate_result.spk_id.to_be_bytes());
    let otk_id_val = initiate_result.otk_id.unwrap_or(0xffffffff);
    handshake.extend_from_slice(&otk_id_val.to_be_bytes());

    let result = serde_json::json!({
        "state": base64::engine::general_purpose::STANDARD.encode(&state_bytes),
        "handshake": base64::engine::general_purpose::STANDARD.encode(&handshake),
        "otk_id": initiate_result.otk_id,
    });

    Ok(result.to_string())
}

/// Create inbound X3DH session (Bob side).
/// Input JSON: {"session_id": "...", "local_identity_key_pair": "<base64 bincode X25519KeyPair>", "local_spk_pair": "<base64 bincode X25519KeyPair>", "local_otk_pair?": "<base64 bincode X25519KeyPair>", "remote_identity_key": "<base64 32 raw bytes>", "remote_handshake": "<base64 40 bytes: ephemeral_pk(32)||spk_id(4BE)||otk_id(4BE)>"}
/// Output JSON: {"state": "<base64>", "otk_id": <u32|null>}
#[allow(dead_code)]
pub fn create_inbound_session(config_json: String) -> Result<String> {
    let config: serde_json::Value = serde_json::from_str(&config_json)
        .context("failed to parse create_inbound_session config")?;

    let identity_bytes = base64::engine::general_purpose::STANDARD
        .decode(config["local_identity_key_pair"].as_str().unwrap_or(""))
        .context("invalid local_identity_key_pair")?;
    let bob_identity: X25519KeyPair = bincode::deserialize(&identity_bytes)
        .context("failed to deserialize local identity key pair")?;

    let spk_bytes = base64::engine::general_purpose::STANDARD
        .decode(config["local_spk_pair"].as_str().unwrap_or(""))
        .context("invalid local_spk_pair")?;
    let bob_spk: X25519KeyPair =
        bincode::deserialize(&spk_bytes).context("failed to deserialize local SPK pair")?;

    let bob_otk: Option<X25519KeyPair> = match config.get("local_otk_pair") {
        Some(v) if v.is_string() => {
            let otk_bytes = base64::engine::general_purpose::STANDARD
                .decode(v.as_str().unwrap_or(""))
                .context("invalid local_otk_pair")?;
            Some(bincode::deserialize(&otk_bytes).context("failed to deserialize OTK pair")?)
        }
        _ => None,
    };

    let remote_id_bytes = base64::engine::general_purpose::STANDARD
        .decode(config["remote_identity_key"].as_str().unwrap_or(""))
        .context("invalid remote_identity_key")?;
    if remote_id_bytes.len() != 32 {
        anyhow::bail!(
            "remote_identity_key must be 32 bytes, got {}",
            remote_id_bytes.len()
        );
    }
    let alice_identity_pk = X25519PublicKey({
        let mut buf = [0u8; 32];
        buf.copy_from_slice(&remote_id_bytes);
        buf
    });

    let handshake_bytes = base64::engine::general_purpose::STANDARD
        .decode(config["remote_handshake"].as_str().unwrap_or(""))
        .context("invalid remote_handshake")?;
    if handshake_bytes.len() != 40 {
        anyhow::bail!("handshake must be 40 bytes, got {}", handshake_bytes.len());
    }
    let alice_ephemeral_pk = X25519PublicKey({
        let mut buf = [0u8; 32];
        buf.copy_from_slice(&handshake_bytes[..32]);
        buf
    });

    let respond_result = im_e2ee_core::x3dh::x3dh_respond_with_raw_otk(
        &bob_identity,
        &bob_spk,
        bob_otk.as_ref(),
        &alice_identity_pk,
        &alice_ephemeral_pk,
    )
    .context("X3DH response failed")?;

    let receiving_state = init_receiving_chain(
        &respond_result.root_key,
        bob_identity.public_key,
        alice_identity_pk,
    )
    .context("failed to initialize receiving ratchet chain")?;

    let state_bytes =
        try_export_state(&receiving_state).context("failed to serialize ratchet state")?;

    let result = serde_json::json!({
        "state": base64::engine::general_purpose::STANDARD.encode(&state_bytes),
        "otk_id": respond_result.otk_id,
    });

    Ok(result.to_string())
}

/// Encrypt message, output E2eeEnvelope JSON.
/// Input JSON: {"state": "<base64>", "plaintext": "<base64>", "sender_device_id": "...", "recipient_device_id": "...", "session_id": "...", "handshake?": "<base64>"}
/// Output JSON: {"version": 2, "algorithm": "rust-x25519-x3dh-dr-v1", "sender_device_id": "...", "recipient_device_id": "...", "session_id": "...", "wire": "<base64>", "handshake?": "<base64>", "new_state": "<base64>"}
#[allow(dead_code)]
pub fn encrypt_message(config_json: String) -> Result<String> {
    let config: serde_json::Value =
        serde_json::from_str(&config_json).context("failed to parse encrypt_message config")?;

    let state_bytes = base64::engine::general_purpose::STANDARD
        .decode(config["state"].as_str().unwrap_or(""))
        .context("invalid state base64")?;
    let plaintext_bytes = base64::engine::general_purpose::STANDARD
        .decode(config["plaintext"].as_str().unwrap_or(""))
        .context("invalid plaintext base64")?;

    let (new_state, header_and_ciphertext) = ratchet_encrypt(state_bytes, plaintext_bytes)?;
    let wire_bytes = encode_wire(&header_and_ciphertext)?;

    let wire = base64::engine::general_purpose::STANDARD.encode(&wire_bytes);
    let new_state_b64 = base64::engine::general_purpose::STANDARD.encode(&new_state);

    let mut envelope = serde_json::json!({
        "version": 2,
        "algorithm": "rust-x25519-x3dh-dr-v1",
        "sender_device_id": config["sender_device_id"],
        "recipient_device_id": config["recipient_device_id"],
        "session_id": config["session_id"],
        "wire": wire,
        "new_state": new_state_b64,
    });

    if let Some(handshake) = config.get("handshake") {
        if handshake.is_string() && !handshake.as_str().unwrap_or("").is_empty() {
            envelope["handshake"] = handshake.clone();
        }
    }

    Ok(envelope.to_string())
}

/// Decrypt message from E2eeEnvelope JSON.
/// Input JSON: {"state": "<base64>", "envelope": {"wire": "<base64>", ...}}
/// Output JSON: {"plaintext": "<base64>", "new_state": "<base64>"}
#[allow(dead_code)]
pub fn decrypt_message(config_json: String) -> Result<String> {
    let config: serde_json::Value =
        serde_json::from_str(&config_json).context("failed to parse decrypt_message config")?;

    let state_bytes = base64::engine::general_purpose::STANDARD
        .decode(config["state"].as_str().unwrap_or(""))
        .context("invalid state base64")?;

    let wire_b64 = config["envelope"]["wire"]
        .as_str()
        .context("envelope.wire is required")?;
    let wire_bytes = base64::engine::general_purpose::STANDARD
        .decode(wire_b64)
        .context("invalid wire base64")?;
    let header_and_ciphertext = decode_wire(&wire_bytes)?;

    let (new_state, plaintext) = ratchet_decrypt(state_bytes, header_and_ciphertext)?;

    let result = serde_json::json!({
        "plaintext": base64::engine::general_purpose::STANDARD.encode(&plaintext),
        "new_state": base64::engine::general_purpose::STANDARD.encode(&new_state),
    });

    Ok(result.to_string())
}

/// Export session state with v3 envelope context binding.
/// Input JSON: {"state": "<base64>", "user_id", "device_id", "session_id", "remote_user_id", "remote_device_id"}
/// Output JSON: {"envelope": "<base64>"}
#[allow(dead_code)]
pub fn export_session_envelope(config_json: String) -> Result<String> {
    let config: serde_json::Value = serde_json::from_str(&config_json)
        .context("failed to parse export_session_envelope config")?;

    let state_bytes = base64::engine::general_purpose::STANDARD
        .decode(config["state"].as_str().unwrap_or(""))
        .context("invalid state base64")?;

    let user_id = config["user_id"].as_str().unwrap_or("");
    let device_id = config["device_id"].as_str().unwrap_or("");
    let session_id = config["session_id"].as_str().unwrap_or("");
    let remote_user_id = config["remote_user_id"].as_str().unwrap_or("");
    let remote_device_id = config["remote_device_id"].as_str().unwrap_or("");

    let context_str = format!(
        "{}:{}:{}:{}:{}",
        user_id, device_id, session_id, remote_user_id, remote_device_id
    );
    let mut hasher = Sha256::new();
    hasher.update(context_str.as_bytes());
    let hash = hasher.finalize();
    let context_hash = &hash[..16];

    let mut envelope = Vec::with_capacity(1 + 16 + state_bytes.len());
    envelope.push(3u8); // version 3
    envelope.extend_from_slice(context_hash);
    envelope.extend_from_slice(&state_bytes);

    let result = serde_json::json!({
        "envelope": base64::engine::general_purpose::STANDARD.encode(&envelope),
    });

    Ok(result.to_string())
}

/// Restore session from v3 envelope, validating context binding.
/// Input JSON: {"envelope": "<base64>", "user_id", "device_id", "session_id", "remote_user_id", "remote_device_id"}
/// Output JSON: {"state": "<base64>"} or error
#[allow(dead_code)]
pub fn restore_session_envelope(config_json: String) -> Result<String> {
    let config: serde_json::Value = serde_json::from_str(&config_json)
        .context("failed to parse restore_session_envelope config")?;

    let envelope_bytes = base64::engine::general_purpose::STANDARD
        .decode(config["envelope"].as_str().unwrap_or(""))
        .context("invalid envelope base64")?;

    if envelope_bytes.len() < 17 {
        anyhow::bail!(
            "envelope too short: expected at least 17 bytes, got {}",
            envelope_bytes.len()
        );
    }

    let version = envelope_bytes[0];
    if version != 3 {
        anyhow::bail!("unsupported envelope version: {}", version);
    }

    let stored_hash = &envelope_bytes[1..17];
    let state_bytes = &envelope_bytes[17..];

    let user_id = config["user_id"].as_str().unwrap_or("");
    let device_id = config["device_id"].as_str().unwrap_or("");
    let session_id = config["session_id"].as_str().unwrap_or("");
    let remote_user_id = config["remote_user_id"].as_str().unwrap_or("");
    let remote_device_id = config["remote_device_id"].as_str().unwrap_or("");

    let context_str = format!(
        "{}:{}:{}:{}:{}",
        user_id, device_id, session_id, remote_user_id, remote_device_id
    );
    let mut hasher = Sha256::new();
    hasher.update(context_str.as_bytes());
    let hash = hasher.finalize();
    let computed_hash = &hash[..16];

    if stored_hash != computed_hash {
        anyhow::bail!("session context mismatch — possible cross-account restore attack");
    }

    let _state: im_e2ee_core::RatchetState = bincode::deserialize(state_bytes)
        .context("failed to deserialize ratchet state from envelope")?;

    let result = serde_json::json!({
        "state": base64::engine::general_purpose::STANDARD.encode(state_bytes),
    });

    Ok(result.to_string())
}

// ============================================================================
// Tests
// ============================================================================

#[cfg(test)]
mod tests {
    use super::*;
    use im_e2ee_core::PreKeyBundleFetch;

    /// Helper: deserialize a bincode-serialized BridgeKeyBundle.
    fn deserialize_bundle(bytes: &[u8]) -> BridgeKeyBundle {
        bincode::deserialize(bytes).expect("failed to deserialize BridgeKeyBundle")
    }

    /// Helper: build a PreKeyBundleFetch from a BridgeKeyBundle so that
    /// Alice can call `x3dh_initiate`.
    fn build_fetch_bundle(bundle: &BridgeKeyBundle) -> PreKeyBundleFetch {
        let first_otk = bundle.otk_pairs.first().map(|otk| im_e2ee_core::PreKey {
            id: otk.id,
            key: otk.key_pair.public_key,
        });

        PreKeyBundleFetch {
            identity_key: bundle.bundle.identity_key,
            signing_key: bundle.signing_public_key,
            signed_pre_key: im_e2ee_core::PreKey {
                id: bundle.spk_id,
                key: bundle.signed_pre_key_pair.public_key,
            },
            signed_pre_key_signature: bundle.bundle.signed_pre_key_signature,
            one_time_pre_key: first_otk,
        }
    }

    /// Perform a full X3DH handshake and return both serialized ratchet states.
    ///
    /// Returns `(alice_state, bob_state)`.
    fn run_x3dh_handshake() -> (Vec<u8>, Vec<u8>) {
        let alice_bundle_bytes =
            generate_key_bundle(1).expect("Alice key bundle generation failed");
        let alice_bundle = deserialize_bundle(&alice_bundle_bytes);

        let bob_bundle_bytes = generate_key_bundle(1).expect("Bob key bundle generation failed");
        let bob_bundle = deserialize_bundle(&bob_bundle_bytes);

        // Serialize Alice's identity key pair for the bridge.
        let alice_identity_bytes =
            bincode::serialize(&alice_bundle.identity_key_pair).expect("serialize alice identity");

        // Build Bob's PreKeyBundleFetch.
        let bob_fetch = build_fetch_bundle(&bob_bundle);
        let bob_fetch_bytes = bincode::serialize(&bob_fetch).expect("serialize bob fetch bundle");

        // Alice initiates.
        let initiate_bytes = x3dh_initiate(alice_identity_bytes.clone(), bob_fetch_bytes, None)
            .expect("x3dh_initiate failed");
        let initiate: BridgeX3dhInitiateResult =
            bincode::deserialize(&initiate_bytes).expect("deserialize initiate");

        // Build 64-byte ephemeral_key = alice_identity_pk || alice_ephemeral_pk.
        let mut ephemeral_key = Vec::with_capacity(64);
        ephemeral_key.extend_from_slice(&alice_bundle.identity_key_pair.public_key.0);
        ephemeral_key.extend_from_slice(&initiate.ephemeral_public_key);

        // Serialize Bob's keys for the bridge.
        let bob_identity_bytes =
            bincode::serialize(&bob_bundle.identity_key_pair).expect("serialize bob identity");
        let bob_spk_bytes = bincode::serialize(&bob_bundle.signed_pre_key_pair)
            .expect("serialize bob signed pre-key");
        let bob_otk_bytes = bincode::serialize(&bob_bundle.otk_pairs[0].key_pair)
            .expect("serialize bob one-time pre-key");

        // Bob responds.
        let respond_bytes = x3dh_respond(
            bob_identity_bytes,
            ephemeral_key,
            bob_spk_bytes,
            Some(bob_otk_bytes),
        )
        .expect("x3dh_respond failed");
        let respond: BridgeX3dhRespondResult =
            bincode::deserialize(&respond_bytes).expect("deserialize respond");

        (initiate.state, respond.state)
    }

    #[test]
    fn test_generate_key_bundle() {
        let bundle_bytes = generate_key_bundle(5).expect("generate_key_bundle failed");
        assert!(!bundle_bytes.is_empty(), "bundle bytes must not be empty");

        let bundle = deserialize_bundle(&bundle_bytes);

        // Verify public key material is present (non-zero).
        assert_ne!(
            bundle.bundle.identity_key.0, [0u8; 32],
            "identity key must not be all zeros"
        );
        assert_ne!(
            bundle.bundle.signed_pre_key.0, [0u8; 32],
            "signed pre-key must not be all zeros"
        );

        // Verify OTK count matches.
        assert_eq!(bundle.otk_pairs.len(), 5, "expected 5 one-time pre-keys");

        // Verify OTK ids are sequential starting at 1.
        for (i, otk) in bundle.otk_pairs.iter().enumerate() {
            assert_eq!(otk.id, (i as u32) + 1, "OTK id mismatch");
            assert_ne!(
                otk.key_pair.public_key.0, [0u8; 32],
                "OTK public key must not be all zeros"
            );
        }
    }

    #[test]
    fn test_x3dh_initiate_and_respond() {
        let (alice_state, bob_state) = run_x3dh_handshake();
        assert!(!alice_state.is_empty(), "Alice state must not be empty");
        assert!(!bob_state.is_empty(), "Bob state must not be empty");
    }

    #[test]
    fn test_ratchet_encrypt_decrypt() {
        let (alice_state, bob_state) = run_x3dh_handshake();

        // --- Encrypt with Alice's sending state ---
        let plaintext = b"Hello, Bob!";
        let (alice_state_after, ciphertext) =
            ratchet_encrypt(alice_state, plaintext.to_vec()).expect("ratchet_encrypt failed");

        assert!(!ciphertext.is_empty(), "ciphertext must not be empty");
        // ciphertext = 52-byte header + encrypted data
        assert!(
            ciphertext.len() > 52,
            "ciphertext must be longer than header ({} bytes)",
            ciphertext.len()
        );

        // --- Decrypt with Bob's receiving state ---
        let (bob_state_after, decrypted) =
            ratchet_decrypt(bob_state, ciphertext).expect("ratchet_decrypt failed");

        assert_eq!(
            decrypted,
            plaintext.to_vec(),
            "decrypted plaintext must match original"
        );
        assert!(
            !bob_state_after.is_empty(),
            "Bob's updated state must not be empty"
        );
        assert!(
            !alice_state_after.is_empty(),
            "Alice's updated state must not be empty"
        );
    }

    #[test]
    fn test_ratchet_multiple_messages() {
        let (alice_state, bob_state) = run_x3dh_handshake();

        // --- Alice sends 5 messages, Bob decrypts each ---
        let mut alice_state = alice_state;
        let mut bob_state = bob_state;
        let messages: Vec<Vec<u8>> = (0..5)
            .map(|i| format!("Message {}", i).into_bytes())
            .collect();

        for plaintext in &messages {
            let (new_alice_state, ciphertext) =
                ratchet_encrypt(alice_state, plaintext.clone()).expect("encrypt failed");
            alice_state = new_alice_state;

            let (new_bob_state, decrypted) =
                ratchet_decrypt(bob_state, ciphertext).expect("decrypt failed");
            bob_state = new_bob_state;

            assert_eq!(
                &decrypted, plaintext,
                "decrypted message must match original"
            );
        }
    }

    #[test]
    fn test_export_restore_state() {
        let (alice_state, bob_state) = run_x3dh_handshake();

        // --- Export and restore Alice's state ---
        let exported = export_state(alice_state.clone()).expect("export_state failed");
        let restored = restore_state(exported).expect("restore_state failed");

        // Verify restored state works for encryption.
        let plaintext = b"State persistence test";
        let (_, ciphertext) = ratchet_encrypt(restored, plaintext.to_vec())
            .expect("encrypt with restored state failed");

        let (_, decrypted) = ratchet_decrypt(bob_state, ciphertext).expect("decrypt failed");
        assert_eq!(
            decrypted,
            plaintext.to_vec(),
            "decrypted must match after state restore"
        );

        // --- Also test bincode roundtrip via try_export_state / core_restore_state ---
        let (alice_state_after, _) =
            ratchet_encrypt(alice_state, b"before export".to_vec()).expect("encrypt failed");
        let deserialized_state: im_e2ee_core::RatchetState =
            bincode::deserialize(&alice_state_after).expect("deserialize state");
        let exported2 = try_export_state(&deserialized_state).expect("try_export_state failed");
        let _restored2 = core_restore_state(&exported2).expect("core_restore_state failed");
    }

    #[test]
    fn test_high_level_encrypt_message_wire_has_header_len_prefix() {
        let (alice_state, bob_state) = run_x3dh_handshake();
        let b64 = |bytes: &[u8]| base64::engine::general_purpose::STANDARD.encode(bytes);

        let encrypt_config = serde_json::json!({
            "state": b64(&alice_state),
            "plaintext": b64(b"hello across clients"),
            "sender_device_id": "web-device",
            "recipient_device_id": "desktop-device",
            "session_id": "1_2",
        });

        let encrypted =
            encrypt_message(encrypt_config.to_string()).expect("encrypt_message failed");
        let envelope: serde_json::Value =
            serde_json::from_str(&encrypted).expect("parse encrypted envelope");
        let wire_b64 = envelope["wire"].as_str().expect("wire is a string");
        let wire = base64::engine::general_purpose::STANDARD
            .decode(wire_b64)
            .expect("decode wire");

        assert!(wire.starts_with(&[0, 0, 0, 52]));
        assert!(wire.len() > 4 + 52);

        let decrypt_config = serde_json::json!({
            "state": b64(&bob_state),
            "envelope": envelope,
        });
        let decrypted =
            decrypt_message(decrypt_config.to_string()).expect("decrypt_message failed");
        let parsed: serde_json::Value =
            serde_json::from_str(&decrypted).expect("parse decrypt result");
        let plaintext = base64::engine::general_purpose::STANDARD
            .decode(parsed["plaintext"].as_str().expect("plaintext is a string"))
            .expect("decode plaintext");

        assert_eq!(plaintext, b"hello across clients");
    }
}
