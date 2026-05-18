//! X3DH (Extended Triple Diffie-Hellman) key agreement protocol.
//!
//! This module implements the X3DH protocol for establishing a shared
//! secret key between two parties (Alice and Bob) using a combination
//! of identity keys, signed pre-keys, and optional one-time pre-keys.
//!
//! The protocol produces a `RatchetRootKey` that seeds the Double Ratchet.
//!
//! ## Key Bundle Generation
//!
//! Bob publishes a `PreKeyBundle` containing his identity key, signed pre-key
//! (with Ed25519 signature), and a pool of one-time pre-keys. Alice fetches
//! this bundle and performs `x3dh_initiate` to derive the shared root key.
//!
//! ## DH Computation (stack-allocated, zeroized after use)
//!
//! DH1 = DH(IK_A, SPK_B)
//! DH2 = DH(EK_A, IK_B)
//! DH3 = DH(EK_A, SPK_B)
//! DH4 = DH(EK_A, OTK_B) — optional, when an OTK is available
//!
//! SK = HKDF-SHA256(DH1 || DH2 || DH3 || DH4, salt=0x00..00, "X3DH-RootKey-v1")

use serde::{Deserialize, Serialize};
use zeroize::Zeroize;

use crate::errors::E2eeError;
use crate::primitives::{
    ed25519_sign, ed25519_verify, generate_ed25519_keypair, generate_x25519_keypair,
    hkdf_sha256, x25519_dh, Ed25519KeyPair, Ed25519PublicKey, Ed25519Signature,
    X25519KeyPair, X25519PublicKey,
};
use crate::state::RatchetRootKey;

// ============================================================================
// Protocol Constants
// ============================================================================

/// HKDF info string for X3DH root key derivation.
const X3DH_INFO: &[u8] = b"X3DH-RootKey-v1";

/// HKDF salt (32 zero bytes) — no additional salt in X3DH.
const X3DH_SALT: [u8; 32] = [0u8; 32];

/// Each DH output is 32 bytes (X25519 shared secret).
const DH_OUTPUT_LEN: usize = 32;

/// Maximum number of DH computations: DH1 + DH2 + DH3 + DH4 (optional).
const MAX_DH_COUNT: usize = 4;

// ============================================================================
// Types
// ============================================================================

/// A pre-key with its identifier.
#[derive(Serialize, Deserialize)]
pub struct PreKey {
    pub id: u32,
    pub key: X25519PublicKey,
}

/// Bob's published pre-key bundle (public keys only, fetched via server).
pub struct PreKeyBundle {
    pub identity_key: X25519PublicKey,
    pub signing_key: Ed25519PublicKey,
    pub signed_pre_key: X25519PublicKey,
    pub signed_pre_key_signature: Ed25519Signature,
    pub one_time_pre_keys: Vec<X25519PublicKey>,
}

/// A pre-key bundle that Alice receives, including IDs for the signed
/// pre-key and one-time pre-key (to tell Bob which OTK was used).
#[derive(Serialize, Deserialize)]
pub struct PreKeyBundleFetch {
    pub identity_key: X25519PublicKey,
    pub signing_key: Ed25519PublicKey,
    pub signed_pre_key: PreKey,
    pub signed_pre_key_signature: Ed25519Signature,
    pub one_time_pre_key: Option<PreKey>,
}

/// A complete key bundle (public + private) for Bob.
///
/// The host is responsible for persisting the key pairs and managing
/// OTK ID assignment. This struct contains everything needed to
/// respond to an X3DH initiation.
pub struct KeyBundle {
    pub spk_id: u32,
    pub identity_key_pair: X25519KeyPair,
    pub signing_key_pair: Ed25519KeyPair,
    pub signed_pre_key_pair: X25519KeyPair,
    pub one_time_pre_key_pairs: Vec<X25519KeyPair>,
    pub bundle: PreKeyBundle,
}

/// Result of Alice initiating an X3DH key exchange.
pub struct X3dhInitiateResult {
    pub root_key: RatchetRootKey,
    pub ephemeral_public_key: X25519PublicKey,
    pub spk_id: u32,
    pub otk_id: Option<u32>,
}

