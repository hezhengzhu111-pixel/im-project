#![forbid(unsafe_code)]

#[cfg(test)]
mod social_helpers_tests {
    use crate::social_groups::{ensure_group_exists, ensure_group_owner};
    use crate::social_helpers;
    use sqlx::{MySqlPool, Row};

    fn app_error_text<T>(
        result: Result<T, crate::error::AppError>,
        context: &str,
    ) -> anyhow::Result<String> {
        let Err(err) = result else {
            anyhow::bail!("{context}");
        };
        Ok(err.to_string())
    }

    async fn test_db() -> Option<MySqlPool> {
        let url = std::env::var("DATABASE_URL").ok()?;
        MySqlPool::connect(&url).await.ok()
    }

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

    #[test]
    fn friend_request_status_str_maps_correctly() {
        assert_eq!(social_helpers::friend_request_status_str(0), "PENDING");
        assert_eq!(social_helpers::friend_request_status_str(1), "ACCEPTED");
        assert_eq!(social_helpers::friend_request_status_str(2), "REJECTED");
        assert_eq!(social_helpers::friend_request_status_str(99), "PENDING");
    }

    // ---- Group permission integration tests (require DATABASE_URL) ----

    #[tokio::test]
    #[ignore]
    async fn ensure_group_owner_accepts_owner() -> anyhow::Result<()> {
        let Some(db) = test_db().await else {
            return Ok(());
        };
        let row = sqlx::query(
            "SELECT id, owner_id FROM service_group_service_db.im_group WHERE status = 1 LIMIT 1",
        )
        .fetch_optional(&db)
        .await?;
        let Some(row) = row else {
            return Ok(());
        };
        let group_id: i64 = row.get("id");
        let owner_id: i64 = row.get("owner_id");
        ensure_group_owner(&db, group_id, owner_id).await?;
        Ok(())
    }

    #[tokio::test]
    #[ignore]
    async fn ensure_group_owner_rejects_non_owner() -> anyhow::Result<()> {
        let Some(db) = test_db().await else {
            return Ok(());
        };
        let group_id: i64 = sqlx::query_scalar(
            "SELECT id FROM service_group_service_db.im_group WHERE status = 1 LIMIT 1",
        )
        .fetch_one(&db)
        .await?;

        let result = ensure_group_owner(&db, group_id, 999_999_999).await;
        assert!(result.is_err());
        let msg = app_error_text(result, "non-owner should be rejected")?;
        assert!(msg.contains("only group owner can operate"));
        Ok(())
    }

    #[tokio::test]
    #[ignore]
    async fn ensure_group_exists_accepts_active_group() -> anyhow::Result<()> {
        let Some(db) = test_db().await else {
            return Ok(());
        };
        let group_id: i64 = sqlx::query_scalar(
            "SELECT id FROM service_group_service_db.im_group WHERE status = 1 LIMIT 1",
        )
        .fetch_one(&db)
        .await?;
        ensure_group_exists(&db, group_id).await?;
        Ok(())
    }

    #[tokio::test]
    #[ignore]
    async fn ensure_group_exists_rejects_inactive_group() -> anyhow::Result<()> {
        let Some(db) = test_db().await else {
            return Ok(());
        };
        let group_id: i64 = sqlx::query_scalar(
            "SELECT id FROM service_group_service_db.im_group WHERE status = 0 LIMIT 1",
        )
        .fetch_one(&db)
        .await?;
        let result = ensure_group_exists(&db, group_id).await;
        assert!(result.is_err());
        let msg = app_error_text(result, "inactive group should be rejected")?;
        assert!(msg.contains("group not found"));
        Ok(())
    }
}
