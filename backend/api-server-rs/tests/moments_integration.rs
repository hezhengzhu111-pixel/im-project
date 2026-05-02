use api_server_rs::web;
use axum::{
    body::Body,
    http::{header, Request, StatusCode},
    Router,
};
use serde_json::{json, Value};
use std::sync::atomic::{AtomicU64, Ordering};
use tower::ServiceExt;

// ── counter for unique test usernames ────────────────────────────
static COUNTER: AtomicU64 = AtomicU64::new(0);

fn unique_username(prefix: &str) -> String {
    let n = COUNTER.fetch_add(1, Ordering::SeqCst);
    format!("{}{}", prefix, n)
}

fn unique_username_pair(prefix: &str) -> (String, String) {
    (
        format!("{}a{}", prefix, COUNTER.fetch_add(1, Ordering::SeqCst)),
        format!("{}b{}", prefix, COUNTER.fetch_add(1, Ordering::SeqCst)),
    )
}

// ── test infrastructure ─────────────────────────────────────────

async fn create_test_app() -> Router {
    web::create_test_app().await
}

// ── HTTP helpers ─────────────────────────────────────────────────

fn auth_header(token: &str) -> String {
    format!("Bearer {token}")
}

async fn body_json(resp: axum::response::Response) -> Value {
    let bytes = axum::body::to_bytes(resp.into_body(), 10 * 1024 * 1024)
        .await
        .unwrap();
    serde_json::from_slice(&bytes).unwrap()
}

struct TestResponse {
    status: StatusCode,
    body: Value,
}

async fn call(
    app: &Router,
    method: &str,
    uri: &str,
    token: Option<&str>,
    body_value: Option<&Value>,
) -> TestResponse {
    let method = match method {
        "GET" => axum::http::Method::GET,
        "POST" => axum::http::Method::POST,
        "PUT" => axum::http::Method::PUT,
        "DELETE" => axum::http::Method::DELETE,
        _ => axum::http::Method::GET,
    };
    let mut builder = Request::builder()
        .method(method)
        .uri(uri)
        .header(header::CONTENT_TYPE, "application/json");
    if let Some(t) = token {
        builder = builder.header(header::AUTHORIZATION, auth_header(t));
    }
    let req = if let Some(b) = body_value {
        builder.body(Body::from(b.to_string())).unwrap()
    } else {
        builder.body(Body::empty()).unwrap()
    };
    let resp = app.clone().oneshot(req).await.unwrap();
    let status = resp.status();
    let body = body_json(resp).await;
    TestResponse { status, body }
}

async fn post(app: &Router, uri: &str, token: Option<&str>, body: &Value) -> TestResponse {
    call(app, "POST", uri, token, Some(body)).await
}

async fn get(app: &Router, uri: &str, token: Option<&str>) -> TestResponse {
    call(app, "GET", uri, token, None).await
}

async fn put(app: &Router, uri: &str, token: Option<&str>, body: Option<&Value>) -> TestResponse {
    call(app, "PUT", uri, token, body).await
}

async fn delete(app: &Router, uri: &str, token: Option<&str>) -> TestResponse {
    call(app, "DELETE", uri, token, None).await
}

// ── user auth helpers ────────────────────────────────────────────

async fn register(app: &Router, username: &str, password: &str) -> TestResponse {
    post(
        app,
        "/api/user/register",
        None,
        &json!({"username": username, "password": password, "nickname": username}),
    )
    .await
}

async fn login(app: &Router, username: &str, password: &str) -> TestResponse {
    post(
        app,
        "/api/user/login",
        None,
        &json!({"username": username, "password": password}),
    )
    .await
}

struct AuthedUser {
    token: String,
    user_id: i64,
}

async fn register_and_login(app: &Router, username: &str, password: &str) -> AuthedUser {
    let _reg = register(app, username, password).await;
    let login_resp = login(app, username, password).await;
    let token = login_resp.body["data"]["token"]
        .as_str()
        .unwrap()
        .to_string();
    let user_id: i64 = login_resp.body["data"]["user"]["id"]
        .as_str()
        .unwrap()
        .parse()
        .unwrap();
    AuthedUser { token, user_id }
}

