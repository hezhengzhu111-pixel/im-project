use chrono::{SecondsFormat, Utc};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::time::{SystemTime, UNIX_EPOCH};

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ApiResponse<T> {
    pub code: i32,
    pub message: String,
    pub data: Option<T>,
    pub timestamp: i64,
}

impl<T> ApiResponse<T> {
    pub fn success(data: T) -> Self {
        Self {
            code: 200,
            message: "OK".to_string(),
            data: Some(data),
            timestamp: now_ms(),
        }
    }

    pub fn success_message(message: impl Into<String>, data: T) -> Self {
        Self {
            code: 200,
            message: message.into(),
            data: Some(data),
            timestamp: now_ms(),
        }
    }

    pub fn error(code: i32, message: impl Into<String>) -> Self {
        Self {
            code,
            message: message.into(),
            data: None,
            timestamp: now_ms(),
        }
    }
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HealthResponse {
    pub status: String,
    pub service: String,
    pub time: String,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ReadyResponse {
    pub service: String,
    pub time: String,
    pub readiness_state: String,
    pub status: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct ConsumeWsTicketRequest {
    pub ticket: Option<String>,
    pub user_id: Option<i64>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct WsTicketConsumeResult {
    pub valid: bool,
    pub status: Option<String>,
    pub user_id: Option<i64>,
    pub username: Option<String>,
    pub error: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PresenceEvent {
    pub user_id: String,
    pub status: String,
    pub last_seen: String,
    pub event_time: i64,
    pub source_instance_id: String,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WsEnvelope {
    #[serde(rename = "type")]
    pub kind: String,
    pub data: Value,
    pub timestamp: i64,
}

pub fn now_ms() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_millis() as i64)
        .unwrap_or_default()
}

pub fn now_iso() -> String {
    Utc::now().to_rfc3339_opts(SecondsFormat::Millis, true)
}
