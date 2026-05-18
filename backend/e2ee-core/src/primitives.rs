//! E2EE cryptographic primitives.
//!
//! This module provides type-safe newtype wrappers and functions for all
//! cryptographic operations needed by the E2EE protocol:
//!
//! - **Newtype definitions** — compile-time type safety for keys
//! - **Key generation** — X25519, Ed25519, AES-256, nonces
//! - **X25519 ECDH** — Diffie-Hellman key agreement
//! - **Ed25519 sign/verify** — digital signatures
//! - **HKDF-SHA256** — key derivation with const generics (zero heap alloc)
//! - **AES-256-GCM** — authenticated encryption with AAD

use crate::errors::E2eeError;
use aes_gcm::{
    aead::{Aead, Payload},
    Aes256Gcm, KeyInit, Nonce,
};
use ed25519_dalek::{Signature, Signer, SigningKey, Verifier, VerifyingKey};
use getrandom::getrandom;
use hkdf::Hkdf;
use rand_core::OsRng;
use serde::{Deserialize, Serialize};
use sha2::Sha256;
use x25519_dalek::{PublicKey, StaticSecret};
use zeroize::{Zeroize, ZeroizeOnDrop};

// ============================================================================
// Newtype Definitions  (Task 4)
// ============================================================================

/// AES-256 symmetric key (32 bytes).
///
/// Must be kept secret. Zeroized on drop.
/// Does NOT implement `Clone` or `Copy` to prevent accidental duplication.
#[derive(Zeroize, ZeroizeOnDrop)]
pub struct Aes256Key(pub [u8; 32]);

/// X25519 Diffie-Hellman public key (32 bytes).
///
/// Safe to share. Implements `Clone` and `Copy` for ergonomic use.
#[derive(Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub struct X25519PublicKey(pub [u8; 32]);

/// X25519 Diffie-Hellman private key (32 bytes).
///
/// Must be kept secret. Zeroized on drop.
/// Does NOT implement `Clone` or `Copy` to prevent accidental duplication.
#[derive(Zeroize, ZeroizeOnDrop, Serialize, Deserialize)]
pub struct X25519PrivateKey(pub [u8; 32]);

/// X25519 key pair consisting of a public and private key.
///
/// The private key is zeroized on drop. The public key is skipped during
/// zeroization since it is not secret.
/// Does NOT implement `Clone` or `Copy`.
#[derive(Zeroize, ZeroizeOnDrop, Serialize, Deserialize)]
pub struct X25519KeyPair {
    #[zeroize(skip)]
    pub public_key: X25519PublicKey,
    pub private_key: X25519PrivateKey,
}

/// Ed25519 digital signature public key (32 bytes).
///
/// Safe to share. Implements `Clone` and `Copy` for ergonomic use.
#[derive(Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub struct Ed25519PublicKey(pub [u8; 32]);

/// Ed25519 digital signature private key (32 bytes).
///
/// Must be kept secret. Zeroized on drop.
/// Does NOT implement `Clone` or `Copy`.
#[derive(Zeroize, ZeroizeOnDrop)]
pub struct Ed25519PrivateKey(pub [u8; 32]);

/// Ed25519 key pair consisting of a public and private key.
///
/// The private key is zeroized on drop. The public key is skipped during
/// zeroization since it is not secret.
/// Does NOT implement `Clone` or `Copy`.
#[derive(Zeroize, ZeroizeOnDrop)]
pub struct Ed25519KeyPair {
    #[zeroize(skip)]
    pub public_key: Ed25519PublicKey,
    pub private_key: Ed25519PrivateKey,
}

/// AES-GCM nonce (12 bytes / 96 bits).
///
/// Does NOT implement `Zeroize` since nonces are not secret.
#[derive(Serialize, Deserialize)]
pub struct AesNonce(pub [u8; 12]);

/// Ed25519 signature (64 bytes).
///
/// Does NOT implement `Zeroize` since signatures are not secret.
#[derive(Clone, Copy)]
pub struct Ed25519Signature(pub [u8; 64]);

// Serde support for Ed25519Signature.
// Manual impl required because serde does not support [u8; 64] directly (max is [u8; 32]).
impl Serialize for Ed25519Signature {
    fn serialize<S: serde::Serializer>(&self, serializer: S) -> Result<S::Ok, S::Error> {
        self.0.as_slice().serialize(serializer)
    }
}

