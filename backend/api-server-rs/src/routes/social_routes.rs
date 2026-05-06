use crate::social;
use crate::web::AppState;
use axum::routing::{delete, get, post, put};
use axum::Router;

pub fn routes() -> Router<AppState> {
    Router::new()
        .route("/friend/list", get(social::friend_list))
        .route("/api/friend/list", get(social::friend_list))
        .route("/friend/requests", get(social::friend_requests))
        .route("/api/friend/requests", get(social::friend_requests))
        .route("/friend/request", post(social::add_friend))
        .route("/api/friend/request", post(social::add_friend))
        .route("/friend/accept", post(social::accept_friend))
        .route("/api/friend/accept", post(social::accept_friend))
        .route("/friend/reject", post(social::reject_friend))
        .route("/api/friend/reject", post(social::reject_friend))
        .route("/friend/remove", delete(social::remove_friend))
        .route("/api/friend/remove", delete(social::remove_friend))
        .route("/friend/remark", put(social::update_friend_remark))
        .route("/api/friend/remark", put(social::update_friend_remark))
        .route("/group/create", post(social::create_group))
        .route("/api/group/create", post(social::create_group))
        .route("/group/user/:user_id", get(social::user_groups))
        .route("/api/group/user/:user_id", get(social::user_groups))
        .route("/group/members/list", post(social::group_members))
        .route("/api/group/members/list", post(social::group_members))
        .route(
            "/group/:group_id/add-members",
            post(social::add_group_members),
        )
        .route(
            "/api/group/:group_id/add-members",
            post(social::add_group_members),
        )
        .route("/group/search", get(social::search_groups))
        .route("/api/group/search", get(social::search_groups))
        .route("/group/:group_id/join", post(social::join_group))
        .route("/api/group/:group_id/join", post(social::join_group))
        .route("/group/:group_id/leave", post(social::leave_group))
        .route("/api/group/:group_id/leave", post(social::leave_group))
        .route(
            "/group/:group_id",
            put(social::update_group).delete(social::dismiss_group),
        )
        .route(
            "/api/group/:group_id",
            put(social::update_group).delete(social::dismiss_group),
        )
        .route(
            "/api/group/internal/memberIds/:group_id",
            get(social::internal_group_member_ids),
        )
}
