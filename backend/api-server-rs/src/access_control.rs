use crate::error::AppError;
use sqlx::MySqlPool;

/// 校验单个用户是否为群组有效成员（status=1）。
///
/// 若用户不是群成员，返回 403 Forbidden。
pub async fn ensure_group_member(
    db: &MySqlPool,
    group_id: i64,
    user_id: i64,
) -> Result<(), AppError> {
    let exists: bool = sqlx::query_scalar(
        "SELECT COUNT(*) > 0 FROM service_group_service_db.im_group_member \
         WHERE group_id = ? AND user_id = ? AND status = 1",
    )
    .bind(group_id)
    .bind(user_id)
    .fetch_one(db)
    .await?;

    if !exists {
        return Err(AppError::Forbidden(
            "not a group member".to_string(),
        ));
    }
    Ok(())
}

/// 校验单个用户是否为群管理员或群主（role >= 2）。
///
/// 若用户不是管理员，返回 403 Forbidden。
pub async fn ensure_group_admin(
    db: &MySqlPool,
    group_id: i64,
    user_id: i64,
) -> Result<(), AppError> {
    let role: i32 = sqlx::query_scalar(
        "SELECT COALESCE(role, 0) FROM service_group_service_db.im_group_member \
         WHERE group_id = ? AND user_id = ? AND status = 1",
    )
    .bind(group_id)
    .bind(user_id)
    .fetch_optional(db)
    .await?
    .unwrap_or(0);

    if role < 2 {
        return Err(AppError::Forbidden(
            "only group admin or owner can perform this action".to_string(),
        ));
    }
    Ok(())
}

/// 校验两个用户之间是否存在有效的好友关系（双向 status=1）。
///
/// 若不存在好友关系，返回 403 Forbidden。
pub async fn ensure_friend(
    db: &MySqlPool,
    user_id: i64,
    friend_id: i64,
) -> Result<(), AppError> {
    let exists: bool = sqlx::query_scalar(
        "SELECT COUNT(*) > 0 FROM service_user_service_db.im_friend \
         WHERE user_id = ? AND friend_id = ? AND status = 1",
    )
    .bind(user_id)
    .bind(friend_id)
    .fetch_one(db)
    .await?;

    if !exists {
        return Err(AppError::Forbidden(
            "friend relationship not found".to_string(),
        ));
    }
    Ok(())
}

/// 批量校验多个用户是否均为群组有效成员（单条 IN 查询）。
///
/// 返回实际为群成员的用户 ID 列表。若存在非成员，返回 403 Forbidden。
pub async fn ensure_group_members_batch(
    db: &MySqlPool,
    group_id: i64,
    user_ids: &[i64],
) -> Result<Vec<i64>, AppError> {
    if user_ids.is_empty() {
        return Ok(Vec::new());
    }

    let placeholders: String = user_ids
        .iter()
        .map(|_| "?")
        .collect::<Vec<_>>()
        .join(",");
    let sql = format!(
        "SELECT user_id FROM service_group_service_db.im_group_member \
         WHERE group_id = ? AND status = 1 AND user_id IN ({placeholders})"
    );

    let mut query = sqlx::query_scalar::<_, i64>(&sql).bind(group_id);
    for uid in user_ids {
        query = query.bind(uid);
    }
    let found: Vec<i64> = query.fetch_all(db).await?;

    if found.len() != user_ids.len() {
        let found_set: std::collections::HashSet<i64> = found.iter().copied().collect();
        let missing: Vec<String> = user_ids
            .iter()
            .filter(|uid| !found_set.contains(uid))
            .map(|uid| uid.to_string())
            .collect();
        return Err(AppError::Forbidden(format!(
            "users {} are not members of group {}",
            missing.join(", "),
            group_id,
        )));
    }
    Ok(found)
}

#[cfg(test)]
mod tests {
    use super::*;

