use axum::{
    routing::{get, post},
    Router,
};

use crate::handlers;
use crate::AppState;

pub fn admin_routes() -> Router<AppState> {
    Router::new()
        // User routes
        .route("/api/admin/users/list", get(handlers::users::list_users))
        .route("/api/admin/users/{id}", get(handlers::users::get_user))
        .route(
            "/api/admin/users/{id}/route",
            get(handlers::users::get_user_route),
        )
        .route(
            "/api/admin/users/{id}/disable",
            post(handlers::users::disable_user),
        )
        .route(
            "/api/admin/users/{id}/enable",
            post(handlers::users::enable_user),
        )
        .route(
            "/api/admin/users/{id}/force-offline",
            post(handlers::users::force_offline),
        )
        // Group routes
        .route("/api/admin/groups/list", get(handlers::groups::list_groups))
        .route("/api/admin/groups/{id}", get(handlers::groups::get_group))
        .route(
            "/api/admin/groups/{id}/members",
            get(handlers::groups::get_group_members),
        )
        .route(
            "/api/admin/groups/{id}/dismiss",
            post(handlers::groups::dismiss_group),
        )
        // File routes
        .route("/api/admin/files/list", get(handlers::files::list_files))
        .route("/api/admin/files/{id}", get(handlers::files::get_file))
        .route(
            "/api/admin/files/stats",
            get(handlers::files::get_storage_stats),
        )
        .route(
            "/api/admin/files/{id}/delete",
            post(handlers::files::delete_file),
        )
        // Node routes
        .route("/api/admin/nodes", get(handlers::nodes::list_nodes))
        .route("/api/admin/nodes/{id}", get(handlers::nodes::get_node))
        // Service routes
        .route(
            "/api/admin/services/status",
            get(handlers::services::get_services_status),
        )
        .route(
            "/api/admin/services/{name}/status",
            get(handlers::services::get_service_status),
        )
        // Middleware routes
        .route(
            "/api/admin/middleware/mysql/status",
            get(handlers::middleware_status::get_mysql_status),
        )
        .route(
            "/api/admin/middleware/redis/status",
            get(handlers::middleware_status::get_redis_status),
        )
}
