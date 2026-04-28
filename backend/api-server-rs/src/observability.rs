use std::future::Future;
use std::time::Instant;

pub async fn db_query<T, E, Fut>(operation: &'static str, future: Fut) -> Result<T, E>
where
    Fut: Future<Output = Result<T, E>>,
{
    let started = Instant::now();
    let result = future.await;
    tracing::info!(
        target: "im_observe",
        kind = "db_query",
        operation,
        ok = result.is_ok(),
        elapsed_ms = u64::try_from(started.elapsed().as_millis()).unwrap_or(u64::MAX),
        "db query observed"
    );
    result
}

pub fn cache_fallback(
    operation: &'static str,
    reason: &'static str,
    conversation_id: Option<&str>,
    hot_count: usize,
    requested_count: usize,
) {
    tracing::info!(
        target: "im_observe",
        kind = "cache_fallback",
        operation,
        reason,
        conversation_id = conversation_id.unwrap_or(""),
        has_conversation_id = conversation_id.is_some(),
        hot_count,
        requested_count,
        "redis cache fallback observed"
    );
}

pub fn writer_flush(
    operation: &'static str,
    count: usize,
    elapsed_ms: u64,
    remaining_messages: usize,
    remaining_read_cursors: usize,
) {
    tracing::info!(
        target: "im_observe",
        kind = "writer_flush",
        operation,
        count,
        elapsed_ms,
        remaining_messages,
        remaining_read_cursors,
        "message writer flush observed"
    );
}

pub fn pending_events(operation: &'static str, due_count: usize, backlog_count: Option<usize>) {
    tracing::info!(
        target: "im_observe",
        kind = "pending_events",
        operation,
        due_count,
        backlog_count = backlog_count.unwrap_or(0),
        has_backlog_count = backlog_count.is_some(),
        "pending events observed"
    );
}
