fn main() {
    if let Err(e) = uniffi::generate_scaffolding("src/e2ee_ffi.udl") {
        eprintln!("Failed to generate UniFFI scaffolding from src/e2ee_ffi.udl: {e}");
        std::process::exit(1);
    }
}
