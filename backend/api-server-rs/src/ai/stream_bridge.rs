use crate::auth::identity_from_headers;
use crate::error::AppError;
use crate::web::AppState;
use axum::extract::{Path, State};
use axum::http::HeaderMap;
use axum::response::sse::{Event, KeepAlive, Sse};
use futures_util::stream::Stream;
use im_rs_common::keys;
use std::convert::Infallible;
use std::pin::Pin;
use std::task::{Context, Poll};
use std::time::Duration;
use tokio::sync::mpsc;

const STREAM_TIMEOUT_SECS: u64 = 300;

pub async fn subscribe(
    headers: HeaderMap,
    State(state): State<AppState>,
    Path(task_id): Path<i64>,
) -> Result<Sse<impl Stream<Item = Result<Event, Infallible>>>, AppError> {
    let _identity = identity_from_headers(&headers, &state.config)?;
    let channel = keys::ai_stream_channel(task_id);
    let redis_url = state.config.cache_redis_url.clone();

    let (tx, rx) = mpsc::channel::<String>(64);

    tokio::task::spawn_blocking(move || {
        let client = match redis::Client::open(redis_url.as_str()) {
            Ok(c) => c,
            Err(e) => {
                let _ = tx.blocking_send(format!(
                    "{{\"type\":\"error\",\"content\":\"redis connect: {e}\"}}"
                ));
                return;
            }
        };
        let mut conn = match client.get_connection() {
            Ok(c) => c,
            Err(e) => {
                let _ = tx.blocking_send(format!(
                    "{{\"type\":\"error\",\"content\":\"redis conn: {e}\"}}"
                ));
                return;
            }
        };

        if conn.set_read_timeout(Some(Duration::from_secs(5))).is_err() {
            let _ = tx.blocking_send(
                "{\"type\":\"error\",\"content\":\"redis timeout config failed\"}".to_string(),
            );
            return;
        }

        let mut pubsub = conn.as_pubsub();
        if let Err(e) = pubsub.subscribe(&channel) {
            let _ = tx.blocking_send(format!(
                "{{\"type\":\"error\",\"content\":\"subscribe failed: {e}\"}}"
            ));
            return;
        }

        let deadline = std::time::Instant::now() + Duration::from_secs(STREAM_TIMEOUT_SECS);
        loop {
            if std::time::Instant::now() >= deadline {
                let _ = tx.blocking_send("{\"type\":\"done\",\"content\":\"\"}".to_string());
                break;
            }
            match pubsub.get_message() {
                Ok(msg) => {
                    let payload: String = msg.get_payload().unwrap_or_default();
                    let is_done = payload.contains("\"type\":\"done\"")
                        || payload.contains("\"type\":\"error\"");
                    if tx.blocking_send(payload).is_err() || is_done {
                        break;
                    }
                }
                Err(_) => continue,
            }
        }
    });

    let stream = ReceiverStream { rx };
    Ok(Sse::new(stream).keep_alive(KeepAlive::default()))
}

struct ReceiverStream {
    rx: mpsc::Receiver<String>,
}

impl Stream for ReceiverStream {
    type Item = Result<Event, Infallible>;

    fn poll_next(mut self: Pin<&mut Self>, cx: &mut Context<'_>) -> Poll<Option<Self::Item>> {
        match self.rx.poll_recv(cx) {
            Poll::Ready(Some(data)) => Poll::Ready(Some(Ok(Event::default().data(data)))),
            Poll::Ready(None) => Poll::Ready(None),
            Poll::Pending => Poll::Pending,
        }
    }
}
