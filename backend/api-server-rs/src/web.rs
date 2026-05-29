use crate::auth::{identity_from_headers, is_gateway_whitelist};
use crate::config::AppConfig;
use crate::error::AppError;
use crate::route;
use crate::routes;
use axum::body::Body;
use axum::extract::ws::{Message, WebSocket, WebSocketUpgrade};
use axum::extract::{OriginalUri, Path, Query, State};
use axum::http::{header, HeaderMap, HeaderValue, Method, StatusCode};
use axum::response::{IntoResponse, Response};
use axum::routing::get;
use axum::{Json, Router};
use futures_util::{SinkExt, StreamExt};
use im_rs_common::auth::{sign_gateway_headers, Identity};
use redis::{aio::ConnectionManager, AsyncCommands};
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
    pub private_redis_managers: Arc<Vec<ConnectionManager>>,
    pub group_redis_managers: Arc<Vec<ConnectionManager>>,
    pub route_redis_manager: ConnectionManager,
    pub db: MySqlPool,
    pub http: Client,
}

struct WebSocketTargetCache {
    target: Option<String>,
    expires_at: Instant,
}

static WEBSOCKET_TARGET_CACHE: OnceLock<Mutex<WebSocketTargetCache>> = OnceLock::new();
const WS_TICKET_KEY_PREFIX: &str = "auth:ws:ticket:";

