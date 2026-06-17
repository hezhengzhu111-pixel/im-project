use crate::user;
use crate::web::AppState;
use axum::routing::{delete, get, post, put};
use axum::Router;

pub fn routes() -> Router<AppState> {
    Router::new()
        .route("/api/user/login", post(user::login))
        .route("/api/user/register", post(user::register))
        .route("/api/user/logout", post(user::logout))
        .route("/api/user/offline", post(user::offline))
        .route(
            "/api/user/profile",
            get(user::get_profile).put(user::update_profile),
        )
        .route("/api/user/password", put(user::change_password))
        .route("/api/user/phone/code", post(user::send_phone_code))
        .route("/api/user/phone/bind", post(user::bind_phone))
        .route("/api/user/email/code", post(user::send_email_code))
        .route("/api/user/email/bind", post(user::bind_email))
        .route("/api/user/account", delete(user::delete_account))
        .route("/api/user/search", get(user::search))
        .route("/api/user/heartbeat", post(user::heartbeat))
        .route("/api/user/online-status", post(user::online_status))
        .route("/api/user/settings", get(user::settings))
        .route("/api/user/settings/:kind", put(user::update_settings))
        .route("/api/user/avatar", post(user::upload_avatar))
}
