#![forbid(unsafe_code)]

use api_server_rs::config::AppConfig;
use api_server_rs::web::AppState;
use axum::body::Body;
use axum::http::{header, Request, StatusCode};
use axum::Router;
use redis::aio::ConnectionManager;
use serde_json::{json, Value};
use sqlx::mysql::MySqlConnectOptions;
use std::str::FromStr;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::Arc;
use tower::ServiceExt;

fn build_config() -> AppConfig {
    AppConfig::from_env()
}

async fn connect_redis_managers(urls: &[String]) -> anyhow::Result<Vec<ConnectionManager>> {
    let mut managers = Vec::with_capacity(urls.len());
    for url in urls {
        let client = redis::Client::open(url.as_str())?;
        managers.push(ConnectionManager::new(client).await?);
    }
    Ok(managers)
}

async fn build_state() -> anyhow::Result<AppState> {
    let config = Arc::new(build_config());
    let redis_client = redis::Client::open(config.cache_redis_url.as_str())?;
    let cache_redis = ConnectionManager::new(redis_client).await?;
    let private_redis = connect_redis_managers(&config.private_hot_redis_urls).await?;
    let group_redis = connect_redis_managers(&config.group_hot_redis_urls).await?;
    let route_redis_client = redis::Client::open(config.route_redis_url.as_str())?;
    let route_redis = ConnectionManager::new(route_redis_client).await?;
    let mysql_options = MySqlConnectOptions::from_str(&config.mysql_url)?;
    let max_conn = config.mysql_max_connections.max(20);
    let db = sqlx::mysql::MySqlPoolOptions::new()
        .max_connections(max_conn)
        .connect_with(mysql_options)
        .await?;
    Ok(AppState {
        config: Arc::clone(&config),
        redis_manager: cache_redis.clone(),
        private_redis_managers: Arc::new(private_redis),
        group_redis_managers: Arc::new(group_redis),
        route_redis_manager: route_redis.clone(),
        db,
        http: reqwest::Client::new(),
    })
}

static SUFFIX: AtomicU64 = AtomicU64::new(0);

fn unique_username(prefix: &str) -> String {
    let seq = SUFFIX.fetch_add(1, Ordering::Relaxed);
    let ts = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0);
    format!("{prefix}{ts:x}{seq:x}")
}

async fn test_router() -> Router {
    let state = build_state().await.ok().unwrap_or_else(|| {
        std::process::exit(1);
    });
    api_server_rs::web::router(state)
}

fn auth_header(token: &str) -> (axum::http::HeaderName, axum::http::HeaderValue) {
    (
        header::AUTHORIZATION,
        axum::http::HeaderValue::from_str(&format!("Bearer {token}"))
            .unwrap_or_else(|_| axum::http::HeaderValue::from_static("Bearer invalid")),
    )
}

async fn parse_response_body(response: axum::response::Response) -> anyhow::Result<Value> {
    let bytes = axum::body::to_bytes(response.into_body(), usize::MAX).await?;
    let value: Value = serde_json::from_slice(&bytes)?;
    Ok(value)
}

async fn register(app: &Router, username: &str, password: &str) -> anyhow::Result<i64> {
    let request = Request::builder()
        .method("POST")
        .uri("/api/user/register")
        .header(header::CONTENT_TYPE, "application/json")
        .body(Body::from(
            json!({
                "username": username,
                "password": password,
                "nickname": username
            })
            .to_string(),
        ))?;
    let response = app.clone().oneshot(request).await?;
    let status = response.status();
    let body = parse_response_body(response).await?;
    if !status.is_success() {
        anyhow::bail!("register failed: {status} {body}");
    }
    let user_id = body
        .pointer("/data/id")
        .and_then(Value::as_str)
        .and_then(|s| s.parse::<i64>().ok())
        .ok_or_else(|| anyhow::anyhow!("invalid user id in register response: {body}"))?;
    Ok(user_id)
}

