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
        assert_eq!(wire.first(), Some(&0x00));
        assert_eq!(wire.get(1), Some(&0x00));
        assert_eq!(wire.get(2), Some(&0x00));
        assert_eq!(wire.get(3), Some(&0x34));
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

        let ek_bytes = handshake
            .get(0..32)
            .expect("handshake too short: cannot extract ephemeral key");
        let mut ek_arr = [0u8; 32];
        ek_arr.copy_from_slice(ek_bytes);
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

    // --- Error-path contract tests (run only with wasm-bindgen-test runner) ---

    /// restore_session with corrupted bincode returns an error.
    #[wasm_bindgen_test]
    fn restore_corrupted_state_fails() {
        let mut mgr = WasmSessionManager::new();

        let corrupted = vec![0xAAu8; 128];
        let result = mgr.restore_session("test".to_string(), corrupted);
        match result {
            Err(e) => {
                let msg = e
                    .as_string()
                    .unwrap_or_else(|| "unknown error".to_string());
                assert!(!msg.is_empty(), "error message should not be empty");
                assert!(
                    msg.contains("deserialization") || msg.contains("corrupted"),
                    "expected deserialization failure message, got: {msg}"
                );
            }
            Ok(()) => panic!("expected error for corrupted state, got Ok"),
        }
    }

    /// Decrypting a ciphertext with the wrong session must fail.
    #[wasm_bindgen_test]
    fn wrong_session_decrypt_fails() {
        use e2ee_core::{generate_key_bundle, PreKey, PreKeyBundleFetch};

        fn setup(
            mgr: &mut WasmSessionManager,
            alice_id: &str,
            bob_id: &str,
        ) {
            let bob_bundle = generate_key_bundle(1, &[(100, 1)]).expect("generate bundle");
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
            let alice_ik = generate_x25519_keypair();
            let alice_ik_bincode = bincode::serialize(&alice_ik).expect("serialize ik");
            let handshake = mgr
                .create_outbound_session(
                    alice_id.to_string(),
                    alice_ik_bincode,
                    fetch_json,
                )
                .expect("create outbound");
            let ek_bytes = &handshake[0..32];

            let bob_ik_bincode =
                bincode::serialize(&bob_bundle.identity_key_pair).expect("serialize ik");
            let bob_spk_bincode =
                bincode::serialize(&bob_bundle.signed_pre_key_pair).expect("serialize spk");
            let bob_otk = bob_bundle.one_time_pre_key_pairs.first().expect("otk");
            let bob_otk_bincode =
                bincode::serialize(&bob_otk.key_pair).expect("serialize otk");

            mgr.create_inbound_session(
                bob_id.to_string(),
                bob_ik_bincode,
                bob_spk_bincode,
                Some(bob_otk_bincode),
                alice_ik.public_key.0.to_vec(),
                ek_bytes.to_vec(),
            )
            .expect("create inbound");
        }

        let mut mgr = WasmSessionManager::new();

        setup(&mut mgr, "alice1", "bob1");
        setup(&mut mgr, "alice2", "bob2");

        // Encrypt with session 1
        let wire1 = mgr
            .encrypt("alice1".to_string(), b"secret for bob1".to_vec())
            .expect("encrypt alice1");

        // Try to decrypt with session 2's receiver — must fail
        let result = mgr.decrypt("bob2".to_string(), wire1);
        assert!(
            result.is_err(),
            "wrong session decryption MUST fail, but succeeded"
        );
    }
}

// ============================================================================
// Host tests — regular #[test] (not #[wasm_bindgen_test]) for cargo test
//
// These cover happy-path cross-layer session manager contracts through the
// WasmSessionManager API. They run on the host without a WASM runtime.
//
// Limitation: error-path tests (restore_corrupted_state, wrong_session_decrypt)
// cannot run as host tests because JsValue::from_str panics on non-wasm32
// targets. Those contracts are covered by the #[wasm_bindgen_test] tests below.
// ============================================================================

#[cfg(test)]
mod host_tests {
    use super::*;
    use e2ee_core::generate_x25519_keypair;

    fn js_err(e: JsValue) -> String {
        match e.as_string() {
            Some(s) => s,
            None => "unknown JS error".to_string(),
        }
    }

