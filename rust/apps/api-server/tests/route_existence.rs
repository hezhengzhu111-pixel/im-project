#![forbid(unsafe_code)]
#![cfg(feature = "integration-tests")]

use api_server_rs::config::AppConfig;
use axum::body::{to_bytes, Body};
use axum::http::{Request, StatusCode};
use im_common::auth::Claims;
use jsonwebtoken::{encode, Algorithm, EncodingKey, Header};
use tower::ServiceExt;
use uuid::Uuid;

async fn test_app() -> axum::Router {
    api_server_rs::web::create_test_app().await
}

fn issue_access_token(user_id: i64, username: &str) -> String {
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
    encode(
        &Header::new(Algorithm::HS512),
        &claims,
        &EncodingKey::from_secret(config.jwt_secret.as_bytes()),
    )
    .expect("encode test token")
}

fn authed_request(method: &str, uri: &str) -> Request<Body> {
    let token = issue_access_token(1, "test_user");
    Request::builder()
        .uri(uri)
        .method(method)
        .header("Authorization", format!("Bearer {token}"))
        .body(Body::empty())
        .unwrap()
}

async fn response_text(response: axum::response::Response<Body>) -> String {
    let bytes = to_bytes(response.into_body(), 1_000_000)
        .await
        .expect("read response body");
    String::from_utf8_lossy(&bytes).to_string()
}

// ---------------------------------------------------------------------------
// New-path existence tests (strong): prove handler actually executes.
//
// These send a valid JWT so the gateway auth passes and the request reaches
// the axum route handler.  A handler that runs will return a business error
// (400 Bad Request, 422, 500, etc.) — NOT 404 (which only comes from the
// proxy fallback) and NOT 401 (which only comes from missing/invalid auth).
//
// Assertion: status is neither 404 nor 401 — proves the route exists.
// ---------------------------------------------------------------------------

#[tokio::test]
async fn test_route_user_login_exists() {
    let app = test_app().await;
    let response = app
        .oneshot(authed_request("POST", "/api/user/login"))
        .await
        .unwrap();
    assert!(
        response.status() != StatusCode::NOT_FOUND && response.status() != StatusCode::UNAUTHORIZED,
        "route /api/user/login should exist and reach the handler, got {}",
        response.status()
    );
}

#[tokio::test]
async fn test_route_message_send_private_exists() {
    let app = test_app().await;
    let response = app
        .oneshot(authed_request("POST", "/api/message/send/private"))
        .await
        .unwrap();
    assert!(
        response.status() != StatusCode::NOT_FOUND && response.status() != StatusCode::UNAUTHORIZED,
        "route /api/message/send/private should exist and reach the handler, got {}",
        response.status()
    );
}

#[tokio::test]
async fn test_route_e2ee_group_status_exists() {
    let app = test_app().await;
    let response = app
        .oneshot(authed_request("GET", "/api/e2ee/groups/123/status"))
        .await
        .unwrap();
    assert!(
        response.status() != StatusCode::NOT_FOUND && response.status() != StatusCode::UNAUTHORIZED,
        "route /api/e2ee/groups/:group_id/status should exist and reach the handler, got {}",
        response.status()
    );
}

#[tokio::test]
async fn test_route_ai_settings_exists() {
    let app = test_app().await;
    let response = app
        .oneshot(authed_request("GET", "/api/ai/settings"))
        .await
        .unwrap();
    assert!(
        response.status() != StatusCode::NOT_FOUND && response.status() != StatusCode::UNAUTHORIZED,
        "route /api/ai/settings should exist and reach the handler, got {}",
        response.status()
    );
}

#[tokio::test]
async fn test_route_push_register_exists() {
    let app = test_app().await;
    let response = app
        .oneshot(authed_request("POST", "/api/push/devices/register"))
        .await
        .unwrap();
    assert!(
        response.status() != StatusCode::NOT_FOUND && response.status() != StatusCode::UNAUTHORIZED,
        "route /api/push/devices/register should exist and reach the handler, got {}",
        response.status()
    );
}

#[tokio::test]
async fn test_route_push_settings_exists() {
    let app = test_app().await;
    let response = app
        .oneshot(authed_request("GET", "/api/push/settings"))
        .await
        .unwrap();
    assert!(
        response.status() != StatusCode::NOT_FOUND && response.status() != StatusCode::UNAUTHORIZED,
        "route /api/push/settings should exist and reach the handler, got {}",
        response.status()
    );
}

