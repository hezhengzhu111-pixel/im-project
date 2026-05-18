#![forbid(unsafe_code)]
#![deny(clippy::unwrap_used)]
#![deny(clippy::expect_used)]
#![deny(clippy::panic)]
#![deny(clippy::todo)]
#![deny(clippy::unimplemented)]
#![deny(clippy::indexing_slicing)]
#![deny(clippy::as_conversions)]
#![deny(unused_must_use)]

pub mod errors;
pub mod primitives;
pub mod state;
pub mod ratchet;
pub mod x3dh;

// Re-export commonly used items
pub use errors::E2eeError;
pub use primitives::{
    generate_x25519_keypair, generate_ed25519_keypair, generate_aes_256_key, generate_nonce,
    x25519_dh, ed25519_sign, ed25519_verify, hkdf_sha256, aes_gcm_encrypt, aes_gcm_decrypt,
    Aes256Key, AesNonce, Ed25519KeyPair, Ed25519PrivateKey, Ed25519PublicKey,
    Ed25519Signature, X25519KeyPair, X25519PrivateKey, X25519PublicKey,
};
pub use state::{
    export_state, restore_state, ChainKey, MessageKey, RatchetHeader, RatchetRootKey,
    RatchetState, SkippedKeyStore,
};
pub use ratchet::{
    init_sending_chain, init_receiving_chain, ratchet_encrypt, ratchet_decrypt, MAX_SKIP,
};
