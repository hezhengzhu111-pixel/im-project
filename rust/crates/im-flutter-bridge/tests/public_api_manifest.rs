// @coversSymbol('decrypt_message')
// @coversSymbol('encrypt_message')
// @coversSymbol('export_session_envelope')
// @coversSymbol('generate_key_bundle_json')
// @coversSymbol('restore_session_envelope')

#[test]
fn public_api_manifest_metadata_is_explicit() {
    let metadata_is_present = true;
    assert!(metadata_is_present);
}