/// Result of Bob responding to an X3DH key exchange.
pub struct X3dhRespondResult {
    pub root_key: RatchetRootKey,
    pub otk_id: Option<u32>,
}

// ============================================================================
// Internal Helpers
// ============================================================================

/// Copy a 32-byte DH output into the stack buffer at the current offset.
///
/// Uses `.get_mut()` to avoid panicking on out-of-bounds access (which
/// should never happen since `MAX_DH_COUNT * DH_OUTPUT_LEN = 128`).
/// All DH outputs are zeroized via `dh_buffer.zeroize()` after use.
fn dh_copy_to_stack(
    buffer: &mut [u8; DH_OUTPUT_LEN * MAX_DH_COUNT],
    offset: &mut usize,
    dh: &[u8; DH_OUTPUT_LEN],
) -> Result<(), E2eeError> {
    let end = offset
        .checked_add(DH_OUTPUT_LEN)
        .ok_or(E2eeError::EncryptionFailed)?;
    let slice = buffer
        .get_mut(*offset..end)
        .ok_or(E2eeError::EncryptionFailed)?;
    slice.copy_from_slice(dh);
    *offset = end;
    Ok(())
}

// ============================================================================
// generate_key_bundle  (Task 15)
// ============================================================================

/// Generate Bob's key bundle for X3DH.
///
/// Creates a fresh identity key pair, signing key pair, signed pre-key
/// pair, and the requested number of one-time pre-key pairs. The signed
/// pre-key is signed with the Ed25519 signing key so that Alice can verify
/// authenticity.
///
/// # Arguments
///
/// * `spk_id` — Identifier for the signed pre-key (assigned by the host).
/// * `one_time_pre_key_count` — How many one-time pre-keys to generate.
pub fn generate_key_bundle(
    spk_id: u32,
    one_time_pre_key_count: u32,
) -> Result<KeyBundle, E2eeError> {
    let identity_key_pair = generate_x25519_keypair();
    let signing_key_pair = generate_ed25519_keypair()?;
    let signed_pre_key_pair = generate_x25519_keypair();

    let spk_signature = ed25519_sign(
        &signing_key_pair.private_key,
        &signed_pre_key_pair.public_key.0,
    )?;

    let count =
        usize::try_from(one_time_pre_key_count).map_err(|_| E2eeError::EncryptionFailed)?;
    let mut one_time_pre_key_pairs = Vec::with_capacity(count);
    let mut one_time_pre_key_publics = Vec::with_capacity(count);

    for _ in 0..count {
        let kp = generate_x25519_keypair();
        one_time_pre_key_publics.push(kp.public_key);
        one_time_pre_key_pairs.push(kp);
    }

    let bundle = PreKeyBundle {
        identity_key: identity_key_pair.public_key,
        signing_key: signing_key_pair.public_key,
        signed_pre_key: signed_pre_key_pair.public_key,
        signed_pre_key_signature: spk_signature,
        one_time_pre_keys: one_time_pre_key_publics,
    };

    Ok(KeyBundle {
        spk_id,
        identity_key_pair,
        signing_key_pair,
        signed_pre_key_pair,
        one_time_pre_key_pairs,
        bundle,
    })
}

// ============================================================================
// x3dh_initiate  (Task 16 — Alice side)
// ============================================================================

