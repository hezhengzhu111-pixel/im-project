use crate::error::AppError;
use serde::{Deserialize, Serialize};
use serde_json::Value;

// ---------------------------------------------------------------------------
// 常量
// ---------------------------------------------------------------------------

#[allow(dead_code)]
const MAX_SESSION_ID_LEN: usize = 64;
#[allow(dead_code)]
const MAX_KEY_FIELD_LEN: usize = 1000;
#[allow(dead_code)]
const MAX_PAYLOAD_LEN: usize = 50_000;

// ---------------------------------------------------------------------------
// 请求类型
// ---------------------------------------------------------------------------

/// E2EE 会话协商请求体。

///
/// 用于发起、接受或拒绝端到端加密会话。仅传递公钥/密文材料，
/// 服务端不保存任何私钥。
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct E2eeSessionRequest {
    pub session_id: String,
    pub identity_key: Option<String>,
    pub signed_pre_key: Option<String>,
    pub request_payload_json: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct PendingE2eeSessionDto {
    pub session_id: String,
    pub requester_id: String,
    pub requester_name: String,
    pub target_user_id: String,
    pub request_payload_json: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct E2eeNegotiationPush {
    pub action: String,
    pub session_id: String,
    pub requester_id: String,
    pub requester_name: String,
    pub target_user_id: String,
    pub request_payload_json: Option<String>,
    /// ISO-8601 timestamp from updated_time column.
    /// Clients compare this against their local state to discard stale events.
    pub updated_time: Option<String>,
    /// Monotonic state version (state_version column).
    /// Incremented on every state transition; clients can use it for conflict detection.
    pub state_version: Option<i32>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct InternalPushBatchRequest {
    pub user_ids: Vec<i64>,
    #[serde(rename = "type")]
    pub kind: String,
    pub data: Value,
}

pub(crate) fn validate_session_id(session_id: &str) -> Result<(), AppError> {
    if session_id.is_empty() || session_id.len() > MAX_SESSION_ID_LEN {
        return Err(AppError::BadRequest("invalid session_id".to_string()));
    }
    Ok(())
}

pub(crate) fn validate_optional_key(value: Option<&str>, field_name: &str) -> Result<(), AppError> {
    if let Some(v) = value {
        if v.is_empty() || v.len() > MAX_KEY_FIELD_LEN {
            return Err(AppError::BadRequest(format!("invalid {field_name}")));
        }
    }
    Ok(())
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct CreateE2eeSessionRequest {
    pub conversation_id: String,
    #[serde(default)]
    pub recipient_user_ids: Vec<String>,
    #[serde(default)]
    pub recipient_device_ids: Vec<String>,
    pub sender_device_id: String,
    #[serde(default)]
    #[allow(dead_code)]
    pub initial_envelope_metadata: Value,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "snake_case")]
pub(crate) enum RotateReason {
    MemberAdded,
    MemberRemoved,
    DeviceRevoked,
    Manual,
    KeyCompromised,
}

impl RotateReason {
    pub(crate) fn as_str(&self) -> &'static str {
        match self {
            Self::MemberAdded => "member_added",
            Self::MemberRemoved => "member_removed",
            Self::DeviceRevoked => "device_revoked",
            Self::Manual => "manual",
            Self::KeyCompromised => "key_compromised",
        }
    }
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct RotateE2eeSessionRequest {
    pub reason: RotateReason,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct E2eeSessionMetadataDto {
    pub conversation_id: String,
    pub session_id: String,
    pub key_id: String,
    pub key_version: i32,
    pub epoch: i32,
    pub sender_device_id: String,
    pub recipient_device_ids: Vec<String>,
    pub status: String,
    pub needs_rotation: bool,
}

pub(crate) fn validate_conversation_id(value: &str) -> Result<(), AppError> {
    if value.trim().is_empty() || value.len() > 128 {
        return Err(AppError::BadRequest("invalid conversationId".to_string()));
    }
    Ok(())
}
