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
    let shared_bytes = shared.to_bytes();
    if shared_bytes.iter().all(|byte| *byte == 0) {
        return Err(E2eeError::InvalidPublicKey);
    }
    Ok(shared_bytes)
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

#[cfg(test)]
mod tests;