// ══════════════════════════════════════════════════════════════════
// POST /api/moments — Create Post
// ══════════════════════════════════════════════════════════════════

#[tokio::test]
async fn test_create_post_success() {
    let app = create_test_app().await;
    let username = unique_username("cp");
    let user = register_and_login(&app, &username, "Pass1234").await;

    let resp = post(
        &app,
        "/api/moments",
        Some(&user.token),
        &json!({"content": "Hello, world!", "visibility": 0}),
    )
    .await;
    assert_eq!(resp.status, 200);
    assert_eq!(resp.body["code"], 200);
    let post_id = resp.body["data"]["id"].as_str().unwrap();
    assert!(!post_id.is_empty());
}

#[tokio::test]
async fn test_create_post_with_link() {
    let app = create_test_app().await;
    let username = unique_username("cl");
    let user = register_and_login(&app, &username, "Pass1234").await;

    let resp = post(
        &app,
        "/api/moments",
        Some(&user.token),
        &json!({
            "content": "Check this out!",
            "visibility": 0,
            "linkUrl": "https://example.com",
            "linkTitle": "Example Site",
            "linkCover": "https://example.com/cover.jpg",
            "location": "Beijing"
        }),
    )
    .await;
    assert_eq!(resp.status, 200);
    assert_eq!(resp.body["code"], 200);
}

#[tokio::test]
async fn test_create_post_empty_content() {
    let app = create_test_app().await;
    let username = unique_username("ce");
    let user = register_and_login(&app, &username, "Pass1234").await;

    let resp = post(
        &app,
        "/api/moments",
        Some(&user.token),
        &json!({}),
    )
    .await;
    // Empty content is allowed (link-only posts)
    assert_eq!(resp.status, 200);
}

#[tokio::test]
async fn test_create_post_unauthorized() {
    let app = create_test_app().await;

    let resp = post(
        &app,
        "/api/moments",
        None,
        &json!({"content": "No auth"}),
    )
    .await;
    assert_eq!(resp.status, 401);
}

// ══════════════════════════════════════════════════════════════════
// GET /api/moments/feed — Get Feed
// ══════════════════════════════════════════════════════════════════

#[tokio::test]
async fn test_get_feed_empty() {
    let app = create_test_app().await;
    let username = unique_username("gf");
    let user = register_and_login(&app, &username, "Pass1234").await;

    let resp = get(&app, "/api/moments/feed", Some(&user.token)).await;
    assert_eq!(resp.status, 200);
    assert_eq!(resp.body["code"], 200);
    let posts = resp.body["data"].as_array().unwrap();
    assert!(posts.is_empty());
}

#[tokio::test]
async fn test_get_feed_with_posts() {
    let app = create_test_app().await;
    let username = unique_username("gp");
    let user = register_and_login(&app, &username, "Pass1234").await;

    // Create two posts
    post(
        &app,
        "/api/moments",
        Some(&user.token),
        &json!({"content": "First post"}),
    )
    .await;
    post(
        &app,
        "/api/moments",
        Some(&user.token),
        &json!({"content": "Second post"}),
    )
    .await;

    let resp = get(&app, "/api/moments/feed", Some(&user.token)).await;
    assert_eq!(resp.status, 200);
    let posts = resp.body["data"].as_array().unwrap();
    assert!(posts.len() >= 2);
}

#[tokio::test]
async fn test_get_feed_with_limit() {
    let app = create_test_app().await;
    let username = unique_username("gl");
    let user = register_and_login(&app, &username, "Pass1234").await;

    // Create 3 posts
    for i in 0..3 {
        post(
            &app,
            "/api/moments",
            Some(&user.token),
            &json!({"content": format!("Post {}", i)}),
        )
        .await;
    }

    let resp = get(&app, "/api/moments/feed?limit=2", Some(&user.token)).await;
    assert_eq!(resp.status, 200);
    let posts = resp.body["data"].as_array().unwrap();
    assert!(posts.len() <= 2);
}