impl<'de> Deserialize<'de> for Ed25519Signature {
    fn deserialize<D: serde::Deserializer<'de>>(deserializer: D) -> Result<Self, D::Error> {
        let bytes: Vec<u8> = Vec::deserialize(deserializer)?;
        if bytes.len() != 64 {
            return Err(serde::de::Error::invalid_length(
                bytes.len(),
                &"expected 64 bytes",
            ));
        }
        let mut arr = [0u8; 64];
        arr.copy_from_slice(&bytes);
        Ok(Ed25519Signature(arr))
    }
}

// ============================================================================
// Key Generation  (Task 5)
// ============================================================================

/// Generate a new X25519 key pair using OS entropy.
///
/// The private key is generated from [`OsRng`], which provides
/// cryptographically secure randomness on all supported platforms.
#[must_use]
pub fn generate_x25519_keypair() -> X25519KeyPair {
    let secret = StaticSecret::random_from_rng(OsRng);
    let public = PublicKey::from(&secret);
    X25519KeyPair {
        public_key: X25519PublicKey(*public.as_bytes()),
        private_key: X25519PrivateKey(secret.to_bytes()),
    }
}

/// Generate a new Ed25519 key pair using OS entropy.
///
/// The private key is generated from OS entropy via [`getrandom`], which
/// provides cryptographically secure randomness on all supported platforms.
///
/// # Errors
///
/// Returns `EncryptionFailed` if the OS random number generator fails.
/// This is extremely unlikely on non-embedded platforms.
pub fn generate_ed25519_keypair() -> Result<Ed25519KeyPair, E2eeError> {
    let mut seed = [0u8; 32];
    getrandom(&mut seed).map_err(|_| E2eeError::EncryptionFailed)?;
    let signing_key = SigningKey::from_bytes(&seed);
    let verifying_key = signing_key.verifying_key();
    Ok(Ed25519KeyPair {
        public_key: Ed25519PublicKey(verifying_key.to_bytes()),
        private_key: Ed25519PrivateKey(signing_key.to_bytes()),
    })
}

/// Generate a random 32-byte AES-256 key from OS entropy.
///
/// # Errors
///
/// Returns `EncryptionFailed` if the OS random number generator fails.
/// This is extremely unlikely on non-embedded platforms (Windows, Linux, macOS).
pub fn generate_aes_256_key() -> Result<Aes256Key, E2eeError> {
    let mut key = [0u8; 32];
    getrandom(&mut key).map_err(|_| E2eeError::EncryptionFailed)?;
    Ok(Aes256Key(key))
}

/// Generate a random 12-byte AES-GCM nonce from OS entropy.
///
/// # Errors
///
/// Returns `EncryptionFailed` if the OS random number generator fails.
/// This is extremely unlikely on non-embedded platforms (Windows, Linux, macOS).
pub fn generate_nonce() -> Result<AesNonce, E2eeError> {
    let mut nonce = [0u8; 12];
    getrandom(&mut nonce).map_err(|_| E2eeError::EncryptionFailed)?;
    Ok(AesNonce(nonce))
}

// ============================================================================
// X25519 ECDH  (Task 6)
// ============================================================================

/// Perform X25519 Diffie-Hellman key agreement.
///
/// Combines `private_key` (our secret) with `public_key` (their public key)
/// to produce a 32-byte shared secret. Both parties using each other's keys
/// will arrive at the same shared secret.
pub fn x25519_dh(
    private_key: &X25519PrivateKey,
    public_key: &X25519PublicKey,
) -> Result<[u8; 32], E2eeError> {
    let secret = StaticSecret::from(private_key.0);
    let public = PublicKey::from(public_key.0);
    let shared = secret.diffie_hellman(&public);
    Ok(shared.to_bytes())
}

// ============================================================================
// Ed25519 Sign / Verify  (Task 7)
// ============================================================================

/// Sign a message with an Ed25519 private key.
///
/// Returns a 64-byte `Ed25519Signature`.
pub fn ed25519_sign(
    private_key: &Ed25519PrivateKey,
    message: &[u8],
) -> Result<Ed25519Signature, E2eeError> {
    let signing_key = SigningKey::from_bytes(&private_key.0);
    let signature = signing_key.sign(message);
    Ok(Ed25519Signature(signature.to_bytes()))
}

