#![forbid(unsafe_code)]

#[cfg(test)]
mod tests {
    use crate::auth_api::*;
    use crate::auth_helpers::internal_signature_headers;
    use crate::auth_internal::validate_internal_signature;
    use crate::auth_ws::{
        invalid_ws_ticket, parse_ws_ticket_payload, resolve_ws_ticket_cookie_secure,
    };
    use crate::config::AppConfig;
    use axum::http::{header, HeaderMap, HeaderValue};

    fn config_with_secure(secure: &str) -> AppConfig {
        AppConfig {
            port: 0,
            cache_redis_url: String::new(),
            private_hot_redis_urls: vec![],
            group_hot_redis_urls: vec![],
            private_event_redis_url: String::new(),
            group_event_redis_url: String::new(),
            route_redis_url: String::new(),
            mysql_url: String::new(),
            mysql_max_connections: 0,
            private_event_stream_key: String::new(),
            group_event_stream_key: String::new(),
            event_stream_max_len: 0,
            stream_consumer_block_ms: 0,
            event_publisher_enabled: false,
            message_writer_enabled: false,
            publisher_batch_size: 0,
            publisher_loop_interval_ms: 0,
            writer_group_id: String::new(),
            writer_batch_size: 0,
            writer_flush_interval_ms: 0,
            writer_snowflake_node_id: 0,
            push_dispatcher_enabled: false,
            push_dispatcher_group_id: String::new(),
            push_dispatcher_batch_size: 0,
            route_users_key: String::new(),
            route_cache_ttl_ms: 0,
            server_registry_key_prefix: String::new(),
            jwt_secret: String::new(),
            jwt_expiration_ms: 0,
            refresh_secret: String::new(),
            refresh_expiration_ms: 0,
            remember_me_refresh_expiration_ms: 0,
            ws_ticket_ttl_seconds: 0,
            revoked_token_ttl_seconds: 0,
            resource_cache_ttl_seconds: 0,
            token_revocation_check_enabled: false,
            internal_secret: String::new(),
            internal_max_skew_ms: 0,
            gateway_auth_secret: String::new(),
            access_cookie_name: "IM_ACCESS_TOKEN".to_string(),
            refresh_cookie_name: "IM_REFRESH_TOKEN".to_string(),
            auth_cookie_same_site: "Lax".to_string(),
            auth_cookie_secure: secure.to_string(),
            ws_ticket_cookie_name: "IM_WS_TICKET".to_string(),
            ws_ticket_cookie_path: "/websocket".to_string(),
            ws_ticket_cookie_same_site: "Strict".to_string(),
            ws_ticket_cookie_secure: "false".to_string(),
            admin_usernames: vec![],
            admin_user_ids: vec![],
            storage_base_dir: std::path::PathBuf::new(),
            file_image_max_size: 0,
            file_file_max_size: 0,
            file_audio_max_size: 0,
            file_video_max_size: 0,
            file_avatar_max_size: 0,
            request_body_limit: 0,
            snowflake_node_id: 0,
            im_server_url: String::new(),
            im_server_ws_url: String::new(),
            log_service_url: String::new(),
            registry_service_url: String::new(),
            ai_enabled: false,
            ai_encryption_key_base64: String::new(),
            ai_spring_url: String::new(),
            ai_task_stream_key: String::new(),
            ai_auto_reply_cache_ttl_sec: 0,
            ai_anti_reentry_ms: 0,
            ai_summary_max_tokens: 0,
            ai_summary_cache_ttl_sec: 0,
            ai_snowflake_node_id: 0,
        }
    }

    fn set_cookie_contains_secure(headers: &HeaderMap, cookie_name: &str) -> bool {
        headers
            .get_all(header::SET_COOKIE)
            .into_iter()
            .filter_map(|v| v.to_str().ok())
            .any(|v| v.starts_with(cookie_name) && v.contains("; Secure"))
    }