    async fn test_db() -> Option<MySqlPool> {
        let url = std::env::var("DATABASE_URL").ok()?;
        MySqlPool::connect(&url).await.ok()
    }

    fn app_error_text<T>(result: Result<T, AppError>, context: &str) -> anyhow::Result<String> {
        let Err(err) = result else {
            anyhow::bail!("{context}");
        };
        Ok(err.to_string())
    }

    // ---------- ensure_group_member ----------

    #[tokio::test]
    #[ignore]
    async fn test_ensure_group_member_success() -> anyhow::Result<()> {
        let Some(db) = test_db().await else {
            return Ok(());
        };
        let group_id: i64 = sqlx::query_scalar(
            "SELECT id FROM service_group_service_db.im_group WHERE status = 1 LIMIT 1",
        )
        .fetch_one(&db)
        .await?;

        let user_id: i64 = sqlx::query_scalar(
            "SELECT user_id FROM service_group_service_db.im_group_member \
             WHERE group_id = ? AND status = 1 LIMIT 1",
        )
        .bind(group_id)
        .fetch_one(&db)
        .await?;

        ensure_group_member(&db, group_id, user_id).await?;
        Ok(())
    }

    #[tokio::test]
    #[ignore]
    async fn test_ensure_group_member_failure_non_member() -> anyhow::Result<()> {
        let Some(db) = test_db().await else {
            return Ok(());
        };
        let group_id: i64 = sqlx::query_scalar(
            "SELECT id FROM service_group_service_db.im_group WHERE status = 1 LIMIT 1",
        )
        .fetch_one(&db)
        .await?;

        let result = ensure_group_member(&db, group_id, 999_999_999).await;
        assert!(result.is_err());
        let err = app_error_text(result, "non-member should fail group member check")?;
        assert!(err.contains("not a group member"));
        Ok(())
    }

    // ---------- ensure_group_admin ----------

    #[tokio::test]
    #[ignore]
    async fn test_ensure_group_admin_success() -> anyhow::Result<()> {
        let Some(db) = test_db().await else {
            return Ok(());
        };
        let group_id: i64 = sqlx::query_scalar(
            "SELECT id FROM service_group_service_db.im_group WHERE status = 1 LIMIT 1",
        )
        .fetch_one(&db)
        .await?;

        let user_id: i64 = sqlx::query_scalar(
            "SELECT user_id FROM service_group_service_db.im_group_member \
             WHERE group_id = ? AND status = 1 AND role >= 2 LIMIT 1",
        )
        .bind(group_id)
        .fetch_one(&db)
        .await?;

        ensure_group_admin(&db, group_id, user_id).await?;
        Ok(())
    }

    #[tokio::test]
    #[ignore]
    async fn test_ensure_group_admin_failure_regular_member() -> anyhow::Result<()> {
        let Some(db) = test_db().await else {
            return Ok(());
        };
        let group_id: i64 = sqlx::query_scalar(
            "SELECT id FROM service_group_service_db.im_group WHERE status = 1 LIMIT 1",
        )
        .fetch_one(&db)
        .await?;

        let user_id: Option<i64> = sqlx::query_scalar(
            "SELECT user_id FROM service_group_service_db.im_group_member \
             WHERE group_id = ? AND status = 1 AND role < 2 LIMIT 1",
        )
        .bind(group_id)
        .fetch_optional(&db)
        .await?;

        let Some(user_id) = user_id else {
            return Ok(());
        };

        let result = ensure_group_admin(&db, group_id, user_id).await;
        assert!(result.is_err());
        let err = app_error_text(result, "regular member should fail group admin check")?;
        assert!(err.contains("only group admin or owner"));
        Ok(())
    }

