#![allow(clippy::empty_line_after_doc_comments)]

mod session;
pub use session::*;

mod ffi;

// Include the UDL-generated UniFFI scaffolding directly.
// The generated file contains #[uniffi::export_for_udl] stubs that
// produce the actual FFI export symbols (extern "C" functions).
// We include it directly rather than via setup_scaffolding! to avoid
// the recursive setup_scaffolding!("e2ee_ffi") call inside the generated file.
include!(concat!(env!("OUT_DIR"), "/e2ee_ffi.uniffi.rs"));
