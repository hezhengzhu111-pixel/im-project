use crate::auth::{identity_from_headers, is_gateway_whitelist};
use crate::auth_api;
use crate::config::AppConfig;
use crate::error::AppError;
use crate::file_api;
use crate::message;
use crate::route;
use crate::social;
use crate::user;
use axum::body::Body;
use axum::extract::ws::{Message, WebSocket, WebSocketUpgrade};
use axum::extract::{OriginalUri, Path, Query, State};
use axum::http::{header, HeaderMap, HeaderValue, Method, StatusCode};
use axum::response::{IntoResponse, Response};
use axum::routing::{delete, get, post, put};
use axum::{Json, Router};
use futures_util::{SinkExt, StreamExt};
use im_rs_common::api::ApiResponse;
use im_rs_common::auth::sign_gateway_headers;
use redis::aio::ConnectionManager;
use reqwest::Client;
use serde_json::json;
use sqlx::MySqlPool;
use std::sync::{Arc, OnceLock};
use std::time::{Duration, Instant};
use tokio::sync::Mutex;
use tokio_tungstenite::connect_async;
use tokio_tungstenite::tungstenite::client::IntoClientRequest;

#[derive(Clone)]
pub struct AppState {
    pub config: Arc<AppConfig>,
    pub redis_manager: ConnectionManager,
    pub db: MySqlPool,
    pub http: Client,
}

struct WebSocketTargetCache {
    target: Option<String>,
    expires_at: Instant,
}

static WEBSOCKET_TARGET_CACHE: OnceLock<Mutex<WebSocketTargetCache>> = OnceLock::new();