#[tokio::test]
async fn test_route_friend_list_exists() {
    let app = test_app().await;
    let response = app
        .oneshot(authed_request("GET", "/api/friend/list"))
        .await
        .unwrap();
    assert!(
        response.status() != StatusCode::NOT_FOUND && response.status() != StatusCode::UNAUTHORIZED,
        "route /api/friend/list should exist and reach the handler, got {}",
        response.status()
    );
}

#[tokio::test]
async fn test_route_moments_feed_exists() {
    let app = test_app().await;
    let response = app
        .oneshot(authed_request("GET", "/api/moments/feed"))
        .await
        .unwrap();
    assert!(
        response.status() != StatusCode::NOT_FOUND && response.status() != StatusCode::UNAUTHORIZED,
        "route /api/moments/feed should exist and reach the handler, got {}",
        response.status()
    );
}

#[tokio::test]
async fn test_route_e2ee_conversation_session_exists() {
    let app = test_app().await;
    let response = app
        .oneshot(authed_request(
            "GET",
            "/api/e2ee/conversations/p_1_2/session",
        ))
        .await
        .unwrap();
    let status = response.status();
    let body = response_text(response).await;
    assert!(
        status != StatusCode::UNAUTHORIZED
            && (status != StatusCode::NOT_FOUND || body.contains("e2ee session not found")),
        "route /api/e2ee/conversations/:conversation_id/session should exist and reach the handler, got {status} with {body}",
    );
}

#[tokio::test]
async fn test_route_e2ee_conversation_rotate_exists() {
    let app = test_app().await;
    let response = app
        .oneshot(authed_request(
            "POST",
            "/api/e2ee/conversations/p_1_2/rotate",
        ))
        .await
        .unwrap();
    assert!(
        response.status() != StatusCode::NOT_FOUND && response.status() != StatusCode::UNAUTHORIZED,
        "route /api/e2ee/conversations/:conversation_id/rotate should exist and reach the handler, got {}",
        response.status()
    );
}

#[tokio::test]
async fn test_route_e2ee_remove_group_sender_key_exists() {
    let app = test_app().await;
    let response = app
        .oneshot(authed_request(
            "DELETE",
            "/api/e2ee/groups/123/sender-keys/456",
        ))
        .await
        .unwrap();
    assert!(
        response.status() != StatusCode::NOT_FOUND && response.status() != StatusCode::UNAUTHORIZED,
        "route /api/e2ee/groups/:group_id/sender-keys/:user_id should exist and reach the handler, got {}",
        response.status()
    );
}

#[tokio::test]
async fn test_route_e2ee_devices_by_user_exists() {
    let app = test_app().await;
    let response = app
        .oneshot(authed_request("GET", "/api/e2ee/devices/123"))
        .await
        .unwrap();
    assert!(
        response.status() != StatusCode::NOT_FOUND && response.status() != StatusCode::UNAUTHORIZED,
        "route /api/e2ee/devices/:user_id should exist and reach the handler, got {}",
        response.status()
    );
}

#[tokio::test]
async fn test_route_e2ee_group_devices_exists() {
    let app = test_app().await;
    let response = app
        .oneshot(authed_request("GET", "/api/e2ee/groups/123/devices"))
        .await
        .unwrap();
    assert!(
        response.status() != StatusCode::NOT_FOUND && response.status() != StatusCode::UNAUTHORIZED,
        "route /api/e2ee/groups/:group_id/devices should exist and reach the handler, got {}",
        response.status()
    );
}

#[tokio::test]
async fn test_route_message_group_cursor_exists() {
    let app = test_app().await;
    let response = app
        .oneshot(authed_request(
            "GET",
            "/api/message/group/123/cursor?size=20",
        ))
        .await
        .unwrap();
    let status = response.status();
    let body = response_text(response).await;
    assert!(
        status != StatusCode::UNAUTHORIZED
            && (status != StatusCode::NOT_FOUND || body.contains("group not found")),
        "route /api/message/group/:group_id/cursor should exist and reach the handler, got {status} with {body}",
    );
}

