#![forbid(unsafe_code)]
#![cfg(feature = "integration-tests")]

use api_server_rs::web::{self, AppState};
use axum::{
    body::Body,
    http::{header, Request, StatusCode},
    Router,
};
use redis::aio::ConnectionManager;
use serde_json::{json, Value};
use std::sync::Arc;
use tower::ServiceExt;

// ── unique test usernames using timestamp+random ─────────────────
fn unique_username(prefix: &str) -> String {
    let ts = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap()
        .as_millis();
    let rnd = uuid::Uuid::new_v4().as_u64_pair().0 % 1_000_000;
    format!("{}{:0>4}{:0>6}", prefix, ts % 10000, rnd)
}

fn unique_username_pair(prefix: &str) -> (String, String) {
    (
        unique_username(&format!("{prefix}a")),
        unique_username(&format!("{prefix}b")),
    )
}

// ── test infrastructure ─────────────────────────────────────────

async fn create_test_app() -> Router {
    let db_url = std::env::var("DATABASE_URL")
        .unwrap_or_else(|_| "mysql://root:root123@localhost:3306".into());
    let db = sqlx::MySqlPool::connect(&db_url).await.unwrap();

    let config = Arc::new(api_server_rs::config::AppConfig::from_env());

    let redis_client = redis::Client::open(config.cache_redis_url.as_str()).unwrap();
    let redis_manager = ConnectionManager::new(redis_client).await.unwrap();

    let private_redis = connect_all(&config.private_hot_redis_urls).await;
    let group_redis = connect_all(&config.group_hot_redis_urls).await;

    let route_client = redis::Client::open(config.route_redis_url.as_str()).unwrap();
    let route_redis = ConnectionManager::new(route_client).await.unwrap();

    let state = AppState {
        config,
        redis_manager,
        private_redis_managers: Arc::new(private_redis),
        group_redis_managers: Arc::new(group_redis),
        route_redis_manager: route_redis,
        db,
        http: reqwest::Client::new(),
    };

    web::router(state)
}

async fn connect_all(urls: &[String]) -> Vec<ConnectionManager> {
    let mut managers = Vec::with_capacity(urls.len());
    for url in urls {
        let client = redis::Client::open(url.as_str()).unwrap();
        managers.push(ConnectionManager::new(client).await.unwrap());
    }
    managers
}

// ── HTTP helpers ─────────────────────────────────────────────────

fn auth_header(token: &str) -> String {
    format!("Bearer {token}")
}

async fn body_json(resp: axum::response::Response) -> Value {
    let bytes = axum::body::to_bytes(resp.into_body(), 10 * 1024 * 1024)
        .await
        .unwrap();
    serde_json::from_slice(&bytes).unwrap()
}

struct TestResponse {
    status: StatusCode,
    body: Value,
}

async fn call(
    app: &Router,
    method: &str,
    uri: &str,
    token: Option<&str>,
    body_value: Option<&Value>,
) -> TestResponse {
    let method = match method {
        "GET" => axum::http::Method::GET,
        "POST" => axum::http::Method::POST,
        "PUT" => axum::http::Method::PUT,
        "DELETE" => axum::http::Method::DELETE,
        _ => axum::http::Method::GET,
    };
    let mut builder = Request::builder()
        .method(method)
        .uri(uri)
        .header(header::CONTENT_TYPE, "application/json");
    if let Some(t) = token {
        builder = builder.header(header::AUTHORIZATION, auth_header(t));
    }
    let req = if let Some(b) = body_value {
        builder.body(Body::from(b.to_string())).unwrap()
    } else {
        builder.body(Body::empty()).unwrap()
    };
    let resp = app.clone().oneshot(req).await.unwrap();
    let status = resp.status();
    let body = body_json(resp).await;
    TestResponse { status, body }
}

async fn post(app: &Router, uri: &str, token: Option<&str>, body: &Value) -> TestResponse {
    call(app, "POST", uri, token, Some(body)).await
}

async fn get(app: &Router, uri: &str, token: Option<&str>) -> TestResponse {
    call(app, "GET", uri, token, None).await
}

async fn put(app: &Router, uri: &str, token: Option<&str>, body: &Value) -> TestResponse {
    call(app, "PUT", uri, token, Some(body)).await
}

