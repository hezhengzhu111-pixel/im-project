//! Verify that the generated UniFFI bindings expose SessionError messages.
//!
//! This test generates Kotlin bindings from the UDL and asserts that the
//! SessionError exception class carries the Rust Display message via
//! the flat_error serialization path (variant_index + to_string(error)).

use camino::Utf8PathBuf;
use std::env;

/// Generate Kotlin bindings and verify that SessionError carries a `message` field.
#[test]
fn kotlin_bindings_expose_session_error_message() {
    let manifest_dir =
        Utf8PathBuf::from(env::var("CARGO_MANIFEST_DIR").expect("CARGO_MANIFEST_DIR not set"));
    let udl_file = manifest_dir.join("src").join("e2ee_ffi.udl");
    let out_dir = manifest_dir.join("target").join("e2ee-bindings-test");

    // Clean previous output
    if out_dir.exists() {
        std::fs::remove_dir_all(&out_dir).expect("clean out dir");
    }

    // Generate Kotlin bindings from the UDL
    uniffi_bindgen::generate_bindings(
        &udl_file,
        None::<&camino::Utf8Path>,
        uniffi_bindgen::bindings::KotlinBindingGenerator,
        Some(&out_dir),
        None::<&camino::Utf8Path>,
        Some("e2ee_ffi"),
        false,
    )
    .expect("Failed to generate Kotlin bindings");

    // Read the generated Kotlin file
    let package_dir = out_dir.join("com").join("im").join("e2ee");
    let kt_file = package_dir.join("e2ee_ffi.kt");
    let kotlin_code =
        std::fs::read_to_string(&kt_file).expect("Failed to read generated Kotlin file");

    // ----------------------------------------------------------------
    // Verify flat_error message exposure contract
    // ----------------------------------------------------------------
    //
    // UniFFI Kotlin backend converts "Error" suffix to "Exception" for error types:
    //   Rust: SessionError  →  Kotlin: SessionException

    // 1. SessionException must be a sealed class with `message` String constructor parameter
    let class_pos = kotlin_code
        .find("sealed class SessionException(message: String)")
        .unwrap_or_else(|| {
            eprintln!("Full Kotlin output saved for debugging");
            panic!("SessionException sealed class with message parameter not found")
        });
    let snippet = &kotlin_code[class_pos..class_pos + 350];
    eprintln!("Found SessionException definition:\n{snippet}");

    // 2. Each error variant subclass must carry the message parameter
    for variant in &[
        "SessionNotFound",
        "SessionAlreadyExists",
        "InvalidStateData",
        "Crypto",
    ] {
        let search = format!("class {variant}(message: String)");
        assert!(
            kotlin_code.contains(&search),
            "Error variant {variant} should have 'message: String' constructor parameter.\n\
             Search string: '{search}'"
        );
    }

    // 3. FfiConverter must read a String (the message) after the variant index
    assert!(
        kotlin_code.contains("FfiConverterString.read(buf)"),
        "FfiConverter should call FfiConverterString.read(buf) to read the Display message \
         after the variant index (flat_error path)."
    );

    // 4. Verify the read method puts the string as the exception message
    let read_pos = kotlin_code.find("FfiConverterString.read(buf)").unwrap();
    let read_snippet = &kotlin_code[read_pos.saturating_sub(60)..read_pos + 80];
    eprintln!("Found FfiConverter read path:\n{read_snippet}");
    assert!(
        read_snippet.contains("SessionException.SessionNotFound")
            || read_snippet.contains("SessionException.SessionAlreadyExists"),
        "FfiConverter should construct exception variant with message from read(buf)"
    );

    println!();
    println!("=== Kotlin Binding Verification PASSED ===");
    println!("flat_error serialization: variant_index(i32) + to_string(error)");
    println!("Kotlin: SessionError → SessionException (naming convention)");
    println!("Kotlin exception.message = Rust Display");
    println!();
    println!("Kotlin caller reads error message via:");
    println!("  try {{ manager.encrypt(...) }}");
    println!("  catch (e: SessionException.SessionNotFound) {{");
    println!("      e.message // \"session not found: my-session-123\"");
    println!("  }}");
    println!();
    println!("Swift caller reads error message via:");
    println!("  do {{ try manager.encrypt(...) }}");
    println!("  catch let error as SessionError {{");
    println!("      error.localizedDescription");
    println!("  }}");
}