pub fn router(state: AppState) -> Router {
    Router::new()
        .route("/health", get(health))
        .route("/ready", get(ready))
        .route("/auth/refresh", post(auth_api::refresh))
        .route("/api/auth/refresh", post(auth_api::refresh))
        .route("/auth/parse", post(auth_api::parse))
        .route("/api/auth/parse", post(auth_api::parse))
        .route("/auth/ws-ticket", post(auth_api::issue_ws_ticket))
        .route("/api/auth/ws-ticket", post(auth_api::issue_ws_ticket))
        .route(
            "/api/auth/internal/token",
            post(auth_api::internal_issue_token),
        )
        .route(
            "/api/auth/internal/user-resource/:user_id",
            get(auth_api::internal_user_resource),
        )
        .route(
            "/api/auth/internal/validate-token",
            post(auth_api::internal_validate_token),
        )
        .route(
            "/api/auth/internal/introspect",
            post(auth_api::internal_introspect),
        )
        .route(
            "/api/auth/internal/ws-introspect",
            post(auth_api::internal_introspect),
        )
        .route(
            "/api/auth/internal/check-permission",
            post(auth_api::internal_check_permission),
        )
        .route(
            "/api/auth/internal/revoke-token",
            post(auth_api::internal_revoke_token),
        )
        .route(
            "/api/auth/internal/revoke-user-tokens/:user_id",
            post(auth_api::internal_revoke_user_tokens),
        )
        .route(
            "/api/auth/internal/ws-ticket/consume",
            post(auth_api::internal_consume_ws_ticket),
        )
        .route("/upload/image", post(file_api::upload_image))
        .route("/upload/file", post(file_api::upload_file))
        .route("/upload/audio", post(file_api::upload_audio))
        .route("/upload/video", post(file_api::upload_video))
        .route("/upload/avatar", post(file_api::upload_avatar))
        .route("/file/upload/image", post(file_api::upload_image))
        .route("/file/upload/file", post(file_api::upload_file))
        .route("/file/upload/audio", post(file_api::upload_audio))
        .route("/file/upload/video", post(file_api::upload_video))
        .route("/file/upload/avatar", post(file_api::upload_avatar))
        .route("/api/file/upload/image", post(file_api::upload_image))
        .route("/api/file/upload/file", post(file_api::upload_file))
        .route("/api/file/upload/audio", post(file_api::upload_audio))
        .route("/api/file/upload/video", post(file_api::upload_video))
        .route("/api/file/upload/avatar", post(file_api::upload_avatar))
        .route(
            "/download",
            get(file_api::download_get).post(file_api::download_post),
        )
        .route(
            "/file/download",
            get(file_api::download_get).post(file_api::download_post),
        )
        .route(
            "/api/file/download",
            get(file_api::download_get).post(file_api::download_post),
        )
        .route("/info", post(file_api::file_info))
        .route("/file/info", post(file_api::file_info))
        .route("/api/file/info", post(file_api::file_info))
        .route("/delete", delete(file_api::delete_file))
        .route("/file/delete", delete(file_api::delete_file))
        .route("/api/file/delete", delete(file_api::delete_file))
        .route("/message/config", get(message_config))
        .route("/api/message/config", get(message_config))
        .route("/message/send/private", post(send_private))
        .route("/api/message/send/private", post(send_private))
        .route("/messages/send/private", post(send_private))
        .route("/api/messages/send/private", post(send_private))
        .route("/message/send/group", post(send_group))
        .route("/api/message/send/group", post(send_group))
        .route("/messages/send/group", post(send_group))
        .route("/api/messages/send/group", post(send_group))
        .route("/message/read/:conversation_id", post(mark_read))
        .route("/api/message/read/:conversation_id", post(mark_read))
        .route("/message/recall/:message_id", post(recall_message))
        .route("/api/message/recall/:message_id", post(recall_message))
        .route("/message/delete/:message_id", post(delete_message))
        .route("/api/message/delete/:message_id", post(delete_message))
        .route("/message/conversations", get(conversations))
        .route("/api/message/conversations", get(conversations))
        .route("/message/private/:peer_id", get(private_history))
        .route("/api/message/private/:peer_id", get(private_history))
        .route("/message/private/:peer_id/cursor", get(private_history))
        .route("/api/message/private/:peer_id/cursor", get(private_history))
        .route("/message/group/:group_id", get(group_history))
        .route("/api/message/group/:group_id", get(group_history))
        .route("/message/group/:group_id/cursor", get(group_history))
        .route("/api/message/group/:group_id/cursor", get(group_history))
        .route("/friend/list", get(social::friend_list))
        .route("/api/friend/list", get(social::friend_list))
        .route("/friend/requests", get(social::friend_requests))
        .route("/api/friend/requests", get(social::friend_requests))
        .route("/friend/request", post(social::add_friend))
        .route("/api/friend/request", post(social::add_friend))
        .route("/friend/accept", post(social::accept_friend))
        .route("/api/friend/accept", post(social::accept_friend))
        .route("/friend/reject", post(social::reject_friend))
        .route("/api/friend/reject", post(social::reject_friend))
        .route("/friend/remove", delete(social::remove_friend))
        .route("/api/friend/remove", delete(social::remove_friend))
        .route("/friend/remark", put(social::update_friend_remark))
        .route("/api/friend/remark", put(social::update_friend_remark))
        .route("/group/create", post(social::create_group))
        .route("/api/group/create", post(social::create_group))
        .route("/group/user/:user_id", get(social::user_groups))
        .route("/api/group/user/:user_id", get(social::user_groups))
        .route("/group/members/list", post(social::group_members))
        .route("/api/group/members/list", post(social::group_members))
        .route("/group/:group_id/join", post(social::join_group))
        .route("/api/group/:group_id/join", post(social::join_group))
        .route("/group/:group_id/leave", post(social::leave_group))
        .route("/api/group/:group_id/leave", post(social::leave_group))
        .route(
            "/group/:group_id",
            put(social::update_group).delete(social::dismiss_group),
        )
        .route(
            "/api/group/:group_id",
            put(social::update_group).delete(social::dismiss_group),
        )
        .route(
            "/api/group/internal/memberIds/:group_id",
            get(social::internal_group_member_ids),
        )
        .route("/user/login", post(user::login))
        .route("/api/user/login", post(user::login))
        .route("/user/register", post(user::register))
        .route("/api/user/register", post(user::register))
        .route("/user/logout", post(user::logout))
        .route("/api/user/logout", post(user::logout))
        .route("/user/offline", post(user::offline))
        .route("/api/user/offline", post(user::offline))
        .route("/user/profile", axum::routing::put(user::update_profile))
        .route(
            "/api/user/profile",
            axum::routing::put(user::update_profile),
        )
        .route("/user/password", put(user::change_password))
        .route("/api/user/password", put(user::change_password))
        .route("/user/phone/code", post(user::send_phone_code))
        .route("/api/user/phone/code", post(user::send_phone_code))
        .route("/user/phone/bind", post(user::bind_phone))
        .route("/api/user/phone/bind", post(user::bind_phone))
        .route("/user/email/code", post(user::send_email_code))
        .route("/api/user/email/code", post(user::send_email_code))
        .route("/user/email/bind", post(user::bind_email))
        .route("/api/user/email/bind", post(user::bind_email))
        .route("/user/account", delete(user::delete_account))
        .route("/api/user/account", delete(user::delete_account))
        .route("/user/search", get(user::search))
        .route("/api/user/search", get(user::search))
        .route("/user/heartbeat", post(user::heartbeat))
        .route("/api/user/heartbeat", post(user::heartbeat))
        .route("/user/online-status", post(user::online_status))
        .route("/api/user/online-status", post(user::online_status))
        .route("/user/settings", get(user::settings))
        .route("/api/user/settings", get(user::settings))
        .route(
            "/user/settings/:kind",
            axum::routing::put(user::update_settings),
        )
        .route(
            "/api/user/settings/:kind",
            axum::routing::put(user::update_settings),
        )
        .route("/websocket/:user_id", get(websocket_proxy))
        .fallback(proxy)
        .with_state(state)
}

