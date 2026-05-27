//! Tauri commands bridging the E2EE session manager to the frontend.

use tauri::State;

use crate::e2ee::E2eeManager;

/// Generate a fresh identity key bundle.
///
/// Returns JSON containing bincode-serialized key pairs and the public bundle.
#[tauri::command]
pub async fn e2ee_generate_key_bundle(
    manager: State<'_, E2eeManager>,
    signed_pre_key_id: u32,
    one_time_pre_key_start_id: u32,
    one_time_pre_key_count: u32,
) -> Result<serde_json::Value, String> {
    let bundle = manager
        .generate_key_bundle(signed_pre_key_id, &[(one_time_pre_key_start_id, one_time_pre_key_count)])
        .map_err(|e| e.to_string())?;

    let identity_kp_bincode =
        bincode::serialize(&bundle.identity_key_pair).map_err(|e| e.to_string())?;
    // Ed25519KeyPair doesn't derive Serialize; manually pack public(32) || private(32)
    let mut signing_kp_bincode = Vec::with_capacity(64);
    signing_kp_bincode.extend_from_slice(&bundle.signing_key_pair.public_key.0);
    signing_kp_bincode.extend_from_slice(&bundle.signing_key_pair.private_key.0);
    let spk_bincode =
        bincode::serialize(&bundle.signed_pre_key_pair).map_err(|e| e.to_string())?;

    let mut otk_pairs = Vec::new();
    for otk in &bundle.one_time_pre_key_pairs {
        let kp_bincode =
            bincode::serialize(&otk.key_pair).map_err(|e| e.to_string())?;
        otk_pairs.push(serde_json::json!({
            "id": otk.id,
            "keyPairBincode": kp_bincode,
            "publicKey": otk.key_pair.public_key.0.to_vec(),
        }));
    }

    Ok(serde_json::json!({
        "version": 2,
        "identityKeyPairBincode": identity_kp_bincode,
        "signedPreKeyPairBincode": spk_bincode,
        "signingKeyPairBincode": signing_kp_bincode,
        "oneTimePreKeyPairs": otk_pairs,
        "publicBundle": {
            "identityKey": bundle.bundle.identity_key.0.to_vec(),
            "signingKey": bundle.bundle.signing_key.0.to_vec(),
            "signedPreKey": {
                "id": bundle.spk_id,
                "key": bundle.bundle.signed_pre_key.0.to_vec(),
            },
            "signedPreKeySignature": bundle.bundle.signed_pre_key_signature.0.to_vec(),
            "oneTimePreKeys": bundle.bundle.one_time_pre_keys.iter().map(|pk| {
                serde_json::json!({
                    "id": pk.id,
                    "key": pk.key.0.to_vec(),
                })
            }).collect::<Vec<_>>(),
        },
    }))
}

/// Create an outbound session (Alice side) via X3DH.
///
/// Returns 40-byte handshake bytes to send to the peer.
#[tauri::command]
pub async fn e2ee_create_outbound_session(
    manager: State<'_, E2eeManager>,
    session_id: String,
    identity_key_pair_bincode: Vec<u8>,
    remote_bundle_json: serde_json::Value,
) -> Result<Vec<u8>, String> {
    let ik: e2ee_core::X25519KeyPair =
        bincode::deserialize(&identity_key_pair_bincode).map_err(|e| e.to_string())?;

    let remote_bundle = parse_remote_bundle(&remote_bundle_json)?;

    manager.create_outbound_session(&session_id, &ik, &remote_bundle)
}

/// Create an inbound session (Bob side) by processing a handshake.
#[tauri::command]
pub async fn e2ee_create_inbound_session(
    manager: State<'_, E2eeManager>,
    session_id: String,
    identity_key_pair_bincode: Vec<u8>,
    signed_pre_key_pair_bincode: Vec<u8>,
    one_time_pre_key_pair_bincode: Option<Vec<u8>>,
    remote_identity_key: Vec<u8>,
    handshake: Vec<u8>,
) -> Result<(), String> {
    let remote_id_bytes: [u8; 32] = remote_identity_key
        .try_into()
        .map_err(|_| "remote_identity_key must be 32 bytes".to_string())?;

    manager.create_inbound_session(
        &session_id,
        &identity_key_pair_bincode,
        &signed_pre_key_pair_bincode,
        one_time_pre_key_pair_bincode.as_deref(),
        &remote_id_bytes,
        &handshake,
    )
}

