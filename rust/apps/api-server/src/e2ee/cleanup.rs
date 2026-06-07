use sqlx::MySqlPool;
use tokio::time::{interval, Duration};

pub fn spawn(db: MySqlPool) {
    tokio::spawn(async move {
        let mut tick = interval(Duration::from_secs(24 * 60 * 60));
        loop {
            tick.tick().await;
            if let Err(e) = cleanup_stale_devices(&db).await {
                tracing::error!("e2ee cleanup failed: {}", e);
            }
        }
    });
}

async fn cleanup_stale_devices(db: &MySqlPool) -> Result<(), sqlx::Error> {
    sqlx::query(
        "UPDATE service_user_service_db.e2ee_devices \
         SET status = 'deleted', revoked_at = COALESCE(revoked_at, NOW()) \
         WHERE status = 'active' AND last_active_at < NOW() - INTERVAL 30 DAY",
    )
    .execute(db)
    .await?;

    sqlx::query(
        "DELETE otk FROM service_user_service_db.e2ee_one_time_pre_keys otk \
         LEFT JOIN service_user_service_db.e2ee_devices d \
           ON d.user_id = otk.user_id AND d.device_id = otk.device_id AND d.status = 'active' \
         WHERE d.device_id IS NULL",
    )
    .execute(db)
    .await?;

    sqlx::query(
        "DELETE FROM service_user_service_db.e2ee_one_time_pre_keys \
         WHERE consumed = 1 AND COALESCE(consumed_time, created_time) < NOW() - INTERVAL 7 DAY",
    )
    .execute(db)
    .await?;

    sqlx::query(
        "DELETE FROM service_user_service_db.e2ee_pre_key_claims \
         WHERE created_at < NOW() - INTERVAL 7 DAY",
    )
    .execute(db)
    .await?;

    sqlx::query(
        "DELETE sk FROM service_user_service_db.e2ee_sender_keys sk \
         LEFT JOIN service_user_service_db.e2ee_devices d \
           ON d.user_id = sk.sender_id AND d.device_id = sk.device_id AND d.status = 'active' \
         WHERE d.device_id IS NULL",
    )
    .execute(db)
    .await?;

    tracing::info!("e2ee stale device cleanup completed");
    Ok(())
}
