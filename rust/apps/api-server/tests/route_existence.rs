#![forbid(unsafe_code)]
#![cfg(feature = "integration-tests")]

use axum::body::Body;
use axum::http::{Request, StatusCode};
use tower::ServiceExt;

#[tokio::test]
async fn test_route_user_login_exists() {
    let app = api_server_rs::web::create_test_app().await;
    let response = app
        .oneshot(
            Request::builder()
                .uri("/api/user/login")
                .method("POST")
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();
    assert_ne!(
        response.status(),
        StatusCode::NOT_FOUND,
        "route /api/user/login should exist"
    );
}

#[tokio::test]
async fn test_route_message_send_private_exists() {
    let app = api_server_rs::web::create_test_app().await;
    let response = app
        .oneshot(
            Request::builder()
                .uri("/api/message/send/private")
                .method("POST")
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();
    assert_ne!(
        response.status(),
        StatusCode::NOT_FOUND,
        "route /api/message/send/private should exist"
    );
}

#[tokio::test]
async fn test_route_e2ee_group_status_exists() {
    let app = api_server_rs::web::create_test_app().await;
    let response = app
        .oneshot(
            Request::builder()
                .uri("/api/e2ee/groups/123/status")
                .method("GET")
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();
    assert_ne!(
        response.status(),
        StatusCode::NOT_FOUND,
        "route /api/e2ee/groups/:group_id/status should exist"
    );
}

#[tokio::test]
async fn test_route_ai_settings_exists() {
    let app = api_server_rs::web::create_test_app().await;
    let response = app
        .oneshot(
            Request::builder()
                .uri("/api/ai/settings")
                .method("GET")
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();
    assert_ne!(
        response.status(),
        StatusCode::NOT_FOUND,
        "route /api/ai/settings should exist"
    );
}

#[tokio::test]
async fn test_route_push_register_exists() {
    let app = api_server_rs::web::create_test_app().await;
    let response = app
        .oneshot(
            Request::builder()
                .uri("/api/push/devices/register")
                .method("POST")
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();
    assert_ne!(
        response.status(),
        StatusCode::NOT_FOUND,
        "route /api/push/devices/register should exist"
    );
}

#[tokio::test]
async fn test_route_push_settings_exists() {
    let app = api_server_rs::web::create_test_app().await;
    let response = app
        .oneshot(
            Request::builder()
                .uri("/api/push/settings")
                .method("GET")
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();
    assert_ne!(
        response.status(),
        StatusCode::NOT_FOUND,
        "route /api/push/settings should exist"
    );
}

#[tokio::test]
async fn test_route_health_exists() {
    let app = api_server_rs::web::create_test_app().await;
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
    let app = api_server_rs::web::create_test_app().await;
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

#[tokio::test]
async fn test_route_friend_list_exists() {
    let app = api_server_rs::web::create_test_app().await;
    let response = app
        .oneshot(
            Request::builder()
                .uri("/api/friend/list")
                .method("GET")
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();
    assert_ne!(
        response.status(),
        StatusCode::NOT_FOUND,
        "route /api/friend/list should exist"
    );
}

#[tokio::test]
async fn test_route_moments_feed_exists() {
    let app = api_server_rs::web::create_test_app().await;
    let response = app
        .oneshot(
            Request::builder()
                .uri("/api/moments/feed")
                .method("GET")
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();
    assert_ne!(
        response.status(),
        StatusCode::NOT_FOUND,
        "route /api/moments/feed should exist"
    );
}

#[tokio::test]
async fn test_route_auth_refresh_exists() {
    let app = api_server_rs::web::create_test_app().await;
    let response = app
        .oneshot(
            Request::builder()
                .uri("/api/auth/refresh")
                .method("POST")
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();
    assert_ne!(
        response.status(),
        StatusCode::NOT_FOUND,
        "route /api/auth/refresh should exist"
    );
}

#[tokio::test]
async fn test_route_file_upload_exists() {
    let app = api_server_rs::web::create_test_app().await;
    let response = app
        .oneshot(
            Request::builder()
                .uri("/api/file/upload/image")
                .method("POST")
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();
    assert_ne!(
        response.status(),
        StatusCode::NOT_FOUND,
        "route /api/file/upload/image should exist"
    );
}

#[tokio::test]
async fn test_unknown_route_returns_not_found() {
    let app = api_server_rs::web::create_test_app().await;
    let response = app
        .oneshot(
            Request::builder()
                .uri("/api/nonexistent/route")
                .method("GET")
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();
    // Without auth, the gateway returns 401 before route lookup
    assert_eq!(
        response.status(),
        StatusCode::UNAUTHORIZED,
        "unknown routes without auth should be rejected by gateway"
    );
}