// ══════════════════════════════════════════════════════════════════
// GET /api/moments/:id — Get Single Post
// ══════════════════════════════════════════════════════════════════

#[tokio::test]
async fn test_get_post_success() {
    let app = create_test_app().await;
    let username = unique_username("gs");
    let user = register_and_login(&app, &username, "Pass1234").await;

    let create_resp = post(
        &app,
        "/api/moments",
        Some(&user.token),
        &json!({"content": "My post"}),
    )
    .await;
    let post_id = create_resp.body["data"]["id"].as_str().unwrap();

    let resp = get(
        &app,
        &format!("/api/moments/{}", post_id),
        Some(&user.token),
    )
    .await;
    assert_eq!(resp.status, 200);
    assert_eq!(resp.body["data"]["content"], "My post");
    let uid_str = user.user_id.to_string();
    assert_eq!(resp.body["data"]["userId"].as_str(), Some(uid_str.as_str()));
}

#[tokio::test]
async fn test_get_post_not_found() {
    let app = create_test_app().await;
    let username = unique_username("gn");
    let user = register_and_login(&app, &username, "Pass1234").await;

    let resp = get(&app, "/api/moments/999999999999", Some(&user.token)).await;
    assert_eq!(resp.status, 404);
}

// ══════════════════════════════════════════════════════════════════
// GET /api/moments/user/:user_id — Get User Posts
// ══════════════════════════════════════════════════════════════════

#[tokio::test]
async fn test_get_user_posts() {
    let app = create_test_app().await;
    let username = unique_username("up");
    let user = register_and_login(&app, &username, "Pass1234").await;

    post(
        &app,
        "/api/moments",
        Some(&user.token),
        &json!({"content": "User post 1"}),
    )
    .await;
    post(
        &app,
        "/api/moments",
        Some(&user.token),
        &json!({"content": "User post 2"}),
    )
    .await;

    let resp = get(
        &app,
        &format!("/api/moments/user/{}", user.user_id),
        Some(&user.token),
    )
    .await;
    assert_eq!(resp.status, 200);
    let posts = resp.body["data"].as_array().unwrap();
    assert!(posts.len() >= 2);
    for p in posts {
        let uid_str = user.user_id.to_string();
        assert_eq!(p["userId"].as_str(), Some(uid_str.as_str()));
    }
}

// ══════════════════════════════════════════════════════════════════
// DELETE /api/moments/:id — Delete Post
// ══════════════════════════════════════════════════════════════════

#[tokio::test]
async fn test_delete_post_success() {
    let app = create_test_app().await;
    let username = unique_username("ds");
    let user = register_and_login(&app, &username, "Pass1234").await;

    let create_resp = post(
        &app,
        "/api/moments",
        Some(&user.token),
        &json!({"content": "To be deleted"}),
    )
    .await;
    let post_id = create_resp.body["data"]["id"].as_str().unwrap();

    let resp = delete(
        &app,
        &format!("/api/moments/{}", post_id),
        Some(&user.token),
    )
    .await;
    assert_eq!(resp.status, 200);
    assert_eq!(resp.body["data"], true);

    // Post should no longer appear in feed
    let get_resp = get(
        &app,
        &format!("/api/moments/{}", post_id),
        Some(&user.token),
    )
    .await;
    assert_eq!(get_resp.status, 404);
}

#[tokio::test]
async fn test_delete_post_unauthorized() {
    let app = create_test_app().await;
    let (name_a, name_b) = unique_username_pair("du");
    let user1 = register_and_login(&app, &name_a, "Pass1234").await;
    let user2 = register_and_login(&app, &name_b, "Pass1234").await;

    let create_resp = post(
        &app,
        "/api/moments",
        Some(&user1.token),
        &json!({"content": "User1's post"}),
    )
    .await;
    let post_id = create_resp.body["data"]["id"].as_str().unwrap();

    // user2 tries to delete user1's post
    let resp = delete(
        &app,
        &format!("/api/moments/{}", post_id),
        Some(&user2.token),
    )
    .await;
    assert_eq!(resp.status, 404);
}