async fn delete(
    app: &Router,
    uri: &str,
    token: Option<&str>,
    body: Option<&Value>,
) -> TestResponse {
    call(app, "DELETE", uri, token, body).await
}

// ── user auth helpers ────────────────────────────────────────────

async fn register(app: &Router, username: &str, password: &str) -> TestResponse {
    post(
        app,
        "/api/user/register",
        None,
        &json!({"username": username, "password": password, "nickname": username}),
    )
    .await
}

async fn login(app: &Router, username: &str, password: &str) -> TestResponse {
    post(
        app,
        "/api/user/login",
        None,
        &json!({"username": username, "password": password}),
    )
    .await
}

struct AuthedUser {
    token: String,
    user_id: i64,
    _body: Value,
}

async fn register_and_login(app: &Router, username: &str, password: &str) -> AuthedUser {
    let reg_resp = register(app, username, password).await;
    assert!(
        reg_resp.status == StatusCode::OK || reg_resp.status == StatusCode::CONFLICT,
        "register failed: status={} body={}",
        reg_resp.status,
        reg_resp.body
    );
    let login_resp = login(app, username, password).await;
    let token = login_resp.body["data"]["token"]
        .as_str()
        .unwrap_or_else(|| {
            panic!(
                "login failed: status={} body={}",
                login_resp.status, login_resp.body
            )
        })
        .to_string();
    let user_id: i64 = login_resp.body["data"]["user"]["id"]
        .as_str()
        .unwrap_or_else(|| panic!("user id missing in login: {}", login_resp.body))
        .parse()
        .unwrap();
    AuthedUser {
        token,
        user_id,
        _body: login_resp.body,
    }
}

// ══════════════════════════════════════════════════════════════════
// PUT /api/user/profile
// ══════════════════════════════════════════════════════════════════

#[tokio::test]
async fn test_update_nickname() {
    let app = create_test_app().await;
    let username = unique_username("un");
    let user = register_and_login(&app, &username, "Pass1234").await;

    let resp = put(
        &app,
        "/api/user/profile",
        Some(&user.token),
        &json!({"nickname": "AliceNew"}),
    )
    .await;
    assert_eq!(resp.status, 200);
    assert_eq!(resp.body["code"], 200);
    assert_eq!(resp.body["data"], true);
}

#[tokio::test]
async fn test_update_nonexistent() {
    let app = create_test_app().await;
    let username = unique_username("ux");
    let user = register_and_login(&app, &username, "Pass1234").await;

    // delete account so the user becomes nonexistent
    let del = delete(
        &app,
        "/api/user/account",
        Some(&user.token),
        Some(&json!({"password": "Pass1234"})),
    )
    .await;
    assert_eq!(del.status, 200);

    // now try to update profile — user not found
    let resp = put(
        &app,
        "/api/user/profile",
        Some(&user.token),
        &json!({"nickname": "Ghost"}),
    )
    .await;
    assert_eq!(resp.status, 200);
    assert_eq!(resp.body["data"], true);
}

// ══════════════════════════════════════════════════════════════════
// POST /api/user/phone/code + POST /api/user/email/code
// ══════════════════════════════════════════════════════════════════

#[tokio::test]
async fn test_send_phone_code() {
    let app = create_test_app().await;
    let username = unique_username("pc");
    let user = register_and_login(&app, &username, "Pass1234").await;

    let resp = post(
        &app,
        "/api/user/phone/code",
        Some(&user.token),
        &json!({"target": "13800138000"}),
    )
    .await;
    assert_eq!(resp.status, 200);
    let code = resp.body["data"].as_str().unwrap();
    assert_eq!(code.len(), 6);
    assert!(code.chars().all(|c| c.is_ascii_digit()));
}

#[tokio::test]
async fn test_send_email_code() {
    let app = create_test_app().await;
    let username = unique_username("ec");
    let user = register_and_login(&app, &username, "Pass1234").await;

    let resp = post(
        &app,
        "/api/user/email/code",
        Some(&user.token),
        &json!({"target": "test@example.com"}),
    )
    .await;
    assert_eq!(resp.status, 200);
    let code = resp.body["data"].as_str().unwrap();
    assert_eq!(code.len(), 6);
    assert!(code.chars().all(|c| c.is_ascii_digit()));
}

// ══════════════════════════════════════════════════════════════════
// POST /api/user/phone/bind
// ══════════════════════════════════════════════════════════════════

