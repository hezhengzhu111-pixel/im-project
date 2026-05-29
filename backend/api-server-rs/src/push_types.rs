use crate::auth::identity_from_headers;
use crate::error::AppError;
use crate::web::AppState;
use axum::extract::State;
use axum::http::HeaderMap;
use axum::Json;
use im_rs_common::api::ApiResponse;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use sqlx::{MySqlPool, Row};

const DEFAULT_MESSAGES_CHANNEL: &str = "im-messages";
const DEFAULT_FRIEND_EVENTS_CHANNEL: &str = "im-social";
const DEFAULT_SYSTEM_CHANNEL: &str = "im-system";
const MAX_DEVICE_ID_LEN: usize = 128;
const MAX_TOKEN_LEN: usize = 2048;
const MAX_SIMPLE_FIELD_LEN: usize = 128;
const MAX_MUTED_CONVERSATIONS: usize = 1_024;

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]

pub(crate) struct RegisterDeviceRequest {
    pub(crate) device_id: String,
    pub(crate) platform: String,
    pub(crate) fcm_token: String,
    #[serde(default)]
    pub(crate) app_version: String,
    #[serde(default)]
    pub(crate) device_model: String,
    #[serde(default)]
    pub(crate) os_version: String,
    #[serde(default)]
    pub(crate) locale: String,
    #[serde(default)]
    pub(crate) timezone: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct UnregisterDeviceRequest {
    pub(crate) device_id: String,
    pub(crate) fcm_token: Option<String>,
    pub(crate) reason: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct UpdateDeviceTokenRequest {
    pub(crate) device_id: String,
    pub(crate) old_token: Option<String>,
    pub(crate) new_token: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct RegisterDeviceResponse {
    pub(crate) device_id: String,
    pub(crate) registered: bool,
    pub(crate) token_version: i64,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct UpdateDeviceTokenResponse {
    pub(crate) updated: bool,
    pub(crate) token_version: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct AndroidChannelPolicy {
    pub(crate) messages: String,
    pub(crate) friend_events: String,
    pub(crate) system: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct PushSettings {
    pub(crate) enabled: bool,
    pub(crate) sound_enabled: bool,
    pub(crate) show_preview: bool,
    pub(crate) muted_conversation_ids: Vec<String>,
    pub(crate) android_channel_policy: AndroidChannelPolicy,
}

#[derive(Debug, Clone)]
pub(crate) struct PushDeviceRecord {
    pub(crate) token_version: i64,
    pub(crate) fcm_token: String,
}
