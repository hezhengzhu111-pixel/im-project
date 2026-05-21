use std::collections::HashMap;
use std::sync::{Mutex, RwLock};

use base64::{engine::general_purpose::STANDARD, Engine as _};
use e2ee_core::{
    decode_ratchet_header, encode_ratchet_header, generate_key_bundle, init_receiving_chain,
    init_sending_chain, ratchet_decrypt, ratchet_encrypt, restore_state, try_export_state,
    PreKeyBundleFetch, RatchetState, X25519KeyPair, X25519PrivateKey, X25519PublicKey,
};

// ============================================================================
// SessionError — UniFFI flat_error, message transmitted via Display (thiserror)
//
// UniFFI 0.28 flat_error serialization: variant_index(i32) + to_string(error)
// Kotlin:  exception.message → "session not found: <session_id>"
// Swift:   error.localizedDescription → "session not found: <session_id>"
// ============================================================================

#[derive(Debug, thiserror::Error)]
pub enum SessionError {
    #[error("session not found: {0}")]
    SessionNotFound(String),
    #[error("session already exists: {0}")]
    SessionAlreadyExists(String),
    #[error("invalid session state data: {0}")]
    InvalidStateData(String),
    #[error("crypto error: {0}")]
    Crypto(String),
}

impl From<e2ee_core::E2eeError> for SessionError {
    fn from(e: e2ee_core::E2eeError) -> Self {
        match e {
            e2ee_core::E2eeError::StateSerializationFailed
            | e2ee_core::E2eeError::StateDeserializationFailed => {
                SessionError::InvalidStateData(e.to_string())
            }
            other => SessionError::Crypto(other.to_string()),
        }
    }
}

// ============================================================================
// Internal Helpers
// ============================================================================

/// Validate that a private key derives to the claimed public key.
fn is_valid_x25519_keypair(kp: &X25519KeyPair) -> bool {
    let secret = x25519_dalek::StaticSecret::from(kp.private_key.0);
    let public = x25519_dalek::PublicKey::from(&secret);
    public.as_bytes() == &kp.public_key.0
}

/// Decode an X25519KeyPair from bincode bytes (64 bytes).
///
/// # Wire contracts
///
/// **Core format** (preferred): `bincode::serialize(&X25519KeyPair{..})` produces
/// `public_key(32) || private_key(32)` matching the struct field declaration order.
/// Host code should always produce this format.
///
/// **Legacy format** (deprecated fallback): `bincode::serialize(&(priv, pub))` tuple
/// where the byte order is `private_key(32) || public_key(32)`. Accepted only after
/// cryptographic validation fails for the core interpretation.
///
/// Both formats are validated by deriving the X25519 public key from the private key
/// and comparing with the claimed public key, so corrupted data is never accepted.
fn decode_keypair(data: &[u8]) -> Result<X25519KeyPair, SessionError> {
    // 1) Core format: X25519KeyPair struct — public_key(32) || private_key(32)
    if let Ok(kp) = bincode::deserialize::<X25519KeyPair>(data) {
        if is_valid_x25519_keypair(&kp) {
            return Ok(kp);
        }
    }

    // 2) Legacy format: (private_bytes, public_bytes) tuple — priv(32) || pub(32)
    if let Ok((priv_bytes, pub_bytes)) = bincode::deserialize::<([u8; 32], [u8; 32])>(data) {
        let kp = X25519KeyPair {
            public_key: X25519PublicKey(pub_bytes),
            private_key: X25519PrivateKey(priv_bytes),
        };
        if is_valid_x25519_keypair(&kp) {
            return Ok(kp);
        }
    }

    Err(SessionError::InvalidStateData(
        "keypair validation failed".to_string(),
    ))
}