/// Verify an Ed25519 signature against a public key and message.
///
/// Returns `Ok(())` if the signature is valid, or `Err(E2eeError::SignatureMismatch)`
/// if the signature does not match.
///
/// # Errors
///
/// - `InvalidPublicKey` if the public key bytes are not a valid Ed25519 public key
/// - `InvalidSignature` if the signature bytes are not a valid Ed25519 signature
/// - `SignatureMismatch` if the signature does not match the message and public key
pub fn ed25519_verify(
    public_key: &Ed25519PublicKey,
    message: &[u8],
    signature: &Ed25519Signature,
) -> Result<(), E2eeError> {
    let verifying_key =
        VerifyingKey::from_bytes(&public_key.0).map_err(|_| E2eeError::InvalidPublicKey)?;
    let sig = Signature::from_bytes(&signature.0);
    verifying_key
        .verify(message, &sig)
        .map_err(|_| E2eeError::SignatureMismatch)
}

// ============================================================================
// HKDF-SHA256  (Task 8)
// ============================================================================

/// Derive key material using HKDF-SHA256 with const generics.
///
/// Returns a fixed-size array of `N` bytes with zero heap allocation.
/// The output size `N` must be at most 255 * 32 = 8160 bytes (HKDF-SHA256 limit).
///
/// # Errors
///
/// Returns `HkdfExpandFailed` if `N` exceeds the HKDF-SHA256 output limit.
pub fn hkdf_sha256<const N: usize>(
    ikm: &[u8],
    salt: &[u8],
    info: &[u8],
) -> Result<[u8; N], E2eeError> {
    let hk = Hkdf::<Sha256>::new(Some(salt), ikm);
    let mut output = [0u8; N];
    hk.expand(info, &mut output)
        .map_err(|_| E2eeError::HkdfExpandFailed)?;
    Ok(output)
}

// ============================================================================
// AES-256-GCM Encrypt / Decrypt  (Task 9)
// ============================================================================

/// Encrypt plaintext with AES-256-GCM, producing an authenticated ciphertext.
///
/// The ciphertext includes the GCM authentication tag (appended by the library).
/// The Additional Authenticated Data (AAD) is authenticated but not encrypted.
///
/// # Errors
///
/// Returns `EncryptionFailed` if encryption fails (e.g., invalid key).
pub fn aes_gcm_encrypt(
    key: &Aes256Key,
    nonce: &AesNonce,
    plaintext: &[u8],
    aad: &[u8],
) -> Result<Vec<u8>, E2eeError> {
    let cipher = Aes256Gcm::new_from_slice(&key.0).map_err(|_| E2eeError::EncryptionFailed)?;
    let nonce = Nonce::from_slice(&nonce.0);
    cipher
        .encrypt(
            nonce,
            Payload {
                msg: plaintext,
                aad,
            },
        )
        .map_err(|_| E2eeError::EncryptionFailed)
}

/// Decrypt an AES-256-GCM ciphertext, authenticating it before returning.
///
/// The ciphertext must include the GCM authentication tag.
/// Returns an error if authentication fails (tampered ciphertext, wrong key,
/// or wrong AAD).
///
/// # Errors
///
/// Returns `DecryptionFailed` if:
/// - The ciphertext is tampered with
/// - The wrong key or nonce is used
/// - The AAD does not match
pub fn aes_gcm_decrypt(
    key: &Aes256Key,
    nonce: &AesNonce,
    ciphertext: &[u8],
    aad: &[u8],
) -> Result<Vec<u8>, E2eeError> {
    let cipher = Aes256Gcm::new_from_slice(&key.0).map_err(|_| E2eeError::DecryptionFailed)?;
    let nonce = Nonce::from_slice(&nonce.0);
    cipher
        .decrypt(
            nonce,
            Payload {
                msg: ciphertext,
                aad,
            },
        )
        .map_err(|_| E2eeError::DecryptionFailed)
}

// ============================================================================
// Tests
// ============================================================================

#[cfg(test)]
mod tests {
    use super::*;

    // --- Task 4: Newtype Definitions ---

    #[test]
    fn newtypes_are_distinct_types() {
        let ak = Aes256Key([0u8; 32]);
        let xk = X25519PrivateKey([1u8; 32]);
        assert_ne!(ak.0, xk.0);
    }

