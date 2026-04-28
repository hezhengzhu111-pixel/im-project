use sqlx::MySqlPool;

const JS_SAFE_INTEGER_MAX: i64 = 9_007_199_254_740_991;
const JS_INTEGER_ROUNDING_WINDOW: i64 = 4096;

pub async fn resolve_active_user_id(
    db: &MySqlPool,
    candidate_id: i64,
) -> Result<Option<i64>, sqlx::Error> {
    resolve_existing_id(
        db,
        "service_user_service_db.users",
        "id",
        "status = 1",
        candidate_id,
    )
    .await
}

pub async fn resolve_active_group_id(
    db: &MySqlPool,
    candidate_id: i64,
) -> Result<Option<i64>, sqlx::Error> {
    resolve_existing_id(
        db,
        "service_group_service_db.im_group",
        "id",
        "status = 1",
        candidate_id,
    )
    .await
}

pub async fn resolve_existing_message_id(
    db: &MySqlPool,
    candidate_id: i64,
) -> Result<Option<i64>, sqlx::Error> {
    resolve_existing_id(
        db,
        "service_message_service_db.messages",
        "id",
        "status <> 5",
        candidate_id,
    )
    .await
}

async fn resolve_existing_id(
    db: &MySqlPool,
    table: &str,
    column: &str,
    filter: &str,
    candidate_id: i64,
) -> Result<Option<i64>, sqlx::Error> {
    let exact_sql = format!("SELECT {column} FROM {table} WHERE {column} = ? AND {filter} LIMIT 1");
    let exact: Option<i64> = sqlx::query_scalar(&exact_sql)
        .bind(candidate_id)
        .fetch_optional(db)
        .await?;
    if exact.is_some() || candidate_id.abs() <= JS_SAFE_INTEGER_MAX {
        return Ok(exact);
    }

    let lower = candidate_id.saturating_sub(JS_INTEGER_ROUNDING_WINDOW);
    let upper = candidate_id.saturating_add(JS_INTEGER_ROUNDING_WINDOW);
    let nearest_sql = format!(
        "SELECT {column} FROM {table} \
         WHERE {filter} AND {column} BETWEEN ? AND ? \
         ORDER BY ABS({column} - ?) ASC, {column} ASC LIMIT 1"
    );
    let resolved: Option<i64> = sqlx::query_scalar(&nearest_sql)
        .bind(lower)
        .bind(upper)
        .bind(candidate_id)
        .fetch_optional(db)
        .await?;

    if let Some(resolved_id) = resolved {
        tracing::warn!(
            candidate_id,
            resolved_id,
            table,
            "resolved rounded javascript integer id"
        );
    }
    Ok(resolved)
}