/// Decode an X25519PublicKey from raw 32 bytes.
fn decode_public_key(bytes: &[u8]) -> Result<X25519PublicKey, SessionError> {
    if bytes.len() != 32 {
        return Err(SessionError::InvalidStateData(format!(
            "public key has wrong length: expected 32, got {}",
            bytes.len()
        )));
    }
    let mut key = [0u8; 32];
    key.copy_from_slice(bytes);
    Ok(X25519PublicKey(key))
}

fn encode_base64(bytes: &[u8]) -> String {
    STANDARD.encode(bytes)
}

fn serialize_keypair_base64(kp: &X25519KeyPair) -> Result<String, SessionError> {
    let bytes = bincode::serialize(kp).map_err(|e| {
        SessionError::InvalidStateData(format!("failed to serialize key pair: {e}"))
    })?;
    Ok(encode_base64(&bytes))
}

fn generate_pre_key_bundle_json(
    signed_pre_key_id: u32,
    one_time_pre_key_start_id: u32,
    one_time_pre_key_count: u32,
) -> Result<String, SessionError> {
    let otk_batches = if one_time_pre_key_count == 0 {
        Vec::new()
    } else {
        vec![(one_time_pre_key_start_id, one_time_pre_key_count)]
    };
    let key_bundle = generate_key_bundle(signed_pre_key_id, &otk_batches)?;

    let one_time_pre_key_pairs = key_bundle
        .one_time_pre_key_pairs
        .iter()
        .map(|pair| {
            let key_pair_bincode = serialize_keypair_base64(&pair.key_pair)?;
            Ok(serde_json::json!({
                "id": pair.id,
                "keyPairBincode": key_pair_bincode,
                "publicKey": encode_base64(&pair.key_pair.public_key.0),
            }))
        })
        .collect::<Result<Vec<_>, SessionError>>()?;

    let one_time_pre_keys = key_bundle
        .bundle
        .one_time_pre_keys
        .iter()
        .map(|pre_key| {
            serde_json::json!({
                "id": pre_key.id,
                "key": encode_base64(&pre_key.key.0),
            })
        })
        .collect::<Vec<_>>();

    let payload = serde_json::json!({
        "version": 2,
        "identityKeyPairBincode": serialize_keypair_base64(&key_bundle.identity_key_pair)?,
        "signedPreKeyPairBincode": serialize_keypair_base64(&key_bundle.signed_pre_key_pair)?,
        "oneTimePreKeyPairs": one_time_pre_key_pairs,
        "publicBundle": {
            "identityKey": encode_base64(&key_bundle.bundle.identity_key.0),
            "signingKey": encode_base64(&key_bundle.bundle.signing_key.0),
            "signedPreKey": {
                "id": key_bundle.spk_id,
                "key": encode_base64(&key_bundle.bundle.signed_pre_key.0),
            },
            "signedPreKeySignature": encode_base64(&key_bundle.bundle.signed_pre_key_signature.0),
            "oneTimePreKeys": one_time_pre_keys,
        },
    });

    serde_json::to_string(&payload).map_err(|e| {
        SessionError::InvalidStateData(format!("failed to serialize key bundle JSON: {e}"))
    })
}

// ============================================================================
// SessionManager — the main FFI interface
// ============================================================================

pub struct SessionManager {
    sessions: RwLock<HashMap<String, Mutex<RatchetState>>>,
}

impl Default for SessionManager {
    fn default() -> Self {
        Self::new()
    }
}

impl SessionManager {
    pub fn new() -> Self {
        Self {
            sessions: RwLock::new(HashMap::new()),
        }
    }

    pub fn generate_pre_key_bundle(
        &self,
        signed_pre_key_id: u32,
        one_time_pre_key_start_id: u32,
        one_time_pre_key_count: u32,
    ) -> Result<String, SessionError> {
        generate_pre_key_bundle_json(
            signed_pre_key_id,
            one_time_pre_key_start_id,
            one_time_pre_key_count,
        )
    }