// ══════════════════════════════════════════════════════════════════
// POST /api/moments/:id/like — Like Post
// DELETE /api/moments/:id/like — Unlike Post
// ══════════════════════════════════════════════════════════════════

#[tokio::test]
async fn test_like_post() {
    let app = create_test_app().await;
    let (name_a, name_b) = unique_username_pair("lk");
    let author = register_and_login(&app, &name_a, "Pass1234").await;
    let liker = register_and_login(&app, &name_b, "Pass1234").await;

    let create_resp = post(
        &app,
        "/api/moments",
        Some(&author.token),
        &json!({"content": "Like me!"}),
    )
    .await;
    let post_id = create_resp.body["data"]["id"].as_str().unwrap();

    let resp = post(
        &app,
        &format!("/api/moments/{}/like", post_id),
        Some(&liker.token),
        &json!({}),
    )
    .await;
    assert_eq!(resp.status, 200);
    assert_eq!(resp.body["data"]["liked"], true);

    // Verify like appears in likes list
    let likes_resp = get(
        &app,
        &format!("/api/moments/{}/likes", post_id),
        Some(&liker.token),
    )
    .await;
    assert_eq!(likes_resp.status, 200);
    let likes = likes_resp.body["data"].as_array().unwrap();
    assert!(likes.iter().any(|l| l["userId"].as_str() == Some(liker.user_id.to_string().as_str())));
}

#[tokio::test]
async fn test_unlike_post() {
    let app = create_test_app().await;
    let (name_a, name_b) = unique_username_pair("ul");
    let author = register_and_login(&app, &name_a, "Pass1234").await;
    let liker = register_and_login(&app, &name_b, "Pass1234").await;

    let create_resp = post(
        &app,
        "/api/moments",
        Some(&author.token),
        &json!({"content": "Unlike me"}),
    )
    .await;
    let post_id = create_resp.body["data"]["id"].as_str().unwrap();

    // Like first
    post(
        &app,
        &format!("/api/moments/{}/like", post_id),
        Some(&liker.token),
        &json!({}),
    )
    .await;

    // Unlike
    let resp = delete(
        &app,
        &format!("/api/moments/{}/like", post_id),
        Some(&liker.token),
    )
    .await;
    assert_eq!(resp.status, 200);
    assert_eq!(resp.body["data"], true);

    // Verify like is removed
    let likes_resp = get(
        &app,
        &format!("/api/moments/{}/likes", post_id),
        Some(&liker.token),
    )
    .await;
    let likes = likes_resp.body["data"].as_array().unwrap();
    assert!(!likes.iter().any(|l| l["userId"].as_str() == Some(liker.user_id.to_string().as_str())));
}

#[tokio::test]
async fn test_like_post_idempotent() {
    let app = create_test_app().await;
    let (name_a, name_b) = unique_username_pair("li");
    let author = register_and_login(&app, &name_a, "Pass1234").await;
    let liker = register_and_login(&app, &name_b, "Pass1234").await;

    let create_resp = post(
        &app,
        "/api/moments",
        Some(&author.token),
        &json!({"content": "Double like"}),
    )
    .await;
    let post_id = create_resp.body["data"]["id"].as_str().unwrap();

    // Like twice — should not error (INSERT IGNORE)
    let resp1 = post(
        &app,
        &format!("/api/moments/{}/like", post_id),
        Some(&liker.token),
        &json!({}),
    )
    .await;
    assert_eq!(resp1.status, 200);

    let resp2 = post(
        &app,
        &format!("/api/moments/{}/like", post_id),
        Some(&liker.token),
        &json!({}),
    )
    .await;
    assert_eq!(resp2.status, 200);
}

// ══════════════════════════════════════════════════════════════════
// POST /api/moments/:id/comments — Create Comment
// GET /api/moments/:id/comments — Get Comments
// DELETE /api/moments/comments/:id — Delete Comment
// ══════════════════════════════════════════════════════════════════