/// Perform Alice's side of the X3DH key agreement.
///
/// 1. Verifies Bob's signed pre-key signature using his signing key.
/// 2. Generates an ephemeral X25519 key pair.
/// 3. Computes DH1–DH4 on a 128-byte stack buffer (zero heap allocation).
/// 4. Derives the shared root key via HKDF-SHA256.
/// 5. Zeroizes the DH buffer.
///
/// # Arguments
///
/// * `identity_key_pair` — Alice's long-term X25519 identity key pair.
/// * `remote_bundle` — Bob's pre-key bundle (fetched from server).
pub fn x3dh_initiate(
    identity_key_pair: &X25519KeyPair,
    remote_bundle: &PreKeyBundleFetch,
) -> Result<X3dhInitiateResult, E2eeError> {
    // 1. Verify SPK signature using Bob's signing key
    ed25519_verify(
        &remote_bundle.signing_key,
        &remote_bundle.signed_pre_key.key.0,
        &remote_bundle.signed_pre_key_signature,
    )
    .map_err(|_| E2eeError::SpkSignatureRejected)?;

    // 2. Generate ephemeral key pair
    let ephemeral_key_pair = generate_x25519_keypair();

    // 3. Compute DH1–DH4 on stack (128 bytes, zero heap alloc)
    let dh1 = x25519_dh(&identity_key_pair.private_key, &remote_bundle.signed_pre_key.key)?;
    let dh2 = x25519_dh(&ephemeral_key_pair.private_key, &remote_bundle.identity_key)?;
    let dh3 = x25519_dh(&ephemeral_key_pair.private_key, &remote_bundle.signed_pre_key.key)?;

    let mut dh_buffer = [0u8; DH_OUTPUT_LEN * MAX_DH_COUNT]; // [0u8; 128]
    let mut offset: usize = 0;

    dh_copy_to_stack(&mut dh_buffer, &mut offset, &dh1)?;
    dh_copy_to_stack(&mut dh_buffer, &mut offset, &dh2)?;
    dh_copy_to_stack(&mut dh_buffer, &mut offset, &dh3)?;

    // Optional DH4
    let otk_id = if let Some(ref otk) = remote_bundle.one_time_pre_key {
        let dh4 = x25519_dh(&ephemeral_key_pair.private_key, &otk.key)?;
        dh_copy_to_stack(&mut dh_buffer, &mut offset, &dh4)?;
        Some(otk.id)
    } else {
        None
    };

    // 4. HKDF derive Root Key from concatenated DH outputs
    let dh_input = dh_buffer
        .get(..offset)
        .ok_or(E2eeError::EncryptionFailed)?;
    let root_key_bytes: [u8; 32] = hkdf_sha256::<32>(dh_input, &X3DH_SALT, X3DH_INFO)?;

    // 5. Zeroize DH intermediates on stack
    dh_buffer.zeroize();

    Ok(X3dhInitiateResult {
        root_key: RatchetRootKey(root_key_bytes),
        ephemeral_public_key: ephemeral_key_pair.public_key,
        spk_id: remote_bundle.signed_pre_key.id,
        otk_id,
    })
}

// ============================================================================
// x3dh_respond  (Task 17 — Bob side)
// ============================================================================

/// Perform Bob's side of the X3DH key agreement.
///
/// Bob recomputes the same shared secret using his private keys and
/// Alice's public keys (identity key + ephemeral key).
///
/// # Arguments
///
/// * `identity_key_pair` — Bob's long-term X25519 identity key pair.
/// * `signed_pre_key_pair` — Bob's signed pre-key key pair.
/// * `one_time_pre_key_pair` — Bob's one-time pre-key (if Alice used one).
/// * `remote_identity_key` — Alice's X25519 identity public key.
/// * `remote_ephemeral_key` — Alice's ephemeral X25519 public key.
pub fn x3dh_respond(
    identity_key_pair: &X25519KeyPair,
    signed_pre_key_pair: &X25519KeyPair,
    one_time_pre_key_pair: Option<&X25519KeyPair>,
    remote_identity_key: &X25519PublicKey,
    remote_ephemeral_key: &X25519PublicKey,
) -> Result<X3dhRespondResult, E2eeError> {
    // Compute DH1–DH4 on stack
    let dh1 = x25519_dh(&signed_pre_key_pair.private_key, remote_identity_key)?;
    let dh2 = x25519_dh(&identity_key_pair.private_key, remote_ephemeral_key)?;
    let dh3 = x25519_dh(&signed_pre_key_pair.private_key, remote_ephemeral_key)?;

    let mut dh_buffer = [0u8; DH_OUTPUT_LEN * MAX_DH_COUNT];
    let mut offset: usize = 0;

    dh_copy_to_stack(&mut dh_buffer, &mut offset, &dh1)?;
    dh_copy_to_stack(&mut dh_buffer, &mut offset, &dh2)?;
    dh_copy_to_stack(&mut dh_buffer, &mut offset, &dh3)?;

    let has_otk = one_time_pre_key_pair.is_some();
    if let Some(otk_pair) = one_time_pre_key_pair {
        let dh4 = x25519_dh(&otk_pair.private_key, remote_ephemeral_key)?;
        dh_copy_to_stack(&mut dh_buffer, &mut offset, &dh4)?;
    }

    // Derive Root Key
    let dh_input = dh_buffer
        .get(..offset)
        .ok_or(E2eeError::EncryptionFailed)?;
    let root_key_bytes: [u8; 32] = hkdf_sha256::<32>(dh_input, &X3DH_SALT, X3DH_INFO)?;

    dh_buffer.zeroize();

    Ok(X3dhRespondResult {
        root_key: RatchetRootKey(root_key_bytes),
        otk_id: if has_otk { Some(0) } else { None },
    })
}

