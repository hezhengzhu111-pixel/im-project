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