    #[test]
    fn resolve_secure_auto_with_https_header() {
        let config = config_with_secure("auto");
        let mut headers = HeaderMap::new();
        headers.insert("x-forwarded-proto", HeaderValue::from_static("https"));
        assert!(resolve_cookie_secure(&config, &headers));
    }

    #[test]
    fn resolve_secure_auto_without_https_header() {
        let config = config_with_secure("auto");
        let headers = HeaderMap::new();
        assert!(!resolve_cookie_secure(&config, &headers));
    }

    #[test]
    fn resolve_secure_true_always_secure() {
        let config = config_with_secure("true");
        let headers = HeaderMap::new();
        assert!(resolve_cookie_secure(&config, &headers));
    }

    #[test]
    fn append_cookies_auto_https_sets_secure() -> anyhow::Result<()> {
        let config = config_with_secure("auto");
        let mut request_headers = HeaderMap::new();
        request_headers.insert("x-forwarded-proto", HeaderValue::from_static("https"));

        let token_pair = TokenPairDto {
            access_token: Some("at".to_string()),
            refresh_token: Some("rt".to_string()),
            expires_in_ms: Some(60_000),
            refresh_expires_in_ms: Some(3_600_000),
        };
        let mut response_headers = HeaderMap::new();
        append_auth_cookies(
            &mut response_headers,
            &config,
            &token_pair,
            &request_headers,
        )?;

        assert!(set_cookie_contains_secure(
            &response_headers,
            "IM_ACCESS_TOKEN"
        ));
        assert!(set_cookie_contains_secure(
            &response_headers,
            "IM_REFRESH_TOKEN"
        ));
        Ok(())
    }

    #[test]
    fn append_cookies_auto_no_https_omits_secure() -> anyhow::Result<()> {
        let config = config_with_secure("auto");
        let request_headers = HeaderMap::new();

        let token_pair = TokenPairDto {
            access_token: Some("at".to_string()),
            refresh_token: Some("rt".to_string()),
            expires_in_ms: Some(60_000),
            refresh_expires_in_ms: Some(3_600_000),
        };
        let mut response_headers = HeaderMap::new();
        append_auth_cookies(
            &mut response_headers,
            &config,
            &token_pair,
            &request_headers,
        )?;

        assert!(!set_cookie_contains_secure(
            &response_headers,
            "IM_ACCESS_TOKEN"
        ));
        assert!(!set_cookie_contains_secure(
            &response_headers,
            "IM_REFRESH_TOKEN"
        ));
        Ok(())
    }

    #[test]
    fn append_cookies_true_always_sets_secure() -> anyhow::Result<()> {
        let config = config_with_secure("true");
        let request_headers = HeaderMap::new();

        let token_pair = TokenPairDto {
            access_token: Some("at".to_string()),
            refresh_token: Some("rt".to_string()),
            expires_in_ms: Some(60_000),
            refresh_expires_in_ms: Some(3_600_000),
        };
        let mut response_headers = HeaderMap::new();
        append_auth_cookies(
            &mut response_headers,
            &config,
            &token_pair,
            &request_headers,
        )?;

        assert!(set_cookie_contains_secure(
            &response_headers,
            "IM_ACCESS_TOKEN"
        ));
        assert!(set_cookie_contains_secure(
            &response_headers,
            "IM_REFRESH_TOKEN"
        ));
        Ok(())
    }

    #[test]
    fn build_token_empty_secret_fails() {
        let result = build_token("", 3_600_000, 1, "user", "access", "jti1", false);
        assert!(result.is_err(), "empty secret should fail");
    }

    #[test]
    fn build_token_short_secret_fails() {
        let result = build_token("short", 3_600_000, 1, "user", "access", "jti1", false);
        assert!(result.is_err(), "short secret should fail");
    }

    #[test]
    fn build_token_valid_secret_succeeds() {
        let secret = "a-valid-secret-that-is-exactly-sixty-four-bytes-long-for-testing-ok!!!";
        let token = build_token(secret, 3_600_000, 1, "user", "access", "jti1", false);
        assert!(
            token.is_ok(),
            "valid secret should succeed: {:?}",
            token.err()
        );
    }