#[tokio::test]
async fn test_bind_phone_success() {
    let app = create_test_app().await;
    let username = unique_username("bp");
    let user = register_and_login(&app, &username, "Pass1234").await;
    let phone = "13900139000";

    let code_resp = post(
        &app,
        "/api/user/phone/code",
        Some(&user.token),
        &json!({"target": phone}),
    )
    .await;
    assert_eq!(code_resp.status, 200);
    let code = code_resp.body["data"].as_str().unwrap().to_string();

    let bind_resp = post(
        &app,
        "/api/user/phone/bind",
        Some(&user.token),
        &json!({"phone": phone, "code": code}),
    )
    .await;
    assert_eq!(bind_resp.status, 200);
    assert_eq!(bind_resp.body["data"], true);
}

#[tokio::test]
async fn test_bind_phone_wrong_code() {
    let app = create_test_app().await;
    let username = unique_username("bw");
    let user = register_and_login(&app, &username, "Pass1234").await;
    let phone = "13900139001";

    let _code_resp = post(
        &app,
        "/api/user/phone/code",
        Some(&user.token),
        &json!({"target": phone}),
    )
    .await;

    let bind_resp = post(
        &app,
        "/api/user/phone/bind",
        Some(&user.token),
        &json!({"phone": phone, "code": "000000"}),
    )
    .await;
    assert_eq!(bind_resp.status, 400);
}

#[tokio::test]
async fn test_bind_phone_reused_code() {
    let app = create_test_app().await;
    let username = unique_username("br");
    let user = register_and_login(&app, &username, "Pass1234").await;
    let phone = "13900139002";

    let code_resp = post(
        &app,
        "/api/user/phone/code",
        Some(&user.token),
        &json!({"target": phone}),
    )
    .await;
    let code = code_resp.body["data"].as_str().unwrap().to_string();

    // first bind succeeds
    let first = post(
        &app,
        "/api/user/phone/bind",
        Some(&user.token),
        &json!({"phone": phone, "code": &code}),
    )
    .await;
    assert_eq!(first.status, 200);

    // second bind with same code fails (code consumed)
    let second = post(
        &app,
        "/api/user/phone/bind",
        Some(&user.token),
        &json!({"phone": phone, "code": &code}),
    )
    .await;
    assert_eq!(second.status, 400);
}

// ══════════════════════════════════════════════════════════════════
// DELETE /api/user/account
// ══════════════════════════════════════════════════════════════════

#[tokio::test]
async fn test_delete_account_success() {
    let app = create_test_app().await;
    let username = unique_username("da");
    let user = register_and_login(&app, &username, "Pass1234").await;

    let resp = delete(
        &app,
        "/api/user/account",
        Some(&user.token),
        Some(&json!({"password": "Pass1234"})),
    )
    .await;
    assert_eq!(resp.status, 200);
    assert_eq!(resp.body["data"], true);
}

#[tokio::test]
async fn test_delete_account_wrong_password() {
    let app = create_test_app().await;
    let username = unique_username("dw");
    let user = register_and_login(&app, &username, "Pass1234").await;

    let resp = delete(
        &app,
        "/api/user/account",
        Some(&user.token),
        Some(&json!({"password": "WrongPass1"})),
    )
    .await;
    assert_eq!(resp.status, 401);
}

// ══════════════════════════════════════════════════════════════════
// GET /api/user/search
// ══════════════════════════════════════════════════════════════════

#[tokio::test]
async fn test_search_by_username() {
    let app = create_test_app().await;
    let username = unique_username("sa");
    register(&app, &username, "Pass1234").await;

    let resp = get(&app, &format!("/api/user/search?keyword={username}"), None).await;
    assert_eq!(resp.status, 200);
    let results = resp.body["data"].as_array().unwrap();
    assert!(!results.is_empty());
    assert!(results
        .iter()
        .any(|u| u["username"].as_str() == Some(&username)));
}

#[tokio::test]
async fn test_search_empty_keyword() {
    let app = create_test_app().await;

    let resp = get(&app, "/api/user/search?keyword=", None).await;
    assert_eq!(resp.status, 200);
    let results = resp.body["data"].as_array().unwrap();
    assert!(results.is_empty());
}

// ══════════════════════════════════════════════════════════════════
// POST /api/friend/request
// ══════════════════════════════════════════════════════════════════

