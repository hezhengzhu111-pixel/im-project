use crate::dto::{
    ApiResponse, HealthResponse, InternalPushBatchRequest, InternalPushBatchResult,
    InternalPushRequest, ReadyResponse,
};
use crate::error::AppError;
use crate::security::{validate_gateway_ws_identity, validate_internal_signature};
use crate::service::ImService;
use axum::body::Bytes;
use axum::extract::ws::{Message, WebSocket, WebSocketUpgrade};
use axum::extract::{OriginalUri, Path, Query, State};
use axum::http::{header, HeaderMap, HeaderValue};
use axum::response::{IntoResponse, Response};
use axum::routing::{get, post};
use axum::{Json, Router};
use futures_util::{SinkExt, StreamExt};
use serde_json::Value;
use std::collections::HashMap;
use tokio::sync::{mpsc, watch};

pub fn router(service: ImService) -> Router {
    Router::new()
        .route("/health", get(health))
        .route("/ready", get(ready))
        .route("/api/im/offline/:user_id", post(user_offline))
        .route("/api/im/heartbeat/:user_id", post(touch_heartbeat))
        .route("/api/im/heartbeat", post(batch_heartbeat))
        .route("/api/im/online-status", post(online_status))
        .route("/api/im/internal/push", post(internal_push))
        .route("/api/im/internal/push/batch", post(internal_push_batch))
        .route("/websocket/:path_user_id", get(websocket))
        .with_state(service)
}

async fn health() -> Json<HealthResponse> {
    Json(HealthResponse {
        status: "UP".to_string(),
        service: "im-server".to_string(),
        time: crate::dto::now_iso(),
    })
}

async fn ready() -> Json<ReadyResponse> {
    Json(ReadyResponse {
        service: "im-server".to_string(),
        time: crate::dto::now_iso(),
        readiness_state: "ACCEPTING_TRAFFIC".to_string(),
        status: "READY".to_string(),
    })
}

async fn user_offline(
    State(service): State<ImService>,
    headers: HeaderMap,
    OriginalUri(uri): OriginalUri,
    Path(user_id): Path<String>,
    body: Bytes,
) -> Result<Json<ApiResponse<String>>, AppError> {
    validate_internal_signature(&headers, "POST", uri.path(), &body, service.config())?;
    service.user_offline(&user_id).await;
    Ok(Json(ApiResponse::success(
        "user offline success".to_string(),
    )))
}

async fn touch_heartbeat(
    State(service): State<ImService>,
    headers: HeaderMap,
    OriginalUri(uri): OriginalUri,
    Path(user_id): Path<String>,
    body: Bytes,
) -> Result<Json<ApiResponse<bool>>, AppError> {
    validate_internal_signature(&headers, "POST", uri.path(), &body, service.config())?;
    let touched = service.touch_user_heartbeat(&user_id).await;
    if touched {
        Ok(Json(ApiResponse::success_message(
            "heartbeat refreshed",
            true,
        )))
    } else {
        Ok(Json(ApiResponse::error(
            400,
            "user offline or session invalid",
        )))
    }
}

async fn batch_heartbeat(
    State(service): State<ImService>,
    headers: HeaderMap,
    OriginalUri(uri): OriginalUri,
    body: Bytes,
) -> Result<Json<ApiResponse<HashMap<String, bool>>>, AppError> {
    online_status_impl(service, headers, uri, body).await
}

async fn online_status(
    State(service): State<ImService>,
    headers: HeaderMap,
    OriginalUri(uri): OriginalUri,
    body: Bytes,
) -> Result<Json<ApiResponse<HashMap<String, bool>>>, AppError> {
    online_status_impl(service, headers, uri, body).await
}