    #[test]
    fn parse_token_with_valid_secret_succeeds() -> anyhow::Result<()> {
        let secret = "a-valid-secret-that-is-exactly-sixty-four-bytes-long-for-testing-ok!!!";
        let token = build_token(secret, 3_600_000, 1, "user", "access", "jti1", false)?;
        let result = parse_token(Some(&format!("Bearer {token}")), secret, false);
        assert!(result.valid, "parse should succeed");
        assert_eq!(result.user_id, Some(1));
        assert_eq!(result.username.as_deref(), Some("user"));
        Ok(())
    }

    #[test]
    fn parse_token_empty_secret_fails() -> anyhow::Result<()> {
        let secret = "a-valid-secret-that-is-exactly-sixty-four-bytes-long-for-testing-ok!!!";
        let token = build_token(secret, 3_600_000, 1, "user", "access", "jti1", false)?;
        let result = parse_token(Some(&token), "", false);
        assert!(!result.valid, "empty secret should fail validation");
        Ok(())
    }

    #[test]
    fn parse_token_short_secret_fails() -> anyhow::Result<()> {
        let secret = "a-valid-secret-that-is-exactly-sixty-four-bytes-long-for-testing-ok!!!";
        let token = build_token(secret, 3_600_000, 1, "user", "access", "jti1", false)?;
        let result = parse_token(Some(&token), "short", false);
        assert!(!result.valid, "short secret should fail validation");
        Ok(())
    }

    #[test]
    fn build_token_with_remember_me_sets_claim() -> anyhow::Result<()> {
        let secret = "a-valid-secret-that-is-exactly-sixty-four-bytes-long-for-testing-ok!!!";
        let token = build_token(secret, 3_600_000, 1, "user", "access", "jti1", true)?;
        let result = parse_token(Some(&format!("Bearer {token}")), secret, false);
        assert!(result.valid);
        assert!(
            result.remember_me,
            "remember_me should be true in parsed token"
        );
        Ok(())
    }

    #[test]
    fn build_token_without_remember_me_defaults_false() -> anyhow::Result<()> {
        let secret = "a-valid-secret-that-is-exactly-sixty-four-bytes-long-for-testing-ok!!!";
        let token = build_token(secret, 3_600_000, 1, "user", "access", "jti1", false)?;
        let result = parse_token(Some(&format!("Bearer {token}")), secret, false);
        assert!(result.valid);
        assert!(
            !result.remember_me,
            "remember_me should be false by default"
        );
        Ok(())
    }

    // ---- WebSocket ticket helpers ----

    #[test]
    fn parse_ws_ticket_payload_valid() {
        let result = parse_ws_ticket_payload("42\nalice");
        assert_eq!(result, Some((42, "alice".to_string())));
    }

    #[test]
    fn parse_ws_ticket_payload_missing_delimiter() {
        assert_eq!(parse_ws_ticket_payload("42"), None);
    }

    #[test]
    fn parse_ws_ticket_payload_invalid_user_id() {
        assert_eq!(parse_ws_ticket_payload("not_a_number\nalice"), None);
    }

    #[test]
    fn invalid_ws_ticket_has_expected_shape() {
        let result = invalid_ws_ticket("ticket is required");
        assert!(!result.valid);
        assert_eq!(result.status.as_deref(), Some("INVALID"));
        assert_eq!(result.error.as_deref(), Some("ticket is required"));
    }

    #[test]
    fn resolve_ws_ticket_cookie_secure_true() {
        let mut config = config_with_secure("true");
        config.ws_ticket_cookie_secure = "true".to_string();
        assert!(resolve_ws_ticket_cookie_secure(&config));
    }