// ============================================================================
// Tests
// ============================================================================

#[cfg(test)]
mod tests {
    use super::*;
    use crate::primitives::{ed25519_verify, generate_x25519_keypair};

    // --- Test helpers ---

    fn make_bob_bundle() -> Result<(KeyBundle, PreKeyBundleFetch), E2eeError> {
        let kb = generate_key_bundle(1, 1)?;
        let fetch = PreKeyBundleFetch {
            identity_key: kb.bundle.identity_key,
            signing_key: kb.bundle.signing_key,
            signed_pre_key: PreKey {
                id: 1,
                key: kb.bundle.signed_pre_key,
            },
            signed_pre_key_signature: kb.bundle.signed_pre_key_signature,
            one_time_pre_key: kb
                .bundle
                .one_time_pre_keys
                .first()
                .copied()
                .map(|k| PreKey { id: 1, key: k }),
        };
        Ok((kb, fetch))
    }

    // --- Task 15: generate_key_bundle ---

    #[test]
    fn generate_key_bundle_zero_otk() -> Result<(), E2eeError> {
        let kb = generate_key_bundle(1, 0)?;
        assert!(kb.bundle.one_time_pre_keys.is_empty());
        assert_eq!(kb.one_time_pre_key_pairs.len(), 0);
        Ok(())
    }

    #[test]
    fn generate_key_bundle_with_otks() -> Result<(), E2eeError> {
        let kb = generate_key_bundle(1, 5)?;
        assert_eq!(kb.bundle.one_time_pre_keys.len(), 5);
        assert_eq!(kb.one_time_pre_key_pairs.len(), 5);
        Ok(())
    }

    #[test]
    fn generate_key_bundle_spk_signature_valid() -> Result<(), E2eeError> {
        let kb = generate_key_bundle(42, 0)?;
        let result = ed25519_verify(
            &kb.signing_key_pair.public_key,
            &kb.signed_pre_key_pair.public_key.0,
            &kb.bundle.signed_pre_key_signature,
        );
        assert!(result.is_ok());
        Ok(())
    }

    // --- Task 16: x3dh_initiate ---

    #[test]
    fn x3dh_initiate_with_otk_succeeds() -> Result<(), E2eeError> {
        let alice_ik = generate_x25519_keypair();
        let (_bob, fetch) = make_bob_bundle()?;
        let result = x3dh_initiate(&alice_ik, &fetch)?;
        assert_eq!(result.spk_id, 1);
        assert_eq!(result.otk_id, Some(1));
        Ok(())
    }

    #[test]
    fn x3dh_initiate_spk_only_succeeds() -> Result<(), E2eeError> {
        let alice_ik = generate_x25519_keypair();
        let kb = generate_key_bundle(7, 0)?;
        let fetch = PreKeyBundleFetch {
            identity_key: kb.bundle.identity_key,
            signing_key: kb.bundle.signing_key,
            signed_pre_key: PreKey {
                id: 7,
                key: kb.bundle.signed_pre_key,
            },
            signed_pre_key_signature: kb.bundle.signed_pre_key_signature,
            one_time_pre_key: None,
        };
        let result = x3dh_initiate(&alice_ik, &fetch)?;
        assert_eq!(result.spk_id, 7);
        assert_eq!(result.otk_id, None);
        Ok(())
    }

