#[cfg(test)]
mod keys_tests {
    use crate::keys;

    #[test]
    fn private_conversation_id_is_order_independent() {
        let id1 = keys::private_conversation_id(1, 2);
        let id2 = keys::private_conversation_id(2, 1);
        assert_eq!(id1, id2, "private conversation id must be commutative");
        assert_eq!(id1, "p_1_2");
    }

    #[test]
    fn private_conversation_id_with_same_user() {
        let id = keys::private_conversation_id(5, 5);
        assert_eq!(id, "p_5_5");
    }

    #[test]
    fn group_conversation_id_format() {
        assert_eq!(keys::group_conversation_id(42), "g_42");
        assert_eq!(keys::group_conversation_id(0), "g_0");
    }

    #[test]
    fn message_key_format() {
        assert_eq!(keys::message_key(123), "im:msg:123");
    }

    #[test]
    fn conversation_messages_key_format() {
        assert_eq!(
            keys::conversation_messages_key("p_1_2"),
            "im:conv:p_1_2:msgs"
        );
    }

    #[test]
    fn conversation_last_key_format() {
        assert_eq!(keys::conversation_last_key("p_1_2"), "im:conv:p_1_2:last");
    }

    #[test]
    fn user_conversations_key_format() {
        assert_eq!(keys::user_conversations_key(7), "im:user:7:convs");
    }

    #[test]
    fn user_unread_key_format() {
        assert_eq!(keys::user_unread_key(7), "im:user:7:unread");
    }

    #[test]
    fn group_sequence_key_format() {
        assert_eq!(keys::group_sequence_key(42), "im:conv:g_42:seq");
    }

    #[test]
    fn group_read_sequence_key_format() {
        assert_eq!(keys::group_read_sequence_key(7, 42), "im:readseq:7:g_42");
    }

    #[test]
    fn client_message_key_format() {
        assert_eq!(keys::client_message_key(1, "p_1_2", "abc"), "im:client:1:p_1_2:abc");
    }

    #[test]
    fn pending_events_key_is_static() {
        assert_eq!(keys::pending_events_key(), "im:pending:events");
    }

    #[test]
    fn moments_feed_key_format() {
        assert_eq!(keys::moments_feed_key(1), "moments:feed:1");
    }

    #[test]
    fn moments_post_key_format() {
        assert_eq!(keys::moments_post_key(42), "moments:post:42");
    }

    #[test]
    fn moments_likes_key_format() {
        assert_eq!(keys::moments_likes_key(100), "moments:likes:100");
    }

    #[test]
    fn moments_notify_key_format() {
        assert_eq!(keys::moments_notify_key(7), "moments:notify:7");
    }

    #[test]
    fn ai_auto_reply_key_format() {
        assert_eq!(keys::ai_auto_reply_key(3), "im:ai:auto_reply:3");
    }

    #[test]
    fn ai_anti_reentry_key_format() {
        assert_eq!(
            keys::ai_anti_reentry_key(3, "p_1_2"),
            "im:ai:antireentry:3:p_1_2"
        );
    }

    #[test]
    fn ai_stream_channel_format() {
        assert_eq!(keys::ai_stream_channel(5), "im:ai:stream:sub:5");
    }

    #[test]
    fn event_key_format() {
        assert_eq!(keys::event_key("evt-1"), "im:event:evt-1");
    }

    #[test]
    fn read_cursor_key_format() {
        assert_eq!(keys::read_cursor_key(1, "g_42"), "im:read:1:g_42");
    }

    #[test]
    fn ai_summary_cache_key_format() {
        assert_eq!(
            keys::ai_summary_cache_key("g_10", "abc123"),
            "im:ai:summary:g_10:abc123"
        );
    }

    #[test]
    fn db_watermark_key_format() {
        assert_eq!(keys::db_watermark_key("p_1_2"), "im:db:watermark:p_1_2");
    }
}