async fn health() -> Json<serde_json::Value> {
    Json(json!({"status":"UP","service":"api-server-rs"}))
}

async fn ready() -> Json<serde_json::Value> {
    Json(json!({"status":"READY","service":"api-server-rs"}))
}

async fn message_config() -> Json<ApiResponse<message::MessageConfig>> {
    Json(ApiResponse::success(message::MessageConfig {
        text_enforce: true,
        text_max_length: 2000,
    }))
}

async fn send_private(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(request): Json<message::SendPrivateRequest>,
) -> Result<Json<ApiResponse<im_rs_common::event::MessageDto>>, AppError> {
    let identity = identity_from_headers(&headers, &state.config)?;
    let mut redis = state.redis_manager.clone();
    let dto =
        message::send_private(&state.config, &mut redis, &state.db, &identity, request).await?;
    Ok(Json(ApiResponse::success(dto)))
}

async fn send_group(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(request): Json<message::SendGroupRequest>,
) -> Result<Json<ApiResponse<im_rs_common::event::MessageDto>>, AppError> {
    let identity = identity_from_headers(&headers, &state.config)?;
    let mut redis = state.redis_manager.clone();
    let dto = message::send_group(&state.config, &mut redis, &state.db, &identity, request).await?;
    Ok(Json(ApiResponse::success(dto)))
}

async fn mark_read(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(conversation_id): Path<String>,
) -> Result<Json<ApiResponse<String>>, AppError> {
    let identity = identity_from_headers(&headers, &state.config)?;
    let mut redis = state.redis_manager.clone();
    message::mark_read(&mut redis, &state.db, &identity, &conversation_id).await?;
    Ok(Json(ApiResponse::success("ok".to_string())))
}

