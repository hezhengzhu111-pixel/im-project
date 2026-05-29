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
        "ai{:0>13}",
        Uuid::new_v4().as_u64_pair().0 % 1_000_000_000_000_000
    )
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

async fn register_and_login(
    app: &axum::Router,
) -> Result<(String, String), Box<dyn std::error::Error>> {
    let username = unique_username();
    let body = serde_json::to_string(&json!({
        "username": &username,
        "password": valid_password(),
        "nickname": "AITester"
    }))?;
    let request = Request::builder()
        .uri("/api/user/register")
        .method("POST")
        .header("Content-Type", "application/json")
        .body(Body::from(body))?;
    let response = app.clone().oneshot(request).await?;
    assert_eq!(response.status(), StatusCode::OK);

    let body = serde_json::to_string(&json!({
        "username": &username,
        "password": valid_password()
    }))?;
    let request = Request::builder()
        .uri("/api/user/login")
        .method("POST")
        .header("Content-Type", "application/json")
        .body(Body::from(body))?;
    let response = app.clone().oneshot(request).await?;
    assert_eq!(response.status(), StatusCode::OK);
    let json = read_json(response).await;
    let token = json["data"]["token"].as_str().unwrap_or("").to_string();
    Ok((username, token))
}

#[tokio::test]
async fn test_ai_settings_requires_auth() -> Result<(), Box<dyn std::error::Error>> {
    let app = test_app().await;
    let request = Request::builder()
        .uri("/api/ai/settings")
        .method("GET")
        .body(Body::empty())?;
    let response = app.clone().oneshot(request).await?;
    assert_eq!(response.status(), StatusCode::UNAUTHORIZED);
    Ok(())
}

#[tokio::test]
async fn test_ai_settings_authenticated() -> Result<(), Box<dyn std::error::Error>> {
    let app = test_app().await;
    let (_username, token) = register_and_login(&app).await?;

    let request = Request::builder()
        .uri("/api/ai/settings")
        .method("GET")
        .header("Authorization", format!("Bearer {token}"))
        .body(Body::empty())?;
    let response = app.clone().oneshot(request).await?;
    assert_eq!(response.status(), StatusCode::OK);
    let json = read_json(response).await;
    assert_eq!(json["code"], 200);
    Ok(())
}

#[tokio::test]
async fn test_ai_settings_update() -> Result<(), Box<dyn std::error::Error>> {
    let app = test_app().await;
    let (_username, token) = register_and_login(&app).await?;

    let body = serde_json::to_string(&json!({
        "autoReplyEnabled": false,
        "persona": "friendly"
    }))?;
    let request = Request::builder()
        .uri("/api/ai/settings")
        .method("PUT")
        .header("Authorization", format!("Bearer {token}"))
        .header("Content-Type", "application/json")
        .body(Body::from(body))?;
    let response = app.clone().oneshot(request).await?;
    let status = response.status();
    let json = read_json(response).await;
    // May return 200 on success or 503 if AI service not available
    assert!(
        status == StatusCode::OK || status == StatusCode::SERVICE_UNAVAILABLE,
        "expected 200 or 503, got {status}"
    );
    assert!(json["code"].is_number());
    Ok(())
}

#[tokio::test]
async fn test_ai_api_key_management() -> Result<(), Box<dyn std::error::Error>> {
    let app = test_app().await;
    let (_username, token) = register_and_login(&app).await?;

    let request = Request::builder()
        .uri("/api/ai/keys")
        .method("GET")
        .header("Authorization", format!("Bearer {token}"))
        .body(Body::empty())?;
    let response = app.clone().oneshot(request).await?;
    assert_eq!(response.status(), StatusCode::OK);
    let json = read_json(response).await;
    assert_eq!(json["code"], 200);
    Ok(())
}

#[tokio::test]
async fn test_ai_auto_reply_requires_auth() -> Result<(), Box<dyn std::error::Error>> {
    let app = test_app().await;
    let body = serde_json::to_string(&json!({
        "conversationId": "p_1_2",
        "content": "hello"
    }))?;
    let request = Request::builder()
        .uri("/api/ai/chat/auto-reply")
        .method("POST")
        .header("Content-Type", "application/json")
        .body(Body::from(body))?;
    let response = app.clone().oneshot(request).await?;
    assert_eq!(response.status(), StatusCode::UNAUTHORIZED);
    Ok(())
}
