#[cfg(test)]
mod message_e2ee_tests {
    use crate::message::message_e2ee;
    use im_rs_common::event::E2eeEnvelopeDto;

    fn valid_rust_v2_envelope() -> E2eeEnvelopeDto {
        let mut wire = vec![0_u8, 0_u8, 0_u8, 52_u8];
        wire.extend(std::iter::repeat(1_u8).take(52));
        let wire_b64 = base64::Engine::encode(&base64::engine::general_purpose::STANDARD, wire);
        E2eeEnvelopeDto {
            version: 2,
            alg: "rust-x25519-x3dh-dr-v1".to_string(),
            conversation_id: String::new(),
            client_msg_id: "cm-test".to_string(),
            server_message_id: None,
            sender_user_id: "1".to_string(),
            sender_device_id: "device-1".to_string(),
            recipient_user_id: Some("2".to_string()),
            recipient_device_ids: vec![],
            session_id: "1_2".to_string(),
            key_id: String::new(),
            key_version: 0,
            iv: String::new(),
            aad: String::new(),
            ciphertext: String::new(),
            created_at: 0,
            wire: Some(wire_b64),
            handshake: None,
            recipient_device_id: Some("device-2".to_string()),
        }
    }

    #[test]
    fn rust_v2_envelope_format_is_valid() {
        let envelope = valid_rust_v2_envelope();
        assert!(message_e2ee::validate_e2ee_envelope_format(&envelope).is_ok());
    }

    #[test]
    fn legacy_version_rejected() {
        let mut envelope = valid_rust_v2_envelope();
        envelope.version = 1;
        envelope.alg = "legacy-e2ee".to_string();
        assert!(message_e2ee::validate_e2ee_envelope_format(&envelope).is_err());
    }

    #[test]
    fn missing_wire_rejected() {
        let mut envelope = valid_rust_v2_envelope();
        envelope.wire = None;
        assert!(message_e2ee::validate_e2ee_envelope_format(&envelope).is_err());
    }

    #[test]
    fn short_wire_rejected() {
        let mut envelope = valid_rust_v2_envelope();
        envelope.wire = Some(base64::Engine::encode(
            &base64::engine::general_purpose::STANDARD,
            vec![0_u8; 10],
        ));
        assert!(message_e2ee::validate_e2ee_envelope_format(&envelope).is_err());
    }

    #[test]
    fn empty_sender_device_id_rejected() {
        let mut envelope = valid_rust_v2_envelope();
        envelope.sender_device_id = String::new();
        assert!(message_e2ee::validate_e2ee_envelope_format(&envelope).is_err());
    }

    #[test]
    fn whitespace_sender_device_id_rejected() {
        let mut envelope = valid_rust_v2_envelope();
        envelope.sender_device_id = "   ".to_string();
        assert!(message_e2ee::validate_e2ee_envelope_format(&envelope).is_err());
    }

    #[test]
    fn session_id_matches_with_p_prefix() {
        assert!(message_e2ee::e2ee_session_id_matches("1_2", "p_1_2").is_ok());
    }

    #[test]
    fn session_id_matches_without_prefix() {
        assert!(message_e2ee::e2ee_session_id_matches("1_2", "1_2").is_ok());
    }

    #[test]
    fn session_id_mismatch_rejected() {
        assert!(message_e2ee::e2ee_session_id_matches("1_3", "p_1_2").is_err());
    }

    #[test]
    fn empty_session_id_rejected() {
        assert!(message_e2ee::e2ee_session_id_matches("", "p_1_2").is_err());
    }

    #[test]
    fn whitespace_session_id_rejected() {
        assert!(message_e2ee::e2ee_session_id_matches("  ", "p_1_2").is_err());
    }

    #[test]
    fn resolve_recipient_device_ids_from_list() {
        let mut envelope = valid_rust_v2_envelope();
        envelope.recipient_device_ids = vec!["d1".to_string(), "d2".to_string()];
        envelope.recipient_device_id = None;
        let ids = message_e2ee::resolve_recipient_device_ids(&envelope);
        assert_eq!(ids, vec!["d1", "d2"]);
    }

    #[test]
    fn resolve_recipient_device_ids_from_single_field() {
        let mut envelope = valid_rust_v2_envelope();
        envelope.recipient_device_ids = vec![];
        envelope.recipient_device_id = Some("d-single".to_string());
        let ids = message_e2ee::resolve_recipient_device_ids(&envelope);
        assert_eq!(ids, vec!["d-single"]);
    }

    #[test]
    fn resolve_recipient_device_ids_empty() {
        let mut envelope = valid_rust_v2_envelope();
        envelope.recipient_device_ids = vec![];
        envelope.recipient_device_id = None;
        let ids = message_e2ee::resolve_recipient_device_ids(&envelope);
        assert!(ids.is_empty());
    }

    #[test]
    fn invalid_wire_header_length_rejected() {
        let mut wire = vec![0_u8, 0_u8, 0_u8, 99_u8]; // header claims 99 bytes
        wire.extend(std::iter::repeat(1_u8).take(99));
        let wire_b64 = base64::Engine::encode(&base64::engine::general_purpose::STANDARD, wire);
        let mut envelope = valid_rust_v2_envelope();
        envelope.wire = Some(wire_b64);
        assert!(message_e2ee::validate_e2ee_envelope_format(&envelope).is_err());
    }
}
