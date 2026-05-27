//! E2EE session manager — bridges the `e2ee-core` crate to Tauri commands.
//!
//! Manages per-session `RatchetState` instances keyed by session ID.
//! Thread-safe via `Mutex<HashMap<...>>`.

use std::collections::HashMap;
use std::sync::Mutex;

use e2ee_core::{
    decode_ratchet_header, encode_ratchet_header, export_state, generate_ed25519_keypair,
    generate_key_bundle, generate_x25519_keypair, init_receiving_chain, init_sending_chain,
    restore_state, ratchet_decrypt, ratchet_encrypt, x3dh_initiate, x3dh_respond_with_raw_otk,
    Ed25519KeyPair, E2eeError, PreKeyBundleFetch, RatchetHeader, RatchetState, X25519KeyPair,
};

/// E2EE session manager holding all active ratchet sessions.
pub struct E2eeManager {
    sessions: Mutex<HashMap<String, RatchetState>>,
}

impl E2eeManager {
    pub fn new() -> Self {
        Self {
            sessions: Mutex::new(HashMap::new()),
        }
    }

    // -- Key generation -------------------------------------------------------

    /// Generate a fresh X25519 identity key pair.
    #[allow(dead_code)]
    pub fn generate_x25519_keypair(&self) -> X25519KeyPair {
        generate_x25519_keypair()
    }

    /// Generate a fresh Ed25519 signing key pair.
    #[allow(dead_code)]
    pub fn generate_ed25519_keypair(&self) -> Result<Ed25519KeyPair, E2eeError> {
        generate_ed25519_keypair()
    }

    /// Generate a complete key bundle (identity + signing + SPK + OTKs).
    pub fn generate_key_bundle(
        &self,
        spk_id: u32,
        otk_ranges: &[(u32, u32)],
    ) -> Result<e2ee_core::KeyBundle, E2eeError> {
        generate_key_bundle(spk_id, otk_ranges)
    }

    // -- Outbound session (Alice side) ----------------------------------------

    /// Create an outbound session via X3DH initiation.
    ///
    /// Returns the 40-byte handshake bytes to send to the peer:
    /// `ephemeral_pk(32) || spk_id(4 BE) || otk_id(4 BE)`
    pub fn create_outbound_session(
        &self,
        session_id: &str,
        identity_key_pair: &X25519KeyPair,
        remote_bundle: &PreKeyBundleFetch,
    ) -> Result<Vec<u8>, String> {
        let initiate_result = x3dh_initiate(identity_key_pair, remote_bundle)
            .map_err(|e| e.to_string())?;

        let state = init_sending_chain(
            &initiate_result.root_key,
            identity_key_pair.public_key,
            remote_bundle.identity_key,
        )
        .map_err(|e| e.to_string())?;

        // Build 40-byte handshake: ephemeral_pk(32) || spk_id(4) || otk_id(4)
        let mut handshake = Vec::with_capacity(40);
        handshake.extend_from_slice(&initiate_result.ephemeral_public_key.0);
        handshake.extend_from_slice(&initiate_result.spk_id.to_be_bytes());
        match initiate_result.otk_id {
            Some(id) => handshake.extend_from_slice(&id.to_be_bytes()),
            None => handshake.extend_from_slice(&0xffffffff_u32.to_be_bytes()),
        }

        self.sessions
            .lock()
            .map_err(|e| e.to_string())?
            .insert(session_id.to_string(), state);

        Ok(handshake)
    }

    // -- Inbound session (Bob side) -------------------------------------------

    /// Create an inbound session by processing a handshake from the peer.
    ///
    /// `handshake` must be the 40-byte array: `ephemeral_pk(32) || spk_id(4) || otk_id(4)`
    pub fn create_inbound_session(
        &self,
        session_id: &str,
        identity_key_pair_bincode: &[u8],
        signed_pre_key_pair_bincode: &[u8],
        one_time_pre_key_pair_bincode: Option<&[u8]>,
        remote_identity_key: &[u8; 32],
        handshake: &[u8],
    ) -> Result<(), String> {
        if handshake.len() != 40 {
            return Err("handshake must be exactly 40 bytes".to_string());
        }

        let ik: X25519KeyPair =
            bincode::deserialize(identity_key_pair_bincode).map_err(|e| e.to_string())?;
        let spk: X25519KeyPair =
            bincode::deserialize(signed_pre_key_pair_bincode).map_err(|e| e.to_string())?;

        let otk: Option<X25519KeyPair> = one_time_pre_key_pair_bincode
            .map(|bytes| bincode::deserialize(bytes))
            .transpose()
            .map_err(|e| e.to_string())?;

        let remote_id = e2ee_core::X25519PublicKey(*remote_identity_key);

        // Parse handshake
        let ephemeral_bytes: [u8; 32] = handshake[..32]
            .try_into()
            .map_err(|_| "invalid handshake".to_string())?;
        let ephemeral_pk = e2ee_core::X25519PublicKey(ephemeral_bytes);

        let spk_id_bytes: [u8; 4] = handshake[32..36]
            .try_into()
            .map_err(|_| "invalid handshake".to_string())?;
        let _spk_id = u32::from_be_bytes(spk_id_bytes);

        let otk_id_bytes: [u8; 4] = handshake[36..40]
            .try_into()
            .map_err(|_| "invalid handshake".to_string())?;
        let otk_id = u32::from_be_bytes(otk_id_bytes);
        let _otk_id_opt = if otk_id == 0xffffffff {
            None
        } else {
            Some(otk_id)
        };

        let respond_result = x3dh_respond_with_raw_otk(
            &ik,
            &spk,
            otk.as_ref(),
            &remote_id,
            &ephemeral_pk,
        )
        .map_err(|e| e.to_string())?;

        let state = init_receiving_chain(
            &respond_result.root_key,
            ik.public_key,
            remote_id,
        )
        .map_err(|e| e.to_string())?;

        self.sessions
            .lock()
            .map_err(|e| e.to_string())?
            .insert(session_id.to_string(), state);

        Ok(())
    }

