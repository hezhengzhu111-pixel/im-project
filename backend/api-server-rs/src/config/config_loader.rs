use std::env;

pub(crate) fn env_string(key: &str, default: &str) -> String {
    env::var(key)
        .ok()
        .filter(|value| !value.trim().is_empty())
        .unwrap_or_else(|| default.to_string())
}

pub(crate) fn env_u16(key: &str, default: u16) -> u16 {
    env::var(key)
        .ok()
        .and_then(|value| value.trim().parse().ok())
        .unwrap_or(default)
}

pub(crate) fn env_u64(key: &str, default: u64) -> u64 {
    env::var(key)
        .ok()
        .and_then(|value| value.trim().parse().ok())
        .unwrap_or(default)
}

pub(crate) fn env_string_list(key: &str, default: &[String]) -> Vec<String> {
    env::var(key)
        .ok()
        .map(|raw| parse_csv(&raw))
        .filter(|values| !values.is_empty())
        .unwrap_or_else(|| default.to_vec())
}

pub(crate) fn env_u32(key: &str, default: u32) -> u32 {
    env::var(key)
        .ok()
        .and_then(|value| value.trim().parse().ok())
        .unwrap_or(default)
}

pub(crate) fn env_i64(key: &str, default: i64) -> i64 {
    env::var(key)
        .ok()
        .and_then(|value| value.trim().parse().ok())
        .unwrap_or(default)
}

pub(crate) fn env_usize(key: &str, default: usize) -> usize {
    env::var(key)
        .ok()
        .and_then(|value| value.trim().parse().ok())
        .unwrap_or(default)
}

pub(crate) fn env_bool(key: &str, default: bool) -> bool {
    env::var(key)
        .ok()
        .map(|value| {
            matches!(
                value.trim().to_ascii_lowercase().as_str(),
                "1" | "true" | "yes" | "on"
            )
        })
        .unwrap_or(default)
}

pub(crate) fn parse_csv(raw: &str) -> Vec<String> {
    raw.split(',')
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(ToOwned::to_owned)
        .collect()
}

pub(crate) fn is_local_dev_or_test() -> bool {
    matches!(
        env::var("APP_ENV")
            .or_else(|_| env::var("IM_ENV"))
            .unwrap_or_default()
            .trim()
            .to_ascii_lowercase()
            .as_str(),
        "" | "local" | "dev" | "development" | "test"
    )
}

pub(crate) fn warn_if_example(name: &str, value: &str, example: &str) {
    if value.is_empty() {
        eprintln!("WARN: {name} is not set. Set it explicitly via environment variable.");
    } else if value == example {
        eprintln!("WARN: {name} is using an example default value. Set a unique secret via environment variable.");
    }
}

