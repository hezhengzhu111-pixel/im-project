#![forbid(unsafe_code)]
#![cfg(feature = "integration-tests")]

use api_server_rs::config::AppConfig;
use api_server_rs::web;
use axum::body::{to_bytes, Body};
use axum::http::{Request, StatusCode};
use im_rs_common::auth::Claims;
use jsonwebtoken::{encode, Algorithm, EncodingKey, Header};
use serde_json::{json, Value};
use tower::ServiceExt;
use uuid::Uuid;

async fn test_app() -> axum::Router {
    web::create_test_app().await
}

fn unique_user() -> (i64, String) {
    let raw_id = Uuid::new_v4().as_u64_pair().0 % 1_000_000_000_000_000;
    let user_id = i64::try_from(raw_id).unwrap_or(1);
    let username = format!("push_{user_id}");
    (user_id, username)
}

async fn read_json(response: axum::response::Response<Body>) -> Value {
    let bytes = to_bytes(response.into_body(), 10_000_000)
        .await
        .expect("read body");
    serde_json::from_slice(&bytes).expect("parse json")
}

async fn issue_access_token(
    user_id: i64,
    username: &str,
) -> Result<String, Box<dyn std::error::Error>> {
    let config = AppConfig::from_env();
    let claims = Claims {
        user_id,
        username: username.to_string(),
        typ: "access".to_string(),
        jti: Some(Uuid::new_v4().to_string()),
        sub: Some(username.to_string()),
        iat: Some(1_000_000),
        exp: 9_999_999_999,
    };
    let token = encode(
        &Header::new(Algorithm::HS512),
        &claims,
        &EncodingKey::from_secret(config.jwt_secret.as_bytes()),
    )?;
    Ok(token)
}

#[tokio::test]
async fn register_and_rotate_push_device_token() -> Result<(), Box<dyn std::error::Error>> {
    let app = test_app().await;
    let (user_id, username) = unique_user();
    let token = issue_access_token(user_id, &username).await?;

    let register_request = Request::builder()
        .uri("/api/push/devices/register")
        .method("POST")
        .header("Content-Type", "application/json")
        .header("Authorization", format!("Bearer {token}"))
        .body(Body::from(serde_json::to_vec(&json!({
            "deviceId": "android-device-1",
            "platform": "ANDROID",
            "fcmToken": "token-v1",
            "appVersion": "0.0.1",
            "deviceModel": "Pixel 8",
            "osVersion": "Android 14",
            "locale": "zh-CN",
            "timezone": "Asia/Shanghai"
        }))?))?;
    let register_response = app.clone().oneshot(register_request).await?;
    assert_eq!(register_response.status(), StatusCode::OK);
    let register_json = read_json(register_response).await;
    assert_eq!(register_json["data"]["registered"], json!(true));
    assert_eq!(register_json["data"]["tokenVersion"], json!(1));

    let update_request = Request::builder()
        .uri("/api/push/devices/token")
        .method("PUT")
        .header("Content-Type", "application/json")
        .header("Authorization", format!("Bearer {token}"))
        .body(Body::from(serde_json::to_vec(&json!({
            "deviceId": "android-device-1",
            "oldToken": "token-v1",
            "newToken": "token-v2"
        }))?))?;
    let update_response = app.clone().oneshot(update_request).await?;
    assert_eq!(update_response.status(), StatusCode::OK);
    let update_json = read_json(update_response).await;
    assert_eq!(update_json["data"]["updated"], json!(true));
    assert_eq!(update_json["data"]["tokenVersion"], json!(2));

    Ok(())
}

#[tokio::test]
async fn unregister_push_device_is_idempotent() -> Result<(), Box<dyn std::error::Error>> {
    let app = test_app().await;
    let (user_id, username) = unique_user();
    let token = issue_access_token(user_id, &username).await?;

    let unregister_request = |reason: &str| {
        Request::builder()
            .uri("/api/push/devices/unregister")
            .method("POST")
            .header("Content-Type", "application/json")
            .header("Authorization", format!("Bearer {token}"))
            .body(Body::from(
                serde_json::to_vec(&json!({
                    "deviceId": "android-device-2",
                    "fcmToken": "token-v1",
                    "reason": reason
                }))
                .expect("serialize unregister request"),
            ))
            .expect("build unregister request")
    };

    let first_response = app.clone().oneshot(unregister_request("LOGOUT")).await?;
    assert_eq!(first_response.status(), StatusCode::OK);
    let second_response = app.clone().oneshot(unregister_request("LOGOUT")).await?;
    assert_eq!(second_response.status(), StatusCode::OK);

    Ok(())
}

#[tokio::test]
async fn push_settings_round_trip() -> Result<(), Box<dyn std::error::Error>> {
    let app = test_app().await;
    let (user_id, username) = unique_user();
    let token = issue_access_token(user_id, &username).await?;

    let default_request = Request::builder()
        .uri("/api/push/settings")
        .method("GET")
        .header("Authorization", format!("Bearer {token}"))
        .body(Body::empty())?;
    let default_response = app.clone().oneshot(default_request).await?;
    assert_eq!(default_response.status(), StatusCode::OK);
    let default_json = read_json(default_response).await;
    assert_eq!(default_json["data"]["enabled"], json!(true));
    assert_eq!(default_json["data"]["soundEnabled"], json!(true));

    let update_request = Request::builder()
        .uri("/api/push/settings")
        .method("PUT")
        .header("Content-Type", "application/json")
        .header("Authorization", format!("Bearer {token}"))
        .body(Body::from(serde_json::to_vec(&json!({
            "enabled": false,
            "soundEnabled": false,
            "showPreview": false,
            "mutedConversationIds": ["private_1_2", "group_9"],
            "androidChannelPolicy": {
                "messages": "im-messages",
                "friendEvents": "im-social",
                "system": "im-system"
            }
        }))?))?;
    let update_response = app.clone().oneshot(update_request).await?;
    assert_eq!(update_response.status(), StatusCode::OK);

    let get_request = Request::builder()
        .uri("/api/push/settings")
        .method("GET")
        .header("Authorization", format!("Bearer {token}"))
        .body(Body::empty())?;
    let get_response = app.clone().oneshot(get_request).await?;
    assert_eq!(get_response.status(), StatusCode::OK);
    let get_json = read_json(get_response).await;
    assert_eq!(get_json["data"]["enabled"], json!(false));
    assert_eq!(get_json["data"]["soundEnabled"], json!(false));
    assert_eq!(get_json["data"]["showPreview"], json!(false));
    assert_eq!(
        get_json["data"]["mutedConversationIds"],
        json!(["private_1_2", "group_9"])
    );

    Ok(())
}
