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
pub struct RegisterDeviceRequest {
    device_id: String,
    platform: String,
    fcm_token: String,
    #[serde(default)]
    app_version: String,
    #[serde(default)]
    device_model: String,
    #[serde(default)]
    os_version: String,
    #[serde(default)]
    locale: String,
    #[serde(default)]
    timezone: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UnregisterDeviceRequest {
    device_id: String,
    fcm_token: Option<String>,
    reason: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateDeviceTokenRequest {
    device_id: String,
    old_token: Option<String>,
    new_token: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RegisterDeviceResponse {
    device_id: String,
    registered: bool,
    token_version: i64,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateDeviceTokenResponse {
    updated: bool,
    token_version: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AndroidChannelPolicy {
    messages: String,
    friend_events: String,
    system: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PushSettings {
    enabled: bool,
    sound_enabled: bool,
    show_preview: bool,
    muted_conversation_ids: Vec<String>,
    android_channel_policy: AndroidChannelPolicy,
}

#[derive(Debug, Clone)]
struct PushDeviceRecord {
    token_version: i64,
    fcm_token: String,
}

pub async fn ensure_schema(db: &MySqlPool) -> Result<(), AppError> {
    sqlx::query(
        r#"CREATE TABLE IF NOT EXISTS service_user_service_db.user_push_devices (
           user_id BIGINT NOT NULL COMMENT '用户ID',
           device_id VARCHAR(128) NOT NULL COMMENT '设备ID',
           platform VARCHAR(16) NOT NULL COMMENT '平台：ANDROID/IOS',
           fcm_token VARCHAR(2048) NOT NULL COMMENT 'FCM 设备令牌',
           app_version VARCHAR(64) NULL COMMENT 'App 版本',
           device_model VARCHAR(128) NULL COMMENT '设备型号',
           os_version VARCHAR(64) NULL COMMENT '系统版本',
           locale VARCHAR(32) NULL COMMENT '语言区域',
           timezone VARCHAR(64) NULL COMMENT '时区',
           token_version BIGINT NOT NULL DEFAULT 1 COMMENT 'Token 版本',
           last_seen_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '最后活跃时间',
           last_token_refresh_at DATETIME NULL COMMENT '最后 token 刷新时间',
           disabled_at DATETIME NULL COMMENT '注销时间',
           unregister_reason VARCHAR(32) NULL COMMENT '注销原因',
           created_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
           updated_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
           PRIMARY KEY (user_id, device_id),
           KEY idx_user_push_devices_active (user_id, disabled_at, updated_time),
           KEY idx_user_push_devices_token (fcm_token(191))
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='用户推送设备表'"#,
    )
    .execute(db)
    .await?;

    let push_settings_exists = sqlx::query_scalar::<_, i64>(
        "SELECT COUNT(*) FROM information_schema.COLUMNS \
         WHERE TABLE_SCHEMA = 'service_user_service_db' \
           AND TABLE_NAME = 'user_settings' \
           AND COLUMN_NAME = 'push_settings'",
    )
    .fetch_one(db)
    .await?;

    if push_settings_exists == 0 {
        sqlx::query(
            "ALTER TABLE service_user_service_db.user_settings \
             ADD COLUMN push_settings JSON NULL COMMENT '推送设置'",
        )
        .execute(db)
        .await?;
    }

    Ok(())
}

pub async fn register_device(
    headers: HeaderMap,
    State(state): State<AppState>,
    Json(request): Json<RegisterDeviceRequest>,
) -> Result<Json<ApiResponse<RegisterDeviceResponse>>, AppError> {
    let identity = identity_from_headers(&headers, &state.config)?;
    let device = normalize_register_request(request)?;
    let token_version = upsert_device(&state.db, identity.user_id, &device).await?;

    Ok(Json(ApiResponse::success(RegisterDeviceResponse {
        device_id: device.device_id,
        registered: true,
        token_version,
    })))
}

pub async fn unregister_device(
    headers: HeaderMap,
    State(state): State<AppState>,
    Json(request): Json<UnregisterDeviceRequest>,
) -> Result<Json<ApiResponse<bool>>, AppError> {
    let identity = identity_from_headers(&headers, &state.config)?;
    let device_id = normalize_device_id(&request.device_id)?;
    let fcm_token = normalize_token(request.fcm_token.as_deref())?;
    let reason = normalize_reason(request.reason.as_deref())?;

    let query = if fcm_token.is_empty() {
        sqlx::query(
            "UPDATE service_user_service_db.user_push_devices \
             SET disabled_at = NOW(), unregister_reason = ?, updated_time = NOW() \
             WHERE user_id = ? AND device_id = ?",
        )
        .bind(&reason)
        .bind(identity.user_id)
        .bind(&device_id)
    } else {
        sqlx::query(
            "UPDATE service_user_service_db.user_push_devices \
             SET disabled_at = NOW(), unregister_reason = ?, updated_time = NOW() \
             WHERE user_id = ? AND device_id = ? AND fcm_token = ?",
        )
        .bind(&reason)
        .bind(identity.user_id)
        .bind(&device_id)
        .bind(&fcm_token)
    };

    query.execute(&state.db).await?;
    Ok(Json(ApiResponse::success(true)))
}

pub async fn update_device_token(
    headers: HeaderMap,
    State(state): State<AppState>,
    Json(request): Json<UpdateDeviceTokenRequest>,
) -> Result<Json<ApiResponse<UpdateDeviceTokenResponse>>, AppError> {
    let identity = identity_from_headers(&headers, &state.config)?;
    let device_id = normalize_device_id(&request.device_id)?;
    let old_token = normalize_token(request.old_token.as_deref())?;
    let new_token = normalize_required_token(&request.new_token)?;

    let mut tx = state.db.begin().await?;
    let existing = load_push_device_for_update(&mut tx, identity.user_id, &device_id).await?;
    let token_version = match existing {
        Some(record) => {
            if !old_token.is_empty() && record.fcm_token != old_token {
                tracing::warn!(
                    user_id = identity.user_id,
                    device_id = %device_id,
                    "push token rotation old token mismatch; proceeding with owned device"
                );
            }
            let next_version = if record.fcm_token == new_token {
                record.token_version.max(1)
            } else {
                record.token_version.saturating_add(1)
            };
            sqlx::query(
                "UPDATE service_user_service_db.user_push_devices \
                 SET fcm_token = ?, token_version = ?, last_seen_at = NOW(), \
                     last_token_refresh_at = NOW(), disabled_at = NULL, updated_time = NOW() \
                 WHERE user_id = ? AND device_id = ?",
            )
            .bind(&new_token)
            .bind(next_version)
            .bind(identity.user_id)
            .bind(&device_id)
            .execute(&mut *tx)
            .await?;
            next_version
        }
        None => {
            sqlx::query(
                "INSERT INTO service_user_service_db.user_push_devices \
                 (user_id, device_id, platform, fcm_token, token_version, last_seen_at, last_token_refresh_at, disabled_at) \
                 VALUES (?, ?, 'ANDROID', ?, 1, NOW(), NOW(), NULL)",
            )
            .bind(identity.user_id)
            .bind(&device_id)
            .bind(&new_token)
            .execute(&mut *tx)
            .await?;
            1
        }
    };

    tx.commit().await?;
    Ok(Json(ApiResponse::success(UpdateDeviceTokenResponse {
        updated: true,
        token_version,
    })))
}

pub async fn get_settings(
    headers: HeaderMap,
    State(state): State<AppState>,
) -> Result<Json<ApiResponse<PushSettings>>, AppError> {
    let identity = identity_from_headers(&headers, &state.config)?;
    let settings = load_push_settings(&state.db, identity.user_id).await?;
    Ok(Json(ApiResponse::success(settings)))
}

pub async fn update_settings(
    headers: HeaderMap,
    State(state): State<AppState>,
    Json(request): Json<PushSettings>,
) -> Result<Json<ApiResponse<bool>>, AppError> {
    let identity = identity_from_headers(&headers, &state.config)?;
    let settings = normalize_push_settings(request)?;
    let payload = serde_json::to_string(&settings)?;

    sqlx::query(
        "INSERT INTO service_user_service_db.user_settings \
         (user_id, push_settings, created_time, updated_time) \
         VALUES (?, ?, NOW(), NOW()) \
         ON DUPLICATE KEY UPDATE \
         push_settings = VALUES(push_settings), \
         updated_time = NOW()",
    )
    .bind(identity.user_id)
    .bind(payload)
    .execute(&state.db)
    .await?;

    Ok(Json(ApiResponse::success(true)))
}

async fn upsert_device(
    db: &MySqlPool,
    user_id: i64,
    device: &RegisterDeviceRequest,
) -> Result<i64, AppError> {
    let mut tx = db.begin().await?;
    let existing = load_push_device_for_update(&mut tx, user_id, &device.device_id).await?;
    let token_version = match existing {
        Some(record) if record.fcm_token == device.fcm_token => record.token_version.max(1),
        Some(record) => record.token_version.saturating_add(1),
        None => 1,
    };

    sqlx::query(
        "INSERT INTO service_user_service_db.user_push_devices \
         (user_id, device_id, platform, fcm_token, app_version, device_model, os_version, locale, timezone, token_version, last_seen_at, last_token_refresh_at, disabled_at, unregister_reason) \
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW(), NULL, NULL) \
         ON DUPLICATE KEY UPDATE \
         platform = VALUES(platform), \
         fcm_token = VALUES(fcm_token), \
         app_version = VALUES(app_version), \
         device_model = VALUES(device_model), \
         os_version = VALUES(os_version), \
         locale = VALUES(locale), \
         timezone = VALUES(timezone), \
         token_version = VALUES(token_version), \
         last_seen_at = NOW(), \
         last_token_refresh_at = NOW(), \
         disabled_at = NULL, \
         unregister_reason = NULL, \
         updated_time = NOW()",
    )
    .bind(user_id)
    .bind(&device.device_id)
    .bind(&device.platform)
    .bind(&device.fcm_token)
    .bind(&device.app_version)
    .bind(&device.device_model)
    .bind(&device.os_version)
    .bind(&device.locale)
    .bind(&device.timezone)
    .bind(token_version)
    .execute(&mut *tx)
    .await?;

    tx.commit().await?;
    Ok(token_version)
}

async fn load_push_device_for_update(
    tx: &mut sqlx::Transaction<'_, sqlx::MySql>,
    user_id: i64,
    device_id: &str,
) -> Result<Option<PushDeviceRecord>, AppError> {
    let row = sqlx::query(
        "SELECT token_version, fcm_token, platform \
         FROM service_user_service_db.user_push_devices \
         WHERE user_id = ? AND device_id = ? FOR UPDATE",
    )
    .bind(user_id)
    .bind(device_id)
    .fetch_optional(&mut **tx)
    .await?;

    Ok(row.map(|row| PushDeviceRecord {
        token_version: row.get("token_version"),
        fcm_token: row.get("fcm_token"),
    }))
}

async fn load_push_settings(db: &MySqlPool, user_id: i64) -> Result<PushSettings, AppError> {
    let row = sqlx::query(
        "SELECT CAST(push_settings AS CHAR) AS push_settings \
         FROM service_user_service_db.user_settings WHERE user_id = ?",
    )
    .bind(user_id)
    .fetch_optional(db)
    .await?;

    let Some(row) = row else {
        return Ok(default_push_settings());
    };
    let raw: Option<String> = row.try_get("push_settings")?;
    let Some(raw) = raw else {
        return Ok(default_push_settings());
    };
    let value: Value = serde_json::from_str(&raw)?;
    parse_push_settings_value(&value)
}

fn normalize_register_request(
    request: RegisterDeviceRequest,
) -> Result<RegisterDeviceRequest, AppError> {
    let platform = normalize_platform(&request.platform)?;
    Ok(RegisterDeviceRequest {
        device_id: normalize_device_id(&request.device_id)?,
        platform,
        fcm_token: normalize_required_token(&request.fcm_token)?,
        app_version: normalize_optional_text(
            Some(request.app_version.as_str()),
            MAX_SIMPLE_FIELD_LEN,
        )?,
        device_model: normalize_optional_text(
            Some(request.device_model.as_str()),
            MAX_SIMPLE_FIELD_LEN,
        )?,
        os_version: normalize_optional_text(
            Some(request.os_version.as_str()),
            MAX_SIMPLE_FIELD_LEN,
        )?,
        locale: normalize_optional_text(Some(request.locale.as_str()), 32)?,
        timezone: normalize_optional_text(Some(request.timezone.as_str()), 64)?,
    })
}

fn normalize_push_settings(request: PushSettings) -> Result<PushSettings, AppError> {
    if request.muted_conversation_ids.len() > MAX_MUTED_CONVERSATIONS {
        return Err(AppError::BadRequest(
            "mutedConversationIds too large".to_string(),
        ));
    }
    let muted_conversation_ids = request
        .muted_conversation_ids
        .iter()
        .map(|value| normalize_optional_text(Some(value.as_str()), MAX_SIMPLE_FIELD_LEN))
        .collect::<Result<Vec<_>, _>>()?
        .into_iter()
        .filter(|value| !value.is_empty())
        .collect();

    Ok(PushSettings {
        enabled: request.enabled,
        sound_enabled: request.sound_enabled,
        show_preview: request.show_preview,
        muted_conversation_ids,
        android_channel_policy: AndroidChannelPolicy {
            messages: normalize_channel(
                Some(request.android_channel_policy.messages.as_str()),
                DEFAULT_MESSAGES_CHANNEL,
            )?,
            friend_events: normalize_channel(
                Some(request.android_channel_policy.friend_events.as_str()),
                DEFAULT_FRIEND_EVENTS_CHANNEL,
            )?,
            system: normalize_channel(
                Some(request.android_channel_policy.system.as_str()),
                DEFAULT_SYSTEM_CHANNEL,
            )?,
        },
    })
}

fn parse_push_settings_value(value: &Value) -> Result<PushSettings, AppError> {
    let enabled = value
        .get("enabled")
        .and_then(Value::as_bool)
        .unwrap_or(true);
    let sound_enabled = value
        .get("soundEnabled")
        .and_then(Value::as_bool)
        .unwrap_or(true);
    let show_preview = value
        .get("showPreview")
        .and_then(Value::as_bool)
        .unwrap_or(true);
    let muted_conversation_ids = value
        .get("mutedConversationIds")
        .and_then(Value::as_array)
        .map(|items| {
            items
                .iter()
                .filter_map(Value::as_str)
                .map(str::to_string)
                .collect::<Vec<_>>()
        })
        .unwrap_or_default();
    let policy = value
        .get("androidChannelPolicy")
        .cloned()
        .unwrap_or_else(|| {
            json!({
                "messages": DEFAULT_MESSAGES_CHANNEL,
                "friendEvents": DEFAULT_FRIEND_EVENTS_CHANNEL,
                "system": DEFAULT_SYSTEM_CHANNEL
            })
        });

    normalize_push_settings(PushSettings {
        enabled,
        sound_enabled,
        show_preview,
        muted_conversation_ids,
        android_channel_policy: AndroidChannelPolicy {
            messages: policy
                .get("messages")
                .and_then(Value::as_str)
                .unwrap_or(DEFAULT_MESSAGES_CHANNEL)
                .to_string(),
            friend_events: policy
                .get("friendEvents")
                .and_then(Value::as_str)
                .unwrap_or(DEFAULT_FRIEND_EVENTS_CHANNEL)
                .to_string(),
            system: policy
                .get("system")
                .and_then(Value::as_str)
                .unwrap_or(DEFAULT_SYSTEM_CHANNEL)
                .to_string(),
        },
    })
}

fn default_push_settings() -> PushSettings {
    PushSettings {
        enabled: true,
        sound_enabled: true,
        show_preview: true,
        muted_conversation_ids: Vec::new(),
        android_channel_policy: AndroidChannelPolicy {
            messages: DEFAULT_MESSAGES_CHANNEL.to_string(),
            friend_events: DEFAULT_FRIEND_EVENTS_CHANNEL.to_string(),
            system: DEFAULT_SYSTEM_CHANNEL.to_string(),
        },
    }
}

fn normalize_platform(raw: &str) -> Result<String, AppError> {
    let value = raw.trim().to_ascii_uppercase();
    match value.as_str() {
        "ANDROID" | "IOS" => Ok(value),
        _ => Err(AppError::BadRequest(
            "platform must be ANDROID or IOS".to_string(),
        )),
    }
}

fn normalize_device_id(raw: &str) -> Result<String, AppError> {
    let value = raw.trim();
    if value.is_empty() || value.len() > MAX_DEVICE_ID_LEN {
        return Err(AppError::BadRequest("invalid deviceId".to_string()));
    }
    Ok(value.to_string())
}

fn normalize_required_token(raw: &str) -> Result<String, AppError> {
    let value = raw.trim();
    if value.is_empty() || value.len() > MAX_TOKEN_LEN {
        return Err(AppError::BadRequest("invalid token".to_string()));
    }
    Ok(value.to_string())
}

fn normalize_token(raw: Option<&str>) -> Result<String, AppError> {
    let Some(raw) = raw else {
        return Ok(String::new());
    };
    let value = raw.trim();
    if value.is_empty() {
        return Ok(String::new());
    }
    if value.len() > MAX_TOKEN_LEN {
        return Err(AppError::BadRequest("invalid token".to_string()));
    }
    Ok(value.to_string())
}

fn normalize_reason(raw: Option<&str>) -> Result<String, AppError> {
    let value = raw.unwrap_or("LOGOUT").trim();
    if value.is_empty() || value.len() > 32 {
        return Err(AppError::BadRequest("invalid reason".to_string()));
    }
    Ok(value.to_ascii_uppercase())
}

fn normalize_optional_text(raw: Option<&str>, max_len: usize) -> Result<String, AppError> {
    let Some(raw) = raw else {
        return Ok(String::new());
    };
    let value = raw.trim();
    if value.len() > max_len {
        return Err(AppError::BadRequest("field too long".to_string()));
    }
    Ok(value.to_string())
}

fn normalize_channel(raw: Option<&str>, fallback: &str) -> Result<String, AppError> {
    let value = raw.unwrap_or(fallback).trim();
    if value.is_empty() || value.len() > 64 {
        return Err(AppError::BadRequest("invalid channel policy".to_string()));
    }
    Ok(value.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn normalize_platform_rejects_unknown_platform() {
        let result = normalize_platform("web");
        assert!(result.is_err());
    }

    #[test]
    fn parse_push_settings_defaults_missing_fields() -> Result<(), AppError> {
        let parsed = parse_push_settings_value(&json!({}))?;
        assert!(parsed.enabled);
        assert!(parsed.sound_enabled);
        assert!(parsed.show_preview);
        assert!(parsed.muted_conversation_ids.is_empty());
        assert_eq!(
            parsed.android_channel_policy.messages,
            DEFAULT_MESSAGES_CHANNEL
        );
        Ok(())
    }

    #[test]
    fn normalize_push_settings_rejects_oversized_mute_list() {
        let request = PushSettings {
            enabled: true,
            sound_enabled: true,
            show_preview: true,
            muted_conversation_ids: vec!["a".to_string(); MAX_MUTED_CONVERSATIONS + 1],
            android_channel_policy: AndroidChannelPolicy {
                messages: DEFAULT_MESSAGES_CHANNEL.to_string(),
                friend_events: DEFAULT_FRIEND_EVENTS_CHANNEL.to_string(),
                system: DEFAULT_SYSTEM_CHANNEL.to_string(),
            },
        };

        let result = normalize_push_settings(request);
        assert!(result.is_err());
    }
}
