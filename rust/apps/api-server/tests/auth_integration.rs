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
        "t{:0>15}",
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

#[tokio::test]
async fn test_register_success() -> Result<(), Box<dyn std::error::Error>> {
    let app = test_app().await;
    let username = unique_username();
    let body_str = serde_json::to_string(&json!({
        "username": &username,
        "password": valid_password(),
        "nickname": "Tester"
    }))?;

    let request = Request::builder()
        .uri("/api/user/register")
        .method("POST")
        .header("Content-Type", "application/json")
        .body(Body::from(body_str))?;

    let response = app.clone().oneshot(request).await?;
    assert_eq!(response.status(), StatusCode::OK);

    let json = read_json(response).await;
    assert_eq!(json["success"], json!(true));
    assert_eq!(json["data"]["username"], json!(&username));
    Ok(())
}

#[tokio::test]
async fn test_register_duplicate_username() -> Result<(), Box<dyn std::error::Error>> {
    let app = test_app().await;
    let username = unique_username();
    let body_str = serde_json::to_string(&json!({
        "username": &username,
        "password": valid_password(),
    }))?;

    let request = Request::builder()
        .uri("/api/user/register")
        .method("POST")
        .header("Content-Type", "application/json")
        .body(Body::from(body_str.clone()))?;

    let first = app.clone().oneshot(request).await?;
    assert_eq!(first.status(), StatusCode::OK);

    let request2 = Request::builder()
        .uri("/api/user/register")
        .method("POST")
        .header("Content-Type", "application/json")
        .body(Body::from(body_str))?;

    let second = app.clone().oneshot(request2).await?;
    assert_eq!(second.status(), StatusCode::CONFLICT);
    Ok(())
}

#[tokio::test]
async fn test_register_weak_password() -> Result<(), Box<dyn std::error::Error>> {
    let app = test_app().await;
    let username = unique_username();
    // Password without letters — digits only
    let body_str = serde_json::to_string(&json!({
        "username": &username,
        "password": "12345678",
    }))?;

    let request = Request::builder()
        .uri("/api/user/register")
        .method("POST")
        .header("Content-Type", "application/json")
        .body(Body::from(body_str))?;

    let response = app.clone().oneshot(request).await?;
    assert_eq!(response.status(), StatusCode::BAD_REQUEST);
    Ok(())
}

#[tokio::test]
async fn test_register_short_username() -> Result<(), Box<dyn std::error::Error>> {
    let app = test_app().await;
    let body_str = serde_json::to_string(&json!({
        "username": "",
        "password": valid_password(),
    }))?;

    let request = Request::builder()
        .uri("/api/user/register")
        .method("POST")
        .header("Content-Type", "application/json")
        .body(Body::from(body_str))?;

    let response = app.clone().oneshot(request).await?;
    assert_eq!(response.status(), StatusCode::BAD_REQUEST);
    Ok(())
}

#[tokio::test]
async fn test_login_success() -> Result<(), Box<dyn std::error::Error>> {
    let app = test_app().await;
    let username = unique_username();
    let password = valid_password();

    // Register
    let reg_str = serde_json::to_string(&json!({
        "username": &username,
        "password": password,
    }))?;
    let reg_request = Request::builder()
        .uri("/api/user/register")
        .method("POST")
        .header("Content-Type", "application/json")
        .body(Body::from(reg_str))?;
    let reg_response = app.clone().oneshot(reg_request).await?;
    assert_eq!(reg_response.status(), StatusCode::OK);

    // Login
    let login_str = serde_json::to_string(&json!({
        "username": &username,
        "password": password,
    }))?;
    let login_request = Request::builder()
        .uri("/api/user/login")
        .method("POST")
        .header("Content-Type", "application/json")
        .body(Body::from(login_str))?;
    let login_response = app.clone().oneshot(login_request).await?;
    assert_eq!(login_response.status(), StatusCode::OK);

    let json = read_json(login_response).await;
    assert_eq!(json["success"], json!(true));
    assert_eq!(json["data"]["success"], json!(true));
    let token = json["data"]["token"]
        .as_str()
        .ok_or_else(|| "login token missing".to_string())?;
    assert!(!token.is_empty());
    Ok(())
}

#[tokio::test]
async fn test_login_wrong_password() -> Result<(), Box<dyn std::error::Error>> {
    let app = test_app().await;
    let username = unique_username();

    // Register
    let reg_str = serde_json::to_string(&json!({
        "username": &username,
        "password": valid_password(),
    }))?;
    let reg_request = Request::builder()
        .uri("/api/user/register")
        .method("POST")
        .header("Content-Type", "application/json")
        .body(Body::from(reg_str))?;
    let reg_response = app.clone().oneshot(reg_request).await?;
    assert_eq!(reg_response.status(), StatusCode::OK);

    // Login with wrong password
    let login_str = serde_json::to_string(&json!({
        "username": &username,
        "password": "WrongPass1",
    }))?;
    let login_request = Request::builder()
        .uri("/api/user/login")
        .method("POST")
        .header("Content-Type", "application/json")
        .body(Body::from(login_str))?;
    let login_response = app.clone().oneshot(login_request).await?;
    assert_eq!(login_response.status(), StatusCode::UNAUTHORIZED);
    Ok(())
}