async fn online_status_impl(
    service: ImService,
    headers: HeaderMap,
    uri: axum::http::Uri,
    body: Bytes,
) -> Result<Json<ApiResponse<HashMap<String, bool>>>, AppError> {
    validate_internal_signature(&headers, "POST", uri.path(), &body, service.config())?;
    let user_ids: Vec<String> = serde_json::from_slice(&body)?;
    if user_ids.is_empty() {
        return Ok(Json(ApiResponse::error(500, "userIds cannot be empty")));
    }
    let status = service.check_users_online_status(&user_ids).await;
    Ok(Json(ApiResponse::success_message(
        "online status queried",
        status,
    )))
}

async fn internal_push(
    State(service): State<ImService>,
    headers: HeaderMap,
    OriginalUri(uri): OriginalUri,
    body: Bytes,
) -> Result<Json<ApiResponse<bool>>, AppError> {
    validate_internal_signature(&headers, "POST", uri.path(), &body, service.config())?;
    let request: InternalPushRequest = serde_json::from_slice(&body)?;
    if request.kind.trim().is_empty() {
        return Ok(Json(ApiResponse::error(400, "push type cannot be empty")));
    }
    let delivered = service
        .push_to_user(request.user_id, request.kind.trim(), request.data)
        .await;
    Ok(Json(ApiResponse::success_message(
        if delivered {
            "push delivered"
        } else {
            "user has no local websocket session"
        },
        delivered,
    )))
}

async fn internal_push_batch(
    State(service): State<ImService>,
    headers: HeaderMap,
    OriginalUri(uri): OriginalUri,
    body: Bytes,
) -> Result<Json<ApiResponse<InternalPushBatchResult>>, AppError> {
    validate_internal_signature(&headers, "POST", uri.path(), &body, service.config())?;
    let request: InternalPushBatchRequest = serde_json::from_slice(&body)?;
    if request.pushes.is_empty() {
        return Ok(Json(ApiResponse::error(400, "pushes cannot be empty")));
    }
    for push in request.pushes.iter() {
        if push.kind.trim().is_empty() {
            return Ok(Json(ApiResponse::error(400, "push type cannot be empty")));
        }
    }

    let accepted = request.pushes.len();
    let mut delivered = 0_usize;
    for push in request.pushes {
        if service
            .push_to_user(push.user_id, push.kind.trim(), push.data)
            .await
        {
            delivered += 1;
        }
    }
    Ok(Json(ApiResponse::success_message(
        "batch push processed",
        InternalPushBatchResult {
            accepted,
            delivered,
        },
    )))
}

async fn websocket(
    ws: WebSocketUpgrade,
    State(service): State<ImService>,
    Path(_path_user_id): Path<String>,
    Query(query): Query<HashMap<String, String>>,
    headers: HeaderMap,
) -> Response {
    let (gateway_user_id, _gateway_username) =
        match validate_gateway_ws_identity(&headers, service.config()) {
            Ok(identity) => identity,
            Err(err) => {
                tracing::warn!(error = %err, "websocket gateway auth rejected");
                return err.into_response();
            }
        };

    let ticket = match resolve_ticket(&headers, &query, &service) {
        TicketResolution::Ticket(ticket) => ticket,
        TicketResolution::RejectedQueryTicket => {
            tracing::warn!(
                user_id = gateway_user_id,
                "websocket query ticket rejected by config"
            );
            return AppError::query_ticket_not_allowed().into_response();
        }
        TicketResolution::Missing => {
            tracing::warn!(user_id = gateway_user_id, "websocket ticket missing");
            return AppError::ticket_invalid().into_response();
        }
    };

    let consume_result = match service
        .clients()
        .consume_ws_ticket(&ticket, gateway_user_id)
        .await
    {
        Ok(result) => result,
        Err(err) => {
            tracing::warn!(error = %err, user_id = gateway_user_id, "consume ws ticket failed");
            return AppError::ticket_invalid().into_response();
        }
    };
    if !consume_result.valid || consume_result.user_id.is_none() {
        tracing::warn!(
            user_id = gateway_user_id,
            status = ?consume_result.status,
            error = ?consume_result.error,
            "websocket ticket rejected"
        );
        return AppError::ticket_invalid().into_response();
    }

    let user_id = consume_result.user_id.unwrap().to_string();
    let username = consume_result.username.unwrap_or_default();
    let service_for_socket = service.clone();
    let mut response = ws
        .on_upgrade(move |socket| handle_socket(socket, service_for_socket, user_id, username))
        .into_response();
    if let Ok(cookie) = clear_ws_ticket_cookie(&headers, &service) {
        response.headers_mut().append(header::SET_COOKIE, cookie);
    }
    response
}

