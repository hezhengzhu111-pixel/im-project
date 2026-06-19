#![forbid(unsafe_code)]

#[cfg(test)]
mod message_helpers_tests {
    use crate::message::message_e2ee;
    use crate::message::message_helpers;
    use crate::message::message_types::{ConversationDto, GroupConversationSource};

    #[test]
    fn group_unread_count_positive() {
        assert_eq!(message_helpers::group_unread_count(10, 3), 7);
    }

    #[test]
    fn group_unread_count_zero_when_read_ahead() {
        assert_eq!(message_helpers::group_unread_count(3, 10), 0);
    }

    #[test]
    fn group_unread_count_zero_when_equal() {
        assert_eq!(message_helpers::group_unread_count(5, 5), 0);
    }

    #[test]
    fn group_unread_count_negative_seq_handled() {
        assert_eq!(message_helpers::group_unread_count(-1, 10), 0);
        assert_eq!(message_helpers::group_unread_count(10, -1), 10);
    }

    #[test]
    fn within_recall_window_rejects_old_message() {
        let message = im_common::event::MessageDto {
            id: "1".to_string(),
            message_id: "1".to_string(),
            client_message_id: None,
            sender_id: "1".to_string(),
            sender_name: None,
            sender_avatar: None,
            receiver_id: Some("2".to_string()),
            receiver_name: None,
            group_id: None,
            conversation_seq: None,
            group_name: None,
            group_avatar: None,
            is_group_chat: false,
            is_group: false,
            message_type: "TEXT".to_string(),
            content: None,
            media_url: None,
            media_size: None,
            media_name: None,
            thumbnail_url: None,
            duration: None,
            location_info: None,
            status: "SENT".to_string(),
            reply_to_message_id: None,
            created_time: "2020-01-01T00:00:00Z".to_string(),
            created_at: "2020-01-01T00:00:00Z".to_string(),
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
        assert!(!message_helpers::within_recall_window(&message));
    }

    #[test]
    fn conversation_id_from_message_private() {
        let message = im_common::event::MessageDto {
            id: "1".to_string(),
            message_id: "1".to_string(),
            client_message_id: None,
            sender_id: "1".to_string(),
            sender_name: None,
            sender_avatar: None,
            receiver_id: Some("2".to_string()),
            receiver_name: None,
            group_id: None,
            conversation_seq: None,
            group_name: None,
            group_avatar: None,
            is_group_chat: false,
            is_group: false,
            message_type: "TEXT".to_string(),
            content: None,
            media_url: None,
            media_size: None,
            media_name: None,
            thumbnail_url: None,
            duration: None,
            location_info: None,
            status: "SENT".to_string(),
            reply_to_message_id: None,
            created_time: "2024-01-01T00:00:00Z".to_string(),
            created_at: "2024-01-01T00:00:00Z".to_string(),
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
        let result = message_helpers::conversation_id_from_message(&message);
        assert!(result.is_ok());
        assert_eq!(result.unwrap(), "p_1_2");
    }

    #[test]
    fn conversation_id_from_message_group() {
        let message = im_common::event::MessageDto {
            id: "1".to_string(),
            message_id: "1".to_string(),
            client_message_id: None,
            sender_id: "1".to_string(),
            sender_name: None,
            sender_avatar: None,
            receiver_id: None,
            receiver_name: None,
            group_id: Some("42".to_string()),
            conversation_seq: None,
            group_name: None,
            group_avatar: None,
            is_group_chat: true,
            is_group: true,
            message_type: "TEXT".to_string(),
            content: None,
            media_url: None,
            media_size: None,
            media_name: None,
            thumbnail_url: None,
            duration: None,
            location_info: None,
            status: "SENT".to_string(),
            reply_to_message_id: None,
            created_time: "2024-01-01T00:00:00Z".to_string(),
            created_at: "2024-01-01T00:00:00Z".to_string(),
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
        let result = message_helpers::conversation_id_from_message(&message);
        assert!(result.is_ok());
        assert_eq!(result.unwrap(), "g_42");
    }

    #[test]
    fn parse_conversation_target_private() {
        let target = message_helpers::parse_conversation_target(1, "2");
        assert!(target.is_ok());
        let t = target.unwrap();
        assert_eq!(t.peer_id, Some(2));
        assert!(t.group_id.is_none());
    }

    #[test]
    fn parse_conversation_target_group() {
        let target = message_helpers::parse_conversation_target(1, "group_42");
        assert!(target.is_ok());
        let t = target.unwrap();
        assert_eq!(t.group_id, Some(42));
        assert!(t.peer_id.is_none());
    }

    #[test]
    fn parse_db_scope_private() {
        let scope = message_helpers::parse_db_scope("p_1_2");
        assert!(scope.is_ok());
        let s = scope.unwrap();
        assert_eq!(s.left_id, 1);
        assert_eq!(s.right_id, 2);
        assert!(s.group_id.is_none());
    }

    #[test]
    fn parse_db_scope_group() {
        let scope = message_helpers::parse_db_scope("g_42");
        assert!(scope.is_ok());
        let s = scope.unwrap();
        assert_eq!(s.group_id, Some(42));
    }

    #[test]
    fn decode_base64url_valid() {
        let encoded = base64::Engine::encode(
            &base64::engine::general_purpose::STANDARD,
            b"hello world 12",
        );
        let decoded = message_e2ee::decode_base64url(&encoded);
        assert!(decoded.is_ok());
        assert_eq!(decoded.unwrap(), b"hello world 12");
    }

    #[test]
    fn decode_base64url_invalid_rejected() {
        let result = message_e2ee::decode_base64url("!!!not-valid!!!");
        assert!(result.is_err());
    }

    fn sample_private_message(sender_id: i64, receiver_id: i64) -> im_common::event::MessageDto {
        im_common::event::MessageDto {
            id: "1".to_string(),
            message_id: "1".to_string(),
            client_message_id: None,
            sender_id: sender_id.to_string(),
            sender_name: None,
            sender_avatar: None,
            receiver_id: Some(receiver_id.to_string()),
            receiver_name: None,
            group_id: None,
            conversation_seq: Some(5),
            group_name: None,
            group_avatar: None,
            is_group_chat: false,
            is_group: false,
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
            created_time: "2024-01-01T00:00:00Z".to_string(),
            created_at: "2024-01-01T00:00:00Z".to_string(),
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
        }
    }

    fn sample_group_message(sender_id: i64, group_id: i64) -> im_common::event::MessageDto {
        im_common::event::MessageDto {
            id: "2".to_string(),
            message_id: "2".to_string(),
            client_message_id: None,
            sender_id: sender_id.to_string(),
            sender_name: Some("Alice".to_string()),
            sender_avatar: None,
            receiver_id: None,
            receiver_name: None,
            group_id: Some(group_id.to_string()),
            conversation_seq: Some(7),
            group_name: Some("Family".to_string()),
            group_avatar: Some("/g.jpg".to_string()),
            is_group_chat: true,
            is_group: true,
            message_type: "TEXT".to_string(),
            content: Some("hi group".to_string()),
            media_url: None,
            media_size: None,
            media_name: None,
            thumbnail_url: None,
            duration: None,
            location_info: None,
            status: "SENT".to_string(),
            reply_to_message_id: None,
            created_time: "2024-01-01T00:00:00Z".to_string(),
            created_at: "2024-01-01T00:00:00Z".to_string(),
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
        }
    }

    #[test]
    fn extract_peer_id_when_user_is_sender() {
        let message = sample_private_message(1, 2);
        let peer = message_helpers::extract_peer_id(1, &message);
        assert_eq!(peer, Some(2));
    }

    #[test]
    fn extract_peer_id_when_user_is_receiver() {
        let message = sample_private_message(1, 2);
        let peer = message_helpers::extract_peer_id(2, &message);
        assert_eq!(peer, Some(1));
    }

    #[test]
    fn extract_peer_id_none_for_group() {
        let message = sample_group_message(1, 20);
        let peer = message_helpers::extract_peer_id(2, &message);
        assert_eq!(peer, None);
    }

    #[test]
    fn dedup_conversations_removes_duplicates() {
        let mut conversations = vec![
            ConversationDto {
                conversation_id: "1".to_string(),
                conversation_type: 1,
                target_id: "1".to_string(),
                conversation_name: "A".to_string(),
                conversation_avatar: None,
                last_message: "m1".to_string(),
                last_message_type: "TEXT".to_string(),
                last_message_sender_id: None,
                last_message_sender_name: None,
                last_message_time: None,
                unread_count: 1,
                is_online: false,
                is_pinned: false,
                is_muted: false,
            },
            ConversationDto {
                conversation_id: "1".to_string(),
                conversation_type: 1,
                target_id: "1".to_string(),
                conversation_name: "B".to_string(),
                conversation_avatar: None,
                last_message: "m2".to_string(),
                last_message_type: "TEXT".to_string(),
                last_message_sender_id: None,
                last_message_sender_name: None,
                last_message_time: None,
                unread_count: 2,
                is_online: false,
                is_pinned: false,
                is_muted: false,
            },
            ConversationDto {
                conversation_id: "2".to_string(),
                conversation_type: 1,
                target_id: "2".to_string(),
                conversation_name: "C".to_string(),
                conversation_avatar: None,
                last_message: "m3".to_string(),
                last_message_type: "TEXT".to_string(),
                last_message_sender_id: None,
                last_message_sender_name: None,
                last_message_time: None,
                unread_count: 3,
                is_online: false,
                is_pinned: false,
                is_muted: false,
            },
        ];
        message_helpers::dedup_conversations(&mut conversations);
        assert_eq!(conversations.len(), 2);
        assert_eq!(conversations[0].conversation_id, "1");
        assert_eq!(conversations[1].conversation_id, "2");
    }

    #[test]
    fn group_conversation_from_message_maps_fields() {
        let message = sample_group_message(1, 42);
        let source = GroupConversationSource {
            group_id: 42,
            name: "Family".to_string(),
            avatar: Some("/g.jpg".to_string()),
        };
        let conv = message_helpers::group_conversation_from_message(source, message, 3);
        assert_eq!(conv.conversation_id, "42");
        assert_eq!(conv.conversation_type, 2);
        assert_eq!(conv.target_id, "42");
        assert_eq!(conv.conversation_name, "Family");
        assert_eq!(conv.conversation_avatar, Some("/g.jpg".to_string()));
        assert_eq!(conv.last_message, "hi group");
        assert_eq!(conv.unread_count, 3);
    }

    #[test]
    fn parse_conversation_target_rejects_same_user() {
        let result = message_helpers::parse_conversation_target(1, "1");
        assert!(result.is_err());
    }

    #[test]
    fn parse_conversation_target_private_with_underscore() {
        let target = message_helpers::parse_conversation_target(2, "p_1_2").unwrap();
        assert_eq!(target.peer_id, Some(1));
        assert_eq!(target.group_id, None);
        assert_eq!(target.conversation_id, "p_1_2");
    }

    #[test]
    fn parse_db_scope_rejects_mixed_format() {
        let result = message_helpers::parse_db_scope("p_1_2_3");
        assert!(result.is_err());
    }

    #[test]
    fn parse_db_scope_rejects_non_numeric_group() {
        let result = message_helpers::parse_db_scope("g_abc");
        assert!(result.is_err());
    }
}
