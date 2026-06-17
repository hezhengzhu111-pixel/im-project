use crate::moments;
use crate::web::AppState;
use axum::routing::{delete, get, post, put};
use axum::Router;

pub fn routes() -> Router<AppState> {
    Router::new()
        .route("/api/moments", post(moments::post_handler::create_post))
        .route("/api/moments/feed", get(moments::post_handler::get_feed))
        .route(
            "/api/moments/:id",
            get(moments::post_handler::get_post).delete(moments::post_handler::delete_post),
        )
        .route(
            "/api/moments/user/:user_id",
            get(moments::post_handler::get_user_posts),
        )
        .route(
            "/api/moments/:id/like",
            post(moments::interaction_handler::like_post)
                .delete(moments::interaction_handler::unlike_post),
        )
        .route(
            "/api/moments/:id/likes",
            get(moments::interaction_handler::get_likes),
        )
        .route(
            "/api/moments/:id/comments",
            post(moments::interaction_handler::create_comment)
                .get(moments::interaction_handler::get_comments),
        )
        .route(
            "/api/moments/comments/:id",
            delete(moments::interaction_handler::delete_comment),
        )
        .route(
            "/api/moments/:id/media",
            post(moments::post_handler::add_media),
        )
        .route(
            "/api/moments/notifications",
            get(moments::notification_handler::get_notifications),
        )
        .route(
            "/api/moments/notifications/read",
            put(moments::notification_handler::mark_all_read),
        )
}
