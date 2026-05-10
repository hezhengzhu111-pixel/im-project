#![forbid(unsafe_code)]

use api_server_rs::web;
use axum::body::{to_bytes, Body};
use axum::http::{Request, StatusCode};
use serde_json::{json, Value};
use tower::ServiceExt;
use uuid::Uuid;

async fn test_app() -> axum::Router {
    web::create_test_app().await
}

fn unique_username() -> String {
    format!(
        "e2ee{:0>12}",
        Uuid::new_v4().as_u64_pair().0 % 1_000_000_000_000
    )
}

fn unique_device_id() -> String {
    format!("dev_{}", Uuid::new_v4().as_simple())
}

fn valid_password() -> &'static str {
    "Test1234"
}

async fn read_json(response: axum::response::Response<Body>) -> Value {
    let bytes = to_bytes(response.into_body(), 10_000_000)
        .await
        .expect("read body");
    serde_json::from_slice(&bytes).expect("parse json")
}

struct AuthedUser {
    token: String,
    user_id: String,
}

async fn register_and_login(app: &axum::Router) -> AuthedUser {
    let username = unique_username();
    let password = valid_password();

    // Register
    let reg_body = serde_json::to_string(&json!({
        "username": &username,
        "password": password,
    }))
    .unwrap();
    let reg_req = Request::builder()
        .uri("/api/user/register")
        .method("POST")
        .header("Content-Type", "application/json")
        .body(Body::from(reg_body))
        .unwrap();
    let reg_resp = app.clone().oneshot(reg_req).await.unwrap();
    let reg_json = read_json(reg_resp).await;
    assert_eq!(
        reg_json["success"],
        json!(true),
        "register failed: {reg_json}"
    );
    let user_id = reg_json["data"]["id"].as_str().unwrap().to_string();

    // Login
    let login_body = serde_json::to_string(&json!({
        "username": &username,
        "password": password,
    }))
    .unwrap();
    let login_req = Request::builder()
        .uri("/api/user/login")
        .method("POST")
        .header("Content-Type", "application/json")
        .body(Body::from(login_body))
        .unwrap();
    let login_resp = app.clone().oneshot(login_req).await.unwrap();
    let login_json = read_json(login_resp).await;
    assert_eq!(
        login_json["success"],
        json!(true),
        "login failed: {login_json}"
    );
    let token = login_json["data"]["token"].as_str().unwrap().to_string();

    AuthedUser { token, user_id }
}

async fn post_json(
    app: &axum::Router,
    uri: &str,
    token: Option<&str>,
    body: &Value,
) -> (StatusCode, Value) {
    let mut builder = Request::builder()
        .uri(uri)
        .method("POST")
        .header("Content-Type", "application/json");
    if let Some(t) = token {
        builder = builder.header("Authorization", format!("Bearer {t}"));
    }
    let req = builder
        .body(Body::from(serde_json::to_string(body).unwrap()))
        .unwrap();
    let resp = app.clone().oneshot(req).await.unwrap();
    let status = resp.status();
    let json = read_json(resp).await;
    (status, json)
}

async fn get_json(app: &axum::Router, uri: &str, token: Option<&str>) -> (StatusCode, Value) {
    let mut builder = Request::builder()
        .uri(uri)
        .method("GET")
        .header("Content-Type", "application/json");
    if let Some(t) = token {
        builder = builder.header("Authorization", format!("Bearer {t}"));
    }
    let req = builder.body(Body::empty()).unwrap();
    let resp = app.clone().oneshot(req).await.unwrap();
    let status = resp.status();
    let json = read_json(resp).await;
    (status, json)
}

async fn delete_json(app: &axum::Router, uri: &str, token: Option<&str>) -> (StatusCode, Value) {
    let mut builder = Request::builder()
        .uri(uri)
        .method("DELETE")
        .header("Content-Type", "application/json");
    if let Some(t) = token {
        builder = builder.header("Authorization", format!("Bearer {t}"));
    }
    let req = builder.body(Body::empty()).unwrap();
    let resp = app.clone().oneshot(req).await.unwrap();
    let status = resp.status();
    let json = read_json(resp).await;
    (status, json)
}

// ---------------------------------------------------------------------------
// 测试：上传 bundle 后能查询到设备
// ---------------------------------------------------------------------------

