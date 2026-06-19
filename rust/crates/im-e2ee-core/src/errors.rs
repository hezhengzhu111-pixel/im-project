use thiserror::Error;

#[derive(Error, Debug, PartialEq, Eq)]
pub enum E2eeError {
    // === Encryption ===
    #[error("AES-GCM encryption failed")]
    EncryptionFailed,
    #[error("AES-GCM decryption failed: authentication tag mismatch or corrupted data")]
    DecryptionFailed,

    // === Key ===
    #[error("HKDF expand operation failed")]
    HkdfExpandFailed,
    #[error("invalid X25519 public key")]
    InvalidPublicKey,
    #[error("invalid Ed25519 signature")]
    InvalidSignature,
    #[error("Ed25519 signature mismatch")]
    SignatureMismatch,

    // === X3DH ===
    #[error("X3DH: signed pre-key signature verification rejected")]
    SpkSignatureRejected,
    #[error("invalid pre-key id: {0}")]
    InvalidPreKeyId(String),

    // === Ratchet ===
    #[error("sending chain not initialized")]
    SendingChainNotInitialized,
    #[error("receiving chain not initialized")]
    ReceivingChainNotInitialized,
    #[error("counter gap {0} exceeds max skip {1}")]
    CounterGapExceeded(u32, u32),
    #[error("duplicate or expired message")]
    DuplicateOrExpiredMessage,
    #[error("invalid counter: {0}")]
    InvalidCounter(String),
    #[error("max skipped message keys limit reached")]
    MaxSkippedKeysExceeded,

    // === Serialization ===
    #[error("ratchet state serialization failed: {0}")]
    StateSerializationFailed(String),
    #[error("ratchet state deserialization failed: corrupted data")]
    StateDeserializationFailed,

    // === Wire Format ===
    #[error("invalid header format: {0}")]
    InvalidHeader(String),
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn error_display_does_not_panic() {
        // Verify errors can be formatted
        let e = E2eeError::EncryptionFailed;
        let msg = format!("{}", e);
        assert_eq!(msg, "AES-GCM encryption failed");
    }

    #[test]
    fn error_with_params_formats_correctly() {
        let e = E2eeError::CounterGapExceeded(2500, 2000);
        let msg = format!("{}", e);
        assert_eq!(msg, "counter gap 2500 exceeds max skip 2000");
    }

    #[test]
    fn error_equality() {
        assert_eq!(E2eeError::EncryptionFailed, E2eeError::EncryptionFailed);
        assert_ne!(E2eeError::EncryptionFailed, E2eeError::DecryptionFailed);
    }
}