async fn login(app: &Router, username: &str, password: &str) -> anyhow::Result<String> {
    let request = Request::builder()
        .method("POST")
        .uri("/api/user/login")
        .header(header::CONTENT_TYPE, "application/json")
        .body(Body::from(
            json!({
                "username": username,
                "password": password
            })
            .to_string(),
        ))?;
    let response = app.clone().oneshot(request).await?;
    let status = response.status();
    let body = parse_response_body(response).await?;
    if !status.is_success() {
        anyhow::bail!("login failed: {status} {body}");
    }
    let token = body
        .pointer("/data/token")
        .and_then(Value::as_str)
        .filter(|s| !s.is_empty())
        .map(ToOwned::to_owned)
        .ok_or_else(|| anyhow::anyhow!("login response missing token: {body}"))?;
    Ok(token)
}

async fn send_friend_request(app: &Router, token: &str, target_user_id: i64) -> anyhow::Result<()> {
    let request = Request::builder()
        .method("POST")
        .uri("/api/friend/request")
        .header(header::CONTENT_TYPE, "application/json")
        .header(auth_header(token).0, auth_header(token).1)
        .body(Body::from(
            json!({"targetUserId": target_user_id.to_string()}).to_string(),
        ))?;
    let response = app.clone().oneshot(request).await?;
    let status = response.status();
    if !status.is_success() {
        let body = axum::body::to_bytes(response.into_body(), usize::MAX).await?;
        anyhow::bail!(
            "friend request failed: {} {}",
            status,
            String::from_utf8_lossy(&body)
        );
    }
    Ok(())
}

async fn get_friend_requests(
    app: &Router,
    token: &str,
) -> anyhow::Result<Vec<(String, String, String)>> {
    let request = Request::builder()
        .method("GET")
        .uri("/api/friend/requests")
        .header(auth_header(token).0, auth_header(token).1)
        .body(Body::empty())?;
    let response = app.clone().oneshot(request).await?;
    let body = parse_response_body(response).await?;
    let items: Vec<(String, String, String)> = body
        .pointer("/data")
        .and_then(Value::as_array)
        .map(|arr| {
            arr.iter()
                .filter_map(|item| {
                    let id = item.get("id")?.as_str()?.to_string();
                    let applicant_id = item.get("applicantId")?.as_str()?.to_string();
                    let status = item.get("status")?.as_str()?.to_string();
                    Some((id, applicant_id, status))
                })
                .collect()
        })
        .unwrap_or_default();
    Ok(items)
}

async fn accept_friend_request(app: &Router, token: &str, request_id: &str) -> anyhow::Result<()> {
    let request = Request::builder()
        .method("POST")
        .uri("/api/friend/accept")
        .header(header::CONTENT_TYPE, "application/json")
        .header(auth_header(token).0, auth_header(token).1)
        .body(Body::from(json!({"requestId": request_id}).to_string()))?;
    let response = app.clone().oneshot(request).await?;
    let status = response.status();
    if !status.is_success() {
        let body = axum::body::to_bytes(response.into_body(), usize::MAX).await?;
        anyhow::bail!(
            "accept friend failed: {} {}",
            status,
            String::from_utf8_lossy(&body)
        );
    }
    Ok(())
}

async fn make_friends(
    app: &Router,
    user1: &str,
    user2: &str,
    password: &str,
) -> anyhow::Result<(i64, String, i64, String)> {
    let id1 = register(app, user1, password).await?;
    let id2 = register(app, user2, password).await?;
    let token1 = login(app, user1, password).await?;
    let token2 = login(app, user2, password).await?;
    send_friend_request(app, &token1, id2).await?;
    let requests = get_friend_requests(app, &token2).await?;
    let (req_id, _applicant, _status) = requests
        .iter()
        .find(|(_, applicant, s)| applicant == &id1.to_string() && s == "PENDING")
        .ok_or_else(|| anyhow::anyhow!("friend request not found"))?;
    accept_friend_request(app, &token2, req_id).await?;
    Ok((id1, token1, id2, token2))
}

