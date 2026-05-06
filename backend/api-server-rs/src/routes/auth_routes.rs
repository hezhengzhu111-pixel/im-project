use crate::auth_api;
use crate::web::AppState;
use axum::routing::{get, post};
use axum::Router;

pub fn routes() -> Router<AppState> {
    Router::new()
        .route("/auth/refresh", post(auth_api::refresh))
        .route("/api/auth/refresh", post(auth_api::refresh))
        .route("/auth/parse", post(auth_api::parse))
        .route("/api/auth/parse", post(auth_api::parse))
        .route("/auth/ws-ticket", post(auth_api::issue_ws_ticket))
        .route("/api/auth/ws-ticket", post(auth_api::issue_ws_ticket))
        .route(
            "/api/auth/internal/token",
            post(auth_api::internal_issue_token),
        )
        .route(
            "/api/auth/internal/user-resource/:user_id",
            get(auth_api::internal_user_resource),
        )
        .route(
            "/api/auth/internal/validate-token",
            post(auth_api::internal_validate_token),
        )
        .route(
            "/api/auth/internal/introspect",
            post(auth_api::internal_introspect),
        )
        .route(
            "/api/auth/internal/ws-introspect",
            post(auth_api::internal_introspect),
        )
        .route(
            "/api/auth/internal/check-permission",
            post(auth_api::internal_check_permission),
        )
        .route(
            "/api/auth/internal/revoke-token",
            post(auth_api::internal_revoke_token),
        )
        .route(
            "/api/auth/internal/revoke-user-tokens/:user_id",
            post(auth_api::internal_revoke_user_tokens),
        )
        .route(
            "/api/auth/internal/ws-ticket/consume",
            post(auth_api::internal_consume_ws_ticket),
        )
}