    /// Create an outbound (Alice) X3DH session.
    ///
    /// Returns a 40-byte handshake message:
    ///   [0..32)  — Alice's ephemeral public key
    ///   [32..36) — SPK id used (big-endian u32)
    ///   [36..40) — OTK id used (big-endian u32, 0xFFFFFFFF = none)
    pub fn create_outbound_session(
        &self,
        session_id: String,
        identity_key_pair_bincode: Vec<u8>,
        remote_bundle_json: String,
    ) -> Result<Vec<u8>, SessionError> {
        // Check for duplicate session (read lock first)
        {
            let sessions = self
                .sessions
                .read()
                .map_err(|_| SessionError::Crypto("internal lock error".to_string()))?;
            if sessions.contains_key(&session_id) {
                return Err(SessionError::SessionAlreadyExists(session_id));
            }
        }

        let ikp = decode_keypair(&identity_key_pair_bincode)?;
        let fetch: PreKeyBundleFetch = serde_json::from_str(&remote_bundle_json)
            .map_err(|_| SessionError::Crypto("failed to parse remote bundle JSON".to_string()))?;

        let result = e2ee_core::x3dh_initiate(&ikp, &fetch)?;

        let state = init_sending_chain(&result.root_key, ikp.public_key, fetch.identity_key)?;

        // Insert session (write lock) — double-check to prevent TOCTOU race
        {
            let mut sessions = self
                .sessions
                .write()
                .map_err(|_| SessionError::Crypto("internal lock error".to_string()))?;
            if sessions.contains_key(&session_id) {
                return Err(SessionError::SessionAlreadyExists(session_id));
            }
            sessions.insert(session_id, Mutex::new(state));
        }

        // Build handshake: ephemeral_key(32) || spk_id(4) || otk_id(4)
        let mut handshake = Vec::with_capacity(40);
        handshake.extend_from_slice(&result.ephemeral_public_key.0);
        handshake.extend_from_slice(&result.spk_id.to_be_bytes());
        handshake.extend_from_slice(&result.otk_id.unwrap_or(0xFFFFFFFF).to_be_bytes());
        Ok(handshake)
    }

    /// Create an inbound (Bob) X3DH session from Alice's handshake.
    pub fn create_inbound_session(
        &self,
        session_id: String,
        identity_key_pair_bincode: Vec<u8>,
        signed_pre_key_pair_bincode: Vec<u8>,
        one_time_pre_key_pair_bincode: Option<Vec<u8>>,
        remote_identity_key_bytes: Vec<u8>,
        remote_ephemeral_key_bytes: Vec<u8>,
    ) -> Result<(), SessionError> {
        // Check for duplicate session
        {
            let sessions = self
                .sessions
                .read()
                .map_err(|_| SessionError::Crypto("internal lock error".to_string()))?;
            if sessions.contains_key(&session_id) {
                return Err(SessionError::SessionAlreadyExists(session_id));
            }
        }

        let ikp = decode_keypair(&identity_key_pair_bincode)?;
        let spkp = decode_keypair(&signed_pre_key_pair_bincode)?;

        let otk_pair = one_time_pre_key_pair_bincode
            .map(|bytes| decode_keypair(&bytes))
            .transpose()?;

        let remote_ik = decode_public_key(&remote_identity_key_bytes)?;
        let remote_ek = decode_public_key(&remote_ephemeral_key_bytes)?;

        let result = e2ee_core::x3dh_respond_with_raw_otk(
            &ikp,
            &spkp,
            otk_pair.as_ref(),
            &remote_ik,
            &remote_ek,
        )?;

        let state = init_receiving_chain(&result.root_key, ikp.public_key, remote_ik)?;

        {
            let mut sessions = self
                .sessions
                .write()
                .map_err(|_| SessionError::Crypto("internal lock error".to_string()))?;
            if sessions.contains_key(&session_id) {
                return Err(SessionError::SessionAlreadyExists(session_id));
            }
            sessions.insert(session_id, Mutex::new(state));
        }
        Ok(())
    }

