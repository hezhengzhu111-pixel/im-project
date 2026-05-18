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
use zeroize::{Zeroize, ZeroizeOnDrop};

use crate::errors::E2eeError;
use crate::primitives::{
    ed25519_sign, ed25519_verify, generate_ed25519_keypair, generate_x25519_keypair, hkdf_sha256,
    x25519_dh, Ed25519KeyPair, Ed25519PublicKey, Ed25519Signature, X25519KeyPair, X25519PublicKey,
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
#[derive(Clone, Copy, Serialize, Deserialize)]
pub struct PreKey {
    pub id: u32,
    pub key: X25519PublicKey,
}

/// Bob's published pre-key bundle (public keys only, fetched via server).
#[derive(Serialize, Deserialize)]
pub struct PreKeyBundle {
    pub identity_key: X25519PublicKey,
    pub signing_key: Ed25519PublicKey,
    pub signed_pre_key: X25519PublicKey,
    pub signed_pre_key_signature: Ed25519Signature,
    pub one_time_pre_keys: Vec<PreKey>,
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
#[derive(Zeroize, ZeroizeOnDrop)]
pub struct OneTimePreKeyPair {
    #[zeroize(skip)]
    pub id: u32,
    pub key_pair: X25519KeyPair,
}

impl OneTimePreKeyPair {
    #[must_use]
    pub fn pre_key(&self) -> PreKey {
        PreKey {
            id: self.id,
            key: self.key_pair.public_key,
        }
    }
}

/// A complete key bundle (public + private) for Bob.
///
/// The one-time pre-key vector preserves the host-assigned OTK id next to
/// the corresponding private key, so Bob can report the exact consumed id.
#[derive(Zeroize, ZeroizeOnDrop)]
pub struct KeyBundle {
    #[zeroize(skip)]
    pub spk_id: u32,
    pub identity_key_pair: X25519KeyPair,
    pub signing_key_pair: Ed25519KeyPair,
    pub signed_pre_key_pair: X25519KeyPair,
    pub one_time_pre_key_pairs: Vec<OneTimePreKeyPair>,
    #[zeroize(skip)]
    pub bundle: PreKeyBundle,
}

impl KeyBundle {
    #[must_use]
    pub fn one_time_pre_key_pair(&self, otk_id: u32) -> Option<&OneTimePreKeyPair> {
        self.one_time_pre_key_pairs
            .iter()
            .find(|pair| pair.id == otk_id)
    }
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
/// * `one_time_pre_keys` — OTK id batches as `(start_id, count)`.
pub fn generate_key_bundle(
    spk_id: u32,
    one_time_pre_keys: &[(u32, u32)],
) -> Result<KeyBundle, E2eeError> {
    let identity_key_pair = generate_x25519_keypair();
    let signing_key_pair = generate_ed25519_keypair()?;
    let signed_pre_key_pair = generate_x25519_keypair();

    let spk_signature = ed25519_sign(
        &signing_key_pair.private_key,
        &signed_pre_key_pair.public_key.0,
    )?;

    let mut total_otk_count = 0u32;
    for (_, count) in one_time_pre_keys {
        total_otk_count = total_otk_count.checked_add(*count).ok_or_else(|| {
            E2eeError::InvalidPreKeyId(String::from("one-time pre-key count overflow"))
        })?;
    }

    let count = usize::try_from(total_otk_count).map_err(|_| {
        E2eeError::InvalidPreKeyId(String::from("one-time pre-key count does not fit usize"))
    })?;
    let mut one_time_pre_key_pairs = Vec::with_capacity(count);
    let mut one_time_pre_keys_public = Vec::with_capacity(count);

    for (start_id, batch_count) in one_time_pre_keys {
        for offset in 0..*batch_count {
            let id = start_id.checked_add(offset).ok_or_else(|| {
                E2eeError::InvalidPreKeyId(String::from("one-time pre-key id overflow"))
            })?;
            let key_pair = generate_x25519_keypair();
            one_time_pre_keys_public.push(PreKey {
                id,
                key: key_pair.public_key,
            });
            one_time_pre_key_pairs.push(OneTimePreKeyPair { id, key_pair });
        }
    }

    let bundle = PreKeyBundle {
        identity_key: identity_key_pair.public_key,
        signing_key: signing_key_pair.public_key,
        signed_pre_key: signed_pre_key_pair.public_key,
        signed_pre_key_signature: spk_signature,
        one_time_pre_keys: one_time_pre_keys_public,
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

/// Compatibility helper for callers that only need a count.
///
/// OTK ids are assigned contiguously starting at `1`, matching the old
/// count-only behavior without losing id information inside `KeyBundle`.
pub fn generate_key_bundle_with_count(
    spk_id: u32,
    one_time_pre_key_count: u32,
) -> Result<KeyBundle, E2eeError> {
    generate_key_bundle(spk_id, &[(1, one_time_pre_key_count)])
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
    let dh1 = x25519_dh(
        &identity_key_pair.private_key,
        &remote_bundle.signed_pre_key.key,
    )?;
    let dh2 = x25519_dh(&ephemeral_key_pair.private_key, &remote_bundle.identity_key)?;
    let dh3 = x25519_dh(
        &ephemeral_key_pair.private_key,
        &remote_bundle.signed_pre_key.key,
    )?;

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
    let dh_input = dh_buffer.get(..offset).ok_or(E2eeError::EncryptionFailed)?;
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
fn x3dh_respond_inner(
    identity_key_pair: &X25519KeyPair,
    signed_pre_key_pair: &X25519KeyPair,
    one_time_pre_key_pair: Option<(&X25519KeyPair, Option<u32>)>,
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

    let mut otk_id = None;
    if let Some((otk_pair, id)) = one_time_pre_key_pair {
        let dh4 = x25519_dh(&otk_pair.private_key, remote_ephemeral_key)?;
        dh_copy_to_stack(&mut dh_buffer, &mut offset, &dh4)?;
        otk_id = id;
    }

    // Derive Root Key
    let dh_input = dh_buffer.get(..offset).ok_or(E2eeError::EncryptionFailed)?;
    let root_key_bytes: [u8; 32] = hkdf_sha256::<32>(dh_input, &X3DH_SALT, X3DH_INFO)?;

    dh_buffer.zeroize();

    Ok(X3dhRespondResult {
        root_key: RatchetRootKey(root_key_bytes),
        otk_id,
    })
}

/// Perform Bob's side of the X3DH key agreement.
///
/// Bob recomputes the same shared secret using his private keys and
/// Alice's public keys (identity key + ephemeral key). When an OTK is used,
/// pass the `OneTimePreKeyPair` so the returned result preserves the exact
/// host-assigned OTK id.
pub fn x3dh_respond(
    identity_key_pair: &X25519KeyPair,
    signed_pre_key_pair: &X25519KeyPair,
    one_time_pre_key_pair: Option<&OneTimePreKeyPair>,
    remote_identity_key: &X25519PublicKey,
    remote_ephemeral_key: &X25519PublicKey,
) -> Result<X3dhRespondResult, E2eeError> {
    let otk = one_time_pre_key_pair.map(|pair| (&pair.key_pair, Some(pair.id)));
    x3dh_respond_inner(
        identity_key_pair,
        signed_pre_key_pair,
        otk,
        remote_identity_key,
        remote_ephemeral_key,
    )
}

/// Compatibility helper for callers that still hold a raw OTK keypair.
///
/// This computes the same X3DH secret but returns `otk_id: None` because a
/// raw `X25519KeyPair` does not carry the server-consumed OTK id.
pub fn x3dh_respond_with_raw_otk(
    identity_key_pair: &X25519KeyPair,
    signed_pre_key_pair: &X25519KeyPair,
    one_time_pre_key_pair: Option<&X25519KeyPair>,
    remote_identity_key: &X25519PublicKey,
    remote_ephemeral_key: &X25519PublicKey,
) -> Result<X3dhRespondResult, E2eeError> {
    let otk = one_time_pre_key_pair.map(|pair| (pair, None));
    x3dh_respond_inner(
        identity_key_pair,
        signed_pre_key_pair,
        otk,
        remote_identity_key,
        remote_ephemeral_key,
    )
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
        let kb = generate_key_bundle(1, &[(1, 1)])?;
        let fetch = PreKeyBundleFetch {
            identity_key: kb.bundle.identity_key,
            signing_key: kb.bundle.signing_key,
            signed_pre_key: PreKey {
                id: 1,
                key: kb.bundle.signed_pre_key,
            },
            signed_pre_key_signature: kb.bundle.signed_pre_key_signature,
            one_time_pre_key: kb.bundle.one_time_pre_keys.first().copied(),
        };
        Ok((kb, fetch))
    }

    // --- Task 15: generate_key_bundle ---

    #[test]
    fn generate_key_bundle_zero_otk() -> Result<(), E2eeError> {
        let kb = generate_key_bundle(1, &[])?;
        assert!(kb.bundle.one_time_pre_keys.is_empty());
        assert_eq!(kb.one_time_pre_key_pairs.len(), 0);
        Ok(())
    }

    #[test]
    fn generate_key_bundle_with_one_otk() -> Result<(), E2eeError> {
        let kb = generate_key_bundle(1, &[(100, 1)])?;
        assert_eq!(kb.bundle.one_time_pre_keys.len(), 1);
        assert_eq!(kb.one_time_pre_key_pairs.len(), 1);
        assert!(kb.one_time_pre_key_pair(100).is_some());
        Ok(())
    }

    #[test]
    fn generate_key_bundle_with_one_hundred_otks() -> Result<(), E2eeError> {
        let kb = generate_key_bundle(1, &[(100, 100)])?;
        assert_eq!(kb.bundle.one_time_pre_keys.len(), 100);
        assert_eq!(kb.one_time_pre_key_pairs.len(), 100);
        assert!(kb.one_time_pre_key_pair(100).is_some());
        assert!(kb.one_time_pre_key_pair(199).is_some());
        Ok(())
    }

    #[test]
    fn generate_key_bundle_spk_signature_valid() -> Result<(), E2eeError> {
        let kb = generate_key_bundle(42, &[])?;
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
        let kb = generate_key_bundle(7, &[])?;
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
        let kb = generate_key_bundle(1, &[])?;
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
        let bob_bundle = generate_key_bundle(1, &[(100, 1)])?;
        let bob_otk = bob_bundle
            .one_time_pre_key_pair(100)
            .ok_or_else(|| E2eeError::InvalidPreKeyId(String::from("missing OTK 100")))?;

        let fetch = PreKeyBundleFetch {
            identity_key: bob_bundle.bundle.identity_key,
            signing_key: bob_bundle.bundle.signing_key,
            signed_pre_key: PreKey {
                id: 1,
                key: bob_bundle.bundle.signed_pre_key,
            },
            signed_pre_key_signature: bob_bundle.bundle.signed_pre_key_signature,
            one_time_pre_key: Some(bob_otk.pre_key()),
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
        assert_eq!(bob_result.otk_id, Some(100));
        Ok(())
    }

    #[test]
    fn x3dh_otk_ids_100_and_101_roundtrip() -> Result<(), E2eeError> {
        let bob_bundle = generate_key_bundle(1, &[(100, 2)])?;
        for otk_id in [100u32, 101u32] {
            let alice_ik = generate_x25519_keypair();
            let bob_otk = bob_bundle
                .one_time_pre_key_pair(otk_id)
                .ok_or_else(|| E2eeError::InvalidPreKeyId(String::from("missing test OTK")))?;
            let fetch = PreKeyBundleFetch {
                identity_key: bob_bundle.bundle.identity_key,
                signing_key: bob_bundle.bundle.signing_key,
                signed_pre_key: PreKey {
                    id: 1,
                    key: bob_bundle.bundle.signed_pre_key,
                },
                signed_pre_key_signature: bob_bundle.bundle.signed_pre_key_signature,
                one_time_pre_key: Some(bob_otk.pre_key()),
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
            assert_eq!(alice_result.otk_id, Some(otk_id));
            assert_eq!(bob_result.otk_id, Some(otk_id));
        }
        Ok(())
    }

    #[test]
    fn x3dh_full_handshake_spk_only() -> Result<(), E2eeError> {
        let alice_ik = generate_x25519_keypair();
        let bob_bundle = generate_key_bundle(42, &[])?;

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
        assert_eq!(alice_result.otk_id, None);
        assert_eq!(bob_result.otk_id, None);
        Ok(())
    }

    #[test]
    fn x3dh_different_identity_keys_produce_different_roots() -> Result<(), E2eeError> {
        let alice1 = generate_x25519_keypair();
        let alice2 = generate_x25519_keypair();
        let bob_bundle = generate_key_bundle(1, &[])?;

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

    // --- T6: KeyBundle → PreKeyBundle (server-publishable) → PreKeyBundleFetch ---

    #[test]
    fn x3dh_key_bundle_to_fetch_roundtrip() -> Result<(), E2eeError> {
        let bob_bundle = generate_key_bundle(42, &[(1001, 3)])?;

        // Step 1: KeyBundle.bundle is already a PreKeyBundle (server-publishable form)
        let server_bundle: &PreKeyBundle = &bob_bundle.bundle;
        assert_eq!(server_bundle.one_time_pre_keys.len(), 3);
        let first_otk = server_bundle
            .one_time_pre_keys
            .first()
            .ok_or_else(|| E2eeError::InvalidPreKeyId(String::from("missing first OTK")))?;
        assert_eq!(first_otk.id, 1001);

        // Step 2: Server picks an OTK and constructs PreKeyBundleFetch for Alice
        let picked_otk = server_bundle.one_time_pre_keys.first().copied();
        let fetch = PreKeyBundleFetch {
            identity_key: server_bundle.identity_key,
            signing_key: server_bundle.signing_key,
            signed_pre_key: PreKey {
                id: bob_bundle.spk_id,
                key: server_bundle.signed_pre_key,
            },
            signed_pre_key_signature: server_bundle.signed_pre_key_signature,
            one_time_pre_key: picked_otk,
        };

        // Step 3: Full handshake with the constructed fetch
        let alice_ik = generate_x25519_keypair();
        let alice_result = x3dh_initiate(&alice_ik, &fetch)?;

        let bob_otk = bob_bundle
            .one_time_pre_key_pair(1001)
            .ok_or_else(|| E2eeError::InvalidPreKeyId(String::from("missing OTK 1001")))?;
        let bob_result = x3dh_respond(
            &bob_bundle.identity_key_pair,
            &bob_bundle.signed_pre_key_pair,
            Some(bob_otk),
            &alice_ik.public_key,
            &alice_result.ephemeral_public_key,
        )?;

        assert_eq!(alice_result.root_key.0, bob_result.root_key.0);
        assert_eq!(alice_result.spk_id, 42);
        assert_eq!(alice_result.otk_id, Some(1001));
        Ok(())
    }

    // --- T7: OTK count = 1 full handshake ---

    #[test]
    fn x3dh_otk_count_one_full_handshake() -> Result<(), E2eeError> {
        let alice_ik = generate_x25519_keypair();
        let bob_bundle = generate_key_bundle(1, &[(200, 1)])?;
        let bob_otk = bob_bundle
            .one_time_pre_key_pair(200)
            .ok_or_else(|| E2eeError::InvalidPreKeyId(String::from("missing OTK 200")))?;

        let fetch = PreKeyBundleFetch {
            identity_key: bob_bundle.bundle.identity_key,
            signing_key: bob_bundle.bundle.signing_key,
            signed_pre_key: PreKey {
                id: 1,
                key: bob_bundle.bundle.signed_pre_key,
            },
            signed_pre_key_signature: bob_bundle.bundle.signed_pre_key_signature,
            one_time_pre_key: Some(bob_otk.pre_key()),
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
        assert_eq!(alice_result.otk_id, Some(200));
        Ok(())
    }

    // --- T7: OTK count = 100 full handshake (pick middle OTK) ---

    #[test]
    fn x3dh_otk_count_hundred_full_handshake() -> Result<(), E2eeError> {
        let alice_ik = generate_x25519_keypair();
        let bob_bundle = generate_key_bundle(1, &[(500, 100)])?;

        // Pick the 51st OTK (id=550)
        let bob_otk = bob_bundle
            .one_time_pre_key_pair(550)
            .ok_or_else(|| E2eeError::InvalidPreKeyId(String::from("missing OTK 550")))?;

        let fetch = PreKeyBundleFetch {
            identity_key: bob_bundle.bundle.identity_key,
            signing_key: bob_bundle.bundle.signing_key,
            signed_pre_key: PreKey {
                id: 1,
                key: bob_bundle.bundle.signed_pre_key,
            },
            signed_pre_key_signature: bob_bundle.bundle.signed_pre_key_signature,
            one_time_pre_key: Some(bob_otk.pre_key()),
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
        assert_eq!(bob_bundle.bundle.one_time_pre_keys.len(), 100);
        assert_eq!(bob_bundle.one_time_pre_key_pairs.len(), 100);
        Ok(())
    }

    // --- T8: OTK id not array index (id=1001) ---

    #[test]
    fn x3dh_otk_id_1001_not_array_index() -> Result<(), E2eeError> {
        let alice_ik = generate_x25519_keypair();
        // Single OTK with id=1001 — clearly not an array index
        let bob_bundle = generate_key_bundle(7, &[(1001, 1)])?;

        let bob_otk = bob_bundle
            .one_time_pre_key_pair(1001)
            .ok_or_else(|| E2eeError::InvalidPreKeyId(String::from("missing OTK 1001")))?;

        let fetch = PreKeyBundleFetch {
            identity_key: bob_bundle.bundle.identity_key,
            signing_key: bob_bundle.bundle.signing_key,
            signed_pre_key: PreKey {
                id: 7,
                key: bob_bundle.bundle.signed_pre_key,
            },
            signed_pre_key_signature: bob_bundle.bundle.signed_pre_key_signature,
            one_time_pre_key: Some(bob_otk.pre_key()),
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
        assert_eq!(alice_result.otk_id, Some(1001));
        assert_eq!(bob_result.otk_id, Some(1001));
        Ok(())
    }

    // --- T9: Wrong OTK private key produces different root key ---

    #[test]
    fn x3dh_wrong_otk_private_key_produces_different_root() -> Result<(), E2eeError> {
        let alice_ik = generate_x25519_keypair();
        let bob_bundle = generate_key_bundle(1, &[(300, 2)])?;

        // Alice uses OTK 300's public key
        let bob_otk_300 = bob_bundle
            .one_time_pre_key_pair(300)
            .ok_or_else(|| E2eeError::InvalidPreKeyId(String::from("missing OTK 300")))?;

        let fetch = PreKeyBundleFetch {
            identity_key: bob_bundle.bundle.identity_key,
            signing_key: bob_bundle.bundle.signing_key,
            signed_pre_key: PreKey {
                id: 1,
                key: bob_bundle.bundle.signed_pre_key,
            },
            signed_pre_key_signature: bob_bundle.bundle.signed_pre_key_signature,
            one_time_pre_key: Some(bob_otk_300.pre_key()),
        };

        let alice_result = x3dh_initiate(&alice_ik, &fetch)?;

        // Bob uses OTK 301 (wrong private key) instead of 300
        let bob_wrong_otk = bob_bundle
            .one_time_pre_key_pair(301)
            .ok_or_else(|| E2eeError::InvalidPreKeyId(String::from("missing OTK 301")))?;

        let bob_result = x3dh_respond(
            &bob_bundle.identity_key_pair,
            &bob_bundle.signed_pre_key_pair,
            Some(bob_wrong_otk),
            &alice_ik.public_key,
            &alice_result.ephemeral_public_key,
        )?;

        // Root keys must differ because DH4 used different private keys
        assert_ne!(alice_result.root_key.0, bob_result.root_key.0);
        Ok(())
    }

    // --- T10: root_key not all zero ---

    #[test]
    fn x3dh_root_key_not_all_zero() -> Result<(), E2eeError> {
        let alice_ik = generate_x25519_keypair();

        // With OTK
        let bob_with_otk = generate_key_bundle(1, &[(1, 1)])?;
        let otk = bob_with_otk.bundle.one_time_pre_keys.first().copied();
        let fetch_with_otk = PreKeyBundleFetch {
            identity_key: bob_with_otk.bundle.identity_key,
            signing_key: bob_with_otk.bundle.signing_key,
            signed_pre_key: PreKey {
                id: 1,
                key: bob_with_otk.bundle.signed_pre_key,
            },
            signed_pre_key_signature: bob_with_otk.bundle.signed_pre_key_signature,
            one_time_pre_key: otk,
        };
        let result_with_otk = x3dh_initiate(&alice_ik, &fetch_with_otk)?;
        assert!(result_with_otk.root_key.0.iter().any(|&b| b != 0));

        // SPK-only (without OTK)
        let bob_spk_only = generate_key_bundle(1, &[])?;
        let fetch_spk_only = PreKeyBundleFetch {
            identity_key: bob_spk_only.bundle.identity_key,
            signing_key: bob_spk_only.bundle.signing_key,
            signed_pre_key: PreKey {
                id: 1,
                key: bob_spk_only.bundle.signed_pre_key,
            },
            signed_pre_key_signature: bob_spk_only.bundle.signed_pre_key_signature,
            one_time_pre_key: None,
        };
        let result_spk_only = x3dh_initiate(&alice_ik, &fetch_spk_only)?;
        assert!(result_spk_only.root_key.0.iter().any(|&b| b != 0));

        Ok(())
    }

    // --- Legacy helper: generate_key_bundle_with_count ---

    #[test]
    fn x3dh_generate_key_bundle_with_count_legacy_handshake() -> Result<(), E2eeError> {
        let alice_ik = generate_x25519_keypair();

        // Legacy API: single count, OTK ids start from 1
        let bob_bundle = generate_key_bundle_with_count(5, 3)?;

        assert_eq!(bob_bundle.spk_id, 5);
        assert_eq!(bob_bundle.bundle.one_time_pre_keys.len(), 3);
        assert_eq!(bob_bundle.one_time_pre_key_pairs.len(), 3);

        // OTK ids should be 1, 2, 3 (contiguous starting at 1)
        assert!(bob_bundle.one_time_pre_key_pair(1).is_some());
        assert!(bob_bundle.one_time_pre_key_pair(2).is_some());
        assert!(bob_bundle.one_time_pre_key_pair(3).is_some());
        assert!(bob_bundle.one_time_pre_key_pair(4).is_none());

        // SPK signature is valid
        ed25519_verify(
            &bob_bundle.signing_key_pair.public_key,
            &bob_bundle.signed_pre_key_pair.public_key.0,
            &bob_bundle.bundle.signed_pre_key_signature,
        )?;

        // Full handshake using legacy bundle
        let bob_otk = bob_bundle
            .one_time_pre_key_pair(2)
            .ok_or_else(|| E2eeError::InvalidPreKeyId(String::from("missing OTK 2")))?;
        let fetch = PreKeyBundleFetch {
            identity_key: bob_bundle.bundle.identity_key,
            signing_key: bob_bundle.bundle.signing_key,
            signed_pre_key: PreKey {
                id: 5,
                key: bob_bundle.bundle.signed_pre_key,
            },
            signed_pre_key_signature: bob_bundle.bundle.signed_pre_key_signature,
            one_time_pre_key: Some(bob_otk.pre_key()),
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
        assert_eq!(alice_result.spk_id, 5);
        assert_eq!(alice_result.otk_id, Some(2));
        Ok(())
    }

    // --- Legacy helper: x3dh_respond_with_raw_otk ---

    #[test]
    fn x3dh_respond_with_raw_otk_legacy_handshake() -> Result<(), E2eeError> {
        let alice_ik = generate_x25519_keypair();
        let bob_bundle = generate_key_bundle(1, &[(500, 1)])?;
        let bob_otk = bob_bundle
            .one_time_pre_key_pair(500)
            .ok_or_else(|| E2eeError::InvalidPreKeyId(String::from("missing OTK 500")))?;

        let fetch = PreKeyBundleFetch {
            identity_key: bob_bundle.bundle.identity_key,
            signing_key: bob_bundle.bundle.signing_key,
            signed_pre_key: PreKey {
                id: 1,
                key: bob_bundle.bundle.signed_pre_key,
            },
            signed_pre_key_signature: bob_bundle.bundle.signed_pre_key_signature,
            one_time_pre_key: Some(bob_otk.pre_key()),
        };

        let alice_result = x3dh_initiate(&alice_ik, &fetch)?;

        // Use legacy raw OTK API — provides the same X25519 key pair
        // but otk_id will be None since raw keypair doesn't carry the id
        let bob_result = x3dh_respond_with_raw_otk(
            &bob_bundle.identity_key_pair,
            &bob_bundle.signed_pre_key_pair,
            Some(&bob_otk.key_pair),
            &alice_ik.public_key,
            &alice_result.ephemeral_public_key,
        )?;

        // Root keys match — legacy API computes the same DH
        assert_eq!(alice_result.root_key.0, bob_result.root_key.0);
        // Legacy API does not preserve otk_id
        assert_eq!(bob_result.otk_id, None);
        Ok(())
    }
}
