use aes_gcm::aead::Aead;
use aes_gcm::{Aes256Gcm, Key, KeyInit, Nonce};
use keyring::Entry;
use rand_core::RngCore;
use zeroize::Zeroize;

/// 安全存储服务
pub struct SecureKeyStore {
    service_name: String,
}

impl SecureKeyStore {
    /// 创建新的安全存储实例
    pub fn new(service_name: &str) -> Self {
        Self {
            service_name: service_name.to_string(),
        }
    }

    /// 从操作系统安全存储获取主密钥
    pub fn get_master_key(&self) -> Result<Vec<u8>, String> {
        let entry = Entry::new(&self.service_name, "master_key")
            .map_err(|e| format!("Failed to create keyring entry: {}", e))?;

        let password = entry
            .get_password()
            .map_err(|e| format!("Failed to get master key: {}", e))?;

        Ok(password.into_bytes())
    }

    /// 保存主密钥到操作系统安全存储
    pub fn set_master_key(&self, key: &[u8]) -> Result<(), String> {
        let entry = Entry::new(&self.service_name, "master_key")
            .map_err(|e| format!("Failed to create keyring entry: {}", e))?;

        entry
            .set_password(&String::from_utf8_lossy(key))
            .map_err(|e| format!("Failed to set master key: {}", e))?;

        Ok(())
    }

    /// 加密敏感数据
    pub fn encrypt(&self, data: &[u8], master_key: &[u8]) -> Result<Vec<u8>, String> {
        let key = Key::<Aes256Gcm>::from_slice(master_key);
        let cipher = Aes256Gcm::new(key);

        // 生成随机 nonce
        let mut nonce_bytes = [0u8; 12];
        let mut rng = rand_core::OsRng;
        rng.fill_bytes(&mut nonce_bytes);
        let nonce = Nonce::from_slice(&nonce_bytes);

        let mut ciphertext = cipher
            .encrypt(nonce, data)
            .map_err(|e| format!("Encryption failed: {}", e))?;

        // 将 nonce 添加到密文前面
        let mut result = nonce_bytes.to_vec();
        result.append(&mut ciphertext);

        Ok(result)
    }

    /// 解密敏感数据
    pub fn decrypt(&self, ciphertext: &[u8], master_key: &[u8]) -> Result<Vec<u8>, String> {
        if ciphertext.len() < 12 {
            return Err("Invalid ciphertext".to_string());
        }

        let key = Key::<Aes256Gcm>::from_slice(master_key);
        let cipher = Aes256Gcm::new(key);

        // 提取 nonce
        let nonce = Nonce::from_slice(&ciphertext[..12]);
        let actual_ciphertext = &ciphertext[12..];

        let plaintext = cipher
            .decrypt(nonce, actual_ciphertext)
            .map_err(|e| format!("Decryption failed: {}", e))?;

        Ok(plaintext)
    }

    /// 安全删除密钥
    pub fn delete_master_key(&self) -> Result<(), String> {
        let entry = Entry::new(&self.service_name, "master_key")
            .map_err(|e| format!("Failed to create keyring entry: {}", e))?;

        entry
            .delete_password()
            .map_err(|e| format!("Failed to delete master key: {}", e))?;

        Ok(())
    }
}

/// 安全内存缓冲区
#[frb(opaque)]
pub struct SecureBuffer {
    data: Vec<u8>,
}

impl SecureBuffer {
    /// 创建新的安全缓冲区
    pub fn new(data: Vec<u8>) -> Self {
        Self { data }
    }

    /// 安全清零内存
    pub fn secure_zero(&mut self) {
        self.data.zeroize();
    }

    /// 获取数据引用
    pub fn data(&self) -> &[u8] {
        &self.data
    }
}

impl Drop for SecureBuffer {
    fn drop(&mut self) {
        self.secure_zero();
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    /// 测试安全缓冲区的创建和清零
    #[test]
    fn test_secure_buffer() {
        let data = vec![1u8, 2, 3, 4, 5];
        let mut buffer = SecureBuffer::new(data.clone());
        assert_eq!(buffer.data(), &data[..]);
        buffer.secure_zero();
        // zeroize 清零并截断 Vec
        assert!(buffer.data().is_empty());
    }

    /// 测试 SecureBuffer Drop 自动清零
    #[test]
    fn test_secure_buffer_drop() {
        let data = vec![10u8, 20, 30];
        let buffer = SecureBuffer::new(data);
        assert_eq!(buffer.data(), &[10u8, 20, 30]);
        drop(buffer);
        // Drop 已经调用 secure_zero，验证不会 panic
    }

    /// 测试加密和解密往返
    #[test]
    fn test_encrypt_decrypt_roundtrip() {
        let store = SecureKeyStore::new("test_roundtrip");
        let master_key = vec![42u8; 32]; // 模拟 256-bit 密钥
        let plaintext = b"Hello, secure world!";

        let ciphertext = store.encrypt(plaintext, &master_key).expect("encrypt failed");
        assert_ne!(&ciphertext[..12], &[0u8; 12], "nonce should be random");

        let decrypted = store.decrypt(&ciphertext, &master_key).expect("decrypt failed");
        assert_eq!(decrypted, plaintext);
    }

    /// 测试解密无效密文
    #[test]
    fn test_decrypt_invalid_ciphertext() {
        let store = SecureKeyStore::new("test_invalid");
        let master_key = vec![42u8; 32];

        let result = store.decrypt(&[0u8; 5], &master_key);
        assert!(result.is_err());
    }

    /// 测试解密错误密钥
    #[test]
    fn test_decrypt_wrong_key() {
        let store = SecureKeyStore::new("test_wrong_key");
        let key1 = vec![1u8; 32];
        let key2 = vec![2u8; 32];
        let plaintext = b"secret data";

        let ciphertext = store.encrypt(plaintext, &key1).expect("encrypt failed");
        let result = store.decrypt(&ciphertext, &key2);
        assert!(result.is_err(), "decryption with wrong key should fail");
    }
}