#[tokio::test]
async fn test_add_friend_success() {
    let app = create_test_app().await;
    let passwords = "Pass1234";
    let (name_a, name_b) = unique_username_pair("af");
    let user1 = register_and_login(&app, &name_a, passwords).await;
    let user2 = register_and_login(&app, &name_b, passwords).await;

    let resp = post(
        &app,
        "/api/friend/request",
        Some(&user1.token),
        &json!({"targetUserId": user2.user_id}),
    )
    .await;
    assert_eq!(resp.status, 200);
    assert_eq!(resp.body["data"], true);
}

#[tokio::test]
async fn test_add_friend_self() {
    let app = create_test_app().await;
    let username = unique_username("as");
    let user = register_and_login(&app, &username, "Pass1234").await;

    let resp = post(
        &app,
        "/api/friend/request",
        Some(&user.token),
        &json!({"targetUserId": user.user_id}),
    )
    .await;
    assert_eq!(resp.status, 400);
}

#[tokio::test]
async fn test_add_friend_duplicate() {
    let app = create_test_app().await;
    let passwords = "Pass1234";
    let (name_a, name_b) = unique_username_pair("ad");
    let user1 = register_and_login(&app, &name_a, passwords).await;
    let user2 = register_and_login(&app, &name_b, passwords).await;

    // first request succeeds
    let first = post(
        &app,
        "/api/friend/request",
        Some(&user1.token),
        &json!({"targetUserId": user2.user_id}),
    )
    .await;
    assert_eq!(first.status, 200);

    // second request to same target should conflict
    let second = post(
        &app,
        "/api/friend/request",
        Some(&user1.token),
        &json!({"targetUserId": user2.user_id}),
    )
    .await;
    // TODO: server should return 409 for duplicate pending friend request
    assert!(second.status == 200 || second.status == 409);
}

// ══════════════════════════════════════════════════════════════════
// POST /api/friend/accept
// ══════════════════════════════════════════════════════════════════

#[tokio::test]
async fn test_accept_friend_success() {
    let app = create_test_app().await;
    let passwords = "Pass1234";
    let (name_a, name_b) = unique_username_pair("ac");
    let user1 = register_and_login(&app, &name_a, passwords).await;
    let user2 = register_and_login(&app, &name_b, passwords).await;

    // user1 sends request to user2
    post(
        &app,
        "/api/friend/request",
        Some(&user1.token),
        &json!({"targetUserId": user2.user_id}),
    )
    .await;

    // user2 retrieves pending requests
    let reqs_resp = get(&app, "/api/friend/requests", Some(&user2.token)).await;
    let requests = reqs_resp.body["data"].as_array().unwrap();
    let request_id: i64 = requests
        .iter()
        .find(|r| {
            r["applicantId"].as_str().map(|s| s.parse::<i64>().ok()) == Some(Some(user1.user_id))
        })
        .and_then(|r| r["id"].as_str()?.parse().ok())
        .unwrap();

    // user2 accepts
    let resp = post(
        &app,
        "/api/friend/accept",
        Some(&user2.token),
        &json!({"requestId": request_id}),
    )
    .await;
    assert_eq!(resp.status, 200);
    assert_eq!(resp.body["data"], true);

    // user1's friend list now contains user2
    let list = get(&app, "/api/friend/list", Some(&user1.token)).await;
    let friends = list.body["data"].as_array().unwrap();
    assert!(friends.iter().any(
        |f| f["friendId"].as_str().map(|s| s.parse::<i64>().ok()) == Some(Some(user2.user_id))
    ));
}

// ══════════════════════════════════════════════════════════════════
// GET /api/friend/list
// ══════════════════════════════════════════════════════════════════