async fn create_test_group(
    app: &Router,
    token: &str,
    group_name: &str,
    member_ids: &[i64],
) -> anyhow::Result<i64> {
    let request = Request::builder()
        .method("POST")
        .uri("/api/group/create")
        .header(header::CONTENT_TYPE, "application/json")
        .header(auth_header(token).0, auth_header(token).1)
        .body(Body::from(
            json!({
                "groupName": group_name,
                "memberIds": member_ids.iter().map(i64::to_string).collect::<Vec<_>>()
            })
            .to_string(),
        ))?;
    let response = app.clone().oneshot(request).await?;
    let body = parse_response_body(response).await?;
    body.pointer("/data/id")
        .and_then(Value::as_str)
        .and_then(|s| s.parse::<i64>().ok())
        .ok_or_else(|| anyhow::anyhow!("invalid group id in response: {body}"))
}

async fn send_private_msg(
    app: &Router,
    token: &str,
    receiver_id: i64,
    content: &str,
) -> anyhow::Result<(StatusCode, Value)> {
    let request = Request::builder()
        .method("POST")
        .uri("/api/message/send/private")
        .header(header::CONTENT_TYPE, "application/json")
        .header(auth_header(token).0, auth_header(token).1)
        .body(Body::from(
            json!({
                "receiverId": receiver_id,
                "messageType": "TEXT",
                "content": content
            })
            .to_string(),
        ))?;
    let response = app.clone().oneshot(request).await?;
    let status = response.status();
    let body = axum::body::to_bytes(response.into_body(), usize::MAX).await?;
    let json: Value = serde_json::from_slice(&body).unwrap_or_default();
    Ok((status, json))
}

async fn send_group_msg(
    app: &Router,
    token: &str,
    group_id: i64,
    content: &str,
) -> anyhow::Result<(StatusCode, Value)> {
    let request = Request::builder()
        .method("POST")
        .uri("/api/message/send/group")
        .header(header::CONTENT_TYPE, "application/json")
        .header(auth_header(token).0, auth_header(token).1)
        .body(Body::from(
            json!({
                "groupId": group_id,
                "messageType": "TEXT",
                "content": content
            })
            .to_string(),
        ))?;
    let response = app.clone().oneshot(request).await?;
    let status = response.status();
    let body = axum::body::to_bytes(response.into_body(), usize::MAX).await?;
    let json: Value = serde_json::from_slice(&body).unwrap_or_default();
    Ok((status, json))
}

async fn get_private_history(
    app: &Router,
    token: &str,
    peer_id: i64,
) -> anyhow::Result<(StatusCode, Value)> {
    let request = Request::builder()
        .method("GET")
        .uri(format!("/api/message/private/{peer_id}"))
        .header(auth_header(token).0, auth_header(token).1)
        .body(Body::empty())?;
    let response = app.clone().oneshot(request).await?;
    let status = response.status();
    let body = axum::body::to_bytes(response.into_body(), usize::MAX).await?;
    let json: Value = serde_json::from_slice(&body).unwrap_or_default();
    Ok((status, json))
}

async fn get_private_history_paged(
    app: &Router,
    token: &str,
    peer_id: i64,
    limit: i64,
    last_message_id: Option<i64>,
) -> anyhow::Result<(StatusCode, Value)> {
    let mut uri = format!("/api/message/private/{peer_id}?limit={limit}");
    if let Some(before) = last_message_id {
        uri.push_str(&format!("&lastMessageId={before}"));
    }
    let request = Request::builder()
        .method("GET")
        .uri(uri)
        .header(auth_header(token).0, auth_header(token).1)
        .body(Body::empty())?;
    let response = app.clone().oneshot(request).await?;
    let status = response.status();
    let body = axum::body::to_bytes(response.into_body(), usize::MAX).await?;
    let json: Value = serde_json::from_slice(&body).unwrap_or_default();
    Ok((status, json))
}

async fn mark_read(
    app: &Router,
    token: &str,
    conversation_id: &str,
) -> anyhow::Result<(StatusCode, Value)> {
    let request = Request::builder()
        .method("POST")
        .uri(format!("/api/message/read/{conversation_id}"))
        .header(auth_header(token).0, auth_header(token).1)
        .body(Body::empty())?;
    let response = app.clone().oneshot(request).await?;
    let status = response.status();
    let body = axum::body::to_bytes(response.into_body(), usize::MAX).await?;
    let json: Value = serde_json::from_slice(&body).unwrap_or_default();
    Ok((status, json))
}