#[tokio::test]
async fn test_e2ee_upload_bundle_then_get_devices() {
    let app = test_app().await;
    let user = register_and_login(&app).await;
    let device_id = unique_device_id();

    // Upload bundle
    let (status, body) = post_json(
        &app,
        "/api/keys/bundle",
        Some(&user.token),
        &json!({
            "deviceId": &device_id,
            "identityKey": "dGVzdF9pZGVudGl0eV9rZXk=",
            "signingIdentityKey": "dGVzdF9zaWduaW5nX2lkZW50aXR5X2tleQ==",
            "signedPreKey": "dGVzdF9zaWduZWRfcHJlX2tleQ==",
            "signedPreKeySignature": "dGVzdF9zaWduYXR1cmU=",
            "oneTimePreKeys": ["otp1", "otp2"]
        }),
    )
    .await;
    assert_eq!(status, StatusCode::OK, "upload_bundle failed: {body}");
    assert_eq!(body["success"], json!(true));

    // Get devices
    let (status, body) = get_json(
        &app,
        &format!("/api/keys/devices?userId={}", user.user_id),
        Some(&user.token),
    )
    .await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(body["success"], json!(true));

    let devices = body["data"].as_array().expect("data should be array");
    assert!(!devices.is_empty(), "expected at least 1 device");

    let found = devices.iter().find(|d| d["deviceId"] == json!(device_id));
    assert!(found.is_some(), "uploaded device not found in get_devices");
    let found = found.unwrap();
    assert_eq!(found["identityKey"], json!("dGVzdF9pZGVudGl0eV9rZXk="));
    assert_eq!(found["signedPreKey"], json!("dGVzdF9zaWduZWRfcHJlX2tleQ=="));
    assert!(found["lastActiveAt"].as_str().is_some());
}

// ---------------------------------------------------------------------------
// 测试：get_bundle 会消费 one-time pre-key，第二次不会返回同一个
// ---------------------------------------------------------------------------

#[tokio::test]
async fn test_e2ee_get_bundle_consumes_one_time_pre_key() {
    let app = test_app().await;
    let user = register_and_login(&app).await;
    let device_id = unique_device_id();

    // Upload bundle with 2 one-time pre-keys
    let (status, upload_body) = post_json(
        &app,
        "/api/keys/bundle",
        Some(&user.token),
        &json!({
            "deviceId": &device_id,
            "identityKey": "a2V5X2lkZW50aXR5",
            "signingIdentityKey": "c2lnbmluZ19pZGVudGl0eQ==",
            "signedPreKey": "c2lnbmVkX3ByZV9rZXk=",
            "signedPreKeySignature": "c2lnbmF0dXJl",
            "oneTimePreKeys": ["first_otp_key", "second_otp_key"]
        }),
    )
    .await;
    assert_eq!(
        status,
        StatusCode::OK,
        "upload_bundle failed: {upload_body}"
    );

    // First get_bundle — should return first one-time pre-key
    let (status, body) = get_json(
        &app,
        &format!(
            "/api/keys/bundle?userId={}&deviceId={}",
            user.user_id, device_id
        ),
        Some(&user.token),
    )
    .await;
    assert_eq!(status, StatusCode::OK);
    let first_otp = body["data"]["oneTimePreKey"].as_str().unwrap().to_string();
    assert_eq!(first_otp, "first_otp_key");

    // Second get_bundle — should return second one-time pre-key
    let (status, body) = get_json(
        &app,
        &format!(
            "/api/keys/bundle?userId={}&deviceId={}",
            user.user_id, device_id
        ),
        Some(&user.token),
    )
    .await;
    assert_eq!(status, StatusCode::OK);
    let second_otp = body["data"]["oneTimePreKey"].as_str().unwrap().to_string();
    assert_eq!(second_otp, "second_otp_key");

    // Third get_bundle — no more one-time pre-keys, should be null
    let (status, body) = get_json(
        &app,
        &format!(
            "/api/keys/bundle?userId={}&deviceId={}",
            user.user_id, device_id
        ),
        Some(&user.token),
    )
    .await;
    assert_eq!(status, StatusCode::OK);
    assert!(
        body["data"]["oneTimePreKey"].is_null(),
        "expected null when no more one-time pre-keys"
    );
    // signed pre key should still be present
    assert_eq!(body["data"]["signedPreKey"], json!("c2lnbmVkX3ByZV9rZXk="));
}

// ---------------------------------------------------------------------------
// 测试：A 用户不能删除 B 用户的 device
// ---------------------------------------------------------------------------

#[tokio::test]
async fn test_e2ee_cannot_delete_other_user_device() {
    let app = test_app().await;
    let user_a = register_and_login(&app).await;
    let user_b = register_and_login(&app).await;
    let device_id = unique_device_id();

    // User B uploads a bundle
    let (status, _) = post_json(
        &app,
        "/api/keys/bundle",
        Some(&user_b.token),
        &json!({
            "deviceId": &device_id,
            "identityKey": "dGVzdA==",
            "signingIdentityKey": "dGVzdA==",
            "signedPreKey": "dGVzdA==",
            "signedPreKeySignature": "dGVzdA==",
            "oneTimePreKeys": []
        }),
    )
    .await;
    assert_eq!(status, StatusCode::OK);

    // User A tries to delete User B's device → should get 404 (not found, because ownership check)
    let (status, body) = delete_json(
        &app,
        &format!("/api/keys/device/{}", device_id),
        Some(&user_a.token),
    )
    .await;
    assert_eq!(
        status,
        StatusCode::NOT_FOUND,
        "user A should not be able to delete user B's device: {body}"
    );
}

