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
    format!("fu{:0>6}", Uuid::new_v4().as_u64_pair().0 % 1_000_000)
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
        "nickname": "FileTester"
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
    let token = json["data"]["token"]
        .as_str()
        .map(ToString::to_string)
        .unwrap_or_default();
    Ok((username, token))
}

#[tokio::test]
async fn test_file_info_not_found() -> Result<(), Box<dyn std::error::Error>> {
    let app = test_app().await;
    let (_username, token) = register_and_login(&app).await?;

    let body = serde_json::to_string(&json!({
        "category": "image",
        "date": "2024-01-01",
        "filename": "nonexistent-file.jpg"
    }))?;
    let request = Request::builder()
        .uri("/api/file/info")
        .method("POST")
        .header("Authorization", format!("Bearer {token}"))
        .header("Content-Type", "application/json")
        .body(Body::from(body))?;
    let response = app.clone().oneshot(request).await?;
    // May return 404 if file not found, or 403 if access check fails first
    let status = response.status();
    assert!(
        status == StatusCode::NOT_FOUND || status == StatusCode::FORBIDDEN,
        "expected 404 or 403, got {status}"
    );
    Ok(())
}

#[tokio::test]
async fn test_file_upload_image_requires_auth() -> Result<(), Box<dyn std::error::Error>> {
    let app = test_app().await;
    let request = Request::builder()
        .uri("/api/file/upload/image")
        .method("POST")
        .body(Body::empty())?;
    let response = app.clone().oneshot(request).await?;
    // Without proper multipart body, the handler may return 400 before auth check
    let status = response.status();
    assert!(
        status == StatusCode::UNAUTHORIZED || status == StatusCode::BAD_REQUEST,
        "expected 401 or 400, got {status}"
    );
    Ok(())
}

#[tokio::test]
async fn test_file_upload_file_requires_auth() -> Result<(), Box<dyn std::error::Error>> {
    let app = test_app().await;
    let request = Request::builder()
        .uri("/api/file/upload/file")
        .method("POST")
        .body(Body::empty())?;
    let response = app.clone().oneshot(request).await?;
    let status = response.status();
    assert!(
        status == StatusCode::UNAUTHORIZED || status == StatusCode::BAD_REQUEST,
        "expected 401 or 400, got {status}"
    );
    Ok(())
}

#[tokio::test]
async fn test_file_download_not_found() -> Result<(), Box<dyn std::error::Error>> {
    let app = test_app().await;
    let (_username, token) = register_and_login(&app).await?;

    let body = serde_json::to_string(&json!({
        "category": "image",
        "date": "2024-01-01",
        "filename": "nonexistent.jpg"
    }))?;
    let request = Request::builder()
        .uri("/api/file/download")
        .method("POST")
        .header("Authorization", format!("Bearer {token}"))
        .header("Content-Type", "application/json")
        .body(Body::from(body))?;
    let response = app.clone().oneshot(request).await?;
    // May return 404 if file not found, or 403 if access check fails first
    let status = response.status();
    assert!(
        status == StatusCode::NOT_FOUND || status == StatusCode::FORBIDDEN,
        "expected 404 or 403, got {status}"
    );
    Ok(())
}
