use std::collections::HashMap;
use wasm_bindgen::prelude::*;

use e2ee_core::{
    decode_ratchet_header, encode_ratchet_header, init_receiving_chain, init_sending_chain,
    ratchet_decrypt, ratchet_encrypt, restore_state, try_export_state, PreKeyBundleFetch,
    RatchetState, X25519KeyPair, X25519PrivateKey, X25519PublicKey,
};

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
fn decode_keypair(data: &[u8]) -> Result<X25519KeyPair, JsValue> {
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

    Err(JsValue::from_str("invalid keypair: corrupted or unknown format"))
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

impl Default for WasmSessionManager {
    fn default() -> Self {
        Self::new()
    }
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

        let state = init_sending_chain(&result.root_key, ikp.public_key, fetch.identity_key)
            .map_err(to_js_error)?;

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

        let result = e2ee_core::x3dh_respond_with_raw_otk(
            &ikp,
            &spkp,
            otk_pair.as_ref(),
            &remote_ik,
            &remote_ek,
        )
        .map_err(to_js_error)?;

        let state = init_receiving_chain(&result.root_key, ikp.public_key, remote_ik)
            .map_err(to_js_error)?;

        self.sessions.insert(session_id, state);
        Ok(())
    }

    /// Encrypt plaintext, returns wire format: header_len(4 BE) || RatchetHeader(52) || ciphertext
    pub fn encrypt(&mut self, session_id: String, plaintext: Vec<u8>) -> Result<Vec<u8>, JsValue> {
        let state = self
            .sessions
            .get_mut(&session_id)
            .ok_or_else(|| JsValue::from_str("session not found"))?;
        let (header, ciphertext) = ratchet_encrypt(state, &plaintext).map_err(to_js_error)?;
        let header_bytes = encode_ratchet_header(&header);
        let mut wire = Vec::with_capacity(4 + header_bytes.len() + ciphertext.len());
        wire.extend_from_slice(&52u32.to_be_bytes());
        wire.extend_from_slice(&header_bytes);
        wire.extend_from_slice(&ciphertext);
        Ok(wire)
    }

    /// Decrypt wire format back to plaintext
    pub fn decrypt(&mut self, session_id: String, encrypted: Vec<u8>) -> Result<Vec<u8>, JsValue> {
        if encrypted.len() < 4 {
            return Err(JsValue::from_str("encrypted data too short"));
        }
        let header_len =
            u32::from_be_bytes([encrypted[0], encrypted[1], encrypted[2], encrypted[3]]) as usize;
        if header_len != 52 {
            return Err(JsValue::from_str("invalid header length: expected 52"));
        }
        if encrypted.len() < 4 + header_len {
            return Err(JsValue::from_str("encrypted data truncated"));
        }
        let header_bytes = &encrypted[4..4 + header_len];
        let header: e2ee_core::RatchetHeader = decode_ratchet_header(header_bytes)
            .map_err(|e| JsValue::from_str(&format!("invalid header: {}", e)))?;
        let ciphertext = &encrypted[4 + header_len..];

        let state = self
            .sessions
            .get_mut(&session_id)
            .ok_or_else(|| JsValue::from_str("session not found"))?;
        ratchet_decrypt(state, &header, ciphertext).map_err(to_js_error)
    }

    /// Export session state as bincode bytes
    pub fn export_session(&self, session_id: String) -> Result<Vec<u8>, JsValue> {
        let state = self
            .sessions
            .get(&session_id)
            .ok_or_else(|| JsValue::from_str("session not found"))?;
        try_export_state(state).map_err(to_js_error)
    }

    /// Restore session from bincode bytes
    pub fn restore_session(
        &mut self,
        session_id: String,
        state_bincode: Vec<u8>,
    ) -> Result<(), JsValue> {
        let state = restore_state(&state_bincode).map_err(to_js_error)?;
        self.sessions.insert(session_id, state);
        Ok(())
    }

    /// Remove a session
    pub fn remove_session(&mut self, session_id: String) {
        self.sessions.remove(&session_id);
    }
}

// ============================================================================
// Tests
// ============================================================================

#[cfg(test)]
mod tests {
    use super::*;
    use e2ee_core::generate_x25519_keypair;
    use wasm_bindgen_test::*;

    // --- is_valid_x25519_keypair ---

    #[wasm_bindgen_test]
    fn valid_keypair_passes_validation() {
        let kp = generate_x25519_keypair();
        assert!(is_valid_x25519_keypair(&kp));
    }

    #[wasm_bindgen_test]
    fn mismatched_keypair_fails_validation() {
        let kp1 = generate_x25519_keypair();
        let kp2 = generate_x25519_keypair();
        let bad = X25519KeyPair {
            public_key: kp2.public_key,
            private_key: X25519PrivateKey(kp1.private_key.0),
        };
        assert!(!is_valid_x25519_keypair(&bad));
    }

    // --- decode_keypair ---

    #[wasm_bindgen_test]
    fn decode_core_bincode_format() {
        let kp = generate_x25519_keypair();
        // Core format: bincode::serialize(&X25519KeyPair) -> pub(32) || priv(32)
        let bytes = bincode::serialize(&kp).expect("serialize");
        let decoded = decode_keypair(&bytes).expect("decode core format");
        assert_eq!(decoded.public_key.0, kp.public_key.0);
        assert_eq!(decoded.private_key.0, kp.private_key.0);
    }

