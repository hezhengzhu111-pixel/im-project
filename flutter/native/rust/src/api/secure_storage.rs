use serde::{Deserialize, Serialize};

// ---- Native implementation ----
#[cfg(feature = "native")]
mod native_impl {
    use aes_gcm::aead::Aead;
    use aes_gcm::{Aes256Gcm, Key, KeyInit, Nonce};
    use keyring::Entry;
    use rand_core::RngCore;
    use zeroize::Zeroize;

    pub struct SecureKeyStore {
        pub service_name: String,
    }

    impl SecureKeyStore {
        pub fn new(service_name: &str) -> Self {
            Self { service_name: service_name.to_string() }
        }

        pub fn get_master_key(&self) -> Result<Vec<u8>, String> {
            let entry = Entry::new(&self.service_name, "master_key")
                .map_err(|e| format!("Failed to create keyring entry: {}", e))?;
            let password = entry.get_password()
                .map_err(|e| format!("Failed to get master key: {}", e))?;
            Ok(password.into_bytes())
        }

        pub fn set_master_key(&self, key: &[u8]) -> Result<(), String> {
            let entry = Entry::new(&self.service_name, "master_key")
                .map_err(|e| format!("Failed to create keyring entry: {}", e))?;
            entry.set_password(&String::from_utf8_lossy(key))
                .map_err(|e| format!("Failed to set master key: {}", e))?;
            Ok(())
        }

        pub fn encrypt(&self, data: &[u8], master_key: &[u8]) -> Result<Vec<u8>, String> {
            let key = Key::<Aes256Gcm>::from_slice(master_key);
            let cipher = Aes256Gcm::new(key);
            let mut nonce_bytes = [0u8; 12];
            let mut rng = rand_core::OsRng;
            rng.fill_bytes(&mut nonce_bytes);
            let nonce = Nonce::from_slice(&nonce_bytes);
            let mut ciphertext = cipher.encrypt(nonce, data)
                .map_err(|e| format!("Encryption failed: {}", e))?;
            let mut result = nonce_bytes.to_vec();
            result.append(&mut ciphertext);
            Ok(result)
        }

        pub fn decrypt(&self, ciphertext: &[u8], master_key: &[u8]) -> Result<Vec<u8>, String> {
            if ciphertext.len() < 12 { return Err("Invalid ciphertext".to_string()); }
            let key = Key::<Aes256Gcm>::from_slice(master_key);
            let cipher = Aes256Gcm::new(key);
            let nonce = Nonce::from_slice(&ciphertext[..12]);
            let actual_ciphertext = &ciphertext[12..];
            let plaintext = cipher.decrypt(nonce, actual_ciphertext)
                .map_err(|e| format!("Decryption failed: {}", e))?;
            Ok(plaintext)
        }

        pub fn delete_master_key(&self) -> Result<(), String> {
            let entry = Entry::new(&self.service_name, "master_key")
                .map_err(|e| format!("Failed to create keyring entry: {}", e))?;
            entry.delete_password()
                .map_err(|e| format!("Failed to delete master key: {}", e))?;
            Ok(())
        }
    }

    pub struct SecureBuffer {
        data: Vec<u8>,
    }

    impl SecureBuffer {
        pub fn new(data: Vec<u8>) -> Self { Self { data } }
        pub fn secure_zero(&mut self) { self.data.zeroize(); }
        pub fn data(&self) -> &[u8] { &self.data }
    }

    impl Drop for SecureBuffer {
        fn drop(&mut self) { self.secure_zero(); }
    }
}

// ---- WASM stub ----
#[cfg(not(feature = "native"))]
mod native_impl {
    pub struct SecureKeyStore {
        pub service_name: String,
    }
    impl SecureKeyStore {
        pub fn new(service_name: &str) -> Self { Self { service_name: service_name.to_string() } }
        pub fn get_master_key(&self) -> Result<Vec<u8>, String> { Err("Not available in WASM".into()) }
        pub fn set_master_key(&self, _key: &[u8]) -> Result<(), String> { Err("Not available in WASM".into()) }
        pub fn encrypt(&self, _data: &[u8], _master_key: &[u8]) -> Result<Vec<u8>, String> { Err("Not available in WASM".into()) }
        pub fn decrypt(&self, _ciphertext: &[u8], _master_key: &[u8]) -> Result<Vec<u8>, String> { Err("Not available in WASM".into()) }
        pub fn delete_master_key(&self) -> Result<(), String> { Err("Not available in WASM".into()) }
    }

    pub struct SecureBuffer { data: Vec<u8> }
    impl SecureBuffer {
        pub fn new(data: Vec<u8>) -> Self { Self { data } }
        pub fn secure_zero(&mut self) { self.data.fill(0); }
        pub fn data(&self) -> &[u8] { &self.data }
    }
}

pub use native_impl::{SecureKeyStore, SecureBuffer};