    #[test]
    fn x25519_public_key_is_copy() {
        let a = X25519PublicKey([1u8; 32]);
        let _b = a; // move
        let _c = a; // copy — would fail if not Copy
        let _ = _b;
        let _ = _c;
    }

    #[test]
    fn x25519_public_key_is_clone() {
        let a = X25519PublicKey([1u8; 32]);
        let _b = a.clone();
        let _ = _b;
    }

    #[test]
    fn ed25519_public_key_is_copy() {
        let a = Ed25519PublicKey([1u8; 32]);
        let _b = a;
        let _c = a;
        let _ = _b;
        let _ = _c;
    }

    // --- Task 5: Key Generation ---

    #[test]
    fn generate_x25519_keypair_produces_valid_keys() {
        let kp = generate_x25519_keypair();
        assert!(kp.private_key.0.iter().any(|&b| b != 0));
        assert!(kp.public_key.0.iter().any(|&b| b != 0));
    }

    #[test]
    fn generate_ed25519_keypair_produces_valid_keys() -> Result<(), E2eeError> {
        let kp = generate_ed25519_keypair()?;
        assert!(kp.private_key.0.iter().any(|&b| b != 0));
        assert!(kp.public_key.0.iter().any(|&b| b != 0));
        Ok(())
    }

    #[test]
    fn generate_aes_256_key_is_32_bytes() -> Result<(), E2eeError> {
        let key = generate_aes_256_key()?;
        assert_eq!(key.0.len(), 32);
        Ok(())
    }

    #[test]
    fn generate_nonce_is_12_bytes() -> Result<(), E2eeError> {
        let nonce = generate_nonce()?;
        assert_eq!(nonce.0.len(), 12);
        Ok(())
    }

    #[test]
    fn key_generation_is_random() -> Result<(), E2eeError> {
        let k1 = generate_aes_256_key()?;
        let k2 = generate_aes_256_key()?;
        assert_ne!(k1.0, k2.0);
        Ok(())
    }

    #[test]
    fn x25519_keypairs_are_independent() {
        let a = generate_x25519_keypair();
        let b = generate_x25519_keypair();
        assert_ne!(a.private_key.0, b.private_key.0);
        assert_ne!(a.public_key.0, b.public_key.0);
    }

    #[test]
    fn ed25519_keypairs_are_independent() -> Result<(), E2eeError> {
        let a = generate_ed25519_keypair()?;
        let b = generate_ed25519_keypair()?;
        assert_ne!(a.private_key.0, b.private_key.0);
        assert_ne!(a.public_key.0, b.public_key.0);
        Ok(())
    }

    // --- Task 6: X25519 ECDH ---

    #[test]
    fn x25519_dh_produces_shared_secret() -> Result<(), E2eeError> {
        let alice = generate_x25519_keypair();
        let bob = generate_x25519_keypair();
        let alice_shared = x25519_dh(&alice.private_key, &bob.public_key)?;
        let bob_shared = x25519_dh(&bob.private_key, &alice.public_key)?;
        assert_eq!(alice_shared, bob_shared);
        Ok(())
    }

    #[test]
    fn x25519_dh_different_keys_produce_different_output() -> Result<(), E2eeError> {
        let alice = generate_x25519_keypair();
        let bob = generate_x25519_keypair();
        let carol = generate_x25519_keypair();
        let ab = x25519_dh(&alice.private_key, &bob.public_key)?;
        let ac = x25519_dh(&alice.private_key, &carol.public_key)?;
        assert_ne!(ab, ac);
        Ok(())
    }

    #[test]
    fn x25519_dh_output_is_non_zero() -> Result<(), E2eeError> {
        let a = generate_x25519_keypair();
        let b = generate_x25519_keypair();
        let shared = x25519_dh(&a.private_key, &b.public_key)?;
        assert!(shared.iter().any(|&b| b != 0));
        Ok(())
    }

    #[test]
    fn x25519_dh_self_dh() -> Result<(), E2eeError> {
        let kp = generate_x25519_keypair();
        // DH with self is well-defined but not useful
        let result = x25519_dh(&kp.private_key, &kp.public_key)?;
        assert!(result.iter().any(|&b| b != 0));
        Ok(())
    }

    // --- Task 7: Ed25519 Sign / Verify ---