async fn recall_message(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(message_id): Path<i64>,
) -> Result<Json<ApiResponse<im_rs_common::event::MessageDto>>, AppError> {
    let identity = identity_from_headers(&headers, &state.config)?;
    let mut redis = state.redis_manager.clone();
    let dto = message::recall_or_delete(
        &mut redis,
        &state.db,
        &identity,
        message_id,
        im_rs_common::event::MessageStatus::Recalled,
    )
    .await?;
    Ok(Json(ApiResponse::success(dto)))
}

async fn delete_message(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(message_id): Path<i64>,
) -> Result<Json<ApiResponse<im_rs_common::event::MessageDto>>, AppError> {
    let identity = identity_from_headers(&headers, &state.config)?;
    let mut redis = state.redis_manager.clone();
    let dto = message::recall_or_delete(
        &mut redis,
        &state.db,
        &identity,
        message_id,
        im_rs_common::event::MessageStatus::Deleted,
    )
    .await?;
    Ok(Json(ApiResponse::success(dto)))
}

async fn conversations(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> Result<Json<ApiResponse<Vec<message::ConversationDto>>>, AppError> {
    let identity = identity_from_headers(&headers, &state.config)?;
    let mut redis = state.redis_manager.clone();
    let list = message::conversations(&mut redis, &state.db, &identity).await?;
    Ok(Json(ApiResponse::success(list)))
}

async fn private_history(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(peer_id): Path<i64>,
    Query(query): Query<message::HistoryQuery>,
) -> Result<Json<ApiResponse<Vec<im_rs_common::event::MessageDto>>>, AppError> {
    let identity = identity_from_headers(&headers, &state.config)?;
    let mut redis = state.redis_manager.clone();
    let list = message::private_history(&mut redis, &state.db, &identity, peer_id, query).await?;
    Ok(Json(ApiResponse::success(list)))
}

async fn group_history(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(group_id): Path<i64>,
    Query(query): Query<message::HistoryQuery>,
) -> Result<Json<ApiResponse<Vec<im_rs_common::event::MessageDto>>>, AppError> {
    let identity = identity_from_headers(&headers, &state.config)?;
    let mut redis = state.redis_manager.clone();
    let list = message::group_history(&mut redis, &state.db, &identity, group_id, query).await?;
    Ok(Json(ApiResponse::success(list)))
}

async fn websocket_proxy(
    ws: WebSocketUpgrade,
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(user_id): Path<String>,
    Query(query): Query<std::collections::HashMap<String, String>>,
) -> Response {
    let identity = match identity_from_headers(&headers, &state.config) {
        Ok(identity) => identity,
        Err(error) => return error.into_response(),
    };
    let cookie = headers
        .get(header::COOKIE)
        .and_then(|value| value.to_str().ok())
        .map(ToOwned::to_owned);
    let query_ticket = query
        .get("ticket")
        .map(|value| value.trim())
        .filter(|value| !value.is_empty())
        .map(ToOwned::to_owned);
    let origin = headers.get(header::ORIGIN).cloned();
    let target_base = select_websocket_target(&state).await;
    ws.on_upgrade(move |socket| {
        tunnel_websocket(
            socket,
            state,
            identity,
            user_id,
            cookie,
            query_ticket,
            origin,
            target_base,
        )
    })
    .into_response()
}

async fn tunnel_websocket(
    socket: WebSocket,
    state: AppState,
    identity: im_rs_common::auth::Identity,
    user_id: String,
    cookie: Option<String>,
    query_ticket: Option<String>,
    origin: Option<HeaderValue>,
    target_base: String,
) {
    let target = format!(
        "{}/websocket/{}",
        target_base.trim_end_matches('/'),
        user_id
    );
    let mut request = match target.as_str().into_client_request() {
        Ok(request) => request,
        Err(error) => {
            tracing::warn!(error = %error, "failed to build websocket proxy request");
            return;
        }
    };
    if let Some(cookie) = upstream_cookie_header(
        cookie,
        &state.config.ws_ticket_cookie_name,
        query_ticket.as_deref(),
    ) {
        if let Ok(value) = HeaderValue::from_str(&cookie) {
            request.headers_mut().insert(header::COOKIE, value);
        }
    }
    if let Some(origin) = origin {
        request.headers_mut().insert(header::ORIGIN, origin);
    }
    apply_gateway_headers(request.headers_mut(), &state.config, &identity);
    let upstream = match connect_async(request).await {
        Ok((upstream, _)) => upstream,
        Err(error) => {
            tracing::warn!(user_id = %user_id, target = %target, error = %error, "failed to connect upstream websocket");
            return;
        }
    };
    let (mut client_tx, mut client_rx) = socket.split();
    let (mut upstream_tx, mut upstream_rx) = upstream.split();

    let client_to_upstream = async {
        while let Some(Ok(message)) = client_rx.next().await {
            let outgoing = match message {
                Message::Text(value) => tokio_tungstenite::tungstenite::Message::Text(value),
                Message::Binary(value) => tokio_tungstenite::tungstenite::Message::Binary(value),
                Message::Ping(value) => tokio_tungstenite::tungstenite::Message::Ping(value),
                Message::Pong(value) => tokio_tungstenite::tungstenite::Message::Pong(value),
                Message::Close(_) => break,
            };
            if upstream_tx.send(outgoing).await.is_err() {
                break;
            }
        }
    };
    let upstream_to_client = async {
        while let Some(Ok(message)) = upstream_rx.next().await {
            let incoming = match message {
                tokio_tungstenite::tungstenite::Message::Text(value) => Message::Text(value),
                tokio_tungstenite::tungstenite::Message::Binary(value) => Message::Binary(value),
                tokio_tungstenite::tungstenite::Message::Ping(value) => Message::Ping(value),
                tokio_tungstenite::tungstenite::Message::Pong(value) => Message::Pong(value),
                tokio_tungstenite::tungstenite::Message::Close(_) => break,
                tokio_tungstenite::tungstenite::Message::Frame(_) => continue,
            };
            if client_tx.send(incoming).await.is_err() {
                break;
            }
        }
    };
    tokio::select! {
        _ = client_to_upstream => {},
        _ = upstream_to_client => {},
    }
}

fn upstream_cookie_header(
    raw_cookie: Option<String>,
    ticket_cookie_name: &str,
    query_ticket: Option<&str>,
) -> Option<String> {
    let Some(ticket) = query_ticket
        .map(str::trim)
        .filter(|ticket| !ticket.is_empty())
    else {
        return raw_cookie;
    };

    let mut parts = vec![format!("{}={}", ticket_cookie_name, ticket)];
    if let Some(raw_cookie) = raw_cookie {
        parts.extend(raw_cookie.split(';').filter_map(|part| {
            let trimmed = part.trim();
            if trimmed.is_empty() {
                return None;
            }
            let key = trimmed
                .split_once('=')
                .map(|(key, _)| key.trim())
                .unwrap_or(trimmed);
            (key != ticket_cookie_name).then(|| trimmed.to_string())
        }));
    }
    Some(parts.join("; "))
}

async fn select_websocket_target(state: &AppState) -> String {
    let cache = WEBSOCKET_TARGET_CACHE.get_or_init(|| {
        Mutex::new(WebSocketTargetCache {
            target: None,
            expires_at: Instant::now(),
        })
    });
    let now = Instant::now();
    {
        let guard = cache.lock().await;
        if guard.expires_at > now {
            if let Some(target) = guard.target.as_ref() {
                return target.clone();
            }
        }
    }

    let mut guard = cache.lock().await;
    let now = Instant::now();
    if guard.expires_at > now {
        if let Some(target) = guard.target.as_ref() {
            return target.clone();
        }
    }

    let target = load_websocket_target(state).await;
    let ttl_ms = state.config.route_cache_ttl_ms.max(1_000) as u64;
    guard.target = Some(target.clone());
    guard.expires_at = Instant::now() + Duration::from_millis(ttl_ms);
    target
}

async fn load_websocket_target(state: &AppState) -> String {
    let mut redis = state.redis_manager.clone();
    match route::server_nodes(&mut redis, &state.config).await {
        Ok(nodes) => {
            if let Some(node) = nodes.first() {
                return node.internal_ws_url.clone();
            }
        }
        Err(error) => {
            tracing::warn!(error = %error, "discover im-server nodes failed");
        }
    }
    state.config.im_server_ws_url.clone()
}

async fn proxy(
    State(state): State<AppState>,
    method: Method,
    headers: HeaderMap,
    OriginalUri(uri): OriginalUri,
    body: axum::body::Bytes,
) -> Result<Response, AppError> {
    let path = uri.path();
    let identity = if is_gateway_whitelist(path) {
        None
    } else {
        Some(identity_from_headers(&headers, &state.config)?)
    };
    let (base, rewrite) = route_target(&state.config, path)
        .ok_or_else(|| AppError::NotFound(format!("no route for {path}")))?;
    let query = uri
        .query()
        .map(|value| format!("?{value}"))
        .unwrap_or_default();
    let target = format!("{}{}{}", base.trim_end_matches('/'), rewrite, query);
    let mut builder = state
        .http
        .request(method.clone(), target)
        .body(body.to_vec());
    for (name, value) in headers.iter() {
        if name == header::HOST || name == header::CONTENT_LENGTH {
            continue;
        }
        builder = builder.header(name, value);
    }
    if let Some(identity) = identity.as_ref() {
        for (name, value) in im_rs_common::auth::sign_gateway_headers(
            identity.user_id,
            &identity.username,
            &state.config.gateway_auth_secret,
        ) {
            builder = builder.header(name, value);
        }
        builder = builder.header("X-Internal-Secret", &state.config.internal_secret);
    }
    let upstream = builder.send().await?;
    let status =
        StatusCode::from_u16(upstream.status().as_u16()).unwrap_or(StatusCode::BAD_GATEWAY);
    let mut response = Response::builder().status(status);
    for (name, value) in upstream.headers() {
        if name == header::CONTENT_LENGTH || name == header::TRANSFER_ENCODING {
            continue;
        }
        response = response.header(name, value);
    }
    let bytes = upstream.bytes().await?;
    Ok(response
        .body(Body::from(bytes))
        .map_err(|err| AppError::Upstream(err.to_string()))?)
}

fn route_target<'a>(config: &'a AppConfig, path: &str) -> Option<(&'a str, String)> {
    if path.starts_with("/api/im/") {
        return Some((&config.im_server_url, path.to_string()));
    }
    if path.starts_with("/im/") {
        return Some((
            &config.im_server_url,
            format!("/api/im{}", path.trim_start_matches("/im")),
        ));
    }
    if path.starts_with("/api/logs/") {
        return Some((&config.log_service_url, path.to_string()));
    }
    if path.starts_with("/api/registry/") {
        return Some((
            &config.registry_service_url,
            path.trim_start_matches("/api/registry").to_string(),
        ));
    }
    if path.starts_with("/registry/") {
        return Some((
            &config.registry_service_url,
            path.trim_start_matches("/registry").to_string(),
        ));
    }
    None
}

fn apply_gateway_headers(
    headers: &mut HeaderMap,
    config: &AppConfig,
    identity: &im_rs_common::auth::Identity,
) {
    for (name, value) in sign_gateway_headers(
        identity.user_id,
        &identity.username,
        &config.gateway_auth_secret,
    ) {
        if let (Ok(name), Ok(value)) = (
            name.parse::<axum::http::HeaderName>(),
            HeaderValue::from_str(&value),
        ) {
            headers.insert(name, value);
        }
    }
    if let Ok(value) = HeaderValue::from_str(&config.internal_secret) {
        headers.insert("X-Internal-Secret", value);
    }
}
