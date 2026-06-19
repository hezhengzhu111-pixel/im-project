use crate::config::AppConfig;
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
    if request.user_ids.is_empty() {
        return Ok(Json(ApiResponse::error(400, "userIds cannot be empty")));
    }
    if request.kind.trim().is_empty() {
        return Ok(Json(ApiResponse::error(400, "push type cannot be empty")));
    }
    let accepted = request.user_ids.len();
    let delivered = service
        .push_to_users(&request.user_ids, request.kind.trim(), &request.data)
        .await;
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
    Path(path_user_id): Path<String>,
    Query(query): Query<HashMap<String, String>>,
    headers: HeaderMap,
) -> Response {
    let ticket = match resolve_ticket(&headers, &query, service.config()) {
        TicketResolution::Ticket(ticket) => ticket,
        TicketResolution::RejectedQueryTicket => {
            tracing::warn!(
                user_id = %path_user_id,
                "websocket query ticket rejected by config"
            );
            return AppError::query_ticket_not_allowed().into_response();
        }
        TicketResolution::Missing => {
            tracing::warn!(user_id = %path_user_id, "websocket ticket missing");
            return AppError::ticket_invalid().into_response();
        }
    };

    let gateway_identity = match validate_gateway_ws_identity(&headers, service.config()) {
        Ok(identity) => Some(identity),
        Err(err) => {
            tracing::debug!(error = %err, user_id = %path_user_id, "websocket gateway auth absent or rejected; falling back to ws ticket identity");
            None
        }
    };
    let expected_user_id = match gateway_identity {
        Some((user_id, _)) => user_id,
        None => match path_user_id.trim().parse::<i64>() {
            Ok(user_id) => user_id,
            Err(_) => {
                tracing::warn!(user_id = %path_user_id, "websocket path user id invalid");
                return AppError::ticket_invalid().into_response();
            }
        },
    };

    let consume_result = match service
        .clients()
        .consume_ws_ticket(&ticket, expected_user_id)
        .await
    {
        Ok(result) => result,
        Err(err) => {
            tracing::warn!(error = %err, user_id = expected_user_id, "consume ws ticket failed");
            return AppError::ticket_invalid().into_response();
        }
    };
    let Some(consumed_user_id) = consume_result.user_id else {
        tracing::warn!(
            user_id = expected_user_id,
            status = ?consume_result.status,
            error = ?consume_result.error,
            "websocket ticket rejected"
        );
        return AppError::ticket_invalid().into_response();
    };
    if !consume_result.valid {
        tracing::warn!(
            user_id = expected_user_id,
            status = ?consume_result.status,
            error = ?consume_result.error,
            "websocket ticket rejected"
        );
        return AppError::ticket_invalid().into_response();
    }

    let user_id = consumed_user_id.to_string();
    let username = consume_result.username.unwrap_or_default();
    let service_for_socket = service.clone();
    let mut response = ws
        .on_upgrade(move |socket| handle_socket(socket, service_for_socket, user_id, username))
        .into_response();
    if let Ok(cookie) = clear_ws_ticket_cookie(&headers, service.config()) {
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
            changed = shutdown_rx.changed() => {
                if let Err(error) = changed {
                    tracing::debug!(error = %error, "websocket shutdown sender dropped");
                }
                break;
            },
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
                send_ws_message(&sender, Message::Pong(payload), "pong");
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
                invalid_payload_count = invalid_payload_count.saturating_add(1);
                if invalid_payload_count >= service.config().invalid_payload_threshold.max(1) {
                    send_ws_message(&sender, Message::Close(None), "close");
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
    send_ws_message(
        sender,
        Message::Text(serde_json::json!({"type":"HEARTBEAT","content":"PONG"}).to_string()),
        "heartbeat pong",
    );
    true
}

fn handle_invalid_payload(
    service: &ImService,
    sender: &mpsc::Sender<Message>,
    invalid_payload_count: &mut usize,
) -> bool {
    *invalid_payload_count = (*invalid_payload_count).saturating_add(1);
    if *invalid_payload_count >= service.config().invalid_payload_threshold.max(1) {
        send_ws_message(sender, Message::Close(None), "close");
        return false;
    }
    true
}

fn send_ws_message(sender: &mpsc::Sender<Message>, message: Message, context: &'static str) {
    match sender.try_send(message) {
        Ok(()) => {}
        Err(error) => {
            tracing::debug!(context, error = %error, "failed to enqueue websocket message");
        }
    }
}

#[derive(Debug, PartialEq, Eq)]
enum TicketResolution {
    Ticket(String),
    RejectedQueryTicket,
    Missing,
}

fn resolve_ticket(
    headers: &HeaderMap,
    query: &HashMap<String, String>,
    config: &AppConfig,
) -> TicketResolution {
    if let Some(ticket) = cookie_value(headers, &config.ws_ticket_cookie_name) {
        return TicketResolution::Ticket(ticket);
    }
    let query_ticket = query
        .get("ticket")
        .map(|value| value.trim())
        .filter(|value| !value.is_empty());
    if query_ticket.is_some() && !config.allow_query_ticket {
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
    config: &AppConfig,
) -> Result<HeaderValue, AppError> {
    let secure = resolve_secure(headers, &config.ws_ticket_cookie_secure);
    let secure_attr = if secure { "; Secure" } else { "" };
    HeaderValue::from_str(&format!(
        "{}=; Max-Age=0; Path={}; HttpOnly; SameSite={}{}",
        config.ws_ticket_cookie_name,
        normalize_cookie_path(&config.ws_ticket_cookie_path),
        normalize_same_site(&config.ws_ticket_cookie_same_site),
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

#[cfg(test)]
mod web_extra_tests {
    use super::*;
    use crate::config::AppConfig;
    use axum::http::HeaderValue;
    use std::sync::Arc;

    fn dummy_config() -> Arc<AppConfig> {
        Arc::new(AppConfig {
            port: 8083,
            route_redis_url: "redis://127.0.0.1:6379/0".to_string(),
            auth_service_url: "http://127.0.0.1:8084".to_string(),
            internal_secret: "im-internal-secret-im-internal-secret-im-internal-secret-im"
                .to_string(),
            internal_max_skew_ms: 300_000,
            gateway_user_id_header: "X-User-Id".to_string(),
            gateway_username_header: "X-Username".to_string(),
            gateway_auth_secret:
                "im-gateway-auth-secret-im-gateway-auth-secret-im-gateway-auth-secret".to_string(),
            gateway_auth_max_skew_ms: 300_000,
            instance_id: "test:8083".to_string(),
            internal_http_url: "http://test:8083".to_string(),
            internal_ws_url: "ws://test:8083".to_string(),
            server_registry_key_prefix: "im:server:".to_string(),
            server_lease_ttl_seconds: 15,
            server_renew_interval_ms: 3_000,
            route_users_key: "im:route:users".to_string(),
            route_lease_ttl_ms: 120_000,
            route_renew_interval_ms: 30_000,
            session_heartbeat_timeout_ms: 90_000,
            session_cleanup_interval_ms: 30_000,
            presence_channel: "im:presence:broadcast".to_string(),
            allow_query_ticket: true,
            ws_ticket_cookie_name: "IM_WS_TICKET".to_string(),
            ws_ticket_cookie_path: "/websocket".to_string(),
            ws_ticket_cookie_same_site: "Lax".to_string(),
            ws_ticket_cookie_secure: "auto".to_string(),
            max_payload_length: 8 * 1024,
            invalid_payload_threshold: 3,
            websocket_outbound_queue_size: 1024,
        })
    }

    fn disabled_query_ticket_config() -> Arc<AppConfig> {
        let mut config = (*dummy_config()).clone();
        config.allow_query_ticket = false;
        Arc::new(config)
    }

    #[test]
    fn resolve_ticket_prefers_cookie() {
        let config = dummy_config();
        let mut headers = HeaderMap::new();
        headers.insert(
            header::COOKIE,
            HeaderValue::from_static("IM_WS_TICKET=cookie-ticket"),
        );
        let mut query = HashMap::new();
        query.insert("ticket".to_string(), "query-ticket".to_string());
        assert_eq!(
            resolve_ticket(&headers, &query, &config),
            TicketResolution::Ticket("cookie-ticket".to_string())
        );
    }

    #[test]
    fn resolve_ticket_allows_query_ticket_when_enabled() {
        let config = dummy_config();
        let headers = HeaderMap::new();
        let mut query = HashMap::new();
        query.insert("ticket".to_string(), "query-ticket".to_string());
        assert_eq!(
            resolve_ticket(&headers, &query, &config),
            TicketResolution::Ticket("query-ticket".to_string())
        );
    }

    #[test]
    fn resolve_ticket_rejects_query_ticket_when_disabled() {
        let config = disabled_query_ticket_config();
        let headers = HeaderMap::new();
        let mut query = HashMap::new();
        query.insert("ticket".to_string(), "query-ticket".to_string());
        assert_eq!(
            resolve_ticket(&headers, &query, &config),
            TicketResolution::RejectedQueryTicket
        );
    }

    #[test]
    fn resolve_ticket_missing_when_no_ticket() {
        let config = dummy_config();
        assert_eq!(
            resolve_ticket(&HeaderMap::new(), &HashMap::new(), &config),
            TicketResolution::Missing
        );
    }

    #[test]
    fn resolve_ticket_ignores_empty_query_ticket() {
        let config = dummy_config();
        let headers = HeaderMap::new();
        let mut query = HashMap::new();
        query.insert("ticket".to_string(), "   ".to_string());
        assert_eq!(
            resolve_ticket(&headers, &query, &config),
            TicketResolution::Missing
        );
    }

    #[test]
    fn clear_ws_ticket_cookie_builds_header() {
        let config = dummy_config();
        let cookie = clear_ws_ticket_cookie(&HeaderMap::new(), &config).unwrap();
        let value = cookie.to_str().unwrap();
        assert!(value.starts_with("IM_WS_TICKET=; Max-Age=0"));
        assert!(value.contains("Path=/websocket"));
        assert!(value.contains("HttpOnly"));
        assert!(value.contains("SameSite=Lax"));
    }

    #[test]
    fn clear_ws_ticket_cookie_adds_secure_for_https() {
        let config = dummy_config();
        let mut headers = HeaderMap::new();
        headers.insert("X-Forwarded-Proto", HeaderValue::from_static("https"));
        let cookie = clear_ws_ticket_cookie(&headers, &config).unwrap();
        assert!(cookie.to_str().unwrap().contains("Secure"));
    }

    #[test]
    fn normalize_cookie_path_keeps_leading_slash() {
        assert_eq!(normalize_cookie_path("/custom"), "/custom");
    }

    #[test]
    fn normalize_cookie_path_defaults_missing_slash() {
        assert_eq!(normalize_cookie_path("websocket"), "/websocket");
    }

    #[test]
    fn normalize_same_site_defaults_to_lax() {
        assert_eq!(normalize_same_site(""), "Lax");
        assert_eq!(normalize_same_site("  "), "Lax");
    }
}
