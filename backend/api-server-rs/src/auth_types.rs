use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::collections::HashMap;

/// JWT access/refresh 令牌对。
///
/// 由 [`issue_token_pair`] 签发，access token 有效期较短（默认由 `jwt_expiration_ms` 控制），
/// refresh token 有效期较长（由 `refresh_expiration_ms` 控制）。
/// 两者均使用 HS512 算法签名，secret 长度不少于 64 字节。
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub(crate) struct TokenPairDto {
    pub access_token: Option<String>,
    pub refresh_token: Option<String>,
    pub expires_in_ms: Option<i64>,
    pub refresh_expires_in_ms: Option<i64>,
}

/// 刷新令牌成功后返回给客户端的响应体。
///
/// 仅暴露新令牌的过期时间，不重复返回 token 本身（token 通过 Set-Cookie 下发）。
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub(crate) struct RefreshResponseDto {
    pub expires_in_ms: Option<i64>,
    pub refresh_expires_in_ms: Option<i64>,
    pub authenticated: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub(crate) struct TokenParseResultDto {
    pub valid: bool,
    pub expired: bool,
    pub error: Option<String>,
    #[serde(
        default,
        deserialize_with = "deserialize_option_i64",
        serialize_with = "serialize_option_i64_as_string"
    )]
    pub user_id: Option<i64>,
    pub username: Option<String>,
    pub token_type: Option<String>,
    pub jti: Option<String>,
    pub issued_at_epoch_ms: Option<i64>,
    pub expires_at_epoch_ms: Option<i64>,
    pub permissions: Option<Vec<String>>,
}

impl TokenParseResultDto {
    pub(crate) fn clear_identity(&mut self) {
        self.user_id = None;
        self.username = None;
        self.token_type = None;
        self.jti = None;
        self.issued_at_epoch_ms = None;
        self.expires_at_epoch_ms = None;
        self.permissions = None;
    }
}

/// 内省（introspect）结果 DTO，由 `/auth/internal/introspect` 返回。
///
/// 与 [`TokenParseResultDto`] 不同，此结构额外包含 `user_info`、`resource_permissions`
/// 和 `data_scopes`，供内部服务做细粒度鉴权决策。
/// 仅限内部 HMAC 签名校验通过后才可调用。
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub(crate) struct AuthIntrospectResultDto {
    pub valid: bool,
    pub expired: bool,
    #[serde(
        default,
        deserialize_with = "deserialize_option_i64",
        serialize_with = "serialize_option_i64_as_string"
    )]
    pub user_id: Option<i64>,
    pub username: Option<String>,
    pub issued_at_epoch_ms: Option<i64>,
    pub expires_at_epoch_ms: Option<i64>,
    pub jti: Option<String>,
    #[serde(default, deserialize_with = "null_to_default")]
    pub user_info: HashMap<String, Value>,
    #[serde(default, deserialize_with = "null_to_default")]
    pub resource_permissions: Vec<String>,
    #[serde(default, deserialize_with = "null_to_default")]
    pub data_scopes: HashMap<String, Value>,
}

/// 用户资源信息 DTO，包含用户元数据、权限列表和数据范围。
///
/// 缓存在 Redis（key: `auth:user:{user_id}`），TTL 由 `resource_cache_ttl_seconds` 控制。
/// 管理员用户会自动注入 `admin`、`file:delete`、`file:read`、`log:read` 权限。
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub(crate) struct AuthUserResourceDto {
    #[serde(
        default,
        deserialize_with = "deserialize_option_i64",
        serialize_with = "serialize_option_i64_as_string"
    )]
    pub user_id: Option<i64>,
    pub username: Option<String>,
    #[serde(default, deserialize_with = "null_to_default")]
    pub user_info: HashMap<String, Value>,
    #[serde(default, deserialize_with = "null_to_default")]
    pub resource_permissions: Vec<String>,
    #[serde(default, deserialize_with = "null_to_default")]
    pub data_scopes: HashMap<String, Value>,
}

/// 内部签发令牌请求体，由 `/auth/internal/token` 使用。
///
/// 需要 HMAC 内部签名。`user_id` 和 `username` 为必填。
/// `permissions` 中的权限会被写入 Redis 用户资源缓存；管理员用户自动追加管理权限。
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub(crate) struct IssueTokenRequest {
    #[serde(default, deserialize_with = "deserialize_option_i64")]
    pub user_id: Option<i64>,
    pub username: Option<String>,
    pub nickname: Option<String>,
    pub avatar: Option<String>,
    pub email: Option<String>,
    pub phone: Option<String>,
    #[serde(default, deserialize_with = "null_to_default")]
    pub permissions: Vec<String>,
}

/// 刷新令牌请求体，支持从请求体 JSON 或 Cookie 中获取 refresh token。
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub(crate) struct RefreshTokenRequest {
    pub refresh_token: Option<String>,
    pub access_token: Option<String>,
}

/// 解析令牌请求体。`token` 为空时自动从 Cookie 中提取。
/// `allow_expired=true` 时会返回过期令牌的身份信息（但 `valid` 仍为 `false`）。
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub(crate) struct ParseTokenRequest {
    pub token: Option<String>,
    pub allow_expired: Option<bool>,
}