    #[test]
    fn x3dh_initiate_rejects_bad_spk_signature() -> Result<(), E2eeError> {
        let alice_ik = generate_x25519_keypair();
        let kb = generate_key_bundle(1, 0)?;
        let mut bad_sig = kb.bundle.signed_pre_key_signature;
        if let Some(byte) = bad_sig.0.get_mut(0) {
            *byte ^= 1;
        }
        let fetch = PreKeyBundleFetch {
            identity_key: kb.bundle.identity_key,
            signing_key: kb.bundle.signing_key,
            signed_pre_key: PreKey {
                id: 1,
                key: kb.bundle.signed_pre_key,
            },
            signed_pre_key_signature: bad_sig,
            one_time_pre_key: None,
        };
        let result = x3dh_initiate(&alice_ik, &fetch);
        assert!(matches!(result, Err(E2eeError::SpkSignatureRejected)));
        Ok(())
    }

    // --- Task 17: x3dh_respond ---

    #[test]
    fn x3dh_full_handshake_with_otk() -> Result<(), E2eeError> {
        let alice_ik = generate_x25519_keypair();
        let bob_bundle = generate_key_bundle(1, 1)?;
        let bob_otk = bob_bundle
            .one_time_pre_key_pairs
            .first()
            .ok_or(E2eeError::EncryptionFailed)?;

        let fetch = PreKeyBundleFetch {
            identity_key: bob_bundle.bundle.identity_key,
            signing_key: bob_bundle.bundle.signing_key,
            signed_pre_key: PreKey {
                id: 1,
                key: bob_bundle.bundle.signed_pre_key,
            },
            signed_pre_key_signature: bob_bundle.bundle.signed_pre_key_signature,
            one_time_pre_key: Some(PreKey {
                id: 100,
                key: bob_otk.public_key,
            }),
        };

        let alice_result = x3dh_initiate(&alice_ik, &fetch)?;
        let bob_result = x3dh_respond(
            &bob_bundle.identity_key_pair,
            &bob_bundle.signed_pre_key_pair,
            Some(bob_otk),
            &alice_ik.public_key,
            &alice_result.ephemeral_public_key,
        )?;

        assert_eq!(alice_result.root_key.0, bob_result.root_key.0);
        assert_eq!(alice_result.otk_id, Some(100));
        Ok(())
    }

    #[test]
    fn x3dh_full_handshake_spk_only() -> Result<(), E2eeError> {
        let alice_ik = generate_x25519_keypair();
        let bob_bundle = generate_key_bundle(42, 0)?;

        let fetch = PreKeyBundleFetch {
            identity_key: bob_bundle.bundle.identity_key,
            signing_key: bob_bundle.bundle.signing_key,
            signed_pre_key: PreKey {
                id: 42,
                key: bob_bundle.bundle.signed_pre_key,
            },
            signed_pre_key_signature: bob_bundle.bundle.signed_pre_key_signature,
            one_time_pre_key: None,
        };

        let alice_result = x3dh_initiate(&alice_ik, &fetch)?;
        let bob_result = x3dh_respond(
            &bob_bundle.identity_key_pair,
            &bob_bundle.signed_pre_key_pair,
            None,
            &alice_ik.public_key,
            &alice_result.ephemeral_public_key,
        )?;

        assert_eq!(alice_result.root_key.0, bob_result.root_key.0);
        Ok(())
    }

    #[test]
    fn x3dh_different_identity_keys_produce_different_roots() -> Result<(), E2eeError> {
        let alice1 = generate_x25519_keypair();
        let alice2 = generate_x25519_keypair();
        let bob_bundle = generate_key_bundle(1, 0)?;

        let fetch = PreKeyBundleFetch {
            identity_key: bob_bundle.bundle.identity_key,
            signing_key: bob_bundle.bundle.signing_key,
            signed_pre_key: PreKey {
                id: 1,
                key: bob_bundle.bundle.signed_pre_key,
            },
            signed_pre_key_signature: bob_bundle.bundle.signed_pre_key_signature,
            one_time_pre_key: None,
        };

        let r1 = x3dh_initiate(&alice1, &fetch)?;
        let r2 = x3dh_initiate(&alice2, &fetch)?;
        assert_ne!(r1.root_key.0, r2.root_key.0);
        Ok(())
    }
}
