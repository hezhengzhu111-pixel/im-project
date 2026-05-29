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
        "su{:0>13}",
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
        "nickname": "SettingsTester"
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
async fn test_get_settings_default() -> Result<(), Box<dyn std::error::Error>> {
    let app = test_app().await;
    let (_username, token) = register_and_login(&app).await?;

    let request = Request::builder()
        .uri("/api/user/settings")
        .method("GET")
        .header("Authorization", format!("Bearer {token}"))
        .body(Body::empty())?;
    let response = app.clone().oneshot(request).await?;
    assert_eq!(response.status(), StatusCode::OK);
    let json = read_json(response).await;
    assert_eq!(json["code"], 200);
    assert!(json["data"]["general"].is_object());
    Ok(())
}

#[tokio::test]
async fn test_update_settings() -> Result<(), Box<dyn std::error::Error>> {
    let app = test_app().await;
    let (_username, token) = register_and_login(&app).await?;

    let body = serde_json::to_string(&json!({
        "general": {
            "language": "en-US",
            "theme": "dark"
        }
    }))?;
    let request = Request::builder()
        .uri("/api/user/settings/general")
        .method("PUT")
        .header("Authorization", format!("Bearer {token}"))
        .header("Content-Type", "application/json")
        .body(Body::from(body))?;
    let response = app.clone().oneshot(request).await?;
    assert_eq!(response.status(), StatusCode::OK);
    let json = read_json(response).await;
    assert_eq!(json["code"], 200);
    Ok(())
}

#[tokio::test]
async fn test_get_settings_requires_auth() -> Result<(), Box<dyn std::error::Error>> {
    let app = test_app().await;
    let request = Request::builder()
        .uri("/api/user/settings")
        .method("GET")
        .body(Body::empty())?;
    let response = app.clone().oneshot(request).await?;
    assert_eq!(response.status(), StatusCode::UNAUTHORIZED);
    Ok(())
}

#[tokio::test]
async fn test_update_profile() -> Result<(), Box<dyn std::error::Error>> {
    let app = test_app().await;
    let (_username, token) = register_and_login(&app).await?;

    let body = serde_json::to_string(&json!({
        "nickname": "UpdatedName"
    }))?;
    let request = Request::builder()
        .uri("/api/user/profile")
        .method("PUT")
        .header("Authorization", format!("Bearer {token}"))
        .header("Content-Type", "application/json")
        .body(Body::from(body))?;
    let response = app.clone().oneshot(request).await?;
    assert_eq!(response.status(), StatusCode::OK);
    let json = read_json(response).await;
    assert_eq!(json["code"], 200);
    Ok(())
}

#[tokio::test]
async fn test_search_users() -> Result<(), Box<dyn std::error::Error>> {
    let app = test_app().await;
    let (username, token) = register_and_login(&app).await?;

    let request = Request::builder()
        .uri(&format!("/api/user/search?keyword={username}"))
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
async fn test_heartbeat_updates_status() -> Result<(), Box<dyn std::error::Error>> {
    let app = test_app().await;
    let (_username, token) = register_and_login(&app).await?;

    let request = Request::builder()
        .uri("/api/user/heartbeat")
        .method("POST")
        .header("Authorization", format!("Bearer {token}"))
        .body(Body::empty())?;
    let response = app.clone().oneshot(request).await?;
    assert_eq!(response.status(), StatusCode::OK);
    let json = read_json(response).await;
    assert_eq!(json["code"], 200);
    Ok(())
}

#[tokio::test]
async fn test_change_password() -> Result<(), Box<dyn std::error::Error>> {
    let app = test_app().await;
    let (_username, token) = register_and_login(&app).await?;

    let body = serde_json::to_string(&json!({
        "currentPassword": valid_password(),
        "newPassword": "NewPass456"
    }))?;
    let request = Request::builder()
        .uri("/api/user/password")
        .method("PUT")
        .header("Authorization", format!("Bearer {token}"))
        .header("Content-Type", "application/json")
        .body(Body::from(body))?;
    let response = app.clone().oneshot(request).await?;
    assert_eq!(response.status(), StatusCode::OK);
    Ok(())
}