async fn handle_socket(socket: WebSocket, service: ImService, user_id: String, username: String) {
    let (mut socket_sender, mut socket_receiver) = socket.split();
    let queue_size = service.config().websocket_outbound_queue_size.max(1);
    let (sender, mut receiver) = mpsc::channel::<Message>(queue_size);
    let (shutdown, mut shutdown_rx) = watch::channel(false);
    let session_id = service
        .register_session(user_id.clone(), username, sender.clone(), shutdown)
        .await;

    let write_task = tokio::spawn(async move {
        while let Some(message) = receiver.recv().await {
            if socket_sender.send(message).await.is_err() {
                break;
            }
        }
    });

    let mut invalid_payload_count = 0_usize;
    loop {
        let message_result = tokio::select! {
            _ = shutdown_rx.changed() => break,
            message = socket_receiver.next() => message,
        };
        let Some(message_result) = message_result else {
            break;
        };
        let Ok(message) = message_result else {
            break;
        };
        match message {
            Message::Text(text) => {
                let keep_open = handle_client_text(
                    &service,
                    &sender,
                    &user_id,
                    &session_id,
                    text.as_str(),
                    &mut invalid_payload_count,
                )
                .await;
                if !keep_open {
                    break;
                }
            }
            Message::Ping(payload) => {
                let _ = sender.try_send(Message::Pong(payload));
                if !service
                    .refresh_session_heartbeat(&user_id, &session_id)
                    .await
                {
                    break;
                }
            }
            Message::Pong(_) => {
                if !service
                    .refresh_session_heartbeat(&user_id, &session_id)
                    .await
                {
                    break;
                }
            }
            Message::Close(_) => break,
            Message::Binary(_) => {
                invalid_payload_count += 1;
                if invalid_payload_count >= service.config().invalid_payload_threshold.max(1) {
                    let _ = sender.try_send(Message::Close(None));
                    break;
                }
            }
        }
    }

    write_task.abort();
    service.unregister_session(&session_id).await;
}

async fn handle_client_text(
    service: &ImService,
    sender: &mpsc::Sender<Message>,
    user_id: &str,
    session_id: &str,
    text: &str,
    invalid_payload_count: &mut usize,
) -> bool {
    if text.len() > service.config().max_payload_length.max(1) {
        return handle_invalid_payload(service, sender, invalid_payload_count);
    }
    let payload = text.trim();
    if payload.is_empty() {
        return handle_invalid_payload(service, sender, invalid_payload_count);
    }
    let mut is_heartbeat = payload.eq_ignore_ascii_case("PING");
    if !is_heartbeat && payload.starts_with('{') {
        match serde_json::from_str::<Value>(payload) {
            Ok(json) => {
                is_heartbeat = json
                    .get("type")
                    .and_then(Value::as_str)
                    .is_some_and(|kind| {
                        kind.eq_ignore_ascii_case("HEARTBEAT") || kind.eq_ignore_ascii_case("PING")
                    });
            }
            Err(_) => return handle_invalid_payload(service, sender, invalid_payload_count),
        }
    }
    if !is_heartbeat {
        return handle_invalid_payload(service, sender, invalid_payload_count);
    }

    *invalid_payload_count = 0;
    if !service.refresh_session_heartbeat(user_id, session_id).await {
        return false;
    }
    let _ = sender.try_send(Message::Text(
        serde_json::json!({"type":"HEARTBEAT","content":"PONG"}).to_string(),
    ));
    true
}

