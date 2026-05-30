use super::*;
use serde::{Deserialize, Serialize};

#[allow(dead_code)]
const FRIEND_CACHE_TTL_SECONDS: u64 = 5 * 60;

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct FriendshipDto {
    pub id: String,
    pub friend_id: String,
    pub username: String,
    pub nickname: Option<String>,
    pub avatar: Option<String>,
    pub remark: Option<String>,
    pub is_online: bool,
    pub created_at: String,
    pub create_time: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct FriendRequestDto {
    pub id: String,
    pub applicant_id: String,
    pub applicant_username: String,
    pub applicant_nickname: Option<String>,
    pub applicant_avatar: Option<String>,
    pub target_user_id: String,
    pub target_username: String,
    pub target_nickname: Option<String>,
    pub target_avatar: Option<String>,
    pub reason: Option<String>,
    pub status: String,
    pub create_time: String,
    pub update_time: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct AddFriendRequest {
    #[serde(deserialize_with = "deserialize_i64")]
    pub target_user_id: i64,
    pub reason: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct HandleFriendRequest {
    #[serde(deserialize_with = "deserialize_i64")]
    pub request_id: i64,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct GroupDto {
    pub id: String,
    pub name: String,
    pub group_name: String,
    pub description: Option<String>,
    pub announcement: Option<String>,
    pub avatar: Option<String>,
    pub owner_id: String,
    pub r#type: i32,
    pub max_members: i32,
    pub member_count: i32,
    pub status: i32,
    pub create_time: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct GroupMemberDto {
    pub id: String,
    pub group_id: String,
    pub user_id: String,
    pub username: String,
    pub nickname: Option<String>,
    pub avatar: Option<String>,
    pub role: i32,
    pub join_time: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct GroupMembersResponse {
    pub members: Vec<GroupMemberDto>,
}
