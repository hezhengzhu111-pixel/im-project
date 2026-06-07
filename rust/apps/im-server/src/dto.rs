use chrono::{SecondsFormat, Utc};
use serde::{de, Deserialize, Deserializer, Serialize};
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
    #[serde(default, deserialize_with = "deserialize_option_i64")]
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

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct InternalPushRequest {
    #[serde(deserialize_with = "deserialize_i64")]
    pub user_id: i64,
    #[serde(rename = "type")]
    pub kind: String,
    pub data: Value,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct InternalPushBatchRequest {
    pub user_ids: Vec<i64>,
    #[serde(rename = "type")]
    pub kind: String,
    pub data: Value,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct InternalPushBatchResult {
    pub accepted: usize,
    pub delivered: usize,
}

pub fn now_ms() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| i64::try_from(duration.as_millis()).unwrap_or(i64::MAX))
        .unwrap_or_default()
}

pub fn now_iso() -> String {
    Utc::now().to_rfc3339_opts(SecondsFormat::Millis, true)
}

fn deserialize_i64<'de, D>(deserializer: D) -> Result<i64, D::Error>
where
    D: Deserializer<'de>,
{
    let value = Value::deserialize(deserializer)?;
    value_to_i64(value).ok_or_else(|| de::Error::custom("invalid integer"))
}

fn deserialize_option_i64<'de, D>(deserializer: D) -> Result<Option<i64>, D::Error>
where
    D: Deserializer<'de>,
{
    let value = Option::<Value>::deserialize(deserializer)?;
    let Some(value) = value else {
        return Ok(None);
    };
    value_to_i64(value)
        .map(Some)
        .ok_or_else(|| de::Error::custom("invalid integer"))
}

#[cfg(test)]
mod tests {
    use super::InternalPushBatchRequest;
    use serde_json::json;
    use std::error::Error;

    #[test]
    fn should_deserialize_shared_batch_push_request() -> Result<(), Box<dyn Error>> {
        let raw = json!({
            "userIds": [1001, 1002],
            "type": "MESSAGE",
            "data": {
                "messageId": "99",
                "content": "hello"
            }
        });
        let request = serde_json::from_value::<InternalPushBatchRequest>(raw)?;
        if request.user_ids != vec![1001, 1002] {
            return Err("userIds should deserialize into shared batch request".into());
        }
        if request.kind != "MESSAGE" {
            return Err("batch type should deserialize".into());
        }
        if request.data["content"] != "hello" {
            return Err("batch data should remain intact".into());
        }
        Ok(())
    }
}

fn value_to_i64(value: Value) -> Option<i64> {
    match value {
        Value::Number(number) => number
            .as_i64()
            .or_else(|| number.as_u64().and_then(|item| i64::try_from(item).ok())),
        Value::String(text) => text.trim().parse().ok(),
        _ => None,
    }
}
