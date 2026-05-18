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
pub mod ratchet;
pub mod state;
pub mod x3dh;

// Re-export commonly used items
pub use errors::E2eeError;
pub use primitives::{
    aes_gcm_decrypt, aes_gcm_encrypt, ed25519_sign, ed25519_verify, generate_aes_256_key,
    generate_ed25519_keypair, generate_nonce, generate_x25519_keypair, hkdf_sha256, x25519_dh,
    Aes256Key, AesNonce, Ed25519KeyPair, Ed25519PrivateKey, Ed25519PublicKey, Ed25519Signature,
    X25519KeyPair, X25519PrivateKey, X25519PublicKey,
};
pub use ratchet::{
    init_receiving_chain, init_sending_chain, ratchet_decrypt, ratchet_encrypt, MAX_SKIP,
};
pub use state::{
    export_state, restore_state, ChainKey, MessageKey, RatchetHeader, RatchetRootKey, RatchetState,
    SkippedKeyStore,
};
pub use x3dh::{
    generate_key_bundle, x3dh_initiate, x3dh_respond, KeyBundle, PreKey, PreKeyBundle,
    PreKeyBundleFetch, X3dhInitiateResult, X3dhRespondResult,
};
