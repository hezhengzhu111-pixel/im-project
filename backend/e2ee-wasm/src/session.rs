use std::collections::HashMap;
use wasm_bindgen::prelude::*;

use e2ee_core::{
    init_receiving_chain, init_sending_chain,
    ratchet_encrypt, ratchet_decrypt,
    export_state, restore_state,
    RatchetState, PreKeyBundleFetch, PreKey,
    X25519KeyPair, X25519PublicKey, X25519PrivateKey,
};

fn decode_keypair(bincode: &[u8]) -> Result<X25519KeyPair, JsValue> {
    let (priv_bytes, pub_bytes): ([u8; 32], [u8; 32]) = bincode::deserialize(bincode)
        .map_err(|e| JsValue::from_str(&format!("invalid keypair: {}", e)))?;
    Ok(X25519KeyPair {
        public_key: X25519PublicKey(pub_bytes),
        private_key: X25519PrivateKey(priv_bytes),
    })
}

fn decode_public_key(bytes: &[u8]) -> Result<X25519PublicKey, JsValue> {
    if bytes.len() != 32 {
        return Err(JsValue::from_str("invalid public key length"));
    }
    let mut key = [0u8; 32];
    key.copy_from_slice(bytes);
    Ok(X25519PublicKey(key))
}

fn to_js_error(e: e2ee_core::E2eeError) -> JsValue {
    JsValue::from_str(&e.to_string())
}

#[wasm_bindgen]
pub struct WasmSessionManager {
    sessions: HashMap<String, RatchetState>,
}

#[wasm_bindgen]
impl WasmSessionManager {
    #[wasm_bindgen(constructor)]
    pub fn new() -> Self {
        Self {
            sessions: HashMap::new(),
        }
    }

    /// Create an outbound session (Alice side).
    /// Returns handshake bytes: ephemeral_pk(32) || spk_id(4 BE) || otk_id(4 BE)
    pub fn create_outbound_session(
        &mut self,
        session_id: String,
        identity_key_pair_bincode: Vec<u8>,
        remote_bundle_json: String,
    ) -> Result<Vec<u8>, JsValue> {
        let ikp = decode_keypair(&identity_key_pair_bincode)?;
        let fetch: PreKeyBundleFetch = serde_json::from_str(&remote_bundle_json)
            .map_err(|e| JsValue::from_str(&format!("invalid bundle JSON: {}", e)))?;

        let result = e2ee_core::x3dh_initiate(&ikp, &fetch).map_err(to_js_error)?;

        let state = init_sending_chain(
            &result.root_key,
            ikp.public_key,
            fetch.identity_key,
        ).map_err(to_js_error)?;

        self.sessions.insert(session_id, state);

        let mut handshake = Vec::with_capacity(40);
        handshake.extend_from_slice(&result.ephemeral_public_key.0);
        handshake.extend_from_slice(&result.spk_id.to_be_bytes());
        handshake.extend_from_slice(&result.otk_id.unwrap_or(0xFFFFFFFF).to_be_bytes());
        Ok(handshake)
    }

    /// Create an inbound session (Bob side).
    pub fn create_inbound_session(
        &mut self,
        session_id: String,
        identity_key_pair_bincode: Vec<u8>,
        signed_pre_key_pair_bincode: Vec<u8>,
        one_time_pre_key_pair_bincode: Option<Vec<u8>>,
        remote_identity_key_bytes: Vec<u8>,
        remote_ephemeral_key_bytes: Vec<u8>,
    ) -> Result<(), JsValue> {
        let ikp = decode_keypair(&identity_key_pair_bincode)?;
        let spkp = decode_keypair(&signed_pre_key_pair_bincode)?;
        let otk_pair = one_time_pre_key_pair_bincode
            .map(|bytes| decode_keypair(&bytes))
            .transpose()?;
        let remote_ik = decode_public_key(&remote_identity_key_bytes)?;
        let remote_ek = decode_public_key(&remote_ephemeral_key_bytes)?;

        let result = e2ee_core::x3dh_respond(
            &ikp, &spkp, otk_pair.as_ref(),
            &remote_ik, &remote_ek,
        ).map_err(to_js_error)?;

        let state = init_receiving_chain(
            &result.root_key, ikp.public_key, remote_ik,
        ).map_err(to_js_error)?;

        self.sessions.insert(session_id, state);
        Ok(())
    }

    /// Encrypt plaintext, returns wire format: header_len(4 BE) || bincode(header) || ciphertext
    pub fn encrypt(&mut self, session_id: String, plaintext: Vec<u8>) -> Result<Vec<u8>, JsValue> {
        let state = self.sessions.get_mut(&session_id)
            .ok_or_else(|| JsValue::from_str("session not found"))?;
        let (header, ciphertext) = ratchet_encrypt(state, &plaintext).map_err(to_js_error)?;
        let header_bytes = bincode::serialize(&header).unwrap_or_default();
        let mut wire = Vec::with_capacity(4 + header_bytes.len() + ciphertext.len());
        wire.extend_from_slice(&(header_bytes.len() as u32).to_be_bytes());
        wire.extend_from_slice(&header_bytes);
        wire.extend_from_slice(&ciphertext);
        Ok(wire)
    }

    /// Decrypt wire format back to plaintext
    pub fn decrypt(&mut self, session_id: String, encrypted: Vec<u8>) -> Result<Vec<u8>, JsValue> {
        if encrypted.len() < 4 {
            return Err(JsValue::from_str("encrypted data too short"));
        }
        let header_len = u32::from_be_bytes([encrypted[0], encrypted[1], encrypted[2], encrypted[3]]) as usize;
        if encrypted.len() < 4 + header_len {
            return Err(JsValue::from_str("encrypted data truncated"));
        }
        let header_bytes = &encrypted[4..4 + header_len];
        let header: e2ee_core::RatchetHeader = bincode::deserialize(header_bytes)
            .map_err(|e| JsValue::from_str(&format!("invalid header: {}", e)))?;
        let ciphertext = &encrypted[4 + header_len..];

        let state = self.sessions.get_mut(&session_id)
            .ok_or_else(|| JsValue::from_str("session not found"))?;
        ratchet_decrypt(state, &header, ciphertext).map_err(to_js_error)
    }

    /// Export session state as bincode bytes
    pub fn export_session(&self, session_id: String) -> Result<Vec<u8>, JsValue> {
        let state = self.sessions.get(&session_id)
            .ok_or_else(|| JsValue::from_str("session not found"))?;
        Ok(export_state(state))
    }

    /// Restore session from bincode bytes
    pub fn restore_session(&mut self, session_id: String, state_bincode: Vec<u8>) -> Result<(), JsValue> {
        let state = restore_state(&state_bincode).map_err(to_js_error)?;
        self.sessions.insert(session_id, state);
        Ok(())
    }

    /// Remove a session
    pub fn remove_session(&mut self, session_id: String) {
        self.sessions.remove(&session_id);
    }
}