#[tokio::test]
async fn test_route_moments_media_exists() {
    let app = test_app().await;
    let response = app
        .oneshot(authed_request("POST", "/api/moments/123/media"))
        .await
        .unwrap();
    assert!(
        response.status() != StatusCode::NOT_FOUND && response.status() != StatusCode::UNAUTHORIZED,
        "route /api/moments/:id/media should exist and reach the handler, got {}",
        response.status()
    );
}

#[tokio::test]
async fn test_route_auth_refresh_exists() {
    let app = test_app().await;
    let response = app
        .oneshot(authed_request("POST", "/api/auth/refresh"))
        .await
        .unwrap();
    // /api/auth/refresh is gateway-whitelisted; the handler itself validates the
    // refresh token and returns 401 when absent.  A 401 from the *handler*
    // (not the gateway) still proves the route was matched — so we only exclude 404.
    assert_ne!(
        response.status(),
        StatusCode::NOT_FOUND,
        "route /api/auth/refresh should exist, got {}",
        response.status()
    );
}

#[tokio::test]
async fn test_route_file_upload_exists() {
    let app = test_app().await;
    let response = app
        .oneshot(authed_request("POST", "/api/file/upload/image"))
        .await
        .unwrap();
    assert!(
        response.status() != StatusCode::NOT_FOUND && response.status() != StatusCode::UNAUTHORIZED,
        "route /api/file/upload/image should exist and reach the handler, got {}",
        response.status()
    );
}

