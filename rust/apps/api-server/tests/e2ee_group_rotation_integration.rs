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
        "e2gr{:0>12}",
        Uuid::new_v4().as_u64_pair().0 % 1_000_000_000_000
    )
}

fn unique_device_id() -> String {
    format!("dev_{}", Uuid::new_v4().as_simple())
}

async fn read_json(response: axum::response::Response<Body>) -> Value {
    let status = response.status();
    let bytes = to_bytes(response.into_body(), 10_000_000)
        .await
        .expect("read body");
    let text = String::from_utf8_lossy(&bytes);
    serde_json::from_slice(&bytes)
        .unwrap_or_else(|_| panic!("parse json failed for status {status}: {text:?}"))
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
            "oneTimePreKeys": make_otp_keys(&["otp1"]),
            "oneTimePreKeySignatures": [{"id": 1, "signature": ed25519_sig()}]
        }),
    )
    .await;
    assert_eq!(status, StatusCode::OK, "register_device failed: {body}");
    device_id
}

async fn setup_group_with_three_members(
    app: &axum::Router,
) -> (i64, AuthedUser, AuthedUser, AuthedUser) {
    let owner = register_and_login(app).await;
    let member_a = register_and_login(app).await;
    let member_b = register_and_login(app).await;

    let (status, body) = post_json(
        app,
        "/api/group/create",
        Some(&owner.token),
        &json!({"groupName": "E2EEGroup"}),
    )
    .await;
    assert_eq!(status, StatusCode::OK, "create group failed: {body}");
    let group_id: i64 = body["data"]["id"].as_str().unwrap().parse().unwrap();

    for member in [&member_a, &member_b] {
        let (status, body) = post_json(
            app,
            &format!("/api/group/{group_id}/join"),
            Some(&member.token),
            &json!({}),
        )
        .await;
        assert_eq!(status, StatusCode::OK, "join group failed: {body}");
    }

    (group_id, owner, member_a, member_b)
}

async fn db_pool() -> sqlx::MySqlPool {
    let url = std::env::var("DATABASE_URL").unwrap_or_else(|_| {
        "mysql://root:root123@127.0.0.1:3306/service_message_service_db".into()
    });
    sqlx::mysql::MySqlPoolOptions::new()
        .max_connections(2)
        .connect(&url)
        .await
        .expect("connect to test database")
}

async fn count_keys_for_recipient(group_id: i64, recipient_id: i64) -> i64 {
    sqlx::query_scalar(
        "SELECT COUNT(*) FROM service_user_service_db.e2ee_sender_keys \
         WHERE group_id = ? AND recipient_id = ?",
    )
    .bind(group_id)
    .bind(recipient_id)
    .fetch_one(&db_pool().await)
    .await
    .expect("count recipient keys")
}

async fn count_keys_for_sender(group_id: i64, sender_id: i64) -> i64 {
    sqlx::query_scalar(
        "SELECT COUNT(*) FROM service_user_service_db.e2ee_sender_keys \
         WHERE group_id = ? AND sender_id = ?",
    )
    .bind(group_id)
    .bind(sender_id)
    .fetch_one(&db_pool().await)
    .await
    .expect("count sender keys")
}

// ---------------------------------------------------------------------------
// Counter ratchet: repeated pushes of the same sender key must increment.
// ---------------------------------------------------------------------------
#[tokio::test]
async fn test_e2ee_group_counter_ratchets_on_push() {
    let app = test_app().await;
    let (group_id, owner, member, _other) = setup_group_with_three_members(&app).await;

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
        &format!("/api/e2ee/groups/{group_id}/sender-keys"),
        Some(&member.token),
    )
    .await;
    assert_eq!(status, StatusCode::OK);
    let keys = body["data"].as_array().expect("sender keys array");
    let key = keys
        .iter()
        .find(|k| k["senderId"].as_str() == Some(&owner.user_id.to_string()))
        .expect("owner key");
    assert_eq!(key["counter"], json!(0));

    // Owner pushes the same key again: counter should ratchet, not reset.
    let (status, body) = post_json(
        &app,
        &format!("/api/e2ee/groups/{group_id}/sender-key"),
        Some(&owner.token),
        &json!({
            "recipientId": member.user_id,
            "deviceId": &device_id,
            "encryptedSenderKey": "dGVzdF9rZXk="
        }),
    )
    .await;
    assert_eq!(status, StatusCode::OK, "push sender key failed: {body}");

    let (status, body) = get_json(
        &app,
        &format!("/api/e2ee/groups/{group_id}/sender-keys"),
        Some(&member.token),
    )
    .await;
    assert_eq!(status, StatusCode::OK);
    let keys = body["data"].as_array().expect("sender keys array");
    let key = keys
        .iter()
        .find(|k| k["senderId"].as_str() == Some(&owner.user_id.to_string()))
        .expect("owner key after push");
    assert_eq!(
        key["counter"],
        json!(1),
        "counter should ratchet forward on duplicate push"
    );
}

