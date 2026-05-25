use super::*;

pub(crate) fn normalize_id(value: &str) -> Option<String> {
    let trimmed = value.trim();
    (!trimmed.is_empty()).then_some(trimmed.to_string())
}

pub(crate) fn read_lock<'a, T>(lock: &'a RwLock<T>, name: &'static str) -> RwLockReadGuard<'a, T> {
    match lock.read() {
        Ok(guard) => guard,
        Err(poisoned) => {
            tracing::error!(lock = name, "recovering poisoned read lock");
            poisoned.into_inner()
        }
    }
}

pub(crate) fn write_lock<'a, T>(lock: &'a RwLock<T>, name: &'static str) -> RwLockWriteGuard<'a, T> {
    match lock.write() {
        Ok(guard) => guard,
        Err(poisoned) => {
            tracing::error!(lock = name, "recovering poisoned write lock");
            poisoned.into_inner()
        }
    }
}

pub(crate) fn send_close(entry: &SessionEntry) {
    match entry.sender.try_send(Message::Close(None)) {
        Ok(()) => {}
        Err(error) => {
            tracing::debug!(session_id = %entry.session_id, error = %error, "failed to enqueue close frame");
        }
    }
}

pub(crate) fn serialize_ws_envelope(ws_type: &str, data: &Value) -> Option<String> {
    match serde_json::to_string(&WsEnvelope {
        kind: ws_type.to_string(),
        data: data.clone(),
        timestamp: now_ms(),
    }) {
        Ok(value) => Some(value),
        Err(error) => {
            tracing::warn!(error = %error, "failed to serialize websocket envelope");
            None
        }
    }
}

pub(crate) fn deliver_envelope_to_sessions(
    sessions: &[Arc<SessionEntry>],
    envelope: &str,
    slow_or_closed_sessions: &mut Vec<String>,
) -> bool {
    let mut delivered = false;
    for session in sessions {
        match session.sender.try_send(Message::Text(envelope.to_string())) {
            Ok(()) => delivered = true,
            Err(tokio::sync::mpsc::error::TrySendError::Full(_))
            | Err(tokio::sync::mpsc::error::TrySendError::Closed(_)) => {
                slow_or_closed_sessions.push(session.session_id.clone());
            }
        }
    }
    delivered
}

pub(crate) fn spawn_detached(future: impl Future<Output = ()> + Send + 'static) {
    tokio::spawn(async move {
        let result = std::panic::AssertUnwindSafe(future).catch_unwind().await;
        if let Err(error) = result {
            let msg = error
                .downcast_ref::<&str>()
                .map(|s| s.to_string())
                .or_else(|| error.downcast_ref::<String>().cloned())
                .unwrap_or_else(|| "unknown panic".to_string());
            tracing::error!(error = %msg, "background task panicked");
        }
    });
}

#[cfg(test)]
mod tests {
    use super::{deliver_envelope_to_sessions, serialize_ws_envelope, SessionEntry};
    use axum::extract::ws::Message;
    use serde_json::json;
    use std::error::Error;
    use std::sync::atomic::AtomicI64;
    use std::sync::Arc;
    use tokio::sync::{mpsc, watch};

    #[test]
    fn should_serialize_ws_envelope() -> Result<(), Box<dyn Error>> {
        let Some(envelope) = serialize_ws_envelope("MESSAGE", &json!({ "content": "hi" })) else {
            return Err("websocket envelope should serialize".into());
        };
        if !envelope.contains("\"type\":\"MESSAGE\"") {
            return Err("envelope type should be present".into());
        }
        if !envelope.contains("\"content\":\"hi\"") {
            return Err("envelope payload should be present".into());
        }
        Ok(())
    }

    #[tokio::test]
    async fn should_deliver_shared_envelope_to_multiple_sessions() -> Result<(), Box<dyn Error>> {
        let (sender_a, mut receiver_a) = mpsc::channel(2);
        let (sender_b, mut receiver_b) = mpsc::channel(2);
        let (shutdown_a, _) = watch::channel(false);
        let (shutdown_b, _) = watch::channel(false);
        let sessions = vec![
            Arc::new(SessionEntry {
                session_id: "a".to_string(),
                user_id: "1".to_string(),
                sender: sender_a,
                shutdown: shutdown_a,
                last_heartbeat_ms: AtomicI64::new(0),
            }),
            Arc::new(SessionEntry {
                session_id: "b".to_string(),
                user_id: "2".to_string(),
                sender: sender_b,
                shutdown: shutdown_b,
                last_heartbeat_ms: AtomicI64::new(0),
            }),
        ];
        let Some(envelope) = serialize_ws_envelope("MESSAGE", &json!({ "messageId": "99" })) else {
            return Err("shared envelope should serialize".into());
        };
        let mut slow_or_closed_sessions = Vec::new();
        if !deliver_envelope_to_sessions(&sessions, &envelope, &mut slow_or_closed_sessions) {
            return Err("envelope should be delivered".into());
        }
        if !slow_or_closed_sessions.is_empty() {
            return Err("healthy sessions should not be marked slow".into());
        }

        let Some(Message::Text(received_a)) = receiver_a.recv().await else {
            return Err("first session should receive text frame".into());
        };
        let Some(Message::Text(received_b)) = receiver_b.recv().await else {
            return Err("second session should receive text frame".into());
        };
        if received_a != envelope || received_b != envelope {
            return Err("all sessions should receive the shared serialized envelope".into());
        }
        Ok(())
    }
}