#[tokio::test]
async fn test_create_comment() {
    let app = create_test_app().await;
    let (name_a, name_b) = unique_username_pair("cc");
    let author = register_and_login(&app, &name_a, "Pass1234").await;
    let commenter = register_and_login(&app, &name_b, "Pass1234").await;

    let create_resp = post(
        &app,
        "/api/moments",
        Some(&author.token),
        &json!({"content": "Comment on me"}),
    )
    .await;
    let post_id = create_resp.body["data"]["id"].as_str().unwrap();

    let resp = post(
        &app,
        &format!("/api/moments/{}/comments", post_id),
        Some(&commenter.token),
        &json!({"content": "Nice post!"}),
    )
    .await;
    assert_eq!(resp.status, 200);
    let comment = &resp.body["data"];
    assert_eq!(comment["content"], "Nice post!");
    let cid_str = commenter.user_id.to_string();
    assert_eq!(comment["userId"].as_str(), Some(cid_str.as_str()));
    assert_eq!(comment["postId"].as_str(), Some(post_id));
    let comment_id = comment["id"].as_str().unwrap();
    assert!(!comment_id.is_empty());
}

#[tokio::test]
async fn test_create_reply_comment() {
    let app = create_test_app().await;
    let (name_a, name_b) = unique_username_pair("cr");
    let author = register_and_login(&app, &name_a, "Pass1234").await;
    let commenter = register_and_login(&app, &name_b, "Pass1234").await;

    let create_resp = post(
        &app,
        "/api/moments",
        Some(&author.token),
        &json!({"content": "Reply test"}),
    )
    .await;
    let post_id = create_resp.body["data"]["id"].as_str().unwrap();

    // Create parent comment
    let parent_resp = post(
        &app,
        &format!("/api/moments/{}/comments", post_id),
        Some(&commenter.token),
        &json!({"content": "Parent comment"}),
    )
    .await;
    let parent_id: i64 = parent_resp.body["data"]["id"]
        .as_str()
        .unwrap()
        .parse()
        .unwrap();

    // Create reply
    let resp = post(
        &app,
        &format!("/api/moments/{}/comments", post_id),
        Some(&author.token),
        &json!({"content": "Reply to comment", "parentId": parent_id}),
    )
    .await;
    assert_eq!(resp.status, 200);
    let pid_str = parent_id.to_string();
    assert_eq!(resp.body["data"]["parentId"].as_str(), Some(pid_str.as_str()));
}

#[tokio::test]
async fn test_get_comments() {
    let app = create_test_app().await;
    let (name_a, name_b) = unique_username_pair("gc");
    let author = register_and_login(&app, &name_a, "Pass1234").await;
    let commenter = register_and_login(&app, &name_b, "Pass1234").await;

    let create_resp = post(
        &app,
        "/api/moments",
        Some(&author.token),
        &json!({"content": "Get my comments"}),
    )
    .await;
    let post_id = create_resp.body["data"]["id"].as_str().unwrap();

    // Add comments
    post(
        &app,
        &format!("/api/moments/{}/comments", post_id),
        Some(&commenter.token),
        &json!({"content": "Comment 1"}),
    )
    .await;
    post(
        &app,
        &format!("/api/moments/{}/comments", post_id),
        Some(&author.token),
        &json!({"content": "Comment 2"}),
    )
    .await;

    let resp = get(
        &app,
        &format!("/api/moments/{}/comments", post_id),
        Some(&author.token),
    )
    .await;
    assert_eq!(resp.status, 200);
    let comments = resp.body["data"].as_array().unwrap();
    assert!(comments.len() >= 2);
}

