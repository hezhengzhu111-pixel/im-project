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
    sqlx::query("DELETE FROM prekey_bundles WHERE last_active_at < NOW() - INTERVAL 30 DAY")
        .execute(db)
        .await?;

    sqlx::query(
        "DELETE FROM one_time_prekeys WHERE device_id NOT IN (SELECT device_id FROM prekey_bundles)",
    )
    .execute(db)
    .await?;

    sqlx::query(
        "DELETE FROM e2ee_sender_keys WHERE device_id NOT IN (SELECT device_id FROM prekey_bundles)",
    )
    .execute(db)
    .await?;

    tracing::info!("e2ee stale device cleanup completed");
    Ok(())
}