    /// Full X3DH handshake through both WASM APIs:
    /// create_outbound_session -> create_inbound_session -> encrypt -> decrypt
    #[test]
    fn create_inbound_session_via_api() -> Result<(), String> {
        use e2ee_core::{generate_key_bundle, PreKey, PreKeyBundleFetch};

        let bob_bundle =
            generate_key_bundle(1, &[(100, 1)]).map_err(|e| format!("generate_key_bundle: {e}"))?;

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
        let fetch_json =
            serde_json::to_string(&fetch).map_err(|e| format!("serialize fetch: {e}"))?;

        let alice_ik = generate_x25519_keypair();
        let alice_ik_bincode =
            bincode::serialize(&alice_ik).map_err(|e| format!("serialize alice_ik: {e}"))?;

        let mut mgr = WasmSessionManager::new();

        let handshake = mgr
            .create_outbound_session("alice".to_string(), alice_ik_bincode, fetch_json)
            .map_err(js_err)?;

        if handshake.len() < 40 {
            return Err(format!("handshake too short: {} bytes", handshake.len()));
        }
        let ek_bytes = &handshake[0..32];
        let alice_ek = ek_bytes.to_vec();

        let bob_ik_bincode = bincode::serialize(&bob_bundle.identity_key_pair)
            .map_err(|e| format!("serialize bob_ik: {e}"))?;
        let bob_spk_bincode = bincode::serialize(&bob_bundle.signed_pre_key_pair)
            .map_err(|e| format!("serialize bob_spk: {e}"))?;
        let bob_otk = bob_bundle
            .one_time_pre_key_pairs
            .first()
            .ok_or("missing OTK".to_string())?;
        let bob_otk_bincode = bincode::serialize(&bob_otk.key_pair)
            .map_err(|e| format!("serialize bob_otk: {e}"))?;

        mgr.create_inbound_session(
            "bob".to_string(),
            bob_ik_bincode,
            bob_spk_bincode,
            Some(bob_otk_bincode),
            alice_ik.public_key.0.to_vec(),
            alice_ek,
        )
        .map_err(js_err)?;

        let wire = mgr
            .encrypt("alice".to_string(), b"hello via WASM API".to_vec())
            .map_err(js_err)?;

        let plaintext = mgr.decrypt("bob".to_string(), wire).map_err(js_err)?;

        if plaintext != b"hello via WASM API" {
            return Err("plaintext mismatch".to_string());
        }

        Ok(())
    }

    /// Alice/Bob bidirectional: each sends at least one message that the other decrypts.
    #[test]
    fn alice_bob_bidirectional() -> Result<(), String> {
        use e2ee_core::{generate_key_bundle, PreKey, PreKeyBundleFetch};

        let bob_bundle =
            generate_key_bundle(1, &[(100, 1)]).map_err(|e| format!("generate_key_bundle: {e}"))?;

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
        let fetch_json =
            serde_json::to_string(&fetch).map_err(|e| format!("serialize fetch: {e}"))?;

        let alice_ik = generate_x25519_keypair();
        let alice_ik_bincode =
            bincode::serialize(&alice_ik).map_err(|e| format!("serialize alice_ik: {e}"))?;

        let mut mgr = WasmSessionManager::new();

        let handshake = mgr
            .create_outbound_session("alice".to_string(), alice_ik_bincode, fetch_json)
            .map_err(js_err)?;

        if handshake.len() < 40 {
            return Err(format!("handshake too short: {} bytes", handshake.len()));
        }
        let ek_bytes = &handshake[0..32];

        let bob_ik_bincode = bincode::serialize(&bob_bundle.identity_key_pair)
            .map_err(|e| format!("serialize bob_ik: {e}"))?;
        let bob_spk_bincode = bincode::serialize(&bob_bundle.signed_pre_key_pair)
            .map_err(|e| format!("serialize bob_spk: {e}"))?;
        let bob_otk = bob_bundle
            .one_time_pre_key_pairs
            .first()
            .ok_or("missing OTK".to_string())?;
        let bob_otk_bincode = bincode::serialize(&bob_otk.key_pair)
            .map_err(|e| format!("serialize bob_otk: {e}"))?;

        mgr.create_inbound_session(
            "bob".to_string(),
            bob_ik_bincode,
            bob_spk_bincode,
            Some(bob_otk_bincode),
            alice_ik.public_key.0.to_vec(),
            ek_bytes.to_vec(),
        )
        .map_err(js_err)?;

        // Alice -> Bob
        let wire_a1 = mgr
            .encrypt("alice".to_string(), b"hello bob".to_vec())
            .map_err(js_err)?;
        let pt_a1 = mgr.decrypt("bob".to_string(), wire_a1).map_err(js_err)?;
        if pt_a1 != b"hello bob" {
            return Err("alice->bob plaintext mismatch".to_string());
        }

        // Bob -> Alice (reply)
        let wire_b1 = mgr
            .encrypt("bob".to_string(), b"hello alice".to_vec())
            .map_err(js_err)?;
        let pt_b1 = mgr.decrypt("alice".to_string(), wire_b1).map_err(js_err)?;
        if pt_b1 != b"hello alice" {
            return Err("bob->alice plaintext mismatch".to_string());
        }

        Ok(())
    }