// ---------------------------------------------------------------------------
// Member removal must rotate the group epoch and only delete the removed
// member's sender keys; keys sent *to* the removed member must be preserved.
// ---------------------------------------------------------------------------
#[tokio::test]
async fn test_e2ee_group_remove_member_preserves_recipient_keys_and_rotates() {
    let app = test_app().await;
    let (group_id, owner, member_a, member_b) = setup_group_with_three_members(&app).await;

    let owner_device = register_device(&app, &owner.token).await;
    let member_a_device = register_device(&app, &member_a.token).await;
    let member_b_device = register_device(&app, &member_b.token).await;

    // Owner enables group encryption for all members.
    let (status, _) = post_json(
        &app,
        &format!("/api/e2ee/groups/{group_id}/enable"),
        Some(&owner.token),
        &json!({
            "senderKeys": [
                {"recipientId": owner.user_id, "deviceId": &owner_device, "encryptedSenderKey": "b3duZXJfa2V5"},
                {"recipientId": member_a.user_id, "deviceId": &member_a_device, "encryptedSenderKey": "b3duZXJfdG9fYQ=="},
                {"recipientId": member_b.user_id, "deviceId": &member_b_device, "encryptedSenderKey": "b3duZXJfdG9fYg=="}
            ]
        }),
    )
    .await;
    assert_eq!(status, StatusCode::OK);

    // member_a pushes a sender key to owner.
    let (status, _) = post_json(
        &app,
        &format!("/api/e2ee/groups/{group_id}/sender-key"),
        Some(&member_a.token),
        &json!({
            "recipientId": owner.user_id,
            "deviceId": &owner_device,
            "encryptedSenderKey": "YV90b19vd25lcg=="
        }),
    )
    .await;
    assert_eq!(status, StatusCode::OK);

    // member_b pushes a sender key to member_a.
    let (status, _) = post_json(
        &app,
        &format!("/api/e2ee/groups/{group_id}/sender-key"),
        Some(&member_b.token),
        &json!({
            "recipientId": member_a.user_id,
            "deviceId": &member_a_device,
            "encryptedSenderKey": "Yl90b19h"
        }),
    )
    .await;
    assert_eq!(status, StatusCode::OK);

    let recipient_keys_before = count_keys_for_recipient(group_id, member_a.user_id).await;
    assert!(recipient_keys_before > 0);
    let sender_keys_before = count_keys_for_sender(group_id, member_a.user_id).await;
    assert!(sender_keys_before > 0);

    // Record epoch before removal.
    let (status, body) = get_json(
        &app,
        &format!("/api/e2ee/groups/{group_id}/status"),
        Some(&owner.token),
    )
    .await;
    assert_eq!(status, StatusCode::OK);
    let epoch_before = body["data"]["epoch"]
        .as_i64()
        .expect("epoch before removal");

    // Admin removes member_a's sender keys.
    let (status, body) = delete_json(
        &app,
        &format!(
            "/api/e2ee/groups/{group_id}/sender-keys/{}",
            member_a.user_id
        ),
        Some(&owner.token),
    )
    .await;
    assert_eq!(
        status,
        StatusCode::OK,
        "remove member sender keys failed: {body}"
    );
    assert_eq!(body["success"], json!(true));

    // Epoch must increase so old keys are no longer served.
    let (status, body) = get_json(
        &app,
        &format!("/api/e2ee/groups/{group_id}/status"),
        Some(&owner.token),
    )
    .await;
    assert_eq!(status, StatusCode::OK);
    let epoch_after = body["data"]["epoch"].as_i64().expect("epoch after removal");
    assert!(
        epoch_after > epoch_before,
        "epoch should increase after member removal"
    );

    // Removed member's own sender keys are deleted.
    let sender_keys_after = count_keys_for_sender(group_id, member_a.user_id).await;
    assert_eq!(
        sender_keys_after, 0,
        "removed member's sender keys should be deleted"
    );

    // Keys where the removed member is the recipient are preserved.
    let recipient_keys_after = count_keys_for_recipient(group_id, member_a.user_id).await;
    assert_eq!(
        recipient_keys_after, recipient_keys_before,
        "recipient keys for removed member should be preserved"
    );
}