pub(crate) fn validate_secret(
    name: &str,
    value: &str,
    example: &str,
    min_len: usize,
    errors: &mut Vec<String>,
) {
    if value.is_empty() {
        errors.push(format!("{name} must be explicitly set"));
    } else if value == example {
        errors.push(format!("{name} must not use the example default value"));
    } else if value.len() < min_len {
        errors.push(format!(
            "{name} must be at least {min_len} bytes (got {} bytes)",
            value.len()
        ));
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::config::*;

    fn valid_config() -> AppConfig {
        AppConfig {
            port: 8082,
            cache_redis_url: "redis://prod:6379/0".to_string(),
            private_hot_redis_urls: vec!["redis://prod:6379/0".to_string()],
            group_hot_redis_urls: vec!["redis://prod:6379/0".to_string()],
            private_event_redis_url: "redis://prod:6379/0".to_string(),
            group_event_redis_url: "redis://prod:6379/0".to_string(),
            route_redis_url: "redis://prod:6379/0".to_string(),
            mysql_url: "mysql://prod:prod@db:3306/prod".to_string(),
            mysql_max_connections: 64,
            private_event_stream_key: "im:events:private".to_string(),
            group_event_stream_key: "im:events:group".to_string(),
            event_stream_max_len: 100_000,
            stream_consumer_block_ms: 1_000,
            event_publisher_enabled: true,
            message_writer_enabled: true,
            publisher_batch_size: 200,
            publisher_loop_interval_ms: 50,
            writer_group_id: "api-server-rs-writer".to_string(),
            writer_batch_size: 500,
            writer_flush_interval_ms: 500,
            writer_snowflake_node_id: 31,
            push_dispatcher_enabled: true,
            push_dispatcher_group_id: "api-server-rs-push-dispatcher".to_string(),
            push_dispatcher_batch_size: 200,
            route_users_key: "im:route:users".to_string(),
            route_cache_ttl_ms: 3_000,
            server_registry_key_prefix: "im:server:".to_string(),
            jwt_secret: "a".repeat(64),
            jwt_expiration_ms: 86_400_000,
            refresh_secret: "b".repeat(64),
            refresh_expiration_ms: 604_800_000,
            ws_ticket_ttl_seconds: 30,
            revoked_token_ttl_seconds: 86_400,
            resource_cache_ttl_seconds: 604_800,
            token_revocation_check_enabled: true,
            internal_secret: "c".repeat(32),
            internal_max_skew_ms: 300_000,
            gateway_auth_secret: "d".repeat(32),
            access_cookie_name: "IM_ACCESS_TOKEN".to_string(),
            refresh_cookie_name: "IM_REFRESH_TOKEN".to_string(),
            auth_cookie_same_site: "Lax".to_string(),
            auth_cookie_secure: "auto".to_string(),
            ws_ticket_cookie_name: "IM_WS_TICKET".to_string(),
            ws_ticket_cookie_path: "/websocket".to_string(),
            ws_ticket_cookie_same_site: "Lax".to_string(),
            ws_ticket_cookie_secure: "auto".to_string(),
            admin_usernames: vec![],
            admin_user_ids: vec![],
            storage_base_dir: PathBuf::from("/data/im-files"),
            file_image_max_size: 20_971_520,
            file_file_max_size: 536_870_912,
            file_audio_max_size: 104_857_600,
            file_video_max_size: 1_073_741_824,
            file_avatar_max_size: 5_242_880,
            request_body_limit: 1_082_130_432,
            snowflake_node_id: 21,
            im_server_url: "http://127.0.0.1:8083".to_string(),
            im_server_ws_url: "ws://127.0.0.1:8083".to_string(),
            log_service_url: "http://127.0.0.1:8091".to_string(),
            registry_service_url: "http://127.0.0.1:8090".to_string(),
            ai_enabled: true,
            ai_encryption_key_base64: "".to_string(),
            ai_spring_url: "http://127.0.0.1:8084".to_string(),
            ai_task_stream_key: "im:ai:tasks".to_string(),
            ai_auto_reply_cache_ttl_sec: 3600,
            ai_anti_reentry_ms: 1000,
            ai_summary_max_tokens: 4000,
            ai_summary_cache_ttl_sec: 1800,
            ai_snowflake_node_id: 41,
        }
    }

    #[test]
    fn valid_config_passes_production_validation() {
        let cfg = valid_config();
        assert!(cfg.validate_production_secrets().is_ok());
    }

    fn validation_error<T>(result: Result<T, String>, context: &str) -> anyhow::Result<String> {
        let Err(err) = result else {
            anyhow::bail!("{context}");
        };
        Ok(err)
    }

    #[test]
    fn production_missing_jwt_secret_fails() -> anyhow::Result<()> {
        let mut cfg = valid_config();
        cfg.jwt_secret = String::new();
        let err = validation_error(
            cfg.validate_production_secrets(),
            "missing JWT secret should fail production validation",
        )?;
        assert!(
            err.contains("JWT_SECRET"),
            "error should mention JWT_SECRET, got: {err}"
        );
        Ok(())
    }

    #[test]
    fn production_example_jwt_secret_fails() -> anyhow::Result<()> {
        let mut cfg = valid_config();
        cfg.jwt_secret = DEFAULT_JWT_SECRET.to_string();
        let err = validation_error(
            cfg.validate_production_secrets(),
            "example JWT secret should fail production validation",
        )?;
        assert!(
            err.contains("JWT_SECRET"),
            "error should mention JWT_SECRET, got: {err}"
        );
        Ok(())
    }

    #[test]
    fn production_valid_jwt_secret_passes() {
        let mut cfg = valid_config();
        cfg.jwt_secret =
            "a-unique-production-jwt-secret-that-is-at-least-64-bytes-long-for-testing!!!"
                .to_string();
        assert!(cfg.validate_production_secrets().is_ok());
    }

    #[test]
    fn production_short_jwt_secret_fails() -> anyhow::Result<()> {
        let mut cfg = valid_config();
        cfg.jwt_secret = "short".to_string();
        let err = validation_error(
            cfg.validate_production_secrets(),
            "short JWT secret should fail production validation",
        )?;
        assert!(err.contains("JWT_SECRET"));
        assert!(err.contains("64"));
        Ok(())
    }

    #[test]
    fn production_default_refresh_secret_fails() -> anyhow::Result<()> {
        let mut cfg = valid_config();
        cfg.refresh_secret = DEFAULT_REFRESH_SECRET.to_string();
        let err = validation_error(
            cfg.validate_production_secrets(),
            "default refresh secret should fail production validation",
        )?;
        assert!(err.contains("AUTH_REFRESH_SECRET"));
        Ok(())
    }

    #[test]
    fn production_default_internal_secret_fails() -> anyhow::Result<()> {
        let mut cfg = valid_config();
        cfg.internal_secret = DEFAULT_INTERNAL_SECRET.to_string();
        let err = validation_error(
            cfg.validate_production_secrets(),
            "default internal secret should fail production validation",
        )?;
        assert!(err.contains("IM_INTERNAL_SECRET"));
        Ok(())
    }

    #[test]
    fn production_short_internal_secret_fails() -> anyhow::Result<()> {
        let mut cfg = valid_config();
        cfg.internal_secret = "short".to_string();
        let err = validation_error(
            cfg.validate_production_secrets(),
            "short internal secret should fail production validation",
        )?;
        assert!(err.contains("IM_INTERNAL_SECRET"));
        assert!(err.contains("32"));
        Ok(())
    }

    #[test]
    fn production_default_gateway_auth_secret_fails() -> anyhow::Result<()> {
        let mut cfg = valid_config();
        cfg.gateway_auth_secret = DEFAULT_GATEWAY_AUTH_SECRET.to_string();
        let err = validation_error(
            cfg.validate_production_secrets(),
            "default gateway auth secret should fail production validation",
        )?;
        assert!(err.contains("IM_GATEWAY_AUTH_SECRET"));
        Ok(())
    }

    #[test]
    fn is_local_dev_or_test_detection() {
        // Only test positive cases to avoid env var race conditions with parallel threads.
        // Unset → local (default)
        env::remove_var("APP_ENV");
        env::remove_var("IM_ENV");
        assert!(is_local_dev_or_test());

        // Explicit local/dev/test values
        env::set_var("APP_ENV", "dev");
        assert!(is_local_dev_or_test());
        env::set_var("APP_ENV", "test");
        assert!(is_local_dev_or_test());
        env::set_var("APP_ENV", "local");
        assert!(is_local_dev_or_test());

        // IM_ENV fallback
        env::remove_var("APP_ENV");
        env::set_var("IM_ENV", "dev");
        assert!(is_local_dev_or_test());
        env::set_var("IM_ENV", "test");
        assert!(is_local_dev_or_test());

        // Restore to safe state
        env::remove_var("APP_ENV");
        env::remove_var("IM_ENV");
    }

    #[test]
    fn jwt_secret_lengths_valid_config_passes() {
        let cfg = valid_config();
        assert!(cfg.validate_jwt_secret_lengths().is_ok());
    }

    #[test]
    fn jwt_secret_lengths_empty_jwt_secret_fails() -> anyhow::Result<()> {
        let mut cfg = valid_config();
        cfg.jwt_secret = String::new();
        let err = validation_error(
            cfg.validate_jwt_secret_lengths(),
            "empty JWT secret should fail length validation",
        )?;
        assert!(
            err.contains("JWT_SECRET"),
            "error should mention JWT_SECRET, got: {err}"
        );
        assert!(
            err.contains("must not be empty"),
            "error should mention empty, got: {err}"
        );
        Ok(())
    }

    #[test]
    fn jwt_secret_lengths_short_jwt_secret_fails() -> anyhow::Result<()> {
        let mut cfg = valid_config();
        cfg.jwt_secret = "short".to_string();
        let err = validation_error(
            cfg.validate_jwt_secret_lengths(),
            "short JWT secret should fail length validation",
        )?;
        assert!(
            err.contains("JWT_SECRET"),
            "error should mention JWT_SECRET, got: {err}"
        );
        assert!(
            err.contains("64"),
            "error should mention 64 bytes, got: {err}"
        );
        Ok(())
    }

    #[test]
    fn jwt_secret_lengths_empty_refresh_secret_fails() -> anyhow::Result<()> {
        let mut cfg = valid_config();
        cfg.refresh_secret = String::new();
        let err = validation_error(
            cfg.validate_jwt_secret_lengths(),
            "empty refresh secret should fail length validation",
        )?;
        assert!(
            err.contains("AUTH_REFRESH_SECRET"),
            "error should mention AUTH_REFRESH_SECRET, got: {err}"
        );
        Ok(())
    }

    #[test]
    fn jwt_secret_lengths_short_refresh_secret_fails() -> anyhow::Result<()> {
        let mut cfg = valid_config();
        cfg.refresh_secret = "short".to_string();
        let err = validation_error(
            cfg.validate_jwt_secret_lengths(),
            "short refresh secret should fail length validation",
        )?;
        assert!(
            err.contains("AUTH_REFRESH_SECRET"),
            "error should mention AUTH_REFRESH_SECRET, got: {err}"
        );
        assert!(
            err.contains("64"),
            "error should mention 64 bytes, got: {err}"
        );
        Ok(())
    }
}