    /// export_session -> remove_session -> restore_session -> continue encrypt/decrypt.
    ///
    /// Note: the intermediate "verify session is gone after remove" step is
    /// omitted here because JsValue::from_str panics on non-wasm32 targets.
    /// Full error-path coverage is in the wasm_bindgen_test module.
    #[test]
    fn export_restore_then_continue() -> Result<(), String> {
        use e2ee_core::{generate_key_bundle, PreKey, PreKeyBundleFetch};

        let bob_bundle =
            generate_key_bundle(1, &[(100, 1)]).map_err(|e| format!("generate_key_bundle: {e}"))?;

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
        let fetch_json =
            serde_json::to_string(&fetch).map_err(|e| format!("serialize fetch: {e}"))?;

        let alice_ik = generate_x25519_keypair();
        let alice_ik_bincode =
            bincode::serialize(&alice_ik).map_err(|e| format!("serialize alice_ik: {e}"))?;

        let mut mgr = WasmSessionManager::new();

        let handshake = mgr
            .create_outbound_session("alice".to_string(), alice_ik_bincode, fetch_json)
            .map_err(js_err)?;

        if handshake.len() < 40 {
            return Err(format!("handshake too short: {} bytes", handshake.len()));
        }
        let ek_bytes = &handshake[0..32];

        let bob_ik_bincode = bincode::serialize(&bob_bundle.identity_key_pair)
            .map_err(|e| format!("serialize bob_ik: {e}"))?;
        let bob_spk_bincode = bincode::serialize(&bob_bundle.signed_pre_key_pair)
            .map_err(|e| format!("serialize bob_spk: {e}"))?;
        let bob_otk = bob_bundle
            .one_time_pre_key_pairs
            .first()
            .ok_or("missing OTK".to_string())?;
        let bob_otk_bincode = bincode::serialize(&bob_otk.key_pair)
            .map_err(|e| format!("serialize bob_otk: {e}"))?;

        mgr.create_inbound_session(
            "bob".to_string(),
            bob_ik_bincode,
            bob_spk_bincode,
            Some(bob_otk_bincode),
            alice_ik.public_key.0.to_vec(),
            ek_bytes.to_vec(),
        )
        .map_err(js_err)?;

        // Alice encrypts
        let wire1 = mgr
            .encrypt("alice".to_string(), b"before export".to_vec())
            .map_err(js_err)?;

        // Export Alice's state
        let alice_state = mgr.export_session("alice".to_string()).map_err(js_err)?;
        if alice_state.is_empty() {
            return Err("exported state is empty".to_string());
        }

        // Remove and restore Alice's session
        mgr.remove_session("alice".to_string());
        mgr.restore_session("alice".to_string(), alice_state)
            .map_err(js_err)?;

        // Alice encrypts again after restore
        let wire2 = mgr
            .encrypt("alice".to_string(), b"after restore".to_vec())
            .map_err(js_err)?;

        // Bob decrypts both messages
        let pt1 = mgr.decrypt("bob".to_string(), wire1).map_err(js_err)?;
        if pt1 != b"before export" {
            return Err("plaintext1 mismatch".to_string());
        }
        let pt2 = mgr.decrypt("bob".to_string(), wire2).map_err(js_err)?;
        if pt2 != b"after restore" {
            return Err("plaintext2 mismatch".to_string());
        }

        Ok(())
    }

