use aes_gcm::aead::{Aead, OsRng};
use aes_gcm::{AeadCore, Aes256Gcm, KeyInit};
use base64::engine::general_purpose::STANDARD as B64;
use base64::Engine;

use crate::error::AppError;

/// Decode the 32-byte AES-256-GCM master key from a base64 env var.
pub fn load_master_key(encoded: &str) -> Result<[u8; 32], AppError> {
    let bytes = B64
        .decode(encoded.trim())
        .map_err(|_| AppError::BadRequest("invalid AI encryption key encoding".to_string()))?;
    if bytes.len() != 32 {
        return Err(AppError::BadRequest(
            "AI encryption key must be exactly 32 bytes".to_string(),
        ));
    }
    let mut key = [0u8; 32];
    key.copy_from_slice(bytes.as_slice());
    Ok(key)
}

/// Encrypt `plaintext` using AES-256-GCM.
///
/// Returns a base64-encoded string consisting of: `nonce (12) || ciphertext || tag (16)`.
pub fn encrypt(plaintext: &str, master_key: &[u8; 32]) -> Result<String, AppError> {
    let cipher = Aes256Gcm::new_from_slice(master_key)
        .map_err(|_| AppError::BadRequest("bad key".into()))?;
    let nonce = Aes256Gcm::generate_nonce(&mut OsRng);
    let ciphertext = cipher
        .encrypt(&nonce, plaintext.as_bytes())
        .map_err(|_| AppError::BadRequest("encryption failed".into()))?;
    let mut output = Vec::with_capacity(nonce.len() + ciphertext.len());
    output.extend_from_slice(&nonce);
    output.extend_from_slice(&ciphertext);
    Ok(B64.encode(&output))
}

/// Decrypt a base64-encoded ciphertext previously produced by [`encrypt`].
pub fn decrypt(encoded: &str, master_key: &[u8; 32]) -> Result<String, AppError> {
    let data = B64
        .decode(encoded.trim())
        .map_err(|_| AppError::BadRequest("invalid ciphertext encoding".into()))?;
    if data.len() < 28 {
        return Err(AppError::BadRequest("ciphertext too short".into()));
    }
    let (nonce_bytes, ciphertext) = data.split_at(12);
    let nonce = aes_gcm::Nonce::from_slice(nonce_bytes);
    let cipher = Aes256Gcm::new_from_slice(master_key)
        .map_err(|_| AppError::BadRequest("bad key".into()))?;
    let plaintext = cipher
        .decrypt(nonce, ciphertext)
        .map_err(|_| AppError::BadRequest("decryption failed".into()))?;
    String::from_utf8(plaintext).map_err(|_| AppError::BadRequest("invalid utf-8".into()))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn encrypt_decrypt_roundtrip() {
        let key: [u8; 32] = [0xAA; 32];
        let plain = "sk-test-api-key-123456";
        let encoded = encrypt(plain, &key).expect("encrypt");
        let decrypted = decrypt(&encoded, &key).expect("decrypt");
        assert_eq!(decrypted, plain);
    }

    #[test]
    fn different_ciphertext_each_time() {
        let key: [u8; 32] = [0xBB; 32];
        let plain = "hello";
        let a = encrypt(plain, &key).expect("encrypt");
        let b = encrypt(plain, &key).expect("encrypt");
        assert_ne!(a, b);
    }

    #[test]
    fn tampered_ciphertext_fails() {
        let key: [u8; 32] = [0xCC; 32];
        let encoded = encrypt("secret", &key).expect("encrypt");
        let mut tampered = encoded.clone();
        tampered.replace_range(14..15, "X");
        let result = decrypt(&tampered, &key);
        assert!(result.is_err());
    }

    #[test]
    fn invalid_encoding_fails() {
        let key: [u8; 32] = [0xDD; 32];
        let result = decrypt("not-base64!!!", &key);
        assert!(result.is_err());
    }
}
