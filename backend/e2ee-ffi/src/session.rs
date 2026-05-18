use std::collections::HashMap;
use std::sync::{Mutex, RwLock};

use e2ee_core::{
    export_state, init_receiving_chain, init_sending_chain, ratchet_decrypt, ratchet_encrypt,
    restore_state, PreKeyBundleFetch, RatchetState, X25519KeyPair, X25519PrivateKey,
    X25519PublicKey,
};

// ============================================================================
// SessionError — flat FFI-safe error enum (matches UDL)
// ============================================================================

#[derive(Debug, thiserror::Error)]
pub enum SessionError {
    #[error("session not found")]
    SessionNotFound,
    #[error("session already exists")]
    SessionAlreadyExists,
    #[error("invalid session state data")]
    InvalidStateData,
    #[error("crypto error")]
    Crypto,
}

impl From<e2ee_core::E2eeError> for SessionError {
    fn from(_e: e2ee_core::E2eeError) -> Self {
        SessionError::Crypto
    }
}

// ============================================================================
// Internal Helpers
// ============================================================================

/// Decode an X25519KeyPair from bincode-encoded (private_bytes, public_bytes) tuple (64 bytes).
fn decode_keypair(bincode: &[u8]) -> Result<X25519KeyPair, SessionError> {
    let (priv_bytes, pub_bytes): ([u8; 32], [u8; 32]) =
        bincode::deserialize(bincode).map_err(|_| SessionError::InvalidStateData)?;
    Ok(X25519KeyPair {
        public_key: X25519PublicKey(pub_bytes),
        private_key: X25519PrivateKey(priv_bytes),
    })
}

/// Decode an X25519PublicKey from raw 32 bytes.
fn decode_public_key(bytes: &[u8]) -> Result<X25519PublicKey, SessionError> {
    if bytes.len() != 32 {
        return Err(SessionError::InvalidStateData);
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
            let sessions = self.sessions.read().map_err(|_| SessionError::Crypto)?;
            if sessions.contains_key(&session_id) {
                return Err(SessionError::SessionAlreadyExists);
            }
        }

        let ikp = decode_keypair(&identity_key_pair_bincode)?;
        let fetch: PreKeyBundleFetch =
            serde_json::from_str(&remote_bundle_json).map_err(|_| SessionError::Crypto)?;

        let result = e2ee_core::x3dh_initiate(&ikp, &fetch)?;

        let state = init_sending_chain(&result.root_key, ikp.public_key, fetch.identity_key)?;

        // Insert session (write lock)
        {
            let mut sessions = self.sessions.write().map_err(|_| SessionError::Crypto)?;
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
            let sessions = self.sessions.read().map_err(|_| SessionError::Crypto)?;
            if sessions.contains_key(&session_id) {
                return Err(SessionError::SessionAlreadyExists);
            }
        }

        let ikp = decode_keypair(&identity_key_pair_bincode)?;
        let spkp = decode_keypair(&signed_pre_key_pair_bincode)?;

        let otk_pair = one_time_pre_key_pair_bincode
            .map(|bytes| decode_keypair(&bytes))
            .transpose()?;

        let remote_ik = decode_public_key(&remote_identity_key_bytes)?;
        let remote_ek = decode_public_key(&remote_ephemeral_key_bytes)?;

        let result =
            e2ee_core::x3dh_respond(&ikp, &spkp, otk_pair.as_ref(), &remote_ik, &remote_ek)?;

        let state = init_receiving_chain(&result.root_key, ikp.public_key, remote_ik)?;

        {
            let mut sessions = self.sessions.write().map_err(|_| SessionError::Crypto)?;
            sessions.insert(session_id, Mutex::new(state));
        }
        Ok(())
    }

    /// Encrypt plaintext for a session.
    ///
    /// Returns wire-format: header_len(4 BE) || bincode(header, ~52) || ciphertext
    pub fn encrypt(&self, session_id: String, plaintext: Vec<u8>) -> Result<Vec<u8>, SessionError> {
        let sessions = self.sessions.read().map_err(|_| SessionError::Crypto)?;
        let mutex = sessions
            .get(&session_id)
            .ok_or(SessionError::SessionNotFound)?;
        let mut state = mutex.lock().map_err(|_| SessionError::Crypto)?;

        let (header, ciphertext) = ratchet_encrypt(&mut state, &plaintext)?;

        let header_bytes = bincode::serialize(&header).unwrap_or_default();
        let mut wire = Vec::with_capacity(4 + header_bytes.len() + ciphertext.len());
        wire.extend_from_slice(&(header_bytes.len() as u32).to_be_bytes());
        wire.extend_from_slice(&header_bytes);
        wire.extend_from_slice(&ciphertext);
        Ok(wire)
    }

    /// Decrypt a wire-format message for a session.
    pub fn decrypt(&self, session_id: String, encrypted: Vec<u8>) -> Result<Vec<u8>, SessionError> {
        if encrypted.len() < 4 {
            return Err(SessionError::Crypto);
        }
        let header_len =
            u32::from_be_bytes([encrypted[0], encrypted[1], encrypted[2], encrypted[3]]) as usize;
        if encrypted.len() < 4 + header_len {
            return Err(SessionError::Crypto);
        }
        let header_bytes = &encrypted[4..4 + header_len];
        let header: e2ee_core::RatchetHeader =
            bincode::deserialize(header_bytes).map_err(|_| SessionError::Crypto)?;
        let ciphertext = &encrypted[4 + header_len..];

        let sessions = self.sessions.read().map_err(|_| SessionError::Crypto)?;
        let mutex = sessions
            .get(&session_id)
            .ok_or(SessionError::SessionNotFound)?;
        let mut state = mutex.lock().map_err(|_| SessionError::Crypto)?;

        ratchet_decrypt(&mut state, &header, ciphertext).map_err(SessionError::from)
    }

    /// Export a session's state as bincode bytes for persistence.
    pub fn export_session(&self, session_id: String) -> Result<Vec<u8>, SessionError> {
        let sessions = self.sessions.read().map_err(|_| SessionError::Crypto)?;
        let mutex = sessions
            .get(&session_id)
            .ok_or(SessionError::SessionNotFound)?;
        let state = mutex.lock().map_err(|_| SessionError::Crypto)?;
        Ok(export_state(&state))
    }

    /// Restore a previously exported session state.
    pub fn restore_session(
        &self,
        session_id: String,
        state_bincode: Vec<u8>,
    ) -> Result<(), SessionError> {
        let state = restore_state(&state_bincode)?;
        let mut sessions = self.sessions.write().map_err(|_| SessionError::Crypto)?;
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