    /// Encrypted wire format: first 4 bytes = header_len BE == 52, ciphertext non-empty.
    #[test]
    fn encrypted_wire_format_header_and_ciphertext() -> Result<(), String> {
        use e2ee_core::{generate_key_bundle, PreKey, PreKeyBundleFetch};

        let bob_bundle =
            generate_key_bundle(1, &[(100, 1)]).map_err(|e| format!("generate_key_bundle: {e}"))?;

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
        let fetch_json =
            serde_json::to_string(&fetch).map_err(|e| format!("serialize fetch: {e}"))?;

        let alice_ik = generate_x25519_keypair();
        let alice_ik_bincode =
            bincode::serialize(&alice_ik).map_err(|e| format!("serialize alice_ik: {e}"))?;

        let mut mgr = WasmSessionManager::new();
        mgr.create_outbound_session("alice".to_string(), alice_ik_bincode, fetch_json)
            .map_err(js_err)?;

        let wire = mgr
            .encrypt("alice".to_string(), b"wire format test".to_vec())
            .map_err(js_err)?;

        if wire.len() < 4 {
            return Err("wire too short: missing header_len prefix".to_string());
        }
        let header_len = u32::from_be_bytes([wire[0], wire[1], wire[2], wire[3]]) as usize;
        if header_len != 52 {
            return Err(format!("expected header_len=52, got {header_len}"));
        }

        if wire.len() <= 4 + 52 {
            return Err(
                "ciphertext is empty (wire too short for header + tag)".to_string(),
            );
        }
        let ciphertext_len = wire.len() - 4 - 52;
        if ciphertext_len < 16 {
            return Err(format!(
                "ciphertext too short: {ciphertext_len} bytes",
            ));
        }

        Ok(())
    }

    /// Multiple sessions in a single HashMap, no cross-contamination.
    #[test]
    fn multi_session_no_cross_pollution() -> Result<(), String> {
        use e2ee_core::{generate_key_bundle, PreKey, PreKeyBundleFetch};

        fn setup_session(
            mgr: &mut WasmSessionManager,
            alice_id: &str,
            bob_id: &str,
        ) -> Result<(), String> {
            let bob_bundle = generate_key_bundle(1, &[(100, 1)])
                .map_err(|e| format!("generate_key_bundle: {e}"))?;

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
            let fetch_json =
                serde_json::to_string(&fetch).map_err(|e| format!("serialize fetch: {e}"))?;

            let alice_ik = generate_x25519_keypair();
            let alice_ik_bincode =
                bincode::serialize(&alice_ik).map_err(|e| format!("serialize alice_ik: {e}"))?;

            let handshake = mgr
                .create_outbound_session(
                    alice_id.to_string(),
                    alice_ik_bincode,
                    fetch_json,
                )
                .map_err(js_err)?;

            if handshake.len() < 40 {
                return Err(format!("handshake too short: {} bytes", handshake.len()));
            }
            let ek_bytes = &handshake[0..32];

            let bob_ik_bincode = bincode::serialize(&bob_bundle.identity_key_pair)
                .map_err(|e| format!("serialize bob_ik: {e}"))?;
            let bob_spk_bincode = bincode::serialize(&bob_bundle.signed_pre_key_pair)
                .map_err(|e| format!("serialize bob_spk: {e}"))?;
            let bob_otk = bob_bundle
                .one_time_pre_key_pairs
                .first()
                .ok_or("missing OTK".to_string())?;
            let bob_otk_bincode = bincode::serialize(&bob_otk.key_pair)
                .map_err(|e| format!("serialize bob_otk: {e}"))?;

            mgr.create_inbound_session(
                bob_id.to_string(),
                bob_ik_bincode,
                bob_spk_bincode,
                Some(bob_otk_bincode),
                alice_ik.public_key.0.to_vec(),
                ek_bytes.to_vec(),
            )
            .map_err(js_err)?;

            Ok(())
        }

        let mut mgr = WasmSessionManager::new();

        setup_session(&mut mgr, "alice1", "bob1")?;
        setup_session(&mut mgr, "alice2", "bob2")?;

        // Interleaved encrypt
        let a1 = mgr
            .encrypt("alice1".to_string(), b"A1 msg".to_vec())
            .map_err(js_err)?;
        let a2 = mgr
            .encrypt("alice2".to_string(), b"A2 msg".to_vec())
            .map_err(js_err)?;
        let a1b = mgr
            .encrypt("alice1".to_string(), b"A1 msg2".to_vec())
            .map_err(js_err)?;

        // Decrypt each with correct receiver
        let p1 = mgr.decrypt("bob1".to_string(), a1).map_err(js_err)?;
        if p1 != b"A1 msg" {
            return Err("bob1 a1 plaintext mismatch".to_string());
        }

        let p2 = mgr.decrypt("bob2".to_string(), a2).map_err(js_err)?;
        if p2 != b"A2 msg" {
            return Err("bob2 a2 plaintext mismatch".to_string());
        }

        let p1b = mgr.decrypt("bob1".to_string(), a1b).map_err(js_err)?;
        if p1b != b"A1 msg2" {
            return Err("bob1 a1b plaintext mismatch".to_string());
        }

        Ok(())
    }
}
