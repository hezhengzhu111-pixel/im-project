use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::collections::HashMap;
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
}

impl ApiResponse<()> {
    pub fn success_empty() -> Self {
        Self {
            code: 200,
            message: "OK".to_string(),
            data: None,
            timestamp: now_ms(),
        }
    }
}

impl<T> ApiResponse<T> {
    pub fn error(code: i32, message: impl Into<String>) -> Self {
        Self {
            code,
            message: message.into(),
            data: None,
            timestamp: now_ms(),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct TokenPairDto {
    pub access_token: Option<String>,
    pub refresh_token: Option<String>,
    pub expires_in_ms: Option<i64>,
    pub refresh_expires_in_ms: Option<i64>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct TokenParseResultDto {
    pub valid: bool,
    pub expired: bool,
    pub error: Option<String>,
    pub user_id: Option<i64>,
    pub username: Option<String>,
    pub token_type: Option<String>,
    pub jti: Option<String>,
    pub issued_at_epoch_ms: Option<i64>,
    pub expires_at_epoch_ms: Option<i64>,
    pub permissions: Option<Vec<String>>,
}

impl TokenParseResultDto {
    pub fn clear_identity(&mut self) {
        self.user_id = None;
        self.username = None;
        self.token_type = None;
        self.jti = None;
        self.issued_at_epoch_ms = None;
        self.expires_at_epoch_ms = None;
        self.permissions = None;
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct AuthIntrospectResultDto {
    pub valid: bool,
    pub expired: bool,
    pub user_id: Option<i64>,
    pub username: Option<String>,
    pub issued_at_epoch_ms: Option<i64>,
    pub expires_at_epoch_ms: Option<i64>,
    pub jti: Option<String>,
    #[serde(default)]
    pub user_info: HashMap<String, Value>,
    #[serde(default)]
    pub resource_permissions: Vec<String>,
    #[serde(default)]
    pub data_scopes: HashMap<String, Value>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct AuthUserResourceDto {
    pub user_id: Option<i64>,
    pub username: Option<String>,
    #[serde(default)]
    pub user_info: HashMap<String, Value>,
    #[serde(default)]
    pub resource_permissions: Vec<String>,
    #[serde(default)]
    pub data_scopes: HashMap<String, Value>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct IssueTokenRequest {
    pub user_id: Option<i64>,
    pub username: Option<String>,
    pub nickname: Option<String>,
    pub avatar: Option<String>,
    pub email: Option<String>,
    pub phone: Option<String>,
    #[serde(default)]
    pub permissions: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct RefreshTokenRequest {
    pub refresh_token: Option<String>,
    pub access_token: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct ParseTokenRequest {
    pub token: Option<String>,
    pub allow_expired: Option<bool>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct CheckPermissionRequest {
    pub user_id: Option<i64>,
    pub permission: Option<String>,
    pub resource: Option<String>,
    pub action: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct PermissionCheckResultDto {
    pub user_id: Option<i64>,
    pub permission: Option<String>,
    pub resource: Option<String>,
    pub action: Option<String>,
    pub granted: bool,
    pub reason: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct RevokeTokenRequest {
    pub token: Option<String>,
    pub reason: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct TokenRevokeResultDto {
    pub success: bool,
    pub message: Option<String>,
    pub user_id: Option<i64>,
    pub token_type: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct WsTicketDto {
    pub ticket: Option<String>,
    pub expires_in_ms: Option<i64>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct ConsumeWsTicketRequest {
    pub ticket: Option<String>,
    pub user_id: Option<i64>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct WsTicketConsumeResultDto {
    pub valid: bool,
    pub status: Option<String>,
    pub user_id: Option<i64>,
    pub username: Option<String>,
    pub error: Option<String>,
}

pub const WS_TICKET_STATUS_VALID: &str = "VALID";
pub const WS_TICKET_STATUS_INVALID: &str = "INVALID";
pub const WS_TICKET_STATUS_USER_MISMATCH: &str = "USER_MISMATCH";

pub fn now_ms() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_millis() as i64)
        .unwrap_or_default()
}

#[cfg(test)]
mod tests {
    #[test]
    fn should_serialize_token_pair_with_java_field_names() {
        let dto = TokenPairDto {
            access_token: Some("access".to_string()),
            refresh_token: Some("refresh".to_string()),
            expires_in_ms: Some(1000),
            refresh_expires_in_ms: Some(2000),
        };

        let json = serde_json::to_value(dto).unwrap();

        assert_eq!(json["accessToken"], "access");
        assert_eq!(json["refreshToken"], "refresh");
        assert_eq!(json["expiresInMs"], 1000);
        assert_eq!(json["refreshExpiresInMs"], 2000);
    }
}