fn handle_invalid_payload(
    service: &ImService,
    sender: &mpsc::Sender<Message>,
    invalid_payload_count: &mut usize,
) -> bool {
    *invalid_payload_count += 1;
    if *invalid_payload_count >= service.config().invalid_payload_threshold.max(1) {
        let _ = sender.try_send(Message::Close(None));
        return false;
    }
    true
}

enum TicketResolution {
    Ticket(String),
    RejectedQueryTicket,
    Missing,
}

fn resolve_ticket(
    headers: &HeaderMap,
    query: &HashMap<String, String>,
    service: &ImService,
) -> TicketResolution {
    if let Some(ticket) = cookie_value(headers, &service.config().ws_ticket_cookie_name) {
        return TicketResolution::Ticket(ticket);
    }
    let query_ticket = query
        .get("ticket")
        .map(|value| value.trim())
        .filter(|value| !value.is_empty());
    if query_ticket.is_some() && !service.config().allow_query_ticket {
        return TicketResolution::RejectedQueryTicket;
    }
    query_ticket
        .map(|ticket| TicketResolution::Ticket(ticket.to_string()))
        .unwrap_or(TicketResolution::Missing)
}

fn cookie_value(headers: &HeaderMap, name: &str) -> Option<String> {
    let raw = headers.get(header::COOKIE)?.to_str().ok()?;
    raw.split(';').find_map(|part| {
        let (key, value) = part.trim().split_once('=')?;
        (key.trim() == name)
            .then(|| value.trim().to_string())
            .filter(|value| !value.is_empty())
    })
}

fn clear_ws_ticket_cookie(
    headers: &HeaderMap,
    service: &ImService,
) -> Result<HeaderValue, AppError> {
    let secure = resolve_secure(headers, &service.config().ws_ticket_cookie_secure);
    let secure_attr = if secure { "; Secure" } else { "" };
    HeaderValue::from_str(&format!(
        "{}=; Max-Age=0; Path={}; HttpOnly; SameSite={}{}",
        service.config().ws_ticket_cookie_name,
        normalize_cookie_path(&service.config().ws_ticket_cookie_path),
        normalize_same_site(&service.config().ws_ticket_cookie_same_site),
        secure_attr
    ))
    .map_err(|err| AppError::BadRequest(format!("invalid cookie header: {}", err)))
}

fn resolve_secure(headers: &HeaderMap, configured: &str) -> bool {
    match configured.trim().to_ascii_lowercase().as_str() {
        "true" => true,
        "false" => false,
        _ => headers
            .get("X-Forwarded-Proto")
            .and_then(|value| value.to_str().ok())
            .is_some_and(|proto| proto.eq_ignore_ascii_case("https")),
    }
}

fn normalize_cookie_path(path: &str) -> &str {
    if path.trim().starts_with('/') {
        path.trim()
    } else {
        "/websocket"
    }
}

fn normalize_same_site(same_site: &str) -> &str {
    if same_site.trim().is_empty() {
        "Lax"
    } else {
        same_site.trim()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::config::AppConfig;
    use crate::service::ImService;
    use redis::aio::ConnectionManager;
    use std::sync::Arc;

    #[test]
    fn should_read_ws_ticket_from_cookie() {
        let mut headers = HeaderMap::new();
        headers.insert(
            header::COOKIE,
            HeaderValue::from_static("a=1; IM_WS_TICKET=ticket-1"),
        );

        assert_eq!(
            Some("ticket-1".to_string()),
            cookie_value(&headers, "IM_WS_TICKET")
        );
    }

    #[test]
    fn should_resolve_secure_from_forwarded_proto() {
        let mut headers = HeaderMap::new();
        headers.insert("X-Forwarded-Proto", HeaderValue::from_static("https"));

        assert!(resolve_secure(&headers, "auto"));
        assert!(resolve_secure(&HeaderMap::new(), "true"));
        assert!(!resolve_secure(&headers, "false"));
    }

    #[allow(dead_code)]
    fn _service_for_type_check(config: Arc<AppConfig>, redis: ConnectionManager) -> ImService {
        ImService::new(config, redis)
    }
}
