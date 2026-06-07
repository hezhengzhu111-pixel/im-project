#![forbid(unsafe_code)]
#![cfg(feature = "integration-tests")]

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
        "e2g{:0>12}",
        Uuid::new_v4().as_u64_pair().0 % 1_000_000_000_000
    )
}

fn unique_device_id() -> String {
    format!("dev_{}", Uuid::new_v4().as_simple())
}

async fn read_json(response: axum::response::Response<Body>) -> Value {
    let bytes = to_bytes(response.into_body(), 10_000_000)
        .await
        .expect("read body");
    serde_json::from_slice(&bytes).expect("parse json")
}

fn x25519_key() -> String {
    let bytes: Vec<u8> = (0..32).map(|i| (i % 26) as u8 + b'a').collect();
    use base64::Engine;
    base64::engine::general_purpose::STANDARD.encode(&bytes)
}

fn ed25519_sig() -> String {
    let bytes: Vec<u8> = (0..64).map(|i| (i % 26) as u8 + b'a').collect();
    use base64::Engine;
    base64::engine::general_purpose::STANDARD.encode(&bytes)
}

fn make_otp_keys(_keys: &[&str]) -> Value {
    vec![json!({"id": 1, "key": x25519_key()})].into()
}

struct AuthedUser {
    token: String,
    user_id: i64,
}