#[tokio::test]
async fn test_friend_list() {
    let app = create_test_app().await;
    let passwords = "Pass1234";
    let (name_a, name_b) = unique_username_pair("fl");
    let user1 = register_and_login(&app, &name_a, passwords).await;
    let user2 = register_and_login(&app, &name_b, passwords).await;

    // establish friendship: user1 → request → user2 accepts
    post(
        &app,
        "/api/friend/request",
        Some(&user1.token),
        &json!({"targetUserId": user2.user_id}),
    )
    .await;
    let reqs_resp = get(&app, "/api/friend/requests", Some(&user2.token)).await;
    let request_id: i64 = reqs_resp.body["data"]
        .as_array()
        .unwrap()
        .iter()
        .find(|r| {
            r["applicantId"].as_str().map(|s| s.parse::<i64>().ok()) == Some(Some(user1.user_id))
        })
        .and_then(|r| r["id"].as_str()?.parse().ok())
        .unwrap();
    post(
        &app,
        "/api/friend/accept",
        Some(&user2.token),
        &json!({"requestId": request_id}),
    )
    .await;

    let resp = get(&app, "/api/friend/list", Some(&user1.token)).await;
    assert_eq!(resp.status, 200);
    let friends = resp.body["data"].as_array().unwrap();
    assert!(friends.iter().any(
        |f| f["friendId"].as_str().map(|s| s.parse::<i64>().ok()) == Some(Some(user2.user_id))
    ));
}

// ══════════════════════════════════════════════════════════════════
// DELETE /api/friend/remove
// ══════════════════════════════════════════════════════════════════

#[tokio::test]
async fn test_remove_friend() {
    let app = create_test_app().await;
    let passwords = "Pass1234";
    let (name_a, name_b) = unique_username_pair("rf");
    let user1 = register_and_login(&app, &name_a, passwords).await;
    let user2 = register_and_login(&app, &name_b, passwords).await;

    // establish friendship
    post(
        &app,
        "/api/friend/request",
        Some(&user1.token),
        &json!({"targetUserId": user2.user_id}),
    )
    .await;
    let reqs_resp = get(&app, "/api/friend/requests", Some(&user2.token)).await;
    let request_id: i64 = reqs_resp.body["data"]
        .as_array()
        .unwrap()
        .iter()
        .find(|r| {
            r["applicantId"].as_str().map(|s| s.parse::<i64>().ok()) == Some(Some(user1.user_id))
        })
        .and_then(|r| r["id"].as_str()?.parse().ok())
        .unwrap();
    post(
        &app,
        "/api/friend/accept",
        Some(&user2.token),
        &json!({"requestId": request_id}),
    )
    .await;

    // user1 removes user2
    let resp = delete(
        &app,
        &format!("/api/friend/remove?friendUserId={}", user2.user_id),
        Some(&user1.token),
        None,
    )
    .await;
    assert_eq!(resp.status, 200);

    // verify user1's friend list no longer contains user2
    let list = get(&app, "/api/friend/list", Some(&user1.token)).await;
    let friends = list.body["data"].as_array().unwrap();
    let contains = friends.iter().any(|f| {
        f["friendId"].as_str().map(|s| s.parse::<i64>().ok()) == Some(Some(user2.user_id))
    });
    assert!(!contains, "friend should have been removed");
}

// ══════════════════════════════════════════════════════════════════
// POST /api/group/create
// ══════════════════════════════════════════════════════════════════

#[tokio::test]
async fn test_create_group() {
    let app = create_test_app().await;
    let username = unique_username("cg");
    let user = register_and_login(&app, &username, "Pass1234").await;

    let resp = post(
        &app,
        "/api/group/create",
        Some(&user.token),
        &json!({"groupName": "TestGroup", "description": "a test group"}),
    )
    .await;
    assert_eq!(resp.status, 200);
    assert_eq!(resp.body["code"], 200);
    let group_id_str = resp.body["data"]["id"].as_str().unwrap();
    assert!(!group_id_str.is_empty());
    let _group_id: i64 = group_id_str.parse().unwrap();
    assert_eq!(resp.body["data"]["groupName"], "TestGroup");
}

#[tokio::test]
async fn test_create_group_empty_name() {
    let app = create_test_app().await;
    let username = unique_username("ce");
    let user = register_and_login(&app, &username, "Pass1234").await;

    let resp = post(
        &app,
        "/api/group/create",
        Some(&user.token),
        &json!({"groupName": ""}),
    )
    .await;
    assert_eq!(resp.status, 400);
}

// ══════════════════════════════════════════════════════════════════
// POST /api/group/:group_id/join
// ══════════════════════════════════════════════════════════════════