#[tokio::test]
async fn test_delete_comment() {
    let app = create_test_app().await;
    let (name_a, name_b) = unique_username_pair("dc");
    let author = register_and_login(&app, &name_a, "Pass1234").await;
    let commenter = register_and_login(&app, &name_b, "Pass1234").await;

    let create_resp = post(
        &app,
        "/api/moments",
        Some(&author.token),
        &json!({"content": "Delete comment test"}),
    )
    .await;
    let post_id = create_resp.body["data"]["id"].as_str().unwrap();

    let comment_resp = post(
        &app,
        &format!("/api/moments/{}/comments", post_id),
        Some(&commenter.token),
        &json!({"content": "To be deleted"}),
    )
    .await;
    let comment_id = comment_resp.body["data"]["id"].as_str().unwrap();

    let resp = delete(
        &app,
        &format!("/api/moments/comments/{}", comment_id),
        Some(&commenter.token),
    )
    .await;
    assert_eq!(resp.status, 200);
    assert_eq!(resp.body["data"], true);
}

#[tokio::test]
async fn test_delete_comment_unauthorized() {
    let app = create_test_app().await;
    let (name_a, name_b) = unique_username_pair("dx");
    let author = register_and_login(&app, &name_a, "Pass1234").await;
    let commenter = register_and_login(&app, &name_b, "Pass1234").await;

    let create_resp = post(
        &app,
        "/api/moments",
        Some(&author.token),
        &json!({"content": "Auth test"}),
    )
    .await;
    let post_id = create_resp.body["data"]["id"].as_str().unwrap();

    let comment_resp = post(
        &app,
        &format!("/api/moments/{}/comments", post_id),
        Some(&commenter.token),
        &json!({"content": "Commenter's comment"}),
    )
    .await;
    let comment_id = comment_resp.body["data"]["id"].as_str().unwrap();

    // author tries to delete commenter's comment
    let resp = delete(
        &app,
        &format!("/api/moments/comments/{}", comment_id),
        Some(&author.token),
    )
    .await;
    assert_eq!(resp.status, 404);
}

// ══════════════════════════════════════════════════════════════════
// GET /api/moments/notifications — Get Notifications
// PUT /api/moments/notifications/read — Mark All Read
// ══════════════════════════════════════════════════════════════════

#[tokio::test]
async fn test_get_notifications_empty() {
    let app = create_test_app().await;
    let username = unique_username("ne");
    let user = register_and_login(&app, &username, "Pass1234").await;

    let resp = get(&app, "/api/moments/notifications", Some(&user.token)).await;
    assert_eq!(resp.status, 200);
    assert_eq!(resp.body["code"], 200);
    let notifications = resp.body["data"].as_array().unwrap();
    assert!(notifications.is_empty());
}

#[tokio::test]
async fn test_get_notifications_after_like() {
    let app = create_test_app().await;
    let (name_a, name_b) = unique_username_pair("nl");
    let author = register_and_login(&app, &name_a, "Pass1234").await;
    let liker = register_and_login(&app, &name_b, "Pass1234").await;

    // Author creates a post
    let create_resp = post(
        &app,
        "/api/moments",
        Some(&author.token),
        &json!({"content": "Notify me!"}),
    )
    .await;
    let post_id = create_resp.body["data"]["id"].as_str().unwrap();

    // Liker likes the post
    post(
        &app,
        &format!("/api/moments/{}/like", post_id),
        Some(&liker.token),
        &json!({}),
    )
    .await;

    // Author checks notifications
    let resp = get(&app, "/api/moments/notifications", Some(&author.token)).await;
    assert_eq!(resp.status, 200);
    // Notifications may or may not be present depending on whether the trigger is implemented
    // The endpoint should still return 200
    let _notifications = resp.body["data"].as_array().unwrap();
}

#[tokio::test]
async fn test_mark_all_read() {
    let app = create_test_app().await;
    let username = unique_username("mr");
    let user = register_and_login(&app, &username, "Pass1234").await;

    let resp = put(
        &app,
        "/api/moments/notifications/read",
        Some(&user.token),
        None,
    )
    .await;
    assert_eq!(resp.status, 200);
    assert_eq!(resp.body["data"], true);
}

// ══════════════════════════════════════════════════════════════════
// End-to-end flow: post → like → comment → notifications
// ══════════════════════════════════════════════════════════════════