async fn recall_message(
    app: &Router,
    token: &str,
    message_id: &str,
) -> anyhow::Result<(StatusCode, Value)> {
    let request = Request::builder()
        .method("POST")
        .uri(format!("/api/message/recall/{message_id}"))
        .header(auth_header(token).0, auth_header(token).1)
        .body(Body::empty())?;
    let response = app.clone().oneshot(request).await?;
    let status = response.status();
    let body = axum::body::to_bytes(response.into_body(), usize::MAX).await?;
    let json: Value = serde_json::from_slice(&body).unwrap_or_default();
    Ok((status, json))
}

async fn delete_message(
    app: &Router,
    token: &str,
    message_id: &str,
) -> anyhow::Result<(StatusCode, Value)> {
    let request = Request::builder()
        .method("POST")
        .uri(format!("/api/message/delete/{message_id}"))
        .header(auth_header(token).0, auth_header(token).1)
        .body(Body::empty())?;
    let response = app.clone().oneshot(request).await?;
    let status = response.status();
    let body = axum::body::to_bytes(response.into_body(), usize::MAX).await?;
    let json: Value = serde_json::from_slice(&body).unwrap_or_default();
    Ok((status, json))
}

async fn get_conversations(app: &Router, token: &str) -> anyhow::Result<(StatusCode, Value)> {
    let request = Request::builder()
        .method("GET")
        .uri("/api/message/conversations")
        .header(auth_header(token).0, auth_header(token).1)
        .body(Body::empty())?;
    let response = app.clone().oneshot(request).await?;
    let status = response.status();
    let body = axum::body::to_bytes(response.into_body(), usize::MAX).await?;
    let json: Value = serde_json::from_slice(&body).unwrap_or_default();
    Ok((status, json))
}

fn extract_send_message_id(response: &Value) -> Option<String> {
    response
        .get("data")
        .and_then(|d| d.get("id"))
        .and_then(Value::as_str)
        .map(ToOwned::to_owned)
}

fn extract_messages(response: &Value) -> Vec<&Value> {
    response
        .get("data")
        .and_then(Value::as_array)
        .map(|list| list.iter().collect())
        .unwrap_or_default()
}

// ============================================================
// Tests
// ============================================================

#[tokio::test]
async fn test_send_private_success() -> anyhow::Result<()> {
    let app = test_router().await;
    let u1 = unique_username("sp");
    let u2 = unique_username("sp");
    let (_id1, token1, id2, _token2) = make_friends(&app, &u1, &u2, "Test1234!").await?;

    let (status, body) = send_private_msg(&app, &token1, id2, "Hello").await?;
    assert_eq!(status, StatusCode::OK, "expected 200, got {status}: {body}");
    let data = body
        .get("data")
        .ok_or_else(|| anyhow::anyhow!("response missing data"))?;
    assert_eq!(
        data.get("messageType").and_then(Value::as_str),
        Some("TEXT")
    );
    assert_eq!(data.get("status").and_then(Value::as_str), Some("SENT"));
    Ok(())
}

#[tokio::test]
async fn test_send_private_empty_content() -> anyhow::Result<()> {
    let app = test_router().await;
    let u1 = unique_username("ec");
    let u2 = unique_username("ec");
    let (_id1, token1, id2, _token2) = make_friends(&app, &u1, &u2, "Test1234!").await?;

    let (status, _body) = send_private_msg(&app, &token1, id2, "").await?;
    assert_eq!(
        status,
        StatusCode::BAD_REQUEST,
        "expected 400 for empty content"
    );
    Ok(())
}

#[tokio::test]
async fn test_send_group_success() -> anyhow::Result<()> {
    let app = test_router().await;
    let u1 = unique_username("gs");
    let u2 = unique_username("gs");
    let _id1 = register(&app, &u1, "Test1234!").await?;
    let id2 = register(&app, &u2, "Test1234!").await?;
    let token1 = login(&app, &u1, "Test1234!").await?;

    let group_id = create_test_group(&app, &token1, "test-group", &[id2]).await?;

    let (status, body) = send_group_msg(&app, &token1, group_id, "Hello group").await?;
    assert_eq!(status, StatusCode::OK, "expected 200, got {status}: {body}");
    Ok(())
}

