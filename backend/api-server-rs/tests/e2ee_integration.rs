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

/// 通过好友 API 建立双向好友关系：A 向 B 发送申请，B 接受。
async fn establish_friendship(app: &axum::Router, user_a: &AuthedUser, user_b: &AuthedUser) {
    // User A sends friend request to B
    let (status, _body) = post_json(
        app,
        "/api/friend/request",
        Some(&user_a.token),
        &json!({
            "targetUserId": &user_b.user_id,
            "reason": "test friendship"
        }),
    )
    .await;
    assert_eq!(status, StatusCode::OK, "friend request failed");

    // User B fetches pending friend requests to find the request ID
    let (status, list_body) =
        get_json(app, "/api/friend/requests", Some(&user_b.token)).await;
    assert_eq!(status, StatusCode::OK, "friend requests list failed");

    let requests = list_body["data"]
        .as_array()
        .expect("friend requests data should be array");
    let target_req = requests
        .iter()
        .find(|r| {
            r["applicantId"].as_str().map(|s| s.to_string()) == Some(user_a.user_id.clone())
                && r["status"].as_i64() == Some(0)
        })
        .expect("should find pending friend request from user_a");
    let request_id = target_req["id"].as_i64().expect("request should have id");

    // User B accepts
    let (status, _body) = post_json(
        app,
        "/api/friend/accept",
        Some(&user_b.token),
        &json!({
            "requestId": request_id
        }),
    )
    .await;
    assert_eq!(
        status,
        StatusCode::OK,
        "friend accept failed: {_body}"
    );
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

    // Establish friendship first (required for negotiation)
    establish_friendship(&app, &user_a, &user_b).await;

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

    // User C (not in session) cannot disable the encrypted channel
    let (status, _) = post_json(
        &app,
        "/api/e2ee/disable",
        Some(&user_c.token),
        &json!({"sessionId": &session_id}),
    )
    .await;
    assert_eq!(
        status,
        StatusCode::FORBIDDEN,
        "user C should not be able to disable"
    );

    // Either participant can exit the encrypted channel
    let (status, body) = post_json(
        &app,
        "/api/e2ee/disable",
        Some(&user_a.token),
        &json!({"sessionId": &session_id}),
    )
    .await;
    assert_eq!(status, StatusCode::OK, "disable_encryption failed: {body}");

    // After disabling, the channel can be negotiated again
    let (status, body) = post_json(
        &app,
        "/api/e2ee/request",
        Some(&user_b.token),
        &json!({
            "sessionId": &session_id,
            "identityKey": "test_key_2",
            "signedPreKey": "test_spk_2"
        }),
    )
    .await;
    assert_eq!(status, StatusCode::OK, "renegotiation failed: {body}");
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

// ---------------------------------------------------------------------------
// 辅助函数：上传设备 Bundle 并返回 device_id
// ---------------------------------------------------------------------------

async fn upload_test_device(
    app: &axum::Router,
    token: &str,
) -> (String, Value) {
    let device_id = unique_device_id();
    let (status, body) = post_json(
        app,
        "/api/keys/bundle",
        Some(token),
        &json!({
            "deviceId": &device_id,
            "identityKey": "dGVzdF9pZGVudGl0eV9rZXk=",
            "signingIdentityKey": "dGVzdF9zaWduaW5nX2lkZW50aXR5X2tleQ==",
            "signedPreKey": "dGVzdF9zaWduZWRfcHJlX2tleQ==",
            "signedPreKeySignature": "dGVzdF9zaWduYXR1cmU=",
            "oneTimePreKeys": ["otp_key_1"]
        }),
    )
    .await;
    assert_eq!(status, StatusCode::OK, "upload_test_device failed: {body}");
    (device_id, body)
}

// ---------------------------------------------------------------------------
// 测试：senderDeviceId 不属于当前用户应返回 Forbidden
// ---------------------------------------------------------------------------

#[tokio::test]
async fn test_e2ee_create_session_sender_device_must_belong_to_caller() {
    let app = test_app().await;
    let user_a = register_and_login(&app).await;
    let user_b = register_and_login(&app).await;

    let (device_a, _) = upload_test_device(&app, &user_a.token).await;
    let (device_b, _) = upload_test_device(&app, &user_b.token).await;

    let (id_a, id_b) = if user_a.user_id < user_b.user_id {
        (user_a.user_id.clone(), user_b.user_id.clone())
    } else {
        (user_b.user_id.clone(), user_a.user_id.clone())
    };
    let conversation_id = format!("p_{id_a}_{id_b}");

    // User A 尝试使用 User B 的设备作为 senderDeviceId → 应拒绝
    let (status, body) = post_json(
        &app,
        "/api/e2ee/sessions",
        Some(&user_a.token),
        &json!({
            "conversationId": conversation_id,
            "senderDeviceId": device_b,
            "recipientDeviceIds": [&device_a]
        }),
    )
    .await;
    assert_eq!(
        status,
        StatusCode::FORBIDDEN,
        "should reject foreign senderDeviceId, got: {body}"
    );
    assert!(
        body["error"]
            .as_str()
            .unwrap_or("")
            .contains("sender device does not belong"),
        "unexpected error message: {body}"
    );
}

// ---------------------------------------------------------------------------
// 测试：私聊创建 session 成功
// ---------------------------------------------------------------------------

#[tokio::test]
async fn test_e2ee_create_session_private_success() {
    let app = test_app().await;
    let user_a = register_and_login(&app).await;
    let user_b = register_and_login(&app).await;

    let (device_a, _) = upload_test_device(&app, &user_a.token).await;
    let (device_b, _) = upload_test_device(&app, &user_b.token).await;

    let (id_a, id_b) = if user_a.user_id < user_b.user_id {
        (user_a.user_id.clone(), user_b.user_id.clone())
    } else {
        (user_b.user_id.clone(), user_a.user_id.clone())
    };
    let conversation_id = format!("p_{id_a}_{id_b}");

    // User A 创建 session: senderDeviceId 属于 A，recipientDeviceIds 属于 B
    let (status, body) = post_json(
        &app,
        "/api/e2ee/sessions",
        Some(&user_a.token),
        &json!({
            "conversationId": conversation_id,
            "senderDeviceId": device_a,
            "recipientDeviceIds": [&device_b],
            "recipientUserIds": [&user_b.user_id]
        }),
    )
    .await;
    assert_eq!(
        status,
        StatusCode::OK,
        "private session creation should succeed: {body}"
    );
    assert_eq!(body["success"], json!(true));
    let data = &body["data"];
    assert_eq!(data["conversationId"], json!(conversation_id));
    assert_eq!(data["senderDeviceId"], json!(device_a));
    let recipients = data["recipientDeviceIds"].as_array().expect("should be array");
    assert!(recipients.contains(&json!(device_b)));
    assert_eq!(data["status"], json!("active"));
}

// ---------------------------------------------------------------------------
// 测试：私聊中 recipientDeviceIds 包含自己的设备应拒绝
// ---------------------------------------------------------------------------

#[tokio::test]
async fn test_e2ee_create_session_private_rejects_own_device_as_recipient() {
    let app = test_app().await;
    let user_a = register_and_login(&app).await;
    let user_b = register_and_login(&app).await;

    let (device_a1, _) = upload_test_device(&app, &user_a.token).await;
    let (device_a2, _) = upload_test_device(&app, &user_a.token).await;

    let (id_a, id_b) = if user_a.user_id < user_b.user_id {
        (user_a.user_id.clone(), user_b.user_id.clone())
    } else {
        (user_b.user_id.clone(), user_a.user_id.clone())
    };
    let conversation_id = format!("p_{id_a}_{id_b}");

    // User A 创建 session 时，recipientDeviceIds 包含 User A 自己的另一个设备 → 应拒绝
    let (status, body) = post_json(
        &app,
        "/api/e2ee/sessions",
        Some(&user_a.token),
        &json!({
            "conversationId": conversation_id,
            "senderDeviceId": device_a1,
            "recipientDeviceIds": [&device_a2]
        }),
    )
    .await;
    assert_eq!(
        status,
        StatusCode::FORBIDDEN,
        "should reject own device as recipient in private chat: {body}"
    );
    assert!(
        body["error"]
            .as_str()
            .unwrap_or("")
            .contains("cannot add own device"),
        "unexpected error message: {body}"
    );
}

// ---------------------------------------------------------------------------
// 测试：私聊中 recipientDeviceIds 包含第三方设备应拒绝
// ---------------------------------------------------------------------------

#[tokio::test]
async fn test_e2ee_create_session_private_rejects_third_party_device() {
    let app = test_app().await;
    let user_a = register_and_login(&app).await;
    let user_b = register_and_login(&app).await;
    let user_c = register_and_login(&app).await;

    let (device_a, _) = upload_test_device(&app, &user_a.token).await;
    let (device_c, _) = upload_test_device(&app, &user_c.token).await;

    let (id_a, id_b) = if user_a.user_id < user_b.user_id {
        (user_a.user_id.clone(), user_b.user_id.clone())
    } else {
        (user_b.user_id.clone(), user_a.user_id.clone())
    };
    let conversation_id = format!("p_{id_a}_{id_b}");

    // User A 创建 session，recipientDeviceIds 包含 User C 的设备 → 应拒绝
    let (status, body) = post_json(
        &app,
        "/api/e2ee/sessions",
        Some(&user_a.token),
        &json!({
            "conversationId": conversation_id,
            "senderDeviceId": device_a,
            "recipientDeviceIds": [&device_c]
        }),
    )
    .await;
    assert_eq!(
        status,
        StatusCode::FORBIDDEN,
        "should reject third-party device in private chat: {body}"
    );
}

// ---------------------------------------------------------------------------
// 测试：recipientUserIds 与 recipientDeviceIds 不匹配应拒绝
// ---------------------------------------------------------------------------

#[tokio::test]
async fn test_e2ee_create_session_recipient_user_ids_mismatch() {
    let app = test_app().await;
    let user_a = register_and_login(&app).await;
    let user_b = register_and_login(&app).await;
    let user_c = register_and_login(&app).await;

    let (device_a, _) = upload_test_device(&app, &user_a.token).await;
    let (device_c, _) = upload_test_device(&app, &user_c.token).await;

    let (id_a, id_b) = if user_a.user_id < user_b.user_id {
        (user_a.user_id.clone(), user_b.user_id.clone())
    } else {
        (user_b.user_id.clone(), user_a.user_id.clone())
    };
    let conversation_id = format!("p_{id_a}_{id_b}");

    // recipientUserIds 声称发给用户 B，但实际 recipientDeviceIds 属于用户 C → 应拒绝
    let (status, body) = post_json(
        &app,
        "/api/e2ee/sessions",
        Some(&user_a.token),
        &json!({
            "conversationId": conversation_id,
            "senderDeviceId": device_a,
            "recipientDeviceIds": [&device_c],
            "recipientUserIds": [&user_b.user_id]
        }),
    )
    .await;
    assert_eq!(
        status,
        StatusCode::FORBIDDEN,
        "should reject mismatched recipientUserIds and device owners: {body}"
    );
}

// ---------------------------------------------------------------------------
// 测试：recipientUserIds 为空时，根据 device 归属自动判断（合法场景）
// ---------------------------------------------------------------------------

#[tokio::test]
async fn test_e2ee_create_session_empty_recipient_user_ids_success() {
    let app = test_app().await;
    let user_a = register_and_login(&app).await;
    let user_b = register_and_login(&app).await;

    let (device_a, _) = upload_test_device(&app, &user_a.token).await;
    let (device_b, _) = upload_test_device(&app, &user_b.token).await;

    let (id_a, id_b) = if user_a.user_id < user_b.user_id {
        (user_a.user_id.clone(), user_b.user_id.clone())
    } else {
        (user_b.user_id.clone(), user_a.user_id.clone())
    };
    let conversation_id = format!("p_{id_a}_{id_b}");

    // recipientUserIds 为空，但 recipientDeviceIds 全部属于另一方 → 应成功
    let (status, body) = post_json(
        &app,
        "/api/e2ee/sessions",
        Some(&user_a.token),
        &json!({
            "conversationId": conversation_id,
            "senderDeviceId": device_a,
            "recipientDeviceIds": [&device_b]
        }),
    )
    .await;
    assert_eq!(
        status,
        StatusCode::OK,
        "should succeed with empty recipientUserIds: {body}"
    );
    assert_eq!(body["success"], json!(true));
}

// ---------------------------------------------------------------------------
// 测试：群聊中 recipientDeviceIds 包含非群成员设备应拒绝
// ---------------------------------------------------------------------------

#[tokio::test]
async fn test_e2ee_create_session_group_rejects_non_member_device() {
    let app = test_app().await;
    let user_a = register_and_login(&app).await;
    let user_b = register_and_login(&app).await;
    let user_c = register_and_login(&app).await;

    let (device_a, _) = upload_test_device(&app, &user_a.token).await;
    let (device_c, _) = upload_test_device(&app, &user_c.token).await;

    // User A 创建群组
    let (status, create_body) = post_json(
        &app,
        "/api/group/create",
        Some(&user_a.token),
        &json!({
            "groupName": "test_e2ee_group",
            "memberIds": [user_b.user_id.parse::<i64>().unwrap()]
        }),
    )
    .await;
    assert_eq!(
        status,
        StatusCode::OK,
        "group creation failed: {create_body}"
    );
    let group_id = create_body["data"]["id"].as_i64().expect("group id");

    let conversation_id = format!("g_{group_id}");

    // User A 创建 session，recipientDeviceIds 包含非群成员 User C 的设备 → 应拒绝
    let (status, body) = post_json(
        &app,
        "/api/e2ee/sessions",
        Some(&user_a.token),
        &json!({
            "conversationId": conversation_id,
            "senderDeviceId": device_a,
            "recipientDeviceIds": [&device_c]
        }),
    )
    .await;
    assert_eq!(
        status,
        StatusCode::FORBIDDEN,
        "should reject non-member device in group chat: {body}"
    );
    assert!(
        body["error"]
            .as_str()
            .unwrap_or("")
            .contains("not a member of group"),
        "unexpected error message: {body}"
    );
}

// ---------------------------------------------------------------------------
// 测试：recipientDeviceIds 包含不存在的设备应拒绝
// ---------------------------------------------------------------------------

#[tokio::test]
async fn test_e2ee_create_session_rejects_nonexistent_device() {
    let app = test_app().await;
    let user_a = register_and_login(&app).await;
    let user_b = register_and_login(&app).await;

    let (device_a, _) = upload_test_device(&app, &user_a.token).await;

    let (id_a, id_b) = if user_a.user_id < user_b.user_id {
        (user_a.user_id.clone(), user_b.user_id.clone())
    } else {
        (user_b.user_id.clone(), user_a.user_id.clone())
    };
    let conversation_id = format!("p_{id_a}_{id_b}");

    let fake_device_id = unique_device_id();

    // recipientDeviceIds 包含从未注册的设备 → 应返回 BadRequest
    let (status, body) = post_json(
        &app,
        "/api/e2ee/sessions",
        Some(&user_a.token),
        &json!({
            "conversationId": conversation_id,
            "senderDeviceId": device_a,
            "recipientDeviceIds": [&fake_device_id]
        }),
    )
    .await;
    assert_eq!(
        status,
        StatusCode::BAD_REQUEST,
        "should reject nonexistent device: {body}"
    );
    assert!(
        body["error"]
            .as_str()
            .unwrap_or("")
            .contains("not found or not active"),
        "unexpected error message: {body}"
    );
}

// ---------------------------------------------------------------------------
// 测试：非会话成员不能创建 session
// ---------------------------------------------------------------------------

#[tokio::test]
async fn test_e2ee_create_session_rejects_non_member() {
    let app = test_app().await;
    let user_a = register_and_login(&app).await;
    let user_b = register_and_login(&app).await;
    let user_c = register_and_login(&app).await;

    let (device_c, _) = upload_test_device(&app, &user_c.token).await;
    let (device_c2, _) = upload_test_device(&app, &user_c.token).await;

    let (id_a, id_b) = if user_a.user_id < user_b.user_id {
        (user_a.user_id.clone(), user_b.user_id.clone())
    } else {
        (user_b.user_id.clone(), user_a.user_id.clone())
    };
    let conversation_id = format!("p_{id_a}_{id_b}");

    // User C 不在会话中，不能创建 session
    let (status, body) = post_json(
        &app,
        "/api/e2ee/sessions",
        Some(&user_c.token),
        &json!({
            "conversationId": conversation_id,
            "senderDeviceId": device_c,
            "recipientDeviceIds": [&device_c2]
        }),
    )
    .await;
    assert_eq!(
        status,
        StatusCode::FORBIDDEN,
        "should reject non-member from creating session: {body}"
    );
    assert!(
        body["error"]
            .as_str()
            .unwrap_or("")
            .contains("not a conversation member"),
        "unexpected error message: {body}"
    );
}

// ---------------------------------------------------------------------------
// 测试：recipientDeviceIds 为空应返回 BadRequest
// ---------------------------------------------------------------------------

#[tokio::test]
async fn test_e2ee_create_session_rejects_empty_recipient_device_ids() {
    let app = test_app().await;
    let user_a = register_and_login(&app).await;
    let user_b = register_and_login(&app).await;

    let (device_a, _) = upload_test_device(&app, &user_a.token).await;

    let (id_a, id_b) = if user_a.user_id < user_b.user_id {
        (user_a.user_id.clone(), user_b.user_id.clone())
    } else {
        (user_b.user_id.clone(), user_a.user_id.clone())
    };
    let conversation_id = format!("p_{id_a}_{id_b}");

    let (status, body) = post_json(
        &app,
        "/api/e2ee/sessions",
        Some(&user_a.token),
        &json!({
            "conversationId": conversation_id,
            "senderDeviceId": device_a,
            "recipientDeviceIds": []
        }),
    )
    .await;
    assert_eq!(
        status,
        StatusCode::BAD_REQUEST,
        "should reject empty recipientDeviceIds: {body}"
    );
}

// ===========================================================================
// E2EE 会话协商状态机安全测试（问题 4 修复验证）
// ===========================================================================

// ---------------------------------------------------------------------------
// 测试：非好友不能发起 E2EE 协商请求
// ---------------------------------------------------------------------------

#[tokio::test]
async fn test_e2ee_non_friends_cannot_request_encryption() {
    let app = test_app().await;
    let user_a = register_and_login(&app).await;
    let user_b = register_and_login(&app).await;

    let (id_a, id_b) =
        if user_a.user_id.parse::<i64>().unwrap() < user_b.user_id.parse::<i64>().unwrap() {
            (&user_a.user_id, &user_b.user_id)
        } else {
            (&user_b.user_id, &user_a.user_id)
        };
    let session_id = format!("{id_a}_{id_b}");

    let (status, body) = post_json(
        &app,
        "/api/e2ee/request",
        Some(&user_a.token),
        &json!({
            "sessionId": &session_id,
            "identityKey": "test_key"
        }),
    )
    .await;
    assert_eq!(
        status,
        StatusCode::FORBIDDEN,
        "non-friends should not be allowed to request encryption: {body}"
    );
    assert!(
        body["error"]
            .as_str()
            .unwrap_or("")
            .contains("not a friend"),
        "unexpected error message: {body}"
    );
}

// ---------------------------------------------------------------------------
// 测试：encrypted 状态下再次 request_encryption 不能覆盖为 pending
// ---------------------------------------------------------------------------

#[tokio::test]
async fn test_e2ee_encrypted_rejects_overwrite_by_request() {
    let app = test_app().await;
    let user_a = register_and_login(&app).await;
    let user_b = register_and_login(&app).await;

    establish_friendship(&app, &user_a, &user_b).await;

    let (id_a, id_b) =
        if user_a.user_id.parse::<i64>().unwrap() < user_b.user_id.parse::<i64>().unwrap() {
            (&user_a.user_id, &user_b.user_id)
        } else {
            (&user_b.user_id, &user_a.user_id)
        };
    let session_id = format!("{id_a}_{id_b}");

    // A requests → pending
    let (status, _) = post_json(
        &app,
        "/api/e2ee/request",
        Some(&user_a.token),
        &json!({
            "sessionId": &session_id,
            "identityKey": "test_key"
        }),
    )
    .await;
    assert_eq!(status, StatusCode::OK);

    // B accepts → encrypted
    let (status, _) = post_json(
        &app,
        "/api/e2ee/accept",
        Some(&user_b.token),
        &json!({"sessionId": &session_id}),
    )
    .await;
    assert_eq!(status, StatusCode::OK);

    // A tries to request again → Conflict (encrypted cannot be overwritten)
    let (status, body) = post_json(
        &app,
        "/api/e2ee/request",
        Some(&user_a.token),
        &json!({
            "sessionId": &session_id,
            "identityKey": "test_key_2"
        }),
    )
    .await;
    assert_eq!(
        status,
        StatusCode::CONFLICT,
        "encrypted session should not be overwritten by request: {body}"
    );
    assert!(
        body["error"]
            .as_str()
            .unwrap_or("")
            .contains("already encrypted"),
        "unexpected error message: {body}"
    );
}

// ---------------------------------------------------------------------------
// 测试：pending 状态下，同一 requester 重复 request 幂等处理
// ---------------------------------------------------------------------------

#[tokio::test]
async fn test_e2ee_pending_same_requester_idempotent() {
    let app = test_app().await;
    let user_a = register_and_login(&app).await;
    let user_b = register_and_login(&app).await;

    establish_friendship(&app, &user_a, &user_b).await;

    let (id_a, id_b) =
        if user_a.user_id.parse::<i64>().unwrap() < user_b.user_id.parse::<i64>().unwrap() {
            (&user_a.user_id, &user_b.user_id)
        } else {
            (&user_b.user_id, &user_a.user_id)
        };
    let session_id = format!("{id_a}_{id_b}");

    // A requests first time
    let (status, _) = post_json(
        &app,
        "/api/e2ee/request",
        Some(&user_a.token),
        &json!({
            "sessionId": &session_id,
            "identityKey": "first_key"
        }),
    )
    .await;
    assert_eq!(status, StatusCode::OK);

    // A requests again (same requester) → idempotent, should succeed
    let (status, _) = post_json(
        &app,
        "/api/e2ee/request",
        Some(&user_a.token),
        &json!({
            "sessionId": &session_id,
            "identityKey": "second_key",
            "requestPayloadJson": "{\"updated\":true}"
        }),
    )
    .await;
    assert_eq!(status, StatusCode::OK, "same requester repeat request should be idempotent");

    // B should still be able to accept (status is still pending)
    let (status, _) = post_json(
        &app,
        "/api/e2ee/accept",
        Some(&user_b.token),
        &json!({"sessionId": &session_id}),
    )
    .await;
    assert_eq!(status, StatusCode::OK);
}

// ---------------------------------------------------------------------------
// 测试：pending 状态下，requester 自己不能 accept
// ---------------------------------------------------------------------------

#[tokio::test]
async fn test_e2ee_pending_requester_cannot_accept_own() {
    let app = test_app().await;
    let user_a = register_and_login(&app).await;
    let user_b = register_and_login(&app).await;

    establish_friendship(&app, &user_a, &user_b).await;

    let (id_a, id_b) =
        if user_a.user_id.parse::<i64>().unwrap() < user_b.user_id.parse::<i64>().unwrap() {
            (&user_a.user_id, &user_b.user_id)
        } else {
            (&user_b.user_id, &user_a.user_id)
        };
    let session_id = format!("{id_a}_{id_b}");

    // A requests
    let (status, _) = post_json(
        &app,
        "/api/e2ee/request",
        Some(&user_a.token),
        &json!({
            "sessionId": &session_id,
            "identityKey": "test_key"
        }),
    )
    .await;
    assert_eq!(status, StatusCode::OK);

    // A tries to accept own request → Forbidden (only target can accept)
    let (status, body) = post_json(
        &app,
        "/api/e2ee/accept",
        Some(&user_a.token),
        &json!({"sessionId": &session_id}),
    )
    .await;
    assert_eq!(
        status,
        StatusCode::FORBIDDEN,
        "requester should not be able to accept own request: {body}"
    );
}

// ---------------------------------------------------------------------------
// 测试：encrypted 状态下 reject 应被拒绝
// ---------------------------------------------------------------------------

#[tokio::test]
async fn test_e2ee_encrypted_rejects_reject() {
    let app = test_app().await;
    let user_a = register_and_login(&app).await;
    let user_b = register_and_login(&app).await;

    establish_friendship(&app, &user_a, &user_b).await;

    let (id_a, id_b) =
        if user_a.user_id.parse::<i64>().unwrap() < user_b.user_id.parse::<i64>().unwrap() {
            (&user_a.user_id, &user_b.user_id)
        } else {
            (&user_b.user_id, &user_a.user_id)
        };
    let session_id = format!("{id_a}_{id_b}");

    // A requests → pending
    let (status, _) = post_json(
        &app,
        "/api/e2ee/request",
        Some(&user_a.token),
        &json!({
            "sessionId": &session_id,
            "identityKey": "test_key"
        }),
    )
    .await;
    assert_eq!(status, StatusCode::OK);

    // B accepts → encrypted
    let (status, _) = post_json(
        &app,
        "/api/e2ee/accept",
        Some(&user_b.token),
        &json!({"sessionId": &session_id}),
    )
    .await;
    assert_eq!(status, StatusCode::OK);

    // B tries to reject encrypted session → Conflict
    let (status, body) = post_json(
        &app,
        "/api/e2ee/reject",
        Some(&user_b.token),
        &json!({"sessionId": &session_id}),
    )
    .await;
    assert_eq!(
        status,
        StatusCode::CONFLICT,
        "encrypted session should not be rejectable: {body}"
    );
    assert!(
        body["error"]
            .as_str()
            .unwrap_or("")
            .contains("cannot reject an encrypted session"),
        "unexpected error message: {body}"
    );
}

// ---------------------------------------------------------------------------
// 测试：disable encrypted 操作正常执行并允许后续重新协商
// ---------------------------------------------------------------------------

#[tokio::test]
async fn test_e2ee_disable_encrypted_session() {
    let app = test_app().await;
    let user_a = register_and_login(&app).await;
    let user_b = register_and_login(&app).await;

    establish_friendship(&app, &user_a, &user_b).await;

    let (id_a, id_b) =
        if user_a.user_id.parse::<i64>().unwrap() < user_b.user_id.parse::<i64>().unwrap() {
            (&user_a.user_id, &user_b.user_id)
        } else {
            (&user_b.user_id, &user_a.user_id)
        };
    let session_id = format!("{id_a}_{id_b}");

    // A requests → pending
    let (status, _) = post_json(
        &app,
        "/api/e2ee/request",
        Some(&user_a.token),
        &json!({
            "sessionId": &session_id,
            "identityKey": "test_key"
        }),
    )
    .await;
    assert_eq!(status, StatusCode::OK);

    // B accepts → encrypted
    let (status, _) = post_json(
        &app,
        "/api/e2ee/accept",
        Some(&user_b.token),
        &json!({"sessionId": &session_id}),
    )
    .await;
    assert_eq!(status, StatusCode::OK);

    // A disables → plaintext
    let (status, _) = post_json(
        &app,
        "/api/e2ee/disable",
        Some(&user_a.token),
        &json!({"sessionId": &session_id}),
    )
    .await;
    assert_eq!(status, StatusCode::OK, "disable encrypted should succeed");

    // After disable, re-request should work (plaintext → pending)
    let (status, _) = post_json(
        &app,
        "/api/e2ee/request",
        Some(&user_b.token),
        &json!({
            "sessionId": &session_id,
            "identityKey": "renegotiated_key"
        }),
    )
    .await;
    assert_eq!(
        status,
        StatusCode::OK,
        "re-request after disable should succeed"
    );
}

// ---------------------------------------------------------------------------
// 测试：非参与者（非好友的用户 C）不能 accept/reject/disable
// ---------------------------------------------------------------------------

#[tokio::test]
async fn test_e2ee_non_participant_blocked_by_friendship_check() {
    let app = test_app().await;
    let user_a = register_and_login(&app).await;
    let user_b = register_and_login(&app).await;
    let user_c = register_and_login(&app).await;

    // Only establish friendship between A and B, not C
    establish_friendship(&app, &user_a, &user_b).await;

    let (id_a, id_b) =
        if user_a.user_id.parse::<i64>().unwrap() < user_b.user_id.parse::<i64>().unwrap() {
            (&user_a.user_id, &user_b.user_id)
        } else {
            (&user_b.user_id, &user_a.user_id)
        };
    let session_id = format!("{id_a}_{id_b}");

    // A requests
    let (status, _) = post_json(
        &app,
        "/api/e2ee/request",
        Some(&user_a.token),
        &json!({
            "sessionId": &session_id,
            "identityKey": "test_key"
        }),
    )
    .await;
    assert_eq!(status, StatusCode::OK);

    // C tries to accept → Forbidden (not a friend)
    let (status, body) = post_json(
        &app,
        "/api/e2ee/accept",
        Some(&user_c.token),
        &json!({"sessionId": &session_id}),
    )
    .await;
    assert_eq!(
        status,
        StatusCode::FORBIDDEN,
        "non-friend should not be able to accept: {body}"
    );
    assert!(
        body["error"]
            .as_str()
            .unwrap_or("")
            .contains("not a friend"),
        "unexpected error message: {body}"
    );
}

// ---------------------------------------------------------------------------
// 测试：伪造 session_id（用户存在但非好友）不能执行任何操作
// ---------------------------------------------------------------------------

#[tokio::test]
async fn test_e2ee_fake_session_id_with_non_friends() {
    let app = test_app().await;
    let user_a = register_and_login(&app).await;
    let user_b = register_and_login(&app).await;

    let (id_a, id_b) =
        if user_a.user_id.parse::<i64>().unwrap() < user_b.user_id.parse::<i64>().unwrap() {
            (&user_a.user_id, &user_b.user_id)
        } else {
            (&user_b.user_id, &user_a.user_id)
        };
    let session_id = format!("p_{id_a}_{id_b}");

    // Accept on non-existent session → Forbidden (friendship check first)
    let (status, body) = post_json(
        &app,
        "/api/e2ee/accept",
        Some(&user_a.token),
        &json!({"sessionId": &session_id}),
    )
    .await;
    assert!(
        status == StatusCode::FORBIDDEN || status == StatusCode::NOT_FOUND,
        "fake session should be rejected, got {status}: {body}"
    );

    // Disable on non-existent session → Forbidden
    let (status, _) = post_json(
        &app,
        "/api/e2ee/disable",
        Some(&user_a.token),
        &json!({"sessionId": &session_id}),
    )
    .await;
    assert!(
        status == StatusCode::FORBIDDEN || status == StatusCode::NOT_FOUND,
        "disable on fake session should be rejected, got {status}"
    );
}