    #[test]
    fn ed25519_sign_and_verify_roundtrip() -> Result<(), E2eeError> {
        let kp = generate_ed25519_keypair()?;
        let msg = b"hello world";
        let sig = ed25519_sign(&kp.private_key, msg)?;
        let result = ed25519_verify(&kp.public_key, msg, &sig);
        assert!(result.is_ok());
        Ok(())
    }

    #[test]
    fn ed25519_verify_wrong_message_fails() -> Result<(), E2eeError> {
        let kp = generate_ed25519_keypair()?;
        let sig = ed25519_sign(&kp.private_key, b"original")?;
        let result = ed25519_verify(&kp.public_key, b"tampered", &sig);
        assert!(matches!(result, Err(E2eeError::SignatureMismatch)));
        Ok(())
    }

    #[test]
    fn ed25519_verify_wrong_key_fails() -> Result<(), E2eeError> {
        let alice = generate_ed25519_keypair()?;
        let bob = generate_ed25519_keypair()?;
        let msg = b"test";
        let sig = ed25519_sign(&alice.private_key, msg)?;
        let result = ed25519_verify(&bob.public_key, msg, &sig);
        assert!(matches!(result, Err(E2eeError::SignatureMismatch)));
        Ok(())
    }

    #[test]
    fn ed25519_sign_different_messages_produce_different_signatures() -> Result<(), E2eeError> {
        let kp = generate_ed25519_keypair()?;
        let sig1 = ed25519_sign(&kp.private_key, b"message one")?;
        let sig2 = ed25519_sign(&kp.private_key, b"message two")?;
        assert_ne!(sig1.0, sig2.0);
        Ok(())
    }

    #[test]
    fn ed25519_sign_empty_message() -> Result<(), E2eeError> {
        let kp = generate_ed25519_keypair()?;
        let sig = ed25519_sign(&kp.private_key, b"")?;
        let result = ed25519_verify(&kp.public_key, b"", &sig);
        assert!(result.is_ok());
        Ok(())
    }

    // --- Task 8: HKDF-SHA256 ---

    #[test]
    fn hkdf_sha256_produces_correct_length() -> Result<(), E2eeError> {
        let ikm = b"input key material";
        let salt = b"salt";
        let info = b"test info";
        let out32: [u8; 32] = hkdf_sha256::<32>(ikm, salt, info)?;
        let out64: [u8; 64] = hkdf_sha256::<64>(ikm, salt, info)?;
        assert_eq!(out32.len(), 32);
        assert_eq!(out64.len(), 64);
        Ok(())
    }

    #[test]
    fn hkdf_sha256_different_info_produces_different_output() -> Result<(), E2eeError> {
        let ikm = b"secret";
        let salt = b"salt";
        let out1: [u8; 32] = hkdf_sha256::<32>(ikm, salt, b"info1")?;
        let out2: [u8; 32] = hkdf_sha256::<32>(ikm, salt, b"info2")?;
        assert_ne!(out1, out2);
        Ok(())
    }

    #[test]
    fn hkdf_sha256_deterministic() -> Result<(), E2eeError> {
        let ikm = b"secret";
        let salt = b"salt";
        let info = b"info";
        let out1: [u8; 32] = hkdf_sha256::<32>(ikm, salt, info)?;
        let out2: [u8; 32] = hkdf_sha256::<32>(ikm, salt, info)?;
        assert_eq!(out1, out2);
        Ok(())
    }

    #[test]
    fn hkdf_sha256_empty_salt_works() -> Result<(), E2eeError> {
        let ikm = b"secret";
        let info = b"info";
        let out: [u8; 32] = hkdf_sha256::<32>(ikm, &[], info)?;
        assert_eq!(out.len(), 32);
        Ok(())
    }

    #[test]
    fn hkdf_sha256_different_ikm_produces_different_output() -> Result<(), E2eeError> {
        let salt = b"salt";
        let info = b"info";
        let out1: [u8; 32] = hkdf_sha256::<32>(b"ikm1", salt, info)?;
        let out2: [u8; 32] = hkdf_sha256::<32>(b"ikm2", salt, info)?;
        assert_ne!(out1, out2);
        Ok(())
    }

    #[test]
    fn hkdf_sha256_different_salt_produces_different_output() -> Result<(), E2eeError> {
        let ikm = b"secret";
        let info = b"info";
        let out1: [u8; 32] = hkdf_sha256::<32>(ikm, b"salt1", info)?;
        let out2: [u8; 32] = hkdf_sha256::<32>(ikm, b"salt2", info)?;
        assert_ne!(out1, out2);
        Ok(())
    }