#[tokio::test]
async fn test_send_group_not_member() -> anyhow::Result<()> {
    let app = test_router().await;
    let u1 = unique_username("gn");
    let u2 = unique_username("gn");
    let _id1 = register(&app, &u1, "Test1234!").await?;
    let _id2 = register(&app, &u2, "Test1234!").await?;
    let token1 = login(&app, &u1, "Test1234!").await?;
    let token2 = login(&app, &u2, "Test1234!").await?;

    let group_id = create_test_group(&app, &token1, "owner-group", &[]).await?;

    let (status, _body) = send_group_msg(&app, &token2, group_id, "should fail").await?;
    assert_eq!(status, StatusCode::FORBIDDEN, "expected 403 for non-member");
    Ok(())
}

#[tokio::test]
async fn test_private_history() -> anyhow::Result<()> {
    let app = test_router().await;
    let u1 = unique_username("hi");
    let u2 = unique_username("hi");
    let (_id1, token1, id2, _token2) = make_friends(&app, &u1, &u2, "Test1234!").await?;

    send_private_msg(&app, &token1, id2, "msg1").await?;
    send_private_msg(&app, &token1, id2, "msg2").await?;
    send_private_msg(&app, &token1, id2, "msg3").await?;

    let (status, body) = get_private_history(&app, &token1, id2).await?;
    assert_eq!(status, StatusCode::OK, "expected 200, got {status}: {body}");
    let messages = extract_messages(&body);
    assert!(!messages.is_empty(), "expected at least one message");
    assert!(
        messages
            .iter()
            .any(|m| m.get("content").and_then(Value::as_str) == Some("msg1")),
        "should contain msg1"
    );
    Ok(())
}

#[tokio::test]
async fn test_private_history_cursor_pagination() -> anyhow::Result<()> {
    let app = test_router().await;
    let u1 = unique_username("cp");
    let u2 = unique_username("cp");
    let (_id1, token1, id2, _token2) = make_friends(&app, &u1, &u2, "Test1234!").await?;

    for i in 1..=20_i64 {
        send_private_msg(&app, &token1, id2, &format!("msg{i}")).await?;
    }

    let (status1, body1) = get_private_history_paged(&app, &token1, id2, 5, None).await?;
    assert_eq!(status1, StatusCode::OK, "first page: expected 200");
    let page1 = extract_messages(&body1);
    assert_eq!(page1.len(), 5, "first page should have 5 messages");

    let last_id = page1
        .last()
        .and_then(|m| m.get("id"))
        .and_then(Value::as_str)
        .and_then(|s| s.parse::<i64>().ok());

    if let Some(last) = last_id {
        let (status2, body2) = get_private_history_paged(&app, &token1, id2, 5, Some(last)).await?;
        assert_eq!(status2, StatusCode::OK, "second page: expected 200");
        let page2 = extract_messages(&body2);
        assert!(!page2.is_empty(), "second page should have more messages");
    }
    Ok(())
}

#[tokio::test]
async fn test_private_history_empty() -> anyhow::Result<()> {
    let app = test_router().await;
    let u1 = unique_username("eh");
    let u2 = unique_username("eh");
    let (_id1, token1, id2, _token2) = make_friends(&app, &u1, &u2, "Test1234!").await?;

    let (status, body) = get_private_history(&app, &token1, id2).await?;
    assert_eq!(status, StatusCode::OK, "expected 200 for empty history");
    let messages = extract_messages(&body);
    assert!(messages.is_empty(), "expected empty array");
    Ok(())
}

#[tokio::test]
async fn test_mark_read_private() -> anyhow::Result<()> {
    let app = test_router().await;
    let u1 = unique_username("mr");
    let u2 = unique_username("mr");
    let (id1, token1, id2, token2) = make_friends(&app, &u1, &u2, "Test1234!").await?;

    send_private_msg(&app, &token1, id2, "ping").await?;
    let conversation_id = format!("{}_{}", id1.min(id2), id1.max(id2));

    let (status, body) = mark_read(&app, &token2, &conversation_id).await?;
    assert_eq!(status, StatusCode::OK, "mark read failed: {body}");
    Ok(())
}