    // -- Encrypt / Decrypt ----------------------------------------------------

    /// Encrypt plaintext. Returns `header(4 + 52 bytes) || ciphertext`.
    pub fn encrypt(&self, session_id: &str, plaintext: &[u8]) -> Result<Vec<u8>, String> {
        let mut sessions = self.sessions.lock().map_err(|e| e.to_string())?;
        let state = sessions
            .get_mut(session_id)
            .ok_or_else(|| format!("session not found: {}", session_id))?;

        let (header, ciphertext) =
            ratchet_encrypt(state, plaintext).map_err(|e| e.to_string())?;
        Ok(Self::encode_wire(&header, &ciphertext))
    }

    /// Decrypt wire-format bytes (`header(4 + 52) || ciphertext`).
    pub fn decrypt(&self, session_id: &str, wire: &[u8]) -> Result<Vec<u8>, String> {
        let mut sessions = self.sessions.lock().map_err(|e| e.to_string())?;
        let state = sessions
            .get_mut(session_id)
            .ok_or_else(|| format!("session not found: {}", session_id))?;

        let (header, ciphertext) = Self::decode_wire(wire)?;
        ratchet_decrypt(state, &header, &ciphertext).map_err(|e| e.to_string())
    }

    // -- Session management ---------------------------------------------------

    /// Remove a session from the in-memory store.
    pub fn remove_session(&self, session_id: &str) -> Result<(), String> {
        self.sessions
            .lock()
            .map_err(|e| e.to_string())?
            .remove(session_id);
        Ok(())
    }

    // -- Session persistence --------------------------------------------------

    /// Export session state as bincode bytes.
    pub fn export_session(&self, session_id: &str) -> Result<Vec<u8>, String> {
        let sessions = self.sessions.lock().map_err(|e| e.to_string())?;
        let state = sessions
            .get(session_id)
            .ok_or_else(|| format!("session not found: {}", session_id))?;
        Ok(export_state(state))
    }

    /// Import session state from bincode bytes.
    pub fn import_session(&self, session_id: &str, data: &[u8]) -> Result<(), String> {
        let state = restore_state(data).map_err(|e| e.to_string())?;
        self.sessions
            .lock()
            .map_err(|e| e.to_string())?
            .insert(session_id.to_string(), state);
        Ok(())
    }

    // -- Wire format helpers --------------------------------------------------

    /// Encode a ratchet header + ciphertext into the wire format:
    /// `header_len(4 BE) || header(52) || ciphertext`
    fn encode_wire(header: &RatchetHeader, ciphertext: &[u8]) -> Vec<u8> {
        let header_bytes = encode_ratchet_header(header);
        let header_len = header_bytes.len() as u32;
        let mut wire = Vec::with_capacity(4 + header_bytes.len() + ciphertext.len());
        wire.extend_from_slice(&header_len.to_be_bytes());
        wire.extend_from_slice(&header_bytes);
        wire.extend_from_slice(ciphertext);
        wire
    }

    /// Decode wire format bytes into a `(RatchetHeader, ciphertext)` pair.
    fn decode_wire(wire: &[u8]) -> Result<(RatchetHeader, Vec<u8>), String> {
        if wire.len() < 4 {
            return Err("wire too short: missing header length".to_string());
        }
        let header_len = u32::from_be_bytes([
            wire[0], wire[1], wire[2], wire[3],
        ]) as usize;
        if wire.len() < 4 + header_len {
            return Err("wire too short: header truncated".to_string());
        }
        if header_len == 0 || wire.len() <= 4 + header_len {
            return Err("wire too short: missing ciphertext".to_string());
        }
        let header_bytes = &wire[4..4 + header_len];
        let header =
            decode_ratchet_header(header_bytes).map_err(|e| format!("invalid header: {}", e))?;
        let ciphertext = wire[4 + header_len..].to_vec();
        Ok((header, ciphertext))
    }
}

impl Default for E2eeManager {
    fn default() -> Self {
        Self::new()
    }
}