pub fn router(state: AppState) -> Router {
    Router::new()
        .route("/health", get(health))
        .route("/ready", get(ready))
        .merge(routes::api_routes())
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

async fn websocket_proxy(
    ws: WebSocketUpgrade,
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(user_id): Path<String>,
    Query(query): Query<std::collections::HashMap<String, String>>,
) -> Response {
    let query_ticket = query
        .get("ticket")
        .map(|value| value.trim())
        .filter(|value| !value.is_empty())
        .map(ToOwned::to_owned);
    let identity = match identity_from_headers(&headers, &state.config) {
        Ok(identity) => identity,
        Err(error) => {
            match identity_from_ws_ticket(&state, &user_id, query_ticket.as_deref()).await {
                Ok(Some(identity)) => identity,
                Ok(None) => return error.into_response(),
                Err(ticket_error) => return ticket_error.into_response(),
            }
        }
    };
    let cookie = headers
        .get(header::COOKIE)
        .and_then(|value| value.to_str().ok())
        .map(ToOwned::to_owned);
    let origin = headers.get(header::ORIGIN).cloned();
    let target_base = select_websocket_target(&state).await;
    ws.on_upgrade(move |socket| {
        tunnel_websocket(
            socket,
            TunnelWebsocketArgs {
                state,
                identity,
                user_id,
                cookie,
                query_ticket,
                origin,
                target_base,
            },
        )
    })
    .into_response()
}

async fn identity_from_ws_ticket(
    state: &AppState,
    path_user_id: &str,
    query_ticket: Option<&str>,
) -> Result<Option<Identity>, AppError> {
    let Some(ticket) = query_ticket
        .map(str::trim)
        .filter(|ticket| !ticket.is_empty())
    else {
        return Ok(None);
    };

    let payload: Option<String> = {
        let mut redis = state.redis_manager.clone();
        redis
            .get(format!("{}{}", WS_TICKET_KEY_PREFIX, ticket))
            .await?
    };
    let Some(payload) = payload else {
        return Err(AppError::Unauthorized(
            "WS_TICKET_INVALID_OR_EXPIRED".to_string(),
        ));
    };
    let Some((ticket_user_id, username)) = parse_ws_ticket_identity(&payload) else {
        return Err(AppError::Unauthorized("WS_TICKET_INVALID".to_string()));
    };
    let path_user_id = path_user_id
        .trim()
        .parse::<i64>()
        .map_err(|_| AppError::Unauthorized("USER_ID_INVALID".to_string()))?;
    if ticket_user_id != path_user_id {
        return Err(AppError::Unauthorized(
            "WS_TICKET_USER_MISMATCH".to_string(),
        ));
    }
    Ok(Some(Identity {
        user_id: ticket_user_id,
        username,
    }))
}

fn parse_ws_ticket_identity(payload: &str) -> Option<(i64, String)> {
    let (user_id, username) = payload.split_once('\n')?;
    Some((user_id.trim().parse().ok()?, username.trim().to_string()))
}

struct TunnelWebsocketArgs {
    state: AppState,
    identity: im_rs_common::auth::Identity,
    user_id: String,
    cookie: Option<String>,
    query_ticket: Option<String>,
    origin: Option<HeaderValue>,
    target_base: String,
}

async fn tunnel_websocket(socket: WebSocket, args: TunnelWebsocketArgs) {
    let TunnelWebsocketArgs {
        state,
        identity,
        user_id,
        cookie,
        query_ticket,
        origin,
        target_base,
    } = args;
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
    if let Err(error) = apply_gateway_headers(request.headers_mut(), &state.config, &identity) {
        tracing::warn!(error = %error, "failed to sign websocket gateway headers");
        return;
    }
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
    let ttl_ms = u64::try_from(state.config.route_cache_ttl_ms.max(1_000)).unwrap_or(1_000);
    guard.target = Some(target.clone());
    guard.expires_at = Instant::now() + Duration::from_millis(ttl_ms);
    target
}

async fn load_websocket_target(state: &AppState) -> String {
    let mut redis = state.route_redis_manager.clone();
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
        let name_lower = name.as_str().to_ascii_lowercase();
        if name_lower.starts_with("x-internal-") || name_lower.starts_with("x-auth-") {
            continue;
        }
        builder = builder.header(name, value);
    }
    if let Some(identity) = identity.as_ref() {
        for (name, value) in im_rs_common::auth::sign_gateway_headers(
            identity.user_id,
            &identity.username,
            &state.config.gateway_auth_secret,
        )? {
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
    response
        .body(Body::from(bytes))
        .map_err(|err| AppError::Upstream(err.to_string()))
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
) -> Result<(), AppError> {
    for (name, value) in sign_gateway_headers(
        identity.user_id,
        &identity.username,
        &config.gateway_auth_secret,
    )? {
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
    Ok(())
}

pub async fn create_test_app() -> Router {
    let mysql_url = std::env::var("DATABASE_URL").unwrap_or_else(|_| {
        "mysql://root:root123@127.0.0.1:3306/service_message_service_db".into()
    });
    let config = Arc::new(AppConfig::from_env());
    let redis_url = std::env::var("REDIS_URL").unwrap_or_else(|_| "redis://127.0.0.1:6379".into());
    let redis_client = match redis::Client::open(redis_url.as_str()) {
        Ok(client) => client,
        Err(err) => {
            eprintln!("failed to open Redis test client: {err}");
            std::process::exit(1);
        }
    };
    let redis_manager = match redis::aio::ConnectionManager::new(redis_client).await {
        Ok(manager) => manager,
        Err(err) => {
            eprintln!("failed to connect Redis test manager: {err}");
            std::process::exit(1);
        }
    };
    let db = match sqlx::mysql::MySqlPoolOptions::new()
        .max_connections(10)
        .connect(&mysql_url)
        .await
    {
        Ok(pool) => pool,
        Err(err) => {
            eprintln!("failed to connect MySQL test pool: {err}");
            std::process::exit(1);
        }
    };
    if let Err(err) = crate::push::ensure_schema(&db).await {
        eprintln!("failed to ensure push schema: {err}");
        std::process::exit(1);
    }
    let state = AppState {
        config,
        redis_manager: redis_manager.clone(),
        private_redis_managers: Arc::new(vec![redis_manager.clone()]),
        group_redis_managers: Arc::new(vec![redis_manager.clone()]),
        route_redis_manager: redis_manager,
        db,
        http: reqwest::Client::new(),
    };
    Router::new()
        .merge(router(state))
        .layer(axum::extract::DefaultBodyLimit::max(16 * 1024 * 1024))
}