    /// Encrypt plaintext for a session.
    ///
    /// Returns wire-format: header_len(4 BE) || RatchetHeader(52 bytes) || ciphertext
    pub fn encrypt(&self, session_id: String, plaintext: Vec<u8>) -> Result<Vec<u8>, SessionError> {
        let sessions = self
            .sessions
            .read()
            .map_err(|_| SessionError::Crypto("internal lock error".to_string()))?;
        let mutex = sessions
            .get(&session_id)
            .ok_or_else(|| SessionError::SessionNotFound(session_id.clone()))?;
        let mut state = mutex
            .lock()
            .map_err(|_| SessionError::Crypto("internal lock error".to_string()))?;

        let (header, ciphertext) = ratchet_encrypt(&mut state, &plaintext)?;

        let header_bytes = encode_ratchet_header(&header);
        let mut wire = Vec::with_capacity(4 + header_bytes.len() + ciphertext.len());
        wire.extend_from_slice(&52u32.to_be_bytes());
        wire.extend_from_slice(&header_bytes);
        wire.extend_from_slice(&ciphertext);
        Ok(wire)
    }

    /// Decrypt a wire-format message for a session.
    pub fn decrypt(&self, session_id: String, encrypted: Vec<u8>) -> Result<Vec<u8>, SessionError> {
        if encrypted.len() < 4 {
            return Err(SessionError::Crypto(
                "encrypted message too short: missing header length prefix".to_string(),
            ));
        }
        let header_len =
            u32::from_be_bytes([encrypted[0], encrypted[1], encrypted[2], encrypted[3]]) as usize;
        if header_len != 52 {
            return Err(SessionError::Crypto(format!(
                "invalid header length: expected 52, got {}",
                header_len
            )));
        }
        if encrypted.len() < 4 + header_len {
            return Err(SessionError::Crypto(
                "encrypted message truncated: incomplete header".to_string(),
            ));
        }
        let header_bytes = &encrypted[4..4 + header_len];
        let header = decode_ratchet_header(header_bytes)
            .map_err(|e| SessionError::Crypto(format!("failed to decode ratchet header: {e}")))?;
        let ciphertext = &encrypted[4 + header_len..];

        let sessions = self
            .sessions
            .read()
            .map_err(|_| SessionError::Crypto("internal lock error".to_string()))?;
        let mutex = sessions
            .get(&session_id)
            .ok_or_else(|| SessionError::SessionNotFound(session_id.clone()))?;
        let mut state = mutex
            .lock()
            .map_err(|_| SessionError::Crypto("internal lock error".to_string()))?;

        ratchet_decrypt(&mut state, &header, ciphertext).map_err(SessionError::from)
    }

    /// Export a session's state as bincode bytes for persistence.
    pub fn export_session(&self, session_id: String) -> Result<Vec<u8>, SessionError> {
        let sessions = self
            .sessions
            .read()
            .map_err(|_| SessionError::Crypto("internal lock error".to_string()))?;
        let mutex = sessions
            .get(&session_id)
            .ok_or_else(|| SessionError::SessionNotFound(session_id.clone()))?;
        let state = mutex
            .lock()
            .map_err(|_| SessionError::Crypto("internal lock error".to_string()))?;
        try_export_state(&state).map_err(SessionError::from)
    }

    /// Restore a previously exported session state.
    pub fn restore_session(
        &self,
        session_id: String,
        state_bincode: Vec<u8>,
    ) -> Result<(), SessionError> {
        let state = restore_state(&state_bincode)?;
        let mut sessions = self
            .sessions
            .write()
            .map_err(|_| SessionError::Crypto("internal lock error".to_string()))?;
        sessions.insert(session_id, Mutex::new(state));
        Ok(())
    }

    /// Remove a session from memory.
    pub fn remove_session(&self, session_id: String) {
        if let Ok(mut sessions) = self.sessions.write() {
            sessions.remove(&session_id);
        }
    }
}

#[cfg(test)]
mod tests;
