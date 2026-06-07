#[cfg(test)]
mod social_helpers_tests {
    use crate::social_helpers;

    #[test]
    fn normalize_optional_some() {
        assert_eq!(
            social_helpers::normalize_optional(Some("hello")),
            Some("hello".to_string())
        );
    }

    #[test]
    fn normalize_optional_empty_string_becomes_none() {
        assert_eq!(social_helpers::normalize_optional(Some("")), None);
    }

    #[test]
    fn normalize_optional_whitespace_only_becomes_none() {
        assert_eq!(social_helpers::normalize_optional(Some("   ")), None);
    }

    #[test]
    fn normalize_optional_none() {
        assert_eq!(social_helpers::normalize_optional(None), None);
    }

    #[test]
    fn query_i64_valid() {
        let mut params = std::collections::HashMap::new();
        params.insert("id".to_string(), "42".to_string());
        assert_eq!(social_helpers::query_i64(&params, "id"), Some(42));
    }

    #[test]
    fn query_i64_invalid() {
        let mut params = std::collections::HashMap::new();
        params.insert("id".to_string(), "abc".to_string());
        assert_eq!(social_helpers::query_i64(&params, "id"), None);
    }

    #[test]
    fn query_i64_missing() {
        let params: std::collections::HashMap<String, String> = std::collections::HashMap::new();
        assert_eq!(social_helpers::query_i64(&params, "id"), None);
    }

    #[test]
    fn distinct_removes_duplicates() {
        let result = social_helpers::distinct(vec![1, 2, 2, 3, 1, 4]);
        assert_eq!(result, vec![1, 2, 3, 4]);
    }

    #[test]
    fn distinct_empty() {
        assert!(social_helpers::distinct(Vec::<i64>::new()).is_empty());
    }

    #[test]
    fn distinct_single() {
        assert_eq!(social_helpers::distinct(vec![5]), vec![5]);
    }

    #[test]
    fn string_field_valid() {
        let value = serde_json::json!({"name": "test"});
        assert_eq!(
            social_helpers::string_field(&value, "name"),
            Some("test".to_string())
        );
    }

    #[test]
    fn string_field_missing() {
        let value = serde_json::json!({"name": "test"});
        assert_eq!(social_helpers::string_field(&value, "missing"), None);
    }

    #[test]
    fn value_to_i64_from_number() {
        let value = serde_json::json!(42);
        assert_eq!(social_helpers::value_to_i64(&value), Some(42));
    }

    #[test]
    fn value_to_i64_from_string() {
        let value = serde_json::json!("42");
        assert_eq!(social_helpers::value_to_i64(&value), Some(42));
    }

    #[test]
    fn value_to_i64_invalid() {
        let value = serde_json::json!("abc");
        assert_eq!(social_helpers::value_to_i64(&value), None);
    }
}
