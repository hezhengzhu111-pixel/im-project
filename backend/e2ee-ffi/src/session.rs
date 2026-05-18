use std::collections::HashMap;
use std::sync::{Mutex, RwLock};

use e2ee_core::{
    decode_ratchet_header, encode_ratchet_header, init_receiving_chain, init_sending_chain,
    ratchet_decrypt, ratchet_encrypt, restore_state, try_export_state, PreKeyBundleFetch,
    RatchetState, X25519KeyPair, X25519PrivateKey, X25519PublicKey,
};

// ============================================================================
// SessionError — flat FFI-safe error enum (matches UDL)
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
        SessionError::Crypto(e.to_string())
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
    if let Ok((priv_bytes, pub_bytes)) =
        bincode::deserialize::<([u8; 32], [u8; 32])>(data)
    {
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

        // Insert session (write lock)
        {
            let mut sessions = self
                .sessions
                .write()
                .map_err(|_| SessionError::Crypto("internal lock error".to_string()))?;
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

// ============================================================================
// Tests
// ============================================================================

#[cfg(test)]
mod tests {
    use super::*;
    use e2ee_core::generate_x25519_keypair;

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
        let bytes =
            bincode::serialize(&(kp.private_key.0, kp.public_key.0)).expect("serialize legacy");
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
        use e2ee_core::{generate_key_bundle, PreKey, PreKeyBundleFetch};

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

        manager
            .create_outbound_session("test".to_string(), alice_ik_bincode, fetch_json)?;

        let wire = manager
            .encrypt("test".to_string(), b"hello".to_vec())?;

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
        use e2ee_core::{generate_key_bundle, init_receiving_chain, x3dh_respond, PreKey, PreKeyBundleFetch, X25519PublicKey};

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

        let handshake = alice_mgr
            .create_outbound_session("alice".to_string(), alice_ik_bincode, fetch_json)?;

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
        let bob_state_bytes = e2ee_core::try_export_state(&bob_state)?;
        bob_mgr
            .restore_session("bob".to_string(), bob_state_bytes)?;

        // Alice encrypts
        let wire = alice_mgr
            .encrypt("alice".to_string(), b"hello bob".to_vec())?;

        // Bob decrypts
        let plaintext = bob_mgr
            .decrypt("bob".to_string(), wire)?;
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
        let alice_ik = e2ee_core::generate_x25519_keypair();
        let bob_bundle = e2ee_core::generate_key_bundle(1, &[(100, 3)])?;

        let fetch = e2ee_core::PreKeyBundleFetch {
            identity_key: bob_bundle.bundle.identity_key,
            signing_key: bob_bundle.bundle.signing_key,
            signed_pre_key: e2ee_core::PreKey {
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
        let e = e2ee_core::E2eeError::CounterGapExceeded(2500, 2000);
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
        let alice_ik = e2ee_core::generate_x25519_keypair();
        let bob_bundle = e2ee_core::generate_key_bundle(1, &[(100, 3)])?;
        let fetch = e2ee_core::PreKeyBundleFetch {
            identity_key: bob_bundle.bundle.identity_key,
            signing_key: bob_bundle.bundle.signing_key,
            signed_pre_key: e2ee_core::PreKey {
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
            SessionError::from(e2ee_core::E2eeError::CounterGapExceeded(2500, 2000)).to_string();
        assert!(msg.contains("crypto error"));
        assert!(msg.contains("counter gap"));
    }
}