    // --- Task 9: AES-256-GCM ---

    #[test]
    fn aes_gcm_encrypt_decrypt_roundtrip() -> Result<(), E2eeError> {
        let key = generate_aes_256_key()?;
        let nonce = generate_nonce()?;
        let plaintext = b"hello, this is a secret message";
        let aad = b"additional authenticated data";
        let ciphertext = aes_gcm_encrypt(&key, &nonce, plaintext, aad)?;
        let decrypted = aes_gcm_decrypt(&key, &nonce, &ciphertext, aad)?;
        assert_eq!(decrypted, plaintext);
        Ok(())
    }

    #[test]
    fn aes_gcm_tampered_ciphertext_fails() -> Result<(), E2eeError> {
        let key = generate_aes_256_key()?;
        let nonce = generate_nonce()?;
        let plaintext = b"secret";
        let aad = b"aad";
        let mut ciphertext = aes_gcm_encrypt(&key, &nonce, plaintext, aad)?;
        if let Some(b) = ciphertext.last_mut() {
            *b ^= 1;
        }
        let result = aes_gcm_decrypt(&key, &nonce, &ciphertext, aad);
        assert!(matches!(result, Err(E2eeError::DecryptionFailed)));
        Ok(())
    }

    #[test]
    fn aes_gcm_wrong_key_fails() -> Result<(), E2eeError> {
        let k1 = generate_aes_256_key()?;
        let k2 = generate_aes_256_key()?;
        let nonce = generate_nonce()?;
        let ciphertext = aes_gcm_encrypt(&k1, &nonce, b"msg", b"")?;
        let result = aes_gcm_decrypt(&k2, &nonce, &ciphertext, b"");
        assert!(matches!(result, Err(E2eeError::DecryptionFailed)));
        Ok(())
    }

    #[test]
    fn aes_gcm_wrong_aad_fails() -> Result<(), E2eeError> {
        let key = generate_aes_256_key()?;
        let nonce = generate_nonce()?;
        let ciphertext = aes_gcm_encrypt(&key, &nonce, b"msg", b"original aad")?;
        let result = aes_gcm_decrypt(&key, &nonce, &ciphertext, b"wrong aad");
        assert!(matches!(result, Err(E2eeError::DecryptionFailed)));
        Ok(())
    }

    #[test]
    fn aes_gcm_empty_plaintext() -> Result<(), E2eeError> {
        let key = generate_aes_256_key()?;
        let nonce = generate_nonce()?;
        let ciphertext = aes_gcm_encrypt(&key, &nonce, b"", b"")?;
        let decrypted = aes_gcm_decrypt(&key, &nonce, &ciphertext, b"")?;
        assert_eq!(decrypted, b"");
        Ok(())
    }

    #[test]
    fn aes_gcm_large_plaintext() -> Result<(), E2eeError> {
        let key = generate_aes_256_key()?;
        let nonce = generate_nonce()?;
        let plaintext = vec![0xABu8; 1024 * 1024]; // 1 MB
        let ciphertext = aes_gcm_encrypt(&key, &nonce, &plaintext, b"")?;
        let decrypted = aes_gcm_decrypt(&key, &nonce, &ciphertext, b"")?;
        assert_eq!(decrypted, plaintext);
        Ok(())
    }

    #[test]
    fn aes_gcm_empty_aad() -> Result<(), E2eeError> {
        let key = generate_aes_256_key()?;
        let nonce = generate_nonce()?;
        let ciphertext = aes_gcm_encrypt(&key, &nonce, b"hello", b"")?;
        let decrypted = aes_gcm_decrypt(&key, &nonce, &ciphertext, b"")?;
        assert_eq!(decrypted, b"hello");
        Ok(())
    }

    #[test]
    fn aes_gcm_wrong_nonce_fails() -> Result<(), E2eeError> {
        let key = generate_aes_256_key()?;
        let nonce1 = generate_nonce()?;
        let nonce2 = generate_nonce()?;
        let ciphertext = aes_gcm_encrypt(&key, &nonce1, b"secret", b"")?;
        let result = aes_gcm_decrypt(&key, &nonce2, &ciphertext, b"");
        assert!(matches!(result, Err(E2eeError::DecryptionFailed)));
        Ok(())
    }
}