// ---------------------------------------------------------------------------
// 测试：未登录请求返回 401
// ---------------------------------------------------------------------------

#[tokio::test]
async fn test_e2ee_unauthenticated_returns_401() {
    let app = test_app().await;

    // Upload bundle without token
    let (status, _) = post_json(
        &app,
        "/api/keys/bundle",
        None,
        &json!({
            "deviceId": "test",
            "identityKey": "test",
            "signingIdentityKey": "test",
            "signedPreKey": "test",
            "signedPreKeySignature": "test",
            "oneTimePreKeys": []
        }),
    )
    .await;
    assert_eq!(status, StatusCode::UNAUTHORIZED);

    // Get devices without token
    let (status, _) = get_json(&app, "/api/keys/devices?userId=1", None).await;
    assert_eq!(status, StatusCode::UNAUTHORIZED);

    // Get bundle without token
    let (status, _) = get_json(&app, "/api/keys/bundle?userId=1&deviceId=test", None).await;
    assert_eq!(status, StatusCode::UNAUTHORIZED);

    // Heartbeat without token
    let (status, _) = post_json(
        &app,
        "/api/keys/heartbeat",
        None,
        &json!({"deviceId": "test"}),
    )
    .await;
    assert_eq!(status, StatusCode::UNAUTHORIZED);

    // Get salt without token
    let (status, _) = get_json(&app, "/api/keys/salt", None).await;
    assert_eq!(status, StatusCode::UNAUTHORIZED);

    // Get backup without token
    let (status, _) = get_json(&app, "/api/keys/backup", None).await;
    assert_eq!(status, StatusCode::UNAUTHORIZED);

    // Delete device without token
    let (status, _) = delete_json(&app, "/api/keys/device/test", None).await;
    assert_eq!(status, StatusCode::UNAUTHORIZED);

    // Session request without token
    let (status, _) = post_json(
        &app,
        "/api/e2ee/request",
        None,
        &json!({"sessionId": "1_2"}),
    )
    .await;
    assert_eq!(status, StatusCode::UNAUTHORIZED);
}

// ---------------------------------------------------------------------------
// 测试：session API 身份校验和状态流转
// ---------------------------------------------------------------------------

#[tokio::test]
async fn test_e2ee_session_request_accept_reject_flow() {
    let app = test_app().await;
    let user_a = register_and_login(&app).await;
    let user_b = register_and_login(&app).await;

    // 构造 session_id: smaller_larger
    let (id_a, id_b) =
        if user_a.user_id.parse::<i64>().unwrap() < user_b.user_id.parse::<i64>().unwrap() {
            (&user_a.user_id, &user_b.user_id)
        } else {
            (&user_b.user_id, &user_a.user_id)
        };
    let session_id = format!("{id_a}_{id_b}");

    // User A requests encryption
    let (status, body) = post_json(
        &app,
        "/api/e2ee/request",
        Some(&user_a.token),
        &json!({
            "sessionId": &session_id,
            "identityKey": "test_key",
            "signedPreKey": "test_spk"
        }),
    )
    .await;
    assert_eq!(status, StatusCode::OK, "request_encryption failed: {body}");

    // User C (not in session) cannot accept
    let user_c = register_and_login(&app).await;
    let (status, _) = post_json(
        &app,
        "/api/e2ee/accept",
        Some(&user_c.token),
        &json!({"sessionId": &session_id}),
    )
    .await;
    assert_eq!(
        status,
        StatusCode::FORBIDDEN,
        "user C should not be able to accept"
    );

    // User B accepts
    let (status, body) = post_json(
        &app,
        "/api/e2ee/accept",
        Some(&user_b.token),
        &json!({"sessionId": &session_id}),
    )
    .await;
    assert_eq!(status, StatusCode::OK, "accept_encryption failed: {body}");
}

// ---------------------------------------------------------------------------
// 测试：加密备份读写
// ---------------------------------------------------------------------------

#[tokio::test]
async fn test_e2ee_backup_upload_and_get() {
    let app = test_app().await;
    let user = register_and_login(&app).await;

    // Get salt (auto-generates)
    let (status, body) = get_json(&app, "/api/keys/salt", Some(&user.token)).await;
    assert_eq!(status, StatusCode::OK);
    let salt = body["data"]["salt"]
        .as_str()
        .expect("salt should be present");
    assert!(!salt.is_empty());

    // Upload backup
    let (status, body) = post_json(
        &app,
        "/api/keys/backup",
        Some(&user.token),
        &json!({
            "encryptedBackup": "encrypted_data_here",
            "salt": salt
        }),
    )
    .await;
    assert_eq!(status, StatusCode::OK, "upload_backup failed: {body}");

    // Get backup
    let (status, body) = get_json(&app, "/api/keys/backup", Some(&user.token)).await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(
        body["data"]["encryptedBackup"],
        json!("encrypted_data_here")
    );
    assert_eq!(body["data"]["salt"], json!(salt));
}