#[tokio::test]
async fn test_recall_own_message() -> anyhow::Result<()> {
    let app = test_router().await;
    let u1 = unique_username("rc");
    let u2 = unique_username("rc");
    let (_id1, token1, id2, _token2) = make_friends(&app, &u1, &u2, "Test1234!").await?;

    let (_status, body) = send_private_msg(&app, &token1, id2, "to recall").await?;
    let message_id = extract_send_message_id(&body)
        .ok_or_else(|| anyhow::anyhow!("message id not found in send response"))?;

    let (status, recall_body) = recall_message(&app, &token1, &message_id).await?;
    assert_eq!(
        status,
        StatusCode::OK,
        "recall should succeed: {recall_body}"
    );
    let data = recall_body
        .get("data")
        .ok_or_else(|| anyhow::anyhow!("response missing data"))?;
    assert_eq!(data.get("status").and_then(Value::as_str), Some("RECALLED"));
    Ok(())
}

#[tokio::test]
async fn test_recall_other_user_message() -> anyhow::Result<()> {
    let app = test_router().await;
    let u1 = unique_username("ro");
    let u2 = unique_username("ro");
    let (_id1, token1, id2, token2) = make_friends(&app, &u1, &u2, "Test1234!").await?;

    let (_status, body) = send_private_msg(&app, &token1, id2, "my message").await?;
    let message_id = extract_send_message_id(&body)
        .ok_or_else(|| anyhow::anyhow!("message id not found in send response"))?;

    let (status, _body) = recall_message(&app, &token2, &message_id).await?;
    assert_eq!(
        status,
        StatusCode::FORBIDDEN,
        "other user should not be able to recall"
    );
    Ok(())
}

#[tokio::test]
async fn test_delete_own_message() -> anyhow::Result<()> {
    let app = test_router().await;
    let u1 = unique_username("dm");
    let u2 = unique_username("dm");
    let (_id1, token1, id2, _token2) = make_friends(&app, &u1, &u2, "Test1234!").await?;

    let (_status, body) = send_private_msg(&app, &token1, id2, "to delete").await?;
    let message_id = extract_send_message_id(&body)
        .ok_or_else(|| anyhow::anyhow!("message id not found in send response"))?;

    let (status, del_body) = delete_message(&app, &token1, &message_id).await?;
    assert_eq!(status, StatusCode::OK, "delete should succeed: {del_body}");
    let data = del_body
        .get("data")
        .ok_or_else(|| anyhow::anyhow!("response missing data"))?;
    assert_eq!(data.get("status").and_then(Value::as_str), Some("DELETED"));
    Ok(())
}

#[tokio::test]
async fn test_delete_other_user() -> anyhow::Result<()> {
    let app = test_router().await;
    let u1 = unique_username("do");
    let u2 = unique_username("do");
    let (_id1, token1, id2, token2) = make_friends(&app, &u1, &u2, "Test1234!").await?;

    let (_status, body) = send_private_msg(&app, &token1, id2, "my message").await?;
    let message_id = extract_send_message_id(&body)
        .ok_or_else(|| anyhow::anyhow!("message id not found in send response"))?;

    let (status, _body) = delete_message(&app, &token2, &message_id).await?;
    assert_eq!(
        status,
        StatusCode::FORBIDDEN,
        "other user should not be able to delete"
    );
    Ok(())
}

#[tokio::test]
async fn test_conversation_list() -> anyhow::Result<()> {
    let app = test_router().await;
    let u1 = unique_username("cl");
    let u2 = unique_username("cl");
    let (_id1, token1, id2, _token2) = make_friends(&app, &u1, &u2, "Test1234!").await?;

    send_private_msg(&app, &token1, id2, "conversation test").await?;

    let (status, body) = get_conversations(&app, &token1).await?;
    assert_eq!(status, StatusCode::OK, "conversations list failed: {body}");
    let data = body
        .get("data")
        .and_then(Value::as_array)
        .ok_or_else(|| anyhow::anyhow!("conversations data missing or not an array"))?;
    assert!(!data.is_empty(), "conversation list should not be empty");
    Ok(())
}