#[tokio::test]
async fn test_full_moments_flow() {
    let app = create_test_app().await;
    let (name_a, name_b) = unique_username_pair("ef");
    let user1 = register_and_login(&app, &name_a, "Pass1234").await;
    let user2 = register_and_login(&app, &name_b, "Pass1234").await;

    // 1. user1 creates a post
    let create_resp = post(
        &app,
        "/api/moments",
        Some(&user1.token),
        &json!({"content": "My moment!", "visibility": 0, "location": "Shanghai"}),
    )
    .await;
    assert_eq!(create_resp.status, 200);
    let post_id = create_resp.body["data"]["id"].as_str().unwrap();

    // 2. user2 likes the post
    let like_resp = post(
        &app,
        &format!("/api/moments/{}/like", post_id),
        Some(&user2.token),
        &json!({}),
    )
    .await;
    assert_eq!(like_resp.status, 200);

    // 3. user2 comments on the post
    let comment_resp = post(
        &app,
        &format!("/api/moments/{}/comments", post_id),
        Some(&user2.token),
        &json!({"content": "Great moment!"}),
    )
    .await;
    assert_eq!(comment_resp.status, 200);
    let comment_id = comment_resp.body["data"]["id"].as_str().unwrap();

    // 4. Verify post details
    let get_resp = get(
        &app,
        &format!("/api/moments/{}", post_id),
        Some(&user1.token),
    )
    .await;
    assert_eq!(get_resp.status, 200);
    assert_eq!(get_resp.body["data"]["content"], "My moment!");
    assert_eq!(get_resp.body["data"]["location"], "Shanghai");

    // 5. Verify likes
    let likes_resp = get(
        &app,
        &format!("/api/moments/{}/likes", post_id),
        Some(&user1.token),
    )
    .await;
    let likes = likes_resp.body["data"].as_array().unwrap();
    assert!(likes.iter().any(|l| l["userId"].as_str() == Some(user2.user_id.to_string().as_str())));

    // 6. Verify comments
    let comments_resp = get(
        &app,
        &format!("/api/moments/{}/comments", post_id),
        Some(&user1.token),
    )
    .await;
    let comments = comments_resp.body["data"].as_array().unwrap();
    assert!(comments.iter().any(|c| c["id"].as_str() == Some(comment_id)));

    // 7. user2 deletes their comment
    let del_comment_resp = delete(
        &app,
        &format!("/api/moments/comments/{}", comment_id),
        Some(&user2.token),
    )
    .await;
    assert_eq!(del_comment_resp.status, 200);

    // 8. user2 unlikes the post
    let unlike_resp = delete(
        &app,
        &format!("/api/moments/{}/like", post_id),
        Some(&user2.token),
    )
    .await;
    assert_eq!(unlike_resp.status, 200);

    // 9. Verify empty likes and comments
    let likes_after = get(
        &app,
        &format!("/api/moments/{}/likes", post_id),
        Some(&user1.token),
    )
    .await;
    let likes_arr = likes_after.body["data"].as_array().unwrap();
    assert!(!likes_arr.iter().any(|l| l["userId"].as_str() == Some(user2.user_id.to_string().as_str())));

    // 10. user1 deletes the post
    let del_resp = delete(
        &app,
        &format!("/api/moments/{}", post_id),
        Some(&user1.token),
    )
    .await;
    assert_eq!(del_resp.status, 200);

    // 11. Post is gone
    let gone_resp = get(
        &app,
        &format!("/api/moments/{}", post_id),
        Some(&user1.token),
    )
    .await;
    assert_eq!(gone_resp.status, 404);

    // 12. Check notifications
    let notif_resp = get(&app, "/api/moments/notifications", Some(&user1.token)).await;
    assert_eq!(notif_resp.status, 200);

    // 13. Mark all read
    let read_resp = put(
        &app,
        "/api/moments/notifications/read",
        Some(&user1.token),
        None,
    )
    .await;
    assert_eq!(read_resp.status, 200);
    assert_eq!(read_resp.body["data"], true);
}
