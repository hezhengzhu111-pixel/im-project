use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MomentPost {
    pub id: i64,
    pub user_id: i64,
    pub content: Option<String>,
    pub visibility: i8,
    pub link_url: Option<String>,
    pub link_title: Option<String>,
    pub link_cover: Option<String>,
    pub location: Option<String>,
    pub status: i8,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MomentMedia {
    pub id: i64,
    pub post_id: i64,
    pub media_type: i8,
    pub url: String,
    pub sort_order: i8,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MomentLike {
    pub id: i64,
    pub post_id: i64,
    pub user_id: i64,
    pub created_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MomentComment {
    pub id: i64,
    pub post_id: i64,
    pub user_id: i64,
    pub parent_id: Option<i64>,
    pub content: String,
    pub created_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MomentNotification {
    pub id: i64,
    pub user_id: i64,
    pub actor_id: i64,
    pub notification_type: String,
    pub post_id: i64,
    pub comment_id: Option<i64>,
    pub is_read: bool,
    pub created_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CreatePostRequest {
    pub content: Option<String>,
    pub visibility: i8,
    pub link_url: Option<String>,
    pub link_title: Option<String>,
    pub link_cover: Option<String>,
    pub location: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CreateCommentRequest {
    pub content: String,
    pub parent_id: Option<i64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PostWithDetails {
    pub post: MomentPost,
    pub media: Vec<MomentMedia>,
    pub like_count: i64,
    pub comment_count: i64,
    pub is_liked: bool,
    pub user_nickname: Option<String>,
    pub user_avatar: Option<String>,
}
