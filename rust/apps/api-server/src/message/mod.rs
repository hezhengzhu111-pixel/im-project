pub mod message_cache;
pub mod message_conversation;
pub mod message_e2ee;
pub mod message_helpers;
pub mod message_read;
pub mod message_redis;
pub mod message_send;
pub mod message_types;

#[cfg(test)]
use im_common::event::{E2eeEnvelopeDto, MessageDto};
#[cfg(test)]
use serde_json;

pub(crate) use message_cache::*;
pub(crate) use message_conversation::*;
pub(crate) use message_e2ee::*;
pub(crate) use message_helpers::*;
pub(crate) use message_read::*;
pub(crate) use message_redis::*;
pub(crate) use message_send::*;
pub(crate) use message_types::*;

#[cfg(test)]
mod message_cache_tests;
mod message_e2ee_tests;
mod message_helpers_tests;

const VALIDATION_CACHE_TTL_SECONDS: u64 = 5 * 60;
const VALIDATION_NEGATIVE_CACHE_TTL_SECONDS: u64 = 60;
const MAX_FRIENDS_PRELOAD: i64 = 10_000;
const FNV_OFFSET_BASIS: u64 = 14_695_981_039_346_656_037;
const FNV_PRIME: u64 = 1_099_511_628_211;

/// 私聊消息发送请求体。
///
/// `receiver_id` 支持数字和字符串两种 JSON 格式（通过 `deserialize_i64` 兼容）。
/// E2EE messages must use the Rust v2 envelope. Legacy header/ciphertext

#[cfg(test)]
mod tests {
    use super::*;

    fn rust_wire_base64_for_tests() -> String {
        let mut wire = vec![0_u8, 0_u8, 0_u8, 52_u8];
        wire.extend(std::iter::repeat(1_u8).take(52));
        base64::Engine::encode(&base64::engine::general_purpose::STANDARD, wire)
    }

    fn rust_e2ee_envelope_for_tests() -> E2eeEnvelopeDto {
        E2eeEnvelopeDto {
            version: 2,
            alg: "rust-x25519-x3dh-dr-v1".to_string(),
            conversation_id: String::new(),
            client_msg_id: "cm-mobile".to_string(),
            server_message_id: None,
            sender_user_id: "1".to_string(),
            sender_device_id: "mobile-sender".to_string(),
            recipient_user_id: Some("2".to_string()),
            recipient_device_ids: Vec::new(),
            session_id: "1_2".to_string(),
            key_id: String::new(),
            key_version: 0,
            iv: String::new(),
            aad: String::new(),
            ciphertext: String::new(),
            created_at: 0,
            wire: Some(rust_wire_base64_for_tests()),
            handshake: Some("aGFuZHNoYWtl".to_string()),
            recipient_device_id: Some("mobile-recipient".to_string()),
        }
    }

    fn private_request_with_e2ee_envelope(envelope: E2eeEnvelopeDto) -> SendPrivateRequest {
        SendPrivateRequest {
            receiver_id: 2,
            client_message_id: Some("cm-mobile".to_string()),
            message_type: Some("TEXT".to_string()),
            content: None,
            media_url: None,
            media_size: None,
            media_name: None,
            thumbnail_url: None,
            duration: None,
            encrypted: Some(true),
            e2ee_header: None,
            e2ee_device_id: Some("mobile-sender".to_string()),
            e2ee_sender_identity_key: None,
            e2ee_ephemeral_key: None,
            e2ee_envelope: Some(envelope),
        }
    }

    #[test]
    fn mobile_rust_v2_envelope_format_is_accepted() {
        let envelope = rust_e2ee_envelope_for_tests();
        assert!(validate_e2ee_envelope_format(&envelope).is_ok());
    }

    #[test]
    fn legacy_e2ee_envelope_format_is_rejected() {
        let mut envelope = rust_e2ee_envelope_for_tests();
        envelope.version = 1;
        envelope.alg = "legacy-e2ee".to_string();
        assert!(validate_e2ee_envelope_format(&envelope).is_err());
    }

    #[test]
    fn mobile_rust_v2_private_request_shape_is_accepted() {
        let request = private_request_with_e2ee_envelope(rust_e2ee_envelope_for_tests());
        assert!(private_e2ee_envelope_from_request(&request).is_ok());
    }

    #[test]
    fn private_e2ee_request_with_plaintext_content_is_rejected() {
        let mut request = private_request_with_e2ee_envelope(rust_e2ee_envelope_for_tests());
        request.content = Some("plaintext secret".to_string());
        assert!(private_e2ee_envelope_from_request(&request).is_err());
    }

    #[test]
    fn private_e2ee_request_with_legacy_header_is_rejected() {
        let mut request = private_request_with_e2ee_envelope(rust_e2ee_envelope_for_tests());
        request.e2ee_header = Some("legacy-header".to_string());
        assert!(private_e2ee_envelope_from_request(&request).is_err());
    }