    #[wasm_bindgen_test]
    fn decode_legacy_tuple_format() {
        let kp = generate_x25519_keypair();
        // Legacy format: (private_bytes, public_bytes) tuple -> priv(32) || pub(32)
        let bytes =
            bincode::serialize(&(kp.private_key.0, kp.public_key.0)).expect("serialize legacy");
        let decoded = decode_keypair(&bytes).expect("decode legacy format");
        assert_eq!(decoded.public_key.0, kp.public_key.0);
        assert_eq!(decoded.private_key.0, kp.private_key.0);
    }

    #[wasm_bindgen_test]
    fn decode_corrupted_data_returns_error() {
        let corrupted = [0xAAu8; 64];
        let result = decode_keypair(&corrupted);
        assert!(result.is_err());
        let err_msg = result.err().and_then(|v| v.as_string()).unwrap_or_default();
        assert!(err_msg.contains("invalid keypair"));
    }

    #[wasm_bindgen_test]
    fn decode_wrong_length_returns_error() {
        let result = decode_keypair(&[1u8, 2, 3]);
        assert!(result.is_err());
    }

    #[wasm_bindgen_test]
    fn decode_empty_returns_error() {
        let result = decode_keypair(&[]);
        assert!(result.is_err());
    }

    #[wasm_bindgen_test]
    fn core_format_takes_priority_over_legacy() {
        let kp_core = generate_x25519_keypair();
        let core_bytes = bincode::serialize(&kp_core).expect("serialize core");
        let decoded = decode_keypair(&core_bytes).expect("decode");
        assert_eq!(decoded.public_key.0, kp_core.public_key.0);
        assert_eq!(decoded.private_key.0, kp_core.private_key.0);
    }

    // --- Wire format: header_len == 52 ---

    #[wasm_bindgen_test]
    fn encrypt_produces_header_len_52() {
        use e2ee_core::{generate_key_bundle, PreKey, PreKeyBundleFetch};

        let bob_bundle = generate_key_bundle(1, &[(100, 3)]).expect("generate bundle");
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
        let fetch_json = serde_json::to_string(&fetch).expect("serialize fetch");

        let mut manager = WasmSessionManager::new();
        let alice_ik_bincode = bincode::serialize(&alice_ik).expect("serialize ik");

        manager
            .create_outbound_session("test".to_string(), alice_ik_bincode, fetch_json)
            .expect("create session");

        let wire = manager
            .encrypt("test".to_string(), b"hello".to_vec())
            .expect("encrypt");

        // Verify header_len is 52 (0x00000034 in big-endian)
        assert_eq!(wire[0], 0x00);
        assert_eq!(wire[1], 0x00);
        assert_eq!(wire[2], 0x00);
        assert_eq!(wire[3], 0x34);
        assert_eq!(wire.len(), 4 + 52 + b"hello".len() + 16);
    }

    #[wasm_bindgen_test]
    fn encrypt_decrypt_roundtrip_wasm() {
        use e2ee_core::{generate_key_bundle, init_receiving_chain, x3dh_respond, PreKey, PreKeyBundleFetch, X25519PublicKey};

        let bob_bundle = generate_key_bundle(1, &[(100, 3)]).expect("generate bundle");
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
        let fetch_json = serde_json::to_string(&fetch).expect("serialize fetch");

        let mut alice_mgr = WasmSessionManager::new();
        let alice_ik_bincode = bincode::serialize(&alice_ik).expect("serialize ik");

        let handshake = alice_mgr
            .create_outbound_session("alice".to_string(), alice_ik_bincode, fetch_json)
            .expect("create alice");

        let mut ek_arr = [0u8; 32];
        ek_arr.copy_from_slice(&handshake[0..32]);
        let alice_ek = X25519PublicKey(ek_arr);

        let bob_otk = bob_bundle.one_time_pre_key_pairs.first().expect("otk");
        let bob_x3dh = x3dh_respond(
            &bob_bundle.identity_key_pair,
            &bob_bundle.signed_pre_key_pair,
            Some(bob_otk),
            &alice_ik.public_key,
            &alice_ek,
        )
        .expect("bob x3dh respond");

        let bob_state = init_receiving_chain(
            &bob_x3dh.root_key,
            bob_bundle.identity_key_pair.public_key,
            alice_ik.public_key,
        )
        .expect("bob init receiving");

        let bob_state_bytes = e2ee_core::try_export_state(&bob_state).expect("export bob state");
        let mut bob_mgr = WasmSessionManager::new();
        bob_mgr
            .restore_session("bob".to_string(), bob_state_bytes)
            .expect("restore bob");

        let wire = alice_mgr
            .encrypt("alice".to_string(), b"hello bob from wasm".to_vec())
            .expect("alice encrypt");

        let plaintext = bob_mgr
            .decrypt("bob".to_string(), wire)
            .expect("bob decrypt");
        assert_eq!(plaintext, b"hello bob from wasm");
    }
}