    #[test]
    fn resolve_ws_ticket_cookie_secure_false() {
        let mut config = config_with_secure("false");
        config.ws_ticket_cookie_secure = "false".to_string();
        assert!(!resolve_ws_ticket_cookie_secure(&config));
    }

    #[test]
    fn resolve_ws_ticket_cookie_secure_case_insensitive() {
        let mut config = config_with_secure("false");
        config.ws_ticket_cookie_secure = " TRUE ".to_string();
        assert!(resolve_ws_ticket_cookie_secure(&config));
    }

    // ---- Internal HMAC signature ----

    fn config_with_internal_secret(secret: &str) -> AppConfig {
        let mut config = config_with_secure("false");
        config.internal_secret = secret.to_string();
        config.internal_max_skew_ms = 300_000;
        config
    }

    #[test]
    fn internal_signature_headers_round_trip() -> anyhow::Result<()> {
        let config = config_with_internal_secret("test-secret-key-32bytes-long!!!");
        let body = br#"{"userId":1,"username":"alice"}"#;
        let headers = internal_signature_headers("POST", "/api/internal/token", body, &config)?;
        validate_internal_signature(&headers, "POST", "/api/internal/token", body, &config)?;
        Ok(())
    }

    #[test]
    fn validate_internal_signature_missing_headers_fails() {
        let config = config_with_internal_secret("test-secret-key-32bytes-long!!!");
        let headers = HeaderMap::new();
        let result =
            validate_internal_signature(&headers, "POST", "/api/internal/token", b"", &config);
        assert!(result.is_err());
        let msg = format!("{}", result.unwrap_err());
        assert!(msg.contains("INTERNAL_AUTH_REJECTED"));
    }

    #[test]
    fn validate_internal_signature_wrong_secret_fails() {
        let config_a = config_with_internal_secret("secret-a-32bytes-long!!!!!!!!!");
        let config_b = config_with_internal_secret("secret-b-32bytes-long!!!!!!!!!");
        let body = b"payload";
        let headers = internal_signature_headers("POST", "/api/test", body, &config_a).unwrap();
        let result = validate_internal_signature(&headers, "POST", "/api/test", body, &config_b);
        assert!(result.is_err());
    }

    #[test]
    fn validate_internal_signature_method_case_normalized() -> anyhow::Result<()> {
        let config = config_with_internal_secret("test-secret-key-32bytes-long!!!");
        let body = b"{}";
        let headers = internal_signature_headers("post", "/api/test", body, &config)?;
        validate_internal_signature(&headers, "POST", "/api/test", body, &config)?;
        Ok(())
    }

    #[test]
    fn internal_signature_rejects_expired_timestamp() -> anyhow::Result<()> {
        let config = config_with_internal_secret("test-secret-key-32bytes-long!!!");
        let mut headers = HeaderMap::new();
        headers.insert(
            "X-Internal-Timestamp",
            HeaderValue::from_str(&(im_common::time::now_ms() - 400_000).to_string())?,
        );
        headers.insert("X-Internal-Nonce", HeaderValue::from_static("nonce"));
        headers.insert("X-Internal-Signature", HeaderValue::from_static("sig"));
        let result = validate_internal_signature(&headers, "POST", "/api/test", b"", &config);
        assert!(result.is_err());
        Ok(())
    }

    // ---- Refresh token shape ----

    #[test]
    fn refresh_token_has_expected_type_and_claims() -> anyhow::Result<()> {
        let secret = "a-valid-secret-that-is-exactly-sixty-four-bytes-long-for-testing-ok!!!";
        let token = build_token(secret, 3_600_000, 7, "bob", "refresh", "jti-refresh", false)?;
        let parsed = parse_token(Some(&token), secret, false);
        assert!(parsed.valid);
        assert_eq!(parsed.user_id, Some(7));
        assert_eq!(parsed.token_type.as_deref(), Some("refresh"));
        assert_eq!(parsed.jti.as_deref(), Some("jti-refresh"));
        assert!(!parsed.remember_me);
        Ok(())
    }
}
