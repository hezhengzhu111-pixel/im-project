#[cfg(test)]
mod auth_helpers_tests {
    use crate::auth_helpers;

    #[test]
    fn sign_hmac_produces_valid_output() {
        let sig = auth_helpers::sign_hmac(
            "test-secret-key-for-hmac-32bytes!",
            "method=GET&path=/api/test",
        );
        assert!(sig.is_ok());
        assert!(!sig.unwrap().is_empty());
    }

    #[test]
    fn sign_hmac_short_key_works_too() {
        let result = auth_helpers::sign_hmac("short", "canonical");
        assert!(result.is_ok());
        assert!(!result.unwrap().is_empty());
    }

    #[test]
    fn verify_hmac_matches_for_same_input() {
        let secret = "my-secret-key-my-secret-key-ok!";
        let canonical = "method=POST&path=/api/foo&bodyHash=abc&ts=123&nonce=x";
        let sig = auth_helpers::sign_hmac(secret, canonical).unwrap();
        let verify = auth_helpers::verify_hmac(secret, canonical, &sig).unwrap();
        assert!(verify, "signature must verify for same input");
    }

    #[test]
    fn verify_hmac_rejects_different_canonical() {
        let secret = "my-secret-key-my-secret-key-ok!";
        let sig = auth_helpers::sign_hmac(secret, "canonical-A").unwrap();
        let verify = auth_helpers::verify_hmac(secret, "canonical-B", &sig).unwrap();
        assert!(!verify, "different canonical must not verify");
    }

    #[test]
    fn verify_hmac_rejects_different_secret() {
        let canonical = "canonical";
        let sig = auth_helpers::sign_hmac("secret-AAAA-AAAAAAAAAAAAAAA!", canonical).unwrap();
        let verify = auth_helpers::sign_hmac("secret-BBBB-BBBBBBBBBBBBBBB!", canonical).unwrap();
        assert_ne!(
            sig, verify,
            "different secrets produce different signatures"
        );
    }

    #[test]
    fn sha256_base64_url_consistent() {
        let hash1 = auth_helpers::sha256_base64_url(b"hello");
        let hash2 = auth_helpers::sha256_base64_url(b"hello");
        assert_eq!(hash1, hash2, "same input must produce same hash");
    }

    #[test]
    fn sha256_base64_url_different_input() {
        let hash1 = auth_helpers::sha256_base64_url(b"hello");
        let hash2 = auth_helpers::sha256_base64_url(b"world");
        assert_ne!(
            hash1, hash2,
            "different inputs must produce different hashes"
        );
    }

    #[test]
    fn sha256_hex_format() {
        let hex = auth_helpers::sha256_hex("test");
        assert_eq!(hex.len(), 64, "SHA-256 hex must be 64 chars");
        assert!(hex.chars().all(|c| c.is_ascii_hexdigit()));
    }

    #[test]
    fn sha256_hex_consistent() {
        assert_eq!(
            auth_helpers::sha256_hex("abc"),
            auth_helpers::sha256_hex("abc")
        );
    }

    #[test]
    fn within_skew_allows_recent_timestamp() {
        let now = im_common::time::now_ms();
        assert!(auth_helpers::within_skew(now, 60_000));
    }

    #[test]
    fn within_skew_rejects_future_timestamp() {
        let future = im_common::time::now_ms() + 120_000;
        assert!(!auth_helpers::within_skew(future, 60_000));
    }

    #[test]
    fn normalize_bearer_strips_prefix() {
        assert_eq!(
            auth_helpers::normalize_bearer(Some("Bearer mytoken")),
            Some("mytoken".to_string())
        );
    }

    #[test]
    fn normalize_bearer_handles_empty() {
        assert_eq!(auth_helpers::normalize_bearer(None), None);
        assert_eq!(auth_helpers::normalize_bearer(Some("")), None);
        assert_eq!(auth_helpers::normalize_bearer(Some("  ")), None);
    }

    #[test]
    fn normalize_bearer_handles_quoted() {
        let result = auth_helpers::normalize_bearer(Some("\"quoted-token\""));
        assert_eq!(result, Some("quoted-token".to_string()));
    }

    #[test]
    fn normalize_path_adds_leading_slash() {
        assert_eq!(
            auth_helpers::normalize_path("api/test"),
            "/api/test".to_string()
        );
    }

    #[test]
    fn normalize_path_keeps_leading_slash() {
        assert_eq!(
            auth_helpers::normalize_path("/api/test"),
            "/api/test".to_string()
        );
    }

    #[test]
    fn normalize_path_strips_query() {
        let result = auth_helpers::normalize_path("/api/test?foo=bar");
        assert_eq!(result, "/api/test".to_string());
    }

    #[test]
    fn ttl_seconds_to_ms_converts() {
        let result = auth_helpers::ttl_seconds_to_ms(60);
        assert!(result.is_ok());
        assert_eq!(result.unwrap(), 60_000);
    }

    #[test]
    fn internal_canonical_format() {
        let canonical =
            auth_helpers::internal_canonical("POST", "/api/test", "abc123", "123456", "nonce-1");
        assert!(canonical.contains("method=POST"));
        assert!(canonical.contains("path=/api/test"));
        assert!(canonical.contains("bodyHash=abc123"));
        assert!(canonical.contains("ts=123456"));
        assert!(canonical.contains("nonce=nonce-1"));
    }
}