async fn register_and_login(app: &axum::Router) -> AuthedUser {
    let username = unique_username();
    let password = "Test1234";

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
    let user_id: i64 = reg_json["data"]["id"].as_str().unwrap().parse().unwrap();

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

/// 为用户注册一个 E2EE 设备（通过 upload_bundle API），返回 device_id
async fn register_device(app: &axum::Router, token: &str) -> String {
    let device_id = unique_device_id();
    let (status, body) = post_json(
        app,
        "/api/keys/bundle",
        Some(token),
        &json!({
            "deviceId": &device_id,
            "identityKey": x25519_key(),
            "signingIdentityKey": x25519_key(),
            "signedPreKey": x25519_key(),
            "signedPreKeySignature": ed25519_sig(),
            "oneTimePreKeys": make_otp_keys(&["otp1"])
        }),
    )
    .await;
    assert_eq!(status, StatusCode::OK, "register_device failed: {body}");
    device_id
}

/// 创建群组并让 member 加入，返回 (group_id, owner, member)
async fn setup_group_with_member(app: &axum::Router) -> (i64, AuthedUser, AuthedUser) {
    let owner = register_and_login(app).await;
    let member = register_and_login(app).await;

    // owner 创建群组（role=3 群主）
    let (status, body) = post_json(
        app,
        "/api/group/create",
        Some(&owner.token),
        &json!({"groupName": "E2EEGroup"}),
    )
    .await;
    assert_eq!(status, StatusCode::OK, "create group failed: {body}");
    let group_id: i64 = body["data"]["id"].as_str().unwrap().parse().unwrap();

    // member 加入群组（role=1 普通成员）
    let (status, body) = post_json(
        app,
        &format!("/api/group/{group_id}/join"),
        Some(&member.token),
        &json!({}),
    )
    .await;
    assert_eq!(status, StatusCode::OK, "join group failed: {body}");

    (group_id, owner, member)
}

// ---------------------------------------------------------------------------
// 测试 1: 管理员向群成员写入 sender key 成功（设备已注册）
// ---------------------------------------------------------------------------

#[tokio::test]
async fn test_e2ee_group_enable_admin_to_member_succeeds() {
    let app = test_app().await;
    let (group_id, owner, member) = setup_group_with_member(&app).await;

    // 为 member 注册设备
    let device_id = register_device(&app, &member.token).await;

    let (status, body) = post_json(
        &app,
        &format!("/api/e2ee/groups/{group_id}/enable"),
        Some(&owner.token),
        &json!({
            "senderKeys": [{
                "recipientId": member.user_id,
                "deviceId": &device_id,
                "encryptedSenderKey": "dGVzdF9rZXk="
            }]
        }),
    )
    .await;
    assert_eq!(status, StatusCode::OK, "enable encryption failed: {body}");
    assert_eq!(body["success"], json!(true));

    // 验证加密状态已启用
    let (status, body) = get_json(
        &app,
        &format!("/api/e2ee/groups/{group_id}/status"),
        Some(&owner.token),
    )
    .await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(body["data"]["status"], json!("encrypted"));
}

// ---------------------------------------------------------------------------
// 测试 2: 管理员向非群成员写入 sender key 返回 403，整体失败不写入任何记录
// ---------------------------------------------------------------------------

#[tokio::test]
async fn test_e2ee_group_enable_admin_to_nonmember_returns_403() {
    let app = test_app().await;
    let (group_id, owner, _member) = setup_group_with_member(&app).await;
    let outsider = register_and_login(&app).await;

    let device_id = unique_device_id();

    // 仅包含非成员的请求 → 整体 403
    let (status, body) = post_json(
        &app,
        &format!("/api/e2ee/groups/{group_id}/enable"),
        Some(&owner.token),
        &json!({
            "senderKeys": [{
                "recipientId": outsider.user_id,
                "deviceId": &device_id,
                "encryptedSenderKey": "aWxsZWdhbF9rZXk="
            }]
        }),
    )
    .await;
    assert_eq!(status, StatusCode::FORBIDDEN, "expected 403: {body}");
    assert!(
        body["message"]
            .as_str()
            .unwrap_or("")
            .contains("not a group member"),
        "error message should mention 'not a group member': {body}"
    );

    // 验证加密状态未被启用（验证校验在写入之前执行）
    let (status, body) = get_json(
        &app,
        &format!("/api/e2ee/groups/{group_id}/status"),
        Some(&owner.token),
    )
    .await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(
        body["data"]["status"],
        json!("plaintext"),
        "group encryption should remain plaintext after failed enable"
    );
}

// ---------------------------------------------------------------------------
// 测试 3: 普通群成员 push sender key 给非群成员返回 403
// ---------------------------------------------------------------------------

#[tokio::test]
async fn test_e2ee_group_push_sender_key_to_nonmember_returns_403() {
    let app = test_app().await;
    let (group_id, _owner, member) = setup_group_with_member(&app).await;
    let outsider = register_and_login(&app).await;

    let device_id = unique_device_id();
    let (status, body) = post_json(
        &app,
        &format!("/api/e2ee/groups/{group_id}/sender-key"),
        Some(&member.token),
        &json!({
            "recipientId": outsider.user_id,
            "deviceId": &device_id,
            "encryptedSenderKey": "dGVzdF9rZXk="
        }),
    )
    .await;
    assert_eq!(status, StatusCode::FORBIDDEN, "expected 403: {body}");
    assert!(
        body["message"]
            .as_str()
            .unwrap_or("")
            .contains("not a group member"),
        "error message should mention 'not a group member': {body}"
    );
}

// ---------------------------------------------------------------------------
// 测试 4: 普通群成员 push sender key 给群成员成功（设备已注册）
// ---------------------------------------------------------------------------

#[tokio::test]
async fn test_e2ee_group_push_sender_key_to_member_succeeds() {
    let app = test_app().await;
    let (group_id, owner, member) = setup_group_with_member(&app).await;

    // 为 owner 注册设备
    let device_id = register_device(&app, &owner.token).await;

    let (status, body) = post_json(
        &app,
        &format!("/api/e2ee/groups/{group_id}/sender-key"),
        Some(&member.token),
        &json!({
            "recipientId": owner.user_id,
            "deviceId": &device_id,
            "encryptedSenderKey": "bWVtYmVyX2tleQ=="
        }),
    )
    .await;
    assert_eq!(status, StatusCode::OK, "push sender key failed: {body}");
    assert_eq!(body["success"], json!(true));
}

// ---------------------------------------------------------------------------
// 测试 5: device_id 属于其他用户时 enable 返回 403
// ---------------------------------------------------------------------------

#[tokio::test]
async fn test_e2ee_group_enable_device_belongs_to_other_user_returns_403() {
    let app = test_app().await;
    let (group_id, owner, member) = setup_group_with_member(&app).await;
    let other_user = register_and_login(&app).await;

    // 将 other_user 加入群组，使其通过成员校验
    let (status, _) = post_json(
        &app,
        &format!("/api/group/{group_id}/join"),
        Some(&other_user.token),
        &json!({}),
    )
    .await;
    assert_eq!(status, StatusCode::OK);

    // 为 other_user 注册设备
    let other_device_id = register_device(&app, &other_user.token).await;

    // 用 other_user 的 device_id 写给 member → 应该被 device 校验拦截
    let (status, body) = post_json(
        &app,
        &format!("/api/e2ee/groups/{group_id}/enable"),
        Some(&owner.token),
        &json!({
            "senderKeys": [{
                "recipientId": member.user_id,
                "deviceId": &other_device_id,
                "encryptedSenderKey": "dGVzdF9rZXk="
            }]
        }),
    )
    .await;
    assert_eq!(status, StatusCode::FORBIDDEN, "expected 403: {body}");
    assert!(
        body["message"]
            .as_str()
            .unwrap_or("")
            .contains("recipient device is not registered"),
        "error message should mention 'recipient device is not registered': {body}"
    );
}

// ---------------------------------------------------------------------------
// 测试 6: device_id 不存在时 enable 返回 403
// ---------------------------------------------------------------------------

#[tokio::test]
async fn test_e2ee_group_enable_device_not_exists_returns_403() {
    let app = test_app().await;
    let (group_id, owner, member) = setup_group_with_member(&app).await;

    let nonexistent_device = unique_device_id();
    let (status, body) = post_json(
        &app,
        &format!("/api/e2ee/groups/{group_id}/enable"),
        Some(&owner.token),
        &json!({
            "senderKeys": [{
                "recipientId": member.user_id,
                "deviceId": &nonexistent_device,
                "encryptedSenderKey": "dGVzdF9rZXk="
            }]
        }),
    )
    .await;
    assert_eq!(status, StatusCode::FORBIDDEN, "expected 403: {body}");
    assert!(
        body["message"]
            .as_str()
            .unwrap_or("")
            .contains("recipient device is not registered"),
        "error message should mention 'recipient device is not registered': {body}"
    );
}

// ---------------------------------------------------------------------------
// 测试 7: push sender key 时 device_id 属于其他用户返回 403
// ---------------------------------------------------------------------------

#[tokio::test]
async fn test_e2ee_group_push_device_belongs_to_other_user_returns_403() {
    let app = test_app().await;
    let (group_id, owner, member) = setup_group_with_member(&app).await;

    let other_user = register_and_login(&app).await;
    let (status, _) = post_json(
        &app,
        &format!("/api/group/{group_id}/join"),
        Some(&other_user.token),
        &json!({}),
    )
    .await;
    assert_eq!(status, StatusCode::OK);
    let other_device_id = register_device(&app, &other_user.token).await;

    // member 用 other_user 的 device_id push 给 owner → 应该被 device 校验拦截
    let (status, body) = post_json(
        &app,
        &format!("/api/e2ee/groups/{group_id}/sender-key"),
        Some(&member.token),
        &json!({
            "recipientId": owner.user_id,
            "deviceId": &other_device_id,
            "encryptedSenderKey": "dGVzdF9rZXk="
        }),
    )
    .await;
    assert_eq!(status, StatusCode::FORBIDDEN, "expected 403: {body}");
    assert!(
        body["message"]
            .as_str()
            .unwrap_or("")
            .contains("recipient device is not registered"),
        "error message should mention 'recipient device is not registered': {body}"
    );
}

async fn post_json_empty(
    app: &axum::Router,
    uri: &str,
    token: Option<&str>,
) -> (StatusCode, Value) {
    let mut builder = Request::builder()
        .uri(uri)
        .method("POST")
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
// 测试 8: 群成员能读取自己的 sender keys
// ---------------------------------------------------------------------------

#[tokio::test]
async fn test_e2ee_group_member_can_read_sender_keys() {
    let app = test_app().await;
    let (group_id, owner, member) = setup_group_with_member(&app).await;

    let device_id = register_device(&app, &member.token).await;

    // owner 启用群加密，写入 sender key 给 member
    let (status, _) = post_json(
        &app,
        &format!("/api/e2ee/groups/{group_id}/enable"),
        Some(&owner.token),
        &json!({
            "senderKeys": [{
                "recipientId": member.user_id,
                "deviceId": &device_id,
                "encryptedSenderKey": "dGVzdF9rZXk="
            }]
        }),
    )
    .await;
    assert_eq!(status, StatusCode::OK);

    // member 读取自己的 sender keys → 应该成功
    let (status, body) = get_json(
        &app,
        &format!("/api/e2ee/groups/{group_id}/sender-keys"),
        Some(&member.token),
    )
    .await;
    assert_eq!(status, StatusCode::OK, "read sender keys failed: {body}");
    assert_eq!(body["success"], json!(true));
    let keys = body["data"].as_array().unwrap();
    assert!(!keys.is_empty(), "should have at least one sender key");
}

// ---------------------------------------------------------------------------
// 测试 9: 退群后读取 sender keys 返回 403
// ---------------------------------------------------------------------------

#[tokio::test]
async fn test_e2ee_group_nonmember_read_sender_keys_returns_403() {
    let app = test_app().await;
    let (group_id, owner, member) = setup_group_with_member(&app).await;

    let device_id = register_device(&app, &member.token).await;

    // owner 启用群加密，写入 sender key 给 member
    let (status, _) = post_json(
        &app,
        &format!("/api/e2ee/groups/{group_id}/enable"),
        Some(&owner.token),
        &json!({
            "senderKeys": [{
                "recipientId": member.user_id,
                "deviceId": &device_id,
                "encryptedSenderKey": "dGVzdF9rZXk="
            }]
        }),
    )
    .await;
    assert_eq!(status, StatusCode::OK);

    // member 退群
    let (status, body) = post_json_empty(
        &app,
        &format!("/api/group/{group_id}/leave"),
        Some(&member.token),
    )
    .await;
    assert_eq!(status, StatusCode::OK, "leave group failed: {body}");

    // member 读取 sender keys → 应该返回 403
    let (status, body) = get_json(
        &app,
        &format!("/api/e2ee/groups/{group_id}/sender-keys"),
        Some(&member.token),
    )
    .await;
    assert_eq!(status, StatusCode::FORBIDDEN, "expected 403: {body}");
    assert!(
        body["message"]
            .as_str()
            .unwrap_or("")
            .contains("not a group member"),
        "error message should mention 'not a group member': {body}"
    );
}

// ---------------------------------------------------------------------------
// 测试 10: 退群后数据库中该用户相关 sender keys 被删除
// ---------------------------------------------------------------------------

#[tokio::test]
async fn test_e2ee_group_leave_deletes_sender_keys() {
    let app = test_app().await;
    let (group_id, owner, member) = setup_group_with_member(&app).await;

    let member_device = register_device(&app, &member.token).await;
    let owner_device = register_device(&app, &owner.token).await;

    // owner 启用群加密，互相写入 sender key
    let (status, _) = post_json(
        &app,
        &format!("/api/e2ee/groups/{group_id}/enable"),
        Some(&owner.token),
        &json!({
            "senderKeys": [
                {
                    "recipientId": member.user_id,
                    "deviceId": &member_device,
                    "encryptedSenderKey": "dGVzdF9rZXkx"
                },
                {
                    "recipientId": owner.user_id,
                    "deviceId": &owner_device,
                    "encryptedSenderKey": "dGVzdF9rZXky"
                }
            ]
        }),
    )
    .await;
    assert_eq!(status, StatusCode::OK);

    // member 退群
    let (status, body) = post_json_empty(
        &app,
        &format!("/api/group/{group_id}/leave"),
        Some(&member.token),
    )
    .await;
    assert_eq!(status, StatusCode::OK, "leave group failed: {body}");

    // owner 读取 sender keys → 应该成功，且只剩 owner 自己的
    let (status, body) = get_json(
        &app,
        &format!("/api/e2ee/groups/{group_id}/sender-keys"),
        Some(&owner.token),
    )
    .await;
    assert_eq!(
        status,
        StatusCode::OK,
        "owner read sender keys failed: {body}"
    );
    let keys = body["data"].as_array().unwrap();
    // member 的 sender key 应该被清理，owner 自己的应该保留
    for key in keys {
        assert_ne!(
            key["senderId"].as_str().unwrap(),
            member.user_id.to_string(),
            "member's sender key should have been deleted"
        );
    }
}

// ---------------------------------------------------------------------------
// 测试 11: 群成员查询加密状态成功
// ---------------------------------------------------------------------------

#[tokio::test]
async fn test_e2ee_group_status_member_succeeds() {
    let app = test_app().await;
    let (group_id, owner, member) = setup_group_with_member(&app).await;

    // member（普通群成员）查询状态 → 应成功，返回 plaintext
    let (status, body) = get_json(
        &app,
        &format!("/api/e2ee/groups/{group_id}/status"),
        Some(&member.token),
    )
    .await;
    assert_eq!(status, StatusCode::OK, "member query status failed: {body}");
    assert_eq!(body["data"]["status"], json!("plaintext"));
    assert_eq!(body["data"]["enabledBy"], Value::Null);

    // owner 启用加密后再查
    let device_id = register_device(&app, &member.token).await;
    let (status, _) = post_json(
        &app,
        &format!("/api/e2ee/groups/{group_id}/enable"),
        Some(&owner.token),
        &json!({
            "senderKeys": [{
                "recipientId": member.user_id,
                "deviceId": &device_id,
                "encryptedSenderKey": "dGVzdF9rZXk="
            }]
        }),
    )
    .await;
    assert_eq!(status, StatusCode::OK);

    let (status, body) = get_json(
        &app,
        &format!("/api/e2ee/groups/{group_id}/status"),
        Some(&member.token),
    )
    .await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(body["data"]["status"], json!("encrypted"));
    assert_eq!(
        body["data"]["enabledBy"].as_str().unwrap(),
        owner.user_id.to_string()
    );
}

// ---------------------------------------------------------------------------
// 测试 12: 非群成员查询加密状态返回 403
// ---------------------------------------------------------------------------

#[tokio::test]
async fn test_e2ee_group_status_nonmember_returns_403() {
    let app = test_app().await;
    let (group_id, _owner, _member) = setup_group_with_member(&app).await;
    let outsider = register_and_login(&app).await;

    let (status, body) = get_json(
        &app,
        &format!("/api/e2ee/groups/{group_id}/status"),
        Some(&outsider.token),
    )
    .await;
    assert_eq!(status, StatusCode::FORBIDDEN, "expected 403: {body}");
    assert!(
        body["message"]
            .as_str()
            .unwrap_or("")
            .contains("not a group member"),
        "error message should mention 'not a group member': {body}"
    );
}

// ---------------------------------------------------------------------------
// 测试 13: 不存在的 group_id 查询返回 403（成员校验先于状态查询）
// ---------------------------------------------------------------------------

#[tokio::test]
async fn test_e2ee_group_status_nonexistent_group_returns_403() {
    let app = test_app().await;
    let user = register_and_login(&app).await;

    // 不存在的 group_id → 成员校验失败 → 403（不泄露 group 是否存在）
    let (status, body) =
        get_json(&app, "/api/e2ee/groups/999999999/status", Some(&user.token)).await;
    assert_eq!(status, StatusCode::FORBIDDEN, "expected 403: {body}");
    assert!(
        body["message"]
            .as_str()
            .unwrap_or("")
            .contains("not a group member"),
        "error message should mention 'not a group member': {body}"
    );
}