    #[tokio::test]
    #[ignore]
    async fn test_ensure_group_admin_failure_non_member() -> anyhow::Result<()> {
        let Some(db) = test_db().await else {
            return Ok(());
        };
        let group_id: i64 = sqlx::query_scalar(
            "SELECT id FROM service_group_service_db.im_group WHERE status = 1 LIMIT 1",
        )
        .fetch_one(&db)
        .await?;

        let result = ensure_group_admin(&db, group_id, 999_999_999).await;
        assert!(result.is_err());
        let err = app_error_text(result, "non-member should fail group admin check")?;
        assert!(err.contains("only group admin or owner"));
        Ok(())
    }

    // ---------- ensure_friend ----------

    #[tokio::test]
    #[ignore]
    async fn test_ensure_friend_success() -> anyhow::Result<()> {
        let Some(db) = test_db().await else {
            return Ok(());
        };
        let (user_id, friend_id): (i64, i64) = sqlx::query_as(
            "SELECT user_id, friend_id FROM service_user_service_db.im_friend \
             WHERE status = 1 LIMIT 1",
        )
        .fetch_one(&db)
        .await?;

        ensure_friend(&db, user_id, friend_id).await?;
        Ok(())
    }

    #[tokio::test]
    #[ignore]
    async fn test_ensure_friend_failure_no_relationship() -> anyhow::Result<()> {
        let Some(db) = test_db().await else {
            return Ok(());
        };
        let result = ensure_friend(&db, 111_111_111, 222_222_222).await;
        assert!(result.is_err());
        let err = app_error_text(result, "missing friendship should fail friend check")?;
        assert!(err.contains("friend relationship not found"));
        Ok(())
    }

    // ---------- ensure_group_members_batch ----------

    #[tokio::test]
    #[ignore]
    async fn test_ensure_group_members_batch_success() -> anyhow::Result<()> {
        let Some(db) = test_db().await else {
            return Ok(());
        };
        let group_id: i64 = sqlx::query_scalar(
            "SELECT id FROM service_group_service_db.im_group WHERE status = 1 LIMIT 1",
        )
        .fetch_one(&db)
        .await?;

        let members: Vec<i64> = sqlx::query_scalar(
            "SELECT user_id FROM service_group_service_db.im_group_member \
             WHERE group_id = ? AND status = 1 LIMIT 3",
        )
        .bind(group_id)
        .fetch_all(&db)
        .await?;

        if members.is_empty() {
            return Ok(());
        }

        let found = ensure_group_members_batch(&db, group_id, &members).await?;
        assert_eq!(found.len(), members.len());
        for uid in &members {
            assert!(found.contains(uid));
        }
        Ok(())
    }

    #[tokio::test]
    #[ignore]
    async fn test_ensure_group_members_batch_failure_non_member() -> anyhow::Result<()> {
        let Some(db) = test_db().await else {
            return Ok(());
        };
        let group_id: i64 = sqlx::query_scalar(
            "SELECT id FROM service_group_service_db.im_group WHERE status = 1 LIMIT 1",
        )
        .fetch_one(&db)
        .await?;

        let members: Vec<i64> = sqlx::query_scalar(
            "SELECT user_id FROM service_group_service_db.im_group_member \
             WHERE group_id = ? AND status = 1 LIMIT 1",
        )
        .bind(group_id)
        .fetch_all(&db)
        .await?;

        if members.is_empty() {
            return Ok(());
        }

        let mut test_ids = members;
        test_ids.push(999_999_999);

        let result = ensure_group_members_batch(&db, group_id, &test_ids).await;
        assert!(result.is_err());
        let err = app_error_text(result, "non-member should fail batch group member check")?;
        assert!(err.contains("are not members of group"));
        assert!(err.contains("999999999"));
        Ok(())
    }

    #[tokio::test]
    #[ignore]
    async fn test_ensure_group_members_batch_empty_input() -> anyhow::Result<()> {
        let Some(db) = test_db().await else {
            return Ok(());
        };
        let result = ensure_group_members_batch(&db, 1, &[]).await?;
        assert!(result.is_empty());
        Ok(())
    }
}