#[tokio::test]
async fn test_login_nonexistent_user() -> Result<(), Box<dyn std::error::Error>> {
    let app = test_app().await;
    let username = unique_username();

    let login_str = serde_json::to_string(&json!({
        "username": &username,
        "password": valid_password(),
    }))?;
    let login_request = Request::builder()
        .uri("/api/user/login")
        .method("POST")
        .header("Content-Type", "application/json")
        .body(Body::from(login_str))?;
    let login_response = app.clone().oneshot(login_request).await?;
    assert_eq!(login_response.status(), StatusCode::UNAUTHORIZED);
    Ok(())
}

#[tokio::test]
async fn test_refresh_success() -> Result<(), Box<dyn std::error::Error>> {
    let app = test_app().await;
    let username = unique_username();
    let password = valid_password();

    // Register
    let reg_str = serde_json::to_string(&json!({
        "username": &username,
        "password": password,
    }))?;
    let reg_request = Request::builder()
        .uri("/api/user/register")
        .method("POST")
        .header("Content-Type", "application/json")
        .body(Body::from(reg_str))?;
    let reg_response = app.clone().oneshot(reg_request).await?;
    assert_eq!(reg_response.status(), StatusCode::OK);

    // Login to get refresh token
    let login_str = serde_json::to_string(&json!({
        "username": &username,
        "password": password,
    }))?;
    let login_request = Request::builder()
        .uri("/api/user/login")
        .method("POST")
        .header("Content-Type", "application/json")
        .body(Body::from(login_str))?;
    let login_response = app.clone().oneshot(login_request).await?;
    assert_eq!(login_response.status(), StatusCode::OK);
    let login_json = read_json(login_response).await;
    let refresh_token = login_json["data"]["refreshToken"]
        .as_str()
        .ok_or_else(|| "refreshToken missing".to_string())?;

    // Refresh
    let refresh_str = serde_json::to_string(&json!({
        "refreshToken": refresh_token,
    }))?;
    let refresh_request = Request::builder()
        .uri("/api/auth/refresh")
        .method("POST")
        .header("Content-Type", "application/json")
        .body(Body::from(refresh_str))?;
    let refresh_response = app.clone().oneshot(refresh_request).await?;
    assert_eq!(refresh_response.status(), StatusCode::OK);

    // 响应 header 必须包含 Set-Cookie（HttpOnly 下发 token）
    let set_cookie = refresh_response
        .headers()
        .get("set-cookie")
        .expect("Set-Cookie header must be present")
        .to_str()
        .unwrap();
    assert!(set_cookie.contains("HttpOnly"), "cookie must be HttpOnly");

    let refresh_json = read_json(refresh_response).await;
    assert_eq!(refresh_json["success"], json!(true));
    // 响应体不得暴露 token
    assert!(
        refresh_json["data"]["token"].is_null(),
        "token must not be in response body"
    );
    assert!(
        refresh_json["data"]["refresh_token"].is_null(),
        "refresh_token must not be in response body"
    );
    // 新字段
    assert_eq!(refresh_json["data"]["authenticated"], json!(true));
    assert!(
        refresh_json["data"]["expiresInMs"].as_i64().is_some(),
        "expiresInMs must be present"
    );
    Ok(())
}

#[tokio::test]
async fn test_refresh_expired_token() -> Result<(), Box<dyn std::error::Error>> {
    let app = test_app().await;

    // Use a completely invalid/expired refresh token
    let refresh_str = serde_json::to_string(&json!({
        "refreshToken": "invalid_refresh_token_value",
    }))?;
    let refresh_request = Request::builder()
        .uri("/api/auth/refresh")
        .method("POST")
        .header("Content-Type", "application/json")
        .body(Body::from(refresh_str))?;
    let refresh_response = app.clone().oneshot(refresh_request).await?;
    assert_eq!(refresh_response.status(), StatusCode::UNAUTHORIZED);
    Ok(())
}

#[tokio::test]
async fn test_parse_valid_token() -> Result<(), Box<dyn std::error::Error>> {
    let app = test_app().await;
    let username = unique_username();
    let password = valid_password();

    // Register
    let reg_str = serde_json::to_string(&json!({
        "username": &username,
        "password": password,
    }))?;
    let reg_request = Request::builder()
        .uri("/api/user/register")
        .method("POST")
        .header("Content-Type", "application/json")
        .body(Body::from(reg_str))?;
    let reg_response = app.clone().oneshot(reg_request).await?;
    assert_eq!(reg_response.status(), StatusCode::OK);

    // Login to get access token
    let login_str = serde_json::to_string(&json!({
        "username": &username,
        "password": password,
    }))?;
    let login_request = Request::builder()
        .uri("/api/user/login")
        .method("POST")
        .header("Content-Type", "application/json")
        .body(Body::from(login_str))?;
    let login_response = app.clone().oneshot(login_request).await?;
    assert_eq!(login_response.status(), StatusCode::OK);
    let login_json = read_json(login_response).await;
    let access_token = login_json["data"]["token"]
        .as_str()
        .ok_or_else(|| "access token missing".to_string())?;

    // Parse
    let parse_str = serde_json::to_string(&json!({
        "token": access_token,
    }))?;
    let parse_request = Request::builder()
        .uri("/api/auth/parse")
        .method("POST")
        .header("Content-Type", "application/json")
        .body(Body::from(parse_str))?;
    let parse_response = app.clone().oneshot(parse_request).await?;
    assert_eq!(parse_response.status(), StatusCode::OK);

    let parse_json = read_json(parse_response).await;
    assert_eq!(parse_json["success"], json!(true));
    assert_eq!(parse_json["data"]["valid"], json!(true));
    assert_eq!(parse_json["data"]["expired"], json!(false));
    Ok(())
}
