use crate::e2ee;
use crate::web::AppState;
use axum::routing::{delete, get, post};
use axum::Router;

pub fn routes() -> Router<AppState> {
    Router::new()
        .route("/api/keys/bundle", post(e2ee::key_api::upload_bundle))
        .route("/api/keys/bundle", get(e2ee::key_api::get_bundle))
        .route("/api/keys/devices", get(e2ee::key_api::get_devices))
        .route("/api/keys/heartbeat", post(e2ee::key_api::heartbeat))
        .route("/api/keys/salt", get(e2ee::key_api::get_salt))
        .route("/api/keys/backup", post(e2ee::key_api::upload_backup))
        .route("/api/keys/backup", get(e2ee::key_api::get_backup))
        .route("/api/keys/device/:id", delete(e2ee::key_api::delete_device))
        .route(
            "/api/e2ee/request",
            post(e2ee::session_api::request_encryption),
        )
        .route(
            "/api/e2ee/pending",
            get(e2ee::session_api::pending_encryption_requests),
        )
        .route(
            "/api/e2ee/accept",
            post(e2ee::session_api::accept_encryption),
        )
        .route(
            "/api/e2ee/reject",
            post(e2ee::session_api::reject_encryption),
        )
        .route(
            "/api/e2ee/disable",
            post(e2ee::session_api::disable_encryption),
        )
        .route(
            "/api/e2ee/group/enable",
            post(e2ee::group_api::enable_group_encryption_legacy),
        )
        .route(
            "/api/e2ee/group/disable",
            post(e2ee::group_api::disable_group_encryption_legacy),
        )
        .route(
            "/api/e2ee/groups/:group_id/enable",
            post(e2ee::group_api::enable_group_encryption),
        )
        .route(
            "/api/e2ee/groups/:group_id/disable",
            post(e2ee::group_api::disable_group_encryption),
        )
        .route(
            "/api/e2ee/groups/:group_id/sender-key",
            post(e2ee::group_api::push_sender_key),
        )
        .route(
            "/api/e2ee/groups/:group_id/sender-keys",
            get(e2ee::group_api::get_my_sender_keys),
        )
        .route(
            "/api/e2ee/groups/:group_id/sender-keys/:user_id",
            delete(e2ee::group_api::remove_member_sender_keys),
        )
        .route(
            "/api/e2ee/groups/:group_id/status",
            get(e2ee::group_api::get_group_status),
        )
        .route(
            "/api/e2ee/devices/:user_id",
            get(e2ee::key_api::get_devices_by_user_path),
        )
        .route(
            "/api/e2ee/groups/:group_id/devices",
            get(e2ee::key_api::get_group_devices),
        )
}