#[tokio::test]
async fn test_route_health_exists() {
    let app = test_app().await;
    let response = app
        .oneshot(
            Request::builder()
                .uri("/health")
                .method("GET")
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(response.status(), StatusCode::OK);
}

#[tokio::test]
async fn test_route_ready_exists() {
    let app = test_app().await;
    let response = app
        .oneshot(
            Request::builder()
                .uri("/ready")
                .method("GET")
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(response.status(), StatusCode::OK);
}

// ---------------------------------------------------------------------------
// Unknown route: proves the proxy fallback returns 404 for truly non-existent
// paths when auth is valid (route_target() returns None → AppError::NotFound).
// ---------------------------------------------------------------------------

#[tokio::test]
async fn test_unknown_route_returns_not_found() {
    let app = test_app().await;
    let response = app
        .oneshot(authed_request("GET", "/api/nonexistent/route"))
        .await
        .unwrap();
    assert_eq!(
        response.status(),
        StatusCode::NOT_FOUND,
        "unknown routes should return 404"
    );
}

// ---------------------------------------------------------------------------
// Old-path rejection tests (strong): prove legacy non-/api routes are gone.
//
// These send a valid JWT so the gateway auth in the proxy fallback passes.
// Because the old routes are no longer registered in the axum router, the
// request falls through to the `proxy` fallback, where route_target()
// returns None → AppError::NotFound → 404.
//
// Assertion: status is exactly NOT_FOUND (404).
// A 401 is NOT accepted — it only proves auth blocked the request, not that
// the route was actually removed.
// ---------------------------------------------------------------------------

#[tokio::test]
async fn old_path_user_login_is_rejected() {
    let app = test_app().await;
    let response = app
        .oneshot(authed_request("POST", "/user/login"))
        .await
        .unwrap();
    assert_eq!(
        response.status(),
        StatusCode::NOT_FOUND,
        "old path /user/login should be gone (404), got {}",
        response.status()
    );
}

#[tokio::test]
async fn old_path_message_send_private_is_rejected() {
    let app = test_app().await;
    let response = app
        .oneshot(authed_request("POST", "/message/send/private"))
        .await
        .unwrap();
    assert_eq!(
        response.status(),
        StatusCode::NOT_FOUND,
        "old path /message/send/private should be gone (404), got {}",
        response.status()
    );
}

#[tokio::test]
async fn old_path_friend_list_is_rejected() {
    let app = test_app().await;
    let response = app
        .oneshot(authed_request("GET", "/friend/list"))
        .await
        .unwrap();
    assert_eq!(
        response.status(),
        StatusCode::NOT_FOUND,
        "old path /friend/list should be gone (404), got {}",
        response.status()
    );
}

#[tokio::test]
async fn old_path_group_create_is_rejected() {
    let app = test_app().await;
    let response = app
        .oneshot(authed_request("POST", "/group/create"))
        .await
        .unwrap();
    assert_eq!(
        response.status(),
        StatusCode::NOT_FOUND,
        "old path /group/create should be gone (404), got {}",
        response.status()
    );
}

#[tokio::test]
async fn old_path_moments_feed_is_rejected() {
    let app = test_app().await;
    let response = app
        .oneshot(authed_request("GET", "/moments/feed"))
        .await
        .unwrap();
    assert_eq!(
        response.status(),
        StatusCode::NOT_FOUND,
        "old path /moments/feed should be gone (404), got {}",
        response.status()
    );
}

#[tokio::test]
async fn old_path_file_upload_image_is_rejected() {
    let app = test_app().await;
    let response = app
        .oneshot(authed_request("POST", "/file/upload/image"))
        .await
        .unwrap();
    assert_eq!(
        response.status(),
        StatusCode::NOT_FOUND,
        "old path /file/upload/image should be gone (404), got {}",
        response.status()
    );
}

#[tokio::test]
async fn old_path_auth_refresh_is_rejected() {
    let app = test_app().await;
    let response = app
        .oneshot(authed_request("POST", "/auth/refresh"))
        .await
        .unwrap();
    assert_eq!(
        response.status(),
        StatusCode::NOT_FOUND,
        "old path /auth/refresh should be gone (404), got {}",
        response.status()
    );
}

#[tokio::test]
async fn old_path_messages_send_private_is_rejected() {
    let app = test_app().await;
    let response = app
        .oneshot(authed_request("POST", "/messages/send/private"))
        .await
        .unwrap();
    assert_eq!(
        response.status(),
        StatusCode::NOT_FOUND,
        "old path /messages/send/private should be gone (404), got {}",
        response.status()
    );
}

#[tokio::test]
async fn old_path_upload_image_is_rejected() {
    let app = test_app().await;
    let response = app
        .oneshot(authed_request("POST", "/upload/image"))
        .await
        .unwrap();
    assert_eq!(
        response.status(),
        StatusCode::NOT_FOUND,
        "old path /upload/image should be gone (404), got {}",
        response.status()
    );
}

#[tokio::test]
async fn old_path_download_is_rejected() {
    let app = test_app().await;
    let response = app
        .oneshot(authed_request("GET", "/download"))
        .await
        .unwrap();
    assert_eq!(
        response.status(),
        StatusCode::NOT_FOUND,
        "old path /download should be gone (404), got {}",
        response.status()
    );
}

#[tokio::test]
async fn old_path_info_is_rejected() {
    let app = test_app().await;
    let response = app.oneshot(authed_request("POST", "/info")).await.unwrap();
    assert_eq!(
        response.status(),
        StatusCode::NOT_FOUND,
        "old path /info should be gone (404), got {}",
        response.status()
    );
}

#[tokio::test]
async fn old_path_delete_is_rejected() {
    let app = test_app().await;
    let response = app
        .oneshot(authed_request("DELETE", "/delete"))
        .await
        .unwrap();
    assert_eq!(
        response.status(),
        StatusCode::NOT_FOUND,
        "old path /delete should be gone (404), got {}",
        response.status()
    );
}

#[tokio::test]
async fn old_path_push_register_is_rejected() {
    let app = test_app().await;
    let response = app
        .oneshot(authed_request("POST", "/push/devices/register"))
        .await
        .unwrap();
    assert_eq!(
        response.status(),
        StatusCode::NOT_FOUND,
        "old path /push/devices/register should be gone (404), got {}",
        response.status()
    );
}

#[tokio::test]
async fn old_path_push_settings_is_rejected() {
    let app = test_app().await;
    let response = app
        .oneshot(authed_request("GET", "/push/settings"))
        .await
        .unwrap();
    assert_eq!(
        response.status(),
        StatusCode::NOT_FOUND,
        "old path /push/settings should be gone (404), got {}",
        response.status()
    );
}

#[tokio::test]
async fn old_path_moments_is_rejected() {
    let app = test_app().await;
    let response = app
        .oneshot(authed_request("POST", "/moments"))
        .await
        .unwrap();
    assert_eq!(
        response.status(),
        StatusCode::NOT_FOUND,
        "old path /moments should be gone (404), got {}",
        response.status()
    );
}
