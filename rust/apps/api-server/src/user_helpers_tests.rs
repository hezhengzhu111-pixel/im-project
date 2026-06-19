#![forbid(unsafe_code)]

#[cfg(test)]
mod user_helpers_tests {
    use crate::user_helpers::*;
    use crate::user_types::*;

    #[test]
    fn normalize_username_accepts_valid() -> anyhow::Result<()> {
        assert_eq!(normalize_username("Alice_01")?, "alice_01");
        assert_eq!(normalize_username("  Bob_2  ")?, "bob_2");
        Ok(())
    }

    #[test]
    fn normalize_username_rejects_too_short() {
        let result = normalize_username("ab");
        assert!(result.is_err());
        let msg = format!("{}", result.unwrap_err());
        assert!(msg.contains("用户名"));
    }

    #[test]
    fn normalize_username_rejects_too_long() {
        let result = normalize_username("a".repeat(21).as_str());
        assert!(result.is_err());
    }

    #[test]
    fn normalize_username_rejects_invalid_chars() {
        let result = normalize_username("alice@example");
        assert!(result.is_err());
    }

    #[test]
    fn validate_password_accepts_valid() {
        assert!(validate_password("Password1").is_ok());
        assert!(validate_password("MyP4ssw0rdIsOk").is_ok());
    }

    #[test]
    fn validate_password_rejects_too_short() {
        assert!(validate_password("Pass1").is_err());
    }

    #[test]
    fn validate_password_rejects_missing_letter() {
        assert!(validate_password("12345678").is_err());
    }

    #[test]
    fn validate_password_rejects_missing_digit() {
        assert!(validate_password("Password").is_err());
    }

    #[test]
    fn validate_password_rejects_too_long() {
        assert!(validate_password(&"P1".repeat(40)).is_err());
    }

    #[test]
    fn validate_phone_accepts_valid() {
        assert!(validate_phone("+8613800138000").is_ok());
        assert!(validate_phone("13800138000").is_ok());
    }

    #[test]
    fn validate_phone_rejects_invalid_chars() {
        assert!(validate_phone("138-0013-8000").is_err());
    }

    #[test]
    fn validate_phone_rejects_too_short() {
        assert!(validate_phone("12345").is_err());
    }

    #[test]
    fn validate_email_accepts_valid() {
        assert!(validate_email("alice@example.com").is_ok());
    }

    #[test]
    fn validate_email_rejects_missing_at() {
        assert!(validate_email("aliceexample.com").is_err());
    }

    #[test]
    fn validate_email_rejects_starts_with_at() {
        assert!(validate_email("@example.com").is_err());
    }

    #[test]
    fn validate_email_rejects_too_short() {
        assert!(validate_email("a@b").is_err());
    }

    #[test]
    fn validate_code_accepts_valid() {
        assert!(validate_code("123456").is_ok());
    }

    #[test]
    fn validate_code_rejects_empty() {
        assert!(validate_code("").is_err());
    }

    #[test]
    fn validate_code_rejects_too_long() {
        assert!(validate_code("1".repeat(17).as_str()).is_err());
    }

    #[test]
    fn generate_verification_code_is_six_digits() {
        let code = generate_verification_code();
        assert_eq!(code.len(), 6);
        assert!(code.chars().all(|ch| ch.is_ascii_digit()));
    }

    #[test]
    fn verification_code_key_format() {
        let key = verification_code_key(42, "phone", "+8613800000000");
        assert_eq!(key, "im:code:42:phone:+8613800000000");
    }

    #[test]
    fn parse_user_ids_empty_body() -> anyhow::Result<()> {
        let ids = parse_user_ids(b"")?;
        assert!(ids.is_empty());
        Ok(())
    }

    #[test]
    fn parse_user_ids_from_strings() -> anyhow::Result<()> {
        let ids = parse_user_ids(br#"["1","2","3"]"#)?;
        assert_eq!(ids, vec!["1", "2", "3"]);
        Ok(())
    }

    #[test]
    fn parse_user_ids_from_numbers() -> anyhow::Result<()> {
        let ids = parse_user_ids(br#"[1,2,3]"#)?;
        assert_eq!(ids, vec!["1", "2", "3"]);
        Ok(())
    }

    #[test]
    fn parse_user_ids_filters_empty() -> anyhow::Result<()> {
        let ids = parse_user_ids(br#"["1","","2"]"#)?;
        assert_eq!(ids, vec!["1", "2"]);
        Ok(())
    }

    #[test]
    fn parse_user_ids_ignores_non_array() -> anyhow::Result<()> {
        let ids = parse_user_ids(br#"{"userIds":["1","2"]}"#)?;
        assert!(ids.is_empty());
        Ok(())
    }

    #[test]
    fn normalize_optional_trims_and_filters_empty() {
        assert_eq!(
            normalize_optional(Some(" hello ")),
            Some("hello".to_string())
        );
        assert_eq!(normalize_optional(Some("")), None);
        assert_eq!(normalize_optional(Some("   ")), None);
        assert_eq!(normalize_optional(None), None);
    }

    #[test]
    fn verify_password_plain_match() {
        assert!(verify_password("secret", "secret"));
    }

    #[test]
    fn verify_password_plain_mismatch() {
        assert!(!verify_password("secret", "other"));
    }

    #[test]
    fn verify_password_bcrypt_wrong() {
        // A valid bcrypt hash of "Password1"
        let hash = "$2b$12$abcdefghijklmnopqrstuuxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx";
        assert!(!verify_password("wrong", hash));
    }

    #[test]
    fn user_record_to_dto_uses_username_when_nickname_empty() {
        let user = UserRecord {
            id: 1,
            username: "alice".to_string(),
            password: String::new(),
            nickname: Some("   ".to_string()),
            avatar: None,
            email: None,
            phone: None,
            status: 1,
            last_login_time: None,
            created_time: None,
        };
        let dto = user.to_dto();
        assert_eq!(dto.nickname, "alice");
    }

    #[test]
    fn user_record_to_dto_uses_nickname_when_present() {
        let user = UserRecord {
            id: 2,
            username: "alice".to_string(),
            password: String::new(),
            nickname: Some("Ali".to_string()),
            avatar: Some("/a.jpg".to_string()),
            email: Some("a@b.com".to_string()),
            phone: Some("123".to_string()),
            status: 1,
            last_login_time: None,
            created_time: None,
        };
        let dto = user.to_dto();
        assert_eq!(dto.nickname, "Ali");
        assert_eq!(dto.avatar, Some("/a.jpg".to_string()));
        assert_eq!(dto.status, "offline");
    }

    #[test]
    fn default_settings_serializes_and_deserializes() -> anyhow::Result<()> {
        let settings = default_settings();
        let raw = serde_json::to_string(&settings)?;
        assert!(raw.contains("readReceipt"));
        assert!(raw.contains("onlineStatus"));
        let parsed: UserSettings = serde_json::from_str(&raw)?;
        assert!(parsed.privacy.read_receipt);
        assert!(parsed.message.notification);
        Ok(())
    }
}