/// Encrypt a message. Input is raw plaintext bytes, output is wire-format bytes.
#[tauri::command]
pub async fn e2ee_encrypt(
    manager: State<'_, E2eeManager>,
    session_id: String,
    plaintext: Vec<u8>,
) -> Result<Vec<u8>, String> {
    manager.encrypt(&session_id, &plaintext)
}

/// Decrypt wire-format bytes. Input is `header(4 + 52) || ciphertext`, output is plaintext bytes.
#[tauri::command]
pub async fn e2ee_decrypt(
    manager: State<'_, E2eeManager>,
    session_id: String,
    wire: Vec<u8>,
) -> Result<Vec<u8>, String> {
    manager.decrypt(&session_id, &wire)
}

/// Export session state as bincode bytes for persistence.
#[tauri::command]
pub async fn e2ee_export_session(
    manager: State<'_, E2eeManager>,
    session_id: String,
) -> Result<Vec<u8>, String> {
    manager.export_session(&session_id)
}

/// Restore a session from previously exported bincode bytes.
#[tauri::command]
pub async fn e2ee_restore_session(
    manager: State<'_, E2eeManager>,
    session_id: String,
    state_bytes: Vec<u8>,
) -> Result<(), String> {
    manager.import_session(&session_id, &state_bytes)
}

/// Remove a session from the in-memory store.
#[tauri::command]
pub async fn e2ee_remove_session(
    manager: State<'_, E2eeManager>,
    session_id: String,
) -> Result<(), String> {
    manager.remove_session(&session_id)
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

fn parse_remote_bundle(json: &serde_json::Value) -> Result<e2ee_core::PreKeyBundleFetch, String> {
    let identity_key = parse_x25519_pk(json.get("identity_key").ok_or("missing identity_key")?)?;
    let signing_key = parse_ed25519_pk(json.get("signing_key").ok_or("missing signing_key")?)?;
    let signed_pre_key_json = json
        .get("signed_pre_key")
        .ok_or("missing signed_pre_key")?;
    let signed_pre_key = e2ee_core::PreKey {
        id: signed_pre_key_json
            .get("id")
            .and_then(|v| v.as_u64())
            .ok_or("signed_pre_key.id missing")? as u32,
        key: parse_x25519_pk(
            signed_pre_key_json
                .get("key")
                .ok_or("signed_pre_key.key missing")?,
        )?,
    };
    let sig_bytes = json
        .get("signed_pre_key_signature")
        .and_then(|v| v.as_array())
        .ok_or("missing signed_pre_key_signature")?;
    let sig_vec: Vec<u8> = sig_bytes
        .iter()
        .map(|v| v.as_u64().unwrap_or(0) as u8)
        .collect();
    if sig_vec.len() != 64 {
        return Err(format!(
            "signed_pre_key_signature must be 64 bytes, got {}",
            sig_vec.len()
        ));
    }
    let mut sig_arr = [0u8; 64];
    sig_arr.copy_from_slice(&sig_vec);
    let signed_pre_key_signature = e2ee_core::Ed25519Signature(sig_arr);

    let one_time_pre_key = match json.get("one_time_pre_key") {
        Some(otk) if !otk.is_null() => {
            let id = otk
                .get("id")
                .and_then(|v| v.as_u64())
                .ok_or("otk.id missing")? as u32;
            let key = parse_x25519_pk(otk.get("key").ok_or("otk.key missing")?)?;
            Some(e2ee_core::PreKey { id, key })
        }
        _ => None,
    };

    Ok(e2ee_core::PreKeyBundleFetch {
        identity_key,
        signing_key,
        signed_pre_key,
        signed_pre_key_signature,
        one_time_pre_key,
    })
}

fn parse_x25519_pk(val: &serde_json::Value) -> Result<e2ee_core::X25519PublicKey, String> {
    let bytes: Vec<u8> = val
        .as_array()
        .ok_or("expected byte array")?
        .iter()
        .map(|v| v.as_u64().unwrap_or(0) as u8)
        .collect();
    let arr: [u8; 32] = bytes
        .try_into()
        .map_err(|_| "X25519PublicKey must be 32 bytes".to_string())?;
    Ok(e2ee_core::X25519PublicKey(arr))
}

fn parse_ed25519_pk(val: &serde_json::Value) -> Result<e2ee_core::Ed25519PublicKey, String> {
    let bytes: Vec<u8> = val
        .as_array()
        .ok_or("expected byte array")?
        .iter()
        .map(|v| v.as_u64().unwrap_or(0) as u8)
        .collect();
    let arr: [u8; 32] = bytes
        .try_into()
        .map_err(|_| "Ed25519PublicKey must be 32 bytes".to_string())?;
    Ok(e2ee_core::Ed25519PublicKey(arr))
}