/// 权限校验请求体，由 `/auth/internal/check-permission` 使用。
///
/// 支持三种匹配模式：精确权限（`permission`）、资源+动作（`resource`+`action`）、
/// 通配符（`resource:*`）。拥有 `*` 或 `admin` 权限的用户始终通过。
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub(crate) struct CheckPermissionRequest {
    #[serde(default, deserialize_with = "deserialize_option_i64")]
    pub user_id: Option<i64>,
    pub permission: Option<String>,
    pub resource: Option<String>,
    pub action: Option<String>,
}

/// 权限校验结果 DTO。
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub(crate) struct PermissionCheckResultDto {
    #[serde(
        default,
        deserialize_with = "deserialize_option_i64",
        serialize_with = "serialize_option_i64_as_string"
    )]
    pub user_id: Option<i64>,
    pub permission: Option<String>,
    pub resource: Option<String>,
    pub action: Option<String>,
    pub granted: bool,
    pub reason: Option<String>,
}

/// 撤销单个令牌请求体，由 `/auth/internal/revoke-token` 使用。
///
/// 被撤销的令牌哈希存入 Redis 黑名单（key: `auth:revoked:token:{hash}`），
/// TTL 由 `revoked_token_ttl_seconds` 控制。
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub(crate) struct RevokeTokenRequest {
    pub token: Option<String>,
    pub reason: Option<String>,
}

/// 令牌撤销结果 DTO。
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub(crate) struct TokenRevokeResultDto {
    pub success: bool,
    pub message: Option<String>,
    #[serde(
        default,
        deserialize_with = "deserialize_option_i64",
        serialize_with = "serialize_option_i64_as_string"
    )]
    pub user_id: Option<i64>,
    pub token_type: Option<String>,
}

/// WebSocket 票据 DTO，由 `/auth/ws-ticket` 签发。
///
/// 票据为一次性使用（消费后立即删除），存于 Redis（key: `auth:ws:ticket:{ticket}`），
/// TTL 由 `ws_ticket_ttl_seconds` 控制。客户端在 WebSocket 握手时通过 Cookie 或查询参数携带。
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub(crate) struct WsTicketDto {
    pub ticket: Option<String>,
    pub expires_in_ms: Option<i64>,
}

/// 消费 WebSocket 票据请求体，由 `/auth/internal/ws-ticket/consume` 使用。
///
/// 仅限内部服务（经 HMAC 签名校验）调用。消费操作是原子的（Lua GET+DEL），
/// 确保同一票据不会被重复使用。
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub(crate) struct ConsumeWsTicketRequest {
    pub ticket: Option<String>,
    #[serde(default, deserialize_with = "deserialize_option_i64")]
    pub user_id: Option<i64>,
}

/// WebSocket 票据消费结果 DTO。
///
/// `valid=true` 且 `status="VALID"` 表示票据有效且用户匹配；
/// `status="USER_MISMATCH"` 表示票据有效但请求的 `user_id` 与票据记录不一致；
/// `status="INVALID"` 表示票据无效或已过期。
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub(crate) struct WsTicketConsumeResultDto {
    pub valid: bool,
    pub status: Option<String>,
    #[serde(
        default,
        deserialize_with = "deserialize_option_i64",
        serialize_with = "serialize_option_i64_as_string"
    )]
    pub user_id: Option<i64>,
    pub username: Option<String>,
    pub error: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub(crate) struct Claims {
    #[serde(rename = "userId")]
    pub(crate) user_id: i64,
    pub(crate) username: String,
    pub(crate) typ: String,
    pub(crate) jti: String,
    pub(crate) sub: String,
    pub(crate) iat: i64,
    pub(crate) exp: i64,
}

pub(crate) fn serialize_option_i64_as_string<S>(
    value: &Option<i64>,
    serializer: S,
) -> Result<S::Ok, S::Error>
where
    S: serde::Serializer,
{
    match value {
        Some(value) => serializer.serialize_some(&value.to_string()),
        None => serializer.serialize_none(),
    }
}

pub(crate) fn deserialize_option_i64<'de, D>(deserializer: D) -> Result<Option<i64>, D::Error>
where
    D: serde::Deserializer<'de>,
{
    let value = Option::<serde_json::Value>::deserialize(deserializer)?;
    let Some(value) = value else {
        return Ok(None);
    };
    match value {
        serde_json::Value::Number(number) => Ok(number
            .as_i64()
            .or_else(|| number.as_u64().and_then(|item| i64::try_from(item).ok()))),
        serde_json::Value::String(text) => text
            .trim()
            .parse()
            .map(Some)
            .map_err(|_| serde::de::Error::custom("invalid integer")),
        _ => Err(serde::de::Error::custom("invalid integer")),
    }
}

pub(crate) fn null_to_default<'de, D, T>(deserializer: D) -> Result<T, D::Error>
where
    D: serde::Deserializer<'de>,
    T: serde::Deserialize<'de> + Default,
{
    Ok(Option::<T>::deserialize(deserializer)?.unwrap_or_default())
}