    #[test]
    fn group_message_payload_should_keep_sequence_placeholder(
    ) -> Result<(), Box<dyn std::error::Error>> {
        let message = MessageDto {
            id: "1".to_string(),
            message_id: "1".to_string(),
            client_message_id: None,
            sender_id: "10".to_string(),
            sender_name: None,
            sender_avatar: None,
            receiver_id: None,
            receiver_name: None,
            group_id: Some("20".to_string()),
            conversation_seq: None,
            group_name: None,
            group_avatar: None,
            is_group_chat: true,
            is_group: true,
            message_type: "TEXT".to_string(),
            content: Some("hello".to_string()),
            media_url: None,
            media_size: None,
            media_name: None,
            thumbnail_url: None,
            duration: None,
            location_info: None,
            status: "SENT".to_string(),
            reply_to_message_id: None,
            created_time: "2026-04-28T00:00:00Z".to_string(),
            created_at: "2026-04-28T00:00:00Z".to_string(),
            updated_time: None,
            updated_at: None,
            is_ai_generated: None,
            ai_provider: None,
            ai_model: None,
            encrypted: None,
            e2ee_header: None,
            e2ee_device_id: None,
            e2ee_sender_identity_key: None,
            e2ee_ephemeral_key: None,
            e2ee_envelope: None,
        };
        let event = build_message_created_event("g_20", &message);
        let message_json = serde_json::to_string(&message)?;
        let event_json = serde_json::to_string(&event)?;

        if !message_json.contains("\"conversationSeq\":null") {
            return Err("message JSON must expose the sequence placeholder".into());
        }
        if !event_json.contains("\"conversationSeq\":null") {
            return Err("event payload JSON must expose the sequence placeholder".into());
        }
        Ok(())
    }

    #[test]
    fn group_unread_count_should_saturate() -> Result<(), &'static str> {
        if group_unread_count(10, 3) != 7 {
            return Err("group unread should be group sequence minus read sequence");
        }
        if group_unread_count(3, 10) != 0 {
            return Err("group unread should not be negative");
        }
        if group_unread_count(-1, 10) != 0 {
            return Err("negative group sequence should be treated as zero");
        }
        Ok(())
    }

    #[test]
    fn pending_event_member_should_include_conversation_id() -> Result<(), &'static str> {
        if pending_event_member("100", "g_20") != "100|g_20" {
            return Err("pending event member should encode event and conversation ids");
        }
        Ok(())
    }

    #[test]
    fn validate_mentioned_user_ids_deduplicates() -> Result<(), Box<dyn std::error::Error>> {
        let input = vec!["100".to_string(), "200".to_string(), "100".to_string()];
        let result = validate_mentioned_user_ids(&input, 1)?;
        assert_eq!(result, vec![100, 200]);
        Ok(())
    }

    #[test]
    fn validate_mentioned_user_ids_excludes_sender() -> Result<(), Box<dyn std::error::Error>> {
        let input = vec!["100".to_string(), "200".to_string()];
        let result = validate_mentioned_user_ids(&input, 100)?;
        assert_eq!(result, vec![200]);
        Ok(())
    }

    #[test]
    fn validate_mentioned_user_ids_rejects_invalid_string() {
        let input = vec!["abc".to_string()];
        let result = validate_mentioned_user_ids(&input, 1);
        assert!(result.is_err());
    }

    #[test]
    fn validate_mentioned_user_ids_trims_whitespace() -> Result<(), Box<dyn std::error::Error>> {
        let input = vec![" 100 ".to_string(), "\t200\t".to_string()];
        let result = validate_mentioned_user_ids(&input, 1)?;
        assert_eq!(result, vec![100, 200]);
        Ok(())
    }

    #[test]
    fn validate_mentioned_user_ids_empty_input() -> Result<(), Box<dyn std::error::Error>> {
        let input: Vec<String> = vec![];
        let result = validate_mentioned_user_ids(&input, 1)?;
        assert!(result.is_empty());
        Ok(())
    }

    #[test]
    fn validate_mentioned_user_ids_all_sender_excluded() -> Result<(), Box<dyn std::error::Error>> {
        let input = vec!["50".to_string(), "50".to_string()];
        let result = validate_mentioned_user_ids(&input, 50)?;
        assert!(result.is_empty());
        Ok(())
    }

    // ---------- e2ee_session_id_matches ----------

    #[test]
    fn e2ee_session_id_without_prefix_matches() -> Result<(), &'static str> {
        e2ee_session_id_matches("1_2", "p_1_2").map_err(|_| "should match")?;
        Ok(())
    }

    #[test]
    fn e2ee_session_id_with_p_prefix_when_conv_has_p() -> Result<(), &'static str> {
        // conversation_id 本就不带 p_ 时也应匹配
        e2ee_session_id_matches("1_2", "1_2").map_err(|_| "should match")?;
        Ok(())
    }

    #[test]
    fn e2ee_session_id_mismatch_rejected() {
        let result = e2ee_session_id_matches("1_3", "p_1_2");
        assert!(result.is_err());
    }

    #[test]
    fn e2ee_session_id_empty_rejected() {
        let result = e2ee_session_id_matches("", "p_1_2");
        assert!(result.is_err());
    }

    #[test]
    fn e2ee_session_id_whitespace_only_rejected() {
        let result = e2ee_session_id_matches("  ", "p_1_2");
        assert!(result.is_err());
    }
}