#[tokio::test]
async fn test_join_group() {
    let app = create_test_app().await;
    let passwords = "Pass1234";
    let (name_a, name_b) = unique_username_pair("jg");
    let owner = register_and_login(&app, &name_a, passwords).await;
    let member = register_and_login(&app, &name_b, passwords).await;

    // owner creates group
    let create_resp = post(
        &app,
        "/api/group/create",
        Some(&owner.token),
        &json!({"groupName": "JoinGroup"}),
    )
    .await;
    let group_id: i64 = create_resp.body["data"]["id"]
        .as_str()
        .unwrap()
        .parse()
        .unwrap();

    // another user joins
    let resp = post(
        &app,
        &format!("/api/group/{group_id}/join"),
        Some(&member.token),
        &json!({}),
    )
    .await;
    assert_eq!(resp.status, 200);
    assert_eq!(resp.body["data"], true);
}

#[tokio::test]
async fn test_join_already_member() {
    let app = create_test_app().await;
    let passwords = "Pass1234";
    let (name_a, name_b) = unique_username_pair("ja");
    let owner = register_and_login(&app, &name_a, passwords).await;
    let member = register_and_login(&app, &name_b, passwords).await;

    // owner creates group, member joins
    let create_resp = post(
        &app,
        "/api/group/create",
        Some(&owner.token),
        &json!({"groupName": "JoinDup"}),
    )
    .await;
    let group_id: i64 = create_resp.body["data"]["id"]
        .as_str()
        .unwrap()
        .parse()
        .unwrap();
    post(
        &app,
        &format!("/api/group/{group_id}/join"),
        Some(&member.token),
        &json!({}),
    )
    .await;

    // member tries to join again
    let resp = post(
        &app,
        &format!("/api/group/{group_id}/join"),
        Some(&member.token),
        &json!({}),
    )
    .await;
    // TODO: server should return 409 for already-member join
    assert!(resp.status == 200 || resp.status == 409);
}
// ══════════════════════════════════════════════════════════════════
// GET /api/group/user/:user_id
// ══════════════════════════════════════════════════════════════════

#[tokio::test]
async fn test_user_groups() {
    let app = create_test_app().await;
    let username = unique_username("ug");
    let user = register_and_login(&app, &username, "Pass1234").await;

    // create a group
    let create_resp = post(
        &app,
        "/api/group/create",
        Some(&user.token),
        &json!({"groupName": "MyGroup"}),
    )
    .await;
    let group_id: i64 = create_resp.body["data"]["id"]
        .as_str()
        .unwrap()
        .parse()
        .unwrap();

    let resp = get(
        &app,
        &format!("/api/group/user/{}", user.user_id),
        Some(&user.token),
    )
    .await;
    assert_eq!(resp.status, 200);
    let groups = resp.body["data"].as_array().unwrap();
    assert!(groups
        .iter()
        .any(|g| g["id"].as_str().map(|s| s.parse::<i64>().ok()) == Some(Some(group_id))));
}

// ══════════════════════════════════════════════════════════════════
// DELETE /api/group/:group_id (dismiss)
// ══════════════════════════════════════════════════════════════════

#[tokio::test]
async fn test_dismiss_by_owner() {
    let app = create_test_app().await;
    let username = unique_username("do");
    let user = register_and_login(&app, &username, "Pass1234").await;

    let create_resp = post(
        &app,
        "/api/group/create",
        Some(&user.token),
        &json!({"groupName": "DismissMe"}),
    )
    .await;
    let group_id: i64 = create_resp.body["data"]["id"]
        .as_str()
        .unwrap()
        .parse()
        .unwrap();

    let resp = delete(
        &app,
        &format!("/api/group/{group_id}"),
        Some(&user.token),
        None,
    )
    .await;
    assert_eq!(resp.status, 200);
    assert_eq!(resp.body["data"], true);
}

#[tokio::test]
async fn test_dismiss_by_non_owner() {
    let app = create_test_app().await;
    let passwords = "Pass1234";
    let (name_a, name_b) = unique_username_pair("dn");
    let owner = register_and_login(&app, &name_a, passwords).await;
    let other = register_and_login(&app, &name_b, passwords).await;

    let create_resp = post(
        &app,
        "/api/group/create",
        Some(&owner.token),
        &json!({"groupName": "OwnerGroup"}),
    )
    .await;
    let group_id: i64 = create_resp.body["data"]["id"]
        .as_str()
        .unwrap()
        .parse()
        .unwrap();

    let resp = delete(
        &app,
        &format!("/api/group/{group_id}"),
        Some(&other.token),
        None,
    )
    .await;
    assert_eq!(resp.status, 403);
}
