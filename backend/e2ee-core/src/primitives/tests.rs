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
    let _b = a;
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
fn x25519_dh_rejects_all_zero_public_key() {
    let private_key = generate_x25519_keypair();
    let low_order_public_key = X25519PublicKey([0u8; 32]);
    let result = x25519_dh(&private_key.private_key, &low_order_public_key);
    assert!(matches!(result, Err(E2eeError::InvalidPublicKey)));
}

#[test]
fn x25519_dh_rejects_low_order_public_key() {
    let private_key = generate_x25519_keypair();
    let mut public_key_bytes = [0u8; 32];
    if let Some(first_byte) = public_key_bytes.first_mut() {
        *first_byte = 1;
    }
    let low_order_public_key = X25519PublicKey(public_key_bytes);
    let result = x25519_dh(&private_key.private_key, &low_order_public_key);
    assert!(matches!(result, Err(E2eeError::InvalidPublicKey)));
}

#[test]
fn x25519_dh_self_dh() -> Result<(), E2eeError> {
    let kp = generate_x25519_keypair();
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
