use super::user_helpers::*;
use super::user_types::*;
use crate::auth::identity_from_headers;
use crate::auth_api::{self};
use crate::error::AppError;
use crate::web::AppState;
use axum::body::Bytes;
use axum::extract::{Multipart, Path, Query, State};
use axum::http::{HeaderMap, StatusCode};
use axum::Json;
use im_common::api::ApiResponse;
use im_common::{ids, time};
use redis::AsyncCommands;
use serde_json::Value;
use std::collections::HashMap;

pub(crate) async fn login(
    State(state): State<AppState>,
    Json(request): Json<LoginRequest>,
) -> Result<(StatusCode, HeaderMap, Json<ApiResponse<UserAuthResponse>>), AppError> {
    let username = normalize_username(&request.username)?;
    if request.password.is_empty() {
        return Err(AppError::Unauthorized("用户名或密码错误".to_string()));
    }
    let user = load_user_by_username(&state.db, &username)
        .await?
        .filter(|user| user.status == 1)
        .ok_or_else(|| AppError::Unauthorized("用户名或密码错误".to_string()))?;

    if !verify_password(&request.password, &user.password) {
        return Err(AppError::Unauthorized("用户名或密码错误".to_string()));
    }

    let token_pair = issue_token(&state, &user, request.remember_me).await?;
    sqlx::query("UPDATE service_user_service_db.users SET last_login_time = NOW() WHERE id = ?")
        .bind(user.id)
        .execute(&state.db)
        .await?;

    let mut headers = HeaderMap::new();
    auth_api::append_auth_cookies(&mut headers, &state.config, &token_pair, &HeaderMap::new())?;

    Ok((
        StatusCode::OK,
        headers,
        Json(ApiResponse::success(UserAuthResponse {
            success: true,
            message: "登录成功".to_string(),
            user: user.to_dto(),
            token: token_pair.access_token.clone(),
            refresh_token: token_pair.refresh_token.clone(),
            expires_in_ms: token_pair.expires_in_ms,
            refresh_expires_in_ms: token_pair.refresh_expires_in_ms,
            permissions: Vec::new(),
        })),
    ))
}

pub(crate) async fn register(
    State(state): State<AppState>,
    Json(request): Json<RegisterRequest>,
) -> Result<Json<ApiResponse<UserDto>>, AppError> {
    let username = normalize_username(&request.username)?;
    validate_password(&request.password)?;
    let nickname =
        normalize_optional(request.nickname.as_deref()).unwrap_or_else(|| username.clone());
    let email = normalize_optional(request.email.as_deref());
    let phone = normalize_optional(request.phone.as_deref());
    let existing = sqlx::query_scalar::<_, i64>(
        "SELECT COUNT(*) FROM service_user_service_db.users WHERE username = ?",
    )
    .bind(&username)
    .fetch_one(&state.db)
    .await?;
    if existing > 0 {
        return Err(AppError::Conflict("用户名已存在".to_string()));
    }

    let password_hash = bcrypt::hash(&request.password, bcrypt::DEFAULT_COST)
        .map_err(|err| AppError::BadRequest(format!("密码加密失败: {err}")))?;
    let user_id = ids::next_id(state.config.snowflake_node_id);
    sqlx::query(
        r#"INSERT INTO service_user_service_db.users
           (id, username, password, nickname, email, phone, status)
           VALUES (?, ?, ?, ?, ?, ?, 1)"#,
    )
    .bind(user_id)
    .bind(&username)
    .bind(password_hash)
    .bind(&nickname)
    .bind(&email)
    .bind(&phone)
    .execute(&state.db)
    .await?;

    Ok(Json(ApiResponse::success(UserDto {
        id: user_id.to_string(),
        username,
        nickname,
        avatar: None,
        email,
        phone,
        status: "offline".to_string(),
        last_login_time: None,
        create_time: Some(time::now_iso()),
    })))
}

pub(crate) async fn logout(
    State(state): State<AppState>,
) -> (StatusCode, HeaderMap, Json<ApiResponse<String>>) {
    let mut headers = HeaderMap::new();
    auth_api::expire_auth_cookies(&mut headers, &state.config, &HeaderMap::new());
    (
        StatusCode::OK,
        headers,
        Json(ApiResponse::success("ok".to_string())),
    )
}

pub(crate) async fn offline() -> Json<ApiResponse<String>> {
    Json(ApiResponse::success("ok".to_string()))
}

pub(crate) async fn get_profile(
    headers: HeaderMap,
    State(state): State<AppState>,
) -> Result<Json<ApiResponse<UserDto>>, AppError> {
    let identity = identity_from_headers(&headers, &state.config)?;
    let user = load_user_by_id(&state.db, identity.user_id)
        .await?
        .ok_or_else(|| AppError::NotFound("用户不存在".to_string()))?;
    Ok(Json(ApiResponse::success(user.to_dto())))
}

pub(crate) async fn update_profile(
    headers: HeaderMap,
    State(state): State<AppState>,
    Json(payload): Json<UpdateProfileRequest>,
) -> Result<Json<ApiResponse<bool>>, AppError> {
    let identity = identity_from_headers(&headers, &state.config)?;
    let user_id = identity.user_id;

    // 验证昵称长度
    if let Some(ref nickname) = payload.nickname {
        if nickname.chars().count() > 20 {
            return Err(AppError::BadRequest(
                "昵称长度不能超过 20 个字符".to_string(),
            ));
        }
    }

    // 验证签名长度
    if let Some(ref signature) = payload.signature {
        if signature.chars().count() > 200 {
            return Err(AppError::BadRequest(
                "个性签名长度不能超过 200 个字符".to_string(),
            ));
        }
    }

    // 验证邮箱格式
    if let Some(ref email) = payload.email {
        validate_email(email)?;
    }

    // 验证手机号格式
    if let Some(ref phone) = payload.phone {
        validate_phone(phone)?;
    }

    // 动态构建 UPDATE 语句
    let mut updates = Vec::new();
    let mut params: Vec<String> = Vec::new();

    if let Some(nickname) = payload.nickname.clone() {
        updates.push("nickname = ?");
        params.push(nickname);
    }
    if let Some(avatar) = payload.avatar.clone() {
        updates.push("avatar = ?");
        params.push(avatar);
    }
    if let Some(email) = payload.email.clone() {
        updates.push("email = ?");
        params.push(email);
    }
    if let Some(phone) = payload.phone.clone() {
        updates.push("phone = ?");
        params.push(phone);
    }
    if let Some(gender) = payload.gender {
        updates.push("gender = ?");
        params.push(gender.to_string());
    }
    if let Some(birthday) = payload.birthday.clone() {
        updates.push("birthday = ?");
        params.push(birthday);
    }
    if let Some(signature) = payload.signature.clone() {
        updates.push("signature = ?");
        params.push(signature);
    }
    if let Some(location) = payload.location.clone() {
        updates.push("location = ?");
        params.push(location);
    }

    if updates.is_empty() {
        return Err(AppError::BadRequest("请求体为空".to_string()));
    }

    let sql = format!(
        "UPDATE service_user_service_db.users SET {} WHERE id = ? AND status = 1",
        updates.join(", ")
    );

    let mut query = sqlx::query(&sql);
    for param in &params {
        query = query.bind(param);
    }
    query = query.bind(user_id);

    query.execute(&state.db).await?;

    Ok(Json(ApiResponse::success(true)))
}

pub(crate) async fn change_password(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(request): Json<ChangePasswordRequest>,
) -> Result<Json<ApiResponse<bool>>, AppError> {
    let identity = identity_from_headers(&headers, &state.config)?;
    let user = load_user_by_id(&state.db, identity.user_id)
        .await?
        .ok_or_else(|| AppError::NotFound("user not found".to_string()))?;
    if !verify_password(&request.current_password, &user.password) {
        return Err(AppError::Unauthorized(
            "current password is incorrect".to_string(),
        ));
    }
    validate_password(&request.new_password)?;
    let password_hash = bcrypt::hash(&request.new_password, bcrypt::DEFAULT_COST)
        .map_err(|err| AppError::BadRequest(format!("password hash failed: {err}")))?;
    sqlx::query("UPDATE service_user_service_db.users SET password = ? WHERE id = ?")
        .bind(password_hash)
        .bind(identity.user_id)
        .execute(&state.db)
        .await?;
    Ok(Json(ApiResponse::success(true)))
}

pub(crate) async fn send_phone_code(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(request): Json<CodeTargetRequest>,
) -> Result<Json<ApiResponse<String>>, AppError> {
    let identity = identity_from_headers(&headers, &state.config)?;
    validate_phone(&request.target)?;
    let code = generate_verification_code();
    let key = verification_code_key(identity.user_id, "phone", request.target.trim());
    if let Err(error) = state
        .redis_manager
        .clone()
        .set_ex::<_, _, ()>(&key, &code, 300_u64)
        .await
    {
        tracing::warn!(error = %error, user_id = identity.user_id, "failed to store phone verification code");
    }
    Ok(Json(ApiResponse::success(code)))
}

pub(crate) async fn bind_phone(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(request): Json<BindPhoneRequest>,
) -> Result<Json<ApiResponse<bool>>, AppError> {
    let identity = identity_from_headers(&headers, &state.config)?;
    validate_phone(&request.phone)?;
    validate_code(&request.code)?;
    verify_and_consume_code(
        &state,
        identity.user_id,
        "phone",
        request.phone.trim(),
        request.code.trim(),
    )
    .await?;
    sqlx::query("UPDATE service_user_service_db.users SET phone = ? WHERE id = ? AND status = 1")
        .bind(request.phone.trim())
        .bind(identity.user_id)
        .execute(&state.db)
        .await?;
    Ok(Json(ApiResponse::success(true)))
}

pub(crate) async fn send_email_code(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(request): Json<CodeTargetRequest>,
) -> Result<Json<ApiResponse<String>>, AppError> {
    let identity = identity_from_headers(&headers, &state.config)?;
    validate_email(&request.target)?;
    let code = generate_verification_code();
    let key = verification_code_key(identity.user_id, "email", request.target.trim());
    if let Err(error) = state
        .redis_manager
        .clone()
        .set_ex::<_, _, ()>(&key, &code, 300_u64)
        .await
    {
        tracing::warn!(error = %error, user_id = identity.user_id, "failed to store email verification code");
    }
    Ok(Json(ApiResponse::success(code)))
}

pub(crate) async fn bind_email(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(request): Json<BindEmailRequest>,
) -> Result<Json<ApiResponse<bool>>, AppError> {
    let identity = identity_from_headers(&headers, &state.config)?;
    validate_email(&request.email)?;
    validate_code(&request.code)?;
    verify_and_consume_code(
        &state,
        identity.user_id,
        "email",
        request.email.trim(),
        request.code.trim(),
    )
    .await?;
    sqlx::query("UPDATE service_user_service_db.users SET email = ? WHERE id = ? AND status = 1")
        .bind(request.email.trim())
        .bind(identity.user_id)
        .execute(&state.db)
        .await?;
    Ok(Json(ApiResponse::success(true)))
}

pub(crate) async fn delete_account(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(payload): Json<DeleteAccountRequest>,
) -> Result<(StatusCode, HeaderMap, Json<ApiResponse<bool>>), AppError> {
    let identity = identity_from_headers(&headers, &state.config)?;
    let user_id = identity.user_id;

    // 验证密码
    let user = load_user_by_id(&state.db, user_id)
        .await?
        .ok_or_else(|| AppError::NotFound("用户不存在".to_string()))?;

    if !verify_password(&payload.password, &user.password) {
        return Err(AppError::Unauthorized("密码错误".to_string()));
    }

    // 软删除：设置 status = 0，更新 last_login_time 为删除时间
    let now = chrono::Utc::now().naive_utc();
    let mut tx = state.db.begin().await?;

    // 1. 软删除用户
    sqlx::query(
        "UPDATE service_user_service_db.users SET status = 0, last_login_time = ? WHERE id = ?",
    )
    .bind(now)
    .bind(user_id)
    .execute(&mut *tx)
    .await?;

    // 2. 清理好友关系
    sqlx::query(
        "UPDATE service_user_service_db.im_friend SET status = 2 WHERE user_id = ? OR friend_id = ?",
    )
    .bind(user_id)
    .bind(user_id)
    .execute(&mut *tx)
    .await?;

    // 3. 清理群组成员
    sqlx::query("UPDATE service_group_service_db.im_group_member SET status = 0 WHERE user_id = ?")
        .bind(user_id)
        .execute(&mut *tx)
        .await?;

    // 4. 清理拥有的群组
    sqlx::query("UPDATE service_group_service_db.im_group SET status = 0 WHERE owner_id = ?")
        .bind(user_id)
        .execute(&mut *tx)
        .await?;

    tx.commit().await?;

    // 5. 清理 Redis 缓存
    {
        let mut redis = state.redis_manager.clone();
        let _: redis::RedisResult<()> = redis.del(format!("user_settings:{}", user_id)).await;
        let _: redis::RedisResult<()> = redis.del(format!("user_token:{}", user_id)).await;
    }

    // 6. 过期 auth cookies
    let mut response_headers = HeaderMap::new();
    auth_api::expire_auth_cookies(&mut response_headers, &state.config, &headers);

    Ok((
        StatusCode::OK,
        response_headers,
        Json(ApiResponse::success(true)),
    ))
}

pub(crate) async fn search(
    State(state): State<AppState>,
    Query(query): Query<SearchQuery>,
) -> Result<Json<ApiResponse<Vec<UserDto>>>, AppError> {
    let keyword = normalize_optional(Some(query.keyword.as_str())).unwrap_or_default();
    if keyword.is_empty() {
        return Ok(Json(ApiResponse::success(Vec::new())));
    }
    let like = format!("%{}%", keyword);
    let rows = if query.r#type.eq_ignore_ascii_case("phone") {
        sqlx::query(&user_select_sql("phone LIKE ?"))
            .bind(like)
            .fetch_all(&state.db)
            .await?
    } else if query.r#type.eq_ignore_ascii_case("email") {
        sqlx::query(&user_select_sql("email LIKE ?"))
            .bind(like)
            .fetch_all(&state.db)
            .await?
    } else {
        sqlx::query(&user_select_sql("(username LIKE ? OR nickname LIKE ?)"))
            .bind(&like)
            .bind(&like)
            .fetch_all(&state.db)
            .await?
    };
    Ok(Json(ApiResponse::success(
        rows.into_iter()
            .map(|row| user_from_row(&row).to_dto())
            .collect(),
    )))
}

pub(crate) async fn heartbeat(
    State(state): State<AppState>,
    headers: HeaderMap,
    body: Bytes,
) -> Result<Json<ApiResponse<HashMap<String, bool>>>, AppError> {
    let identity = identity_from_headers(&headers, &state.config)?;
    let heartbeat_path = format!("/api/im/heartbeat/{}", identity.user_id);
    if let Err(error) = signed_internal_post::<Value>(
        &state,
        &format!(
            "{}{}",
            state.config.im_server_url.trim_end_matches('/'),
            heartbeat_path
        ),
        &heartbeat_path,
        Bytes::new(),
    )
    .await
    {
        tracing::warn!(error = %error, user_id = identity.user_id, "failed to refresh im heartbeat");
    }
    online_status_impl(state, body).await
}

pub(crate) async fn online_status(
    State(state): State<AppState>,
    headers: HeaderMap,
    body: Bytes,
) -> Result<Json<ApiResponse<HashMap<String, bool>>>, AppError> {
    let _identity = identity_from_headers(&headers, &state.config)?;
    online_status_impl(state, body).await
}

pub(crate) async fn settings(
    headers: HeaderMap,
    State(state): State<AppState>,
) -> Result<Json<ApiResponse<UserSettings>>, AppError> {
    let identity = identity_from_headers(&headers, &state.config)?;
    let user_id = identity.user_id;

    // 查询 user_settings 表
    let json_str: Option<String> = sqlx::query_scalar(
        "SELECT CAST(settings AS CHAR) AS settings \
         FROM service_user_service_db.user_settings WHERE user_id = ?",
    )
    .bind(user_id)
    .fetch_optional(&state.db)
    .await?;

    match json_str {
        Some(raw) => {
            let user_settings: UserSettings = match serde_json::from_str(&raw) {
                Ok(s) => s,
                Err(e) => {
                    log::warn!("Failed to parse user_settings for user {}: {}", user_id, e);
                    default_settings()
                }
            };
            Ok(Json(ApiResponse::success(user_settings)))
        }
        None => {
            // 不存在记录时，返回默认设置并创建记录
            let defaults = default_settings();
            let raw = serde_json::to_string(&defaults)?;

            // 使用 INSERT ... ON DUPLICATE KEY UPDATE 避免并发竞态条件
            sqlx::query(
                "INSERT INTO service_user_service_db.user_settings (user_id, settings) VALUES (?, ?)
                 ON DUPLICATE KEY UPDATE settings = VALUES(settings)",
            )
            .bind(user_id)
            .bind(&raw)
            .execute(&state.db)
            .await?;

            Ok(Json(ApiResponse::success(defaults)))
        }
    }
}

/// 递归合并 JSON 对象，实现字段级更新
/// - 如果 base 和 patch 都是对象，递归合并 patch 中的字段到 base
/// - 否则直接用 patch 替换 base
fn merge_json(base: &mut Value, patch: Value) {
    if let (Some(base_obj), Some(patch_obj)) = (base.as_object_mut(), patch.as_object()) {
        for (key, value) in patch_obj {
            if let Some(base_value) = base_obj.get_mut(key) {
                merge_json(base_value, value.clone());
            } else {
                base_obj.insert(key.clone(), value.clone());
            }
        }
    } else {
        *base = patch;
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn test_merge_json_basic() {
        let mut base = json!({
            "privacy": {
                "read_receipt": true,
                "online_status": true
            }
        });
        let patch = json!({
            "privacy": {
                "read_receipt": false
            }
        });

        merge_json(&mut base, patch);

        // read_receipt 应该被更新为 false
        assert_eq!(base["privacy"]["read_receipt"], false);
        // online_status 应该保持不变
        assert_eq!(base["privacy"]["online_status"], true);
    }

    #[test]
    fn test_merge_json_new_field() {
        let mut base = json!({
            "privacy": {
                "read_receipt": true
            }
        });
        let patch = json!({
            "privacy": {
                "online_status": false
            }
        });

        merge_json(&mut base, patch);

        // read_receipt 应该保持不变
        assert_eq!(base["privacy"]["read_receipt"], true);
        // online_status 应该被添加
        assert_eq!(base["privacy"]["online_status"], false);
    }

    #[test]
    fn test_merge_json_nested() {
        let mut base = json!({
            "settings": {
                "privacy": {
                    "read_receipt": true,
                    "online_status": true
                },
                "general": {
                    "language": "zh-CN"
                }
            }
        });
        let patch = json!({
            "settings": {
                "privacy": {
                    "read_receipt": false
                }
            }
        });

        merge_json(&mut base, patch);

        // privacy.read_receipt 应该被更新
        assert_eq!(base["settings"]["privacy"]["read_receipt"], false);
        // privacy.online_status 应该保持不变
        assert_eq!(base["settings"]["privacy"]["online_status"], true);
        // general 应该保持不变
        assert_eq!(base["settings"]["general"]["language"], "zh-CN");
    }

    #[test]
    fn test_merge_json_non_object_replacement() {
        let mut base = json!("old_value");
        let patch = json!("new_value");

        merge_json(&mut base, patch);

        // 非对象类型应该直接替换
        assert_eq!(base, "new_value");
    }
}

pub(crate) async fn update_settings(
    headers: HeaderMap,
    State(state): State<AppState>,
    Path(kind): Path<String>,
    Json(payload): Json<Value>,
) -> Result<Json<ApiResponse<bool>>, AppError> {
    let identity = identity_from_headers(&headers, &state.config)?;
    let user_id = identity.user_id;

    // 验证 kind 参数
    let valid_kinds = ["privacy", "message", "general"];
    if !valid_kinds.contains(&kind.as_str()) {
        return Err(AppError::BadRequest("无效的设置分类".to_string()));
    }

    // 查询现有设置
    let existing = sqlx::query_scalar::<_, String>(
        "SELECT CAST(settings AS CHAR) AS settings \
         FROM service_user_service_db.user_settings WHERE user_id = ?",
    )
    .bind(user_id)
    .fetch_optional(&state.db)
    .await?;

    let default_settings_value = serde_json::to_value(default_settings())?;
    let mut settings_value: serde_json::Value = match existing {
        Some(json_str) => serde_json::from_str(&json_str).unwrap_or(default_settings_value),
        None => default_settings_value,
    };

    // 更新对应节点（使用深度合并，保留其他字段）
    if let Some(obj) = settings_value.as_object_mut() {
        if let Some(existing) = obj.get_mut(&kind) {
            merge_json(existing, payload);
        } else {
            obj.insert(kind.clone(), payload);
        }
    }

    // 保存到数据库
    let json_str = serde_json::to_string(&settings_value)?;

    sqlx::query(
        "INSERT INTO service_user_service_db.user_settings (user_id, settings) VALUES (?, ?)
         ON DUPLICATE KEY UPDATE settings = VALUES(settings)",
    )
    .bind(user_id)
    .bind(&json_str)
    .execute(&state.db)
    .await?;

    // 更新 Redis 缓存
    let cache_key = format!("user_settings:{}", user_id);
    let _ = state
        .redis_manager
        .clone()
        .set_ex::<_, _, ()>(&cache_key, &json_str, 3600_u64)
        .await;

    Ok(Json(ApiResponse::success(true)))
}

pub(crate) async fn upload_avatar(
    headers: HeaderMap,
    State(state): State<AppState>,
    mut multipart: Multipart,
) -> Result<Json<ApiResponse<serde_json::Value>>, AppError> {
    let identity = identity_from_headers(&headers, &state.config)?;
    let user_id = identity.user_id;

    let mut file_data: Option<Vec<u8>> = None;
    let mut file_ext: Option<String> = None;

    while let Some(field) = multipart
        .next_field()
        .await
        .map_err(|e| AppError::BadRequest(format!("读取文件失败: {}", e)))?
    {
        let name = field.name().unwrap_or("").to_string();
        if name != "avatar" {
            continue;
        }

        // 获取文件名和扩展名
        let filename = field.file_name().unwrap_or("unknown").to_string();

        let ext = filename.rsplit('.').next().unwrap_or("jpg").to_lowercase();

        // 验证文件类型
        let allowed_exts = ["jpg", "jpeg", "png", "gif"];
        if !allowed_exts.contains(&ext.as_str()) {
            return Err(AppError::BadRequest(
                "不支持的文件类型（仅支持 jpg、png、gif）".to_string(),
            ));
        }

        // 验证文件内容类型与扩展名匹配（防止将可执行文件重命名为图片扩展名绕过校验）
        let content_type = field.content_type().unwrap_or("").to_string();
        let expected_content_type = match ext.as_str() {
            "jpg" | "jpeg" => "image/jpeg",
            "png" => "image/png",
            "gif" => "image/gif",
            _ => "",
        };

        if !expected_content_type.is_empty() && !content_type.contains(expected_content_type) {
            return Err(AppError::BadRequest(
                "文件内容类型与扩展名不匹配".to_string(),
            ));
        }

        // 读取文件数据
        let data = field
            .bytes()
            .await
            .map_err(|e| AppError::BadRequest(format!("读取文件内容失败: {}", e)))?;

        // 验证 Magic Bytes（防止伪造文件内容）
        let magic_valid = match ext.as_str() {
            "jpg" | "jpeg" => data.starts_with(&[0xFF, 0xD8, 0xFF]),
            "png" => data.starts_with(&[0x89, 0x50, 0x4E, 0x47]),
            "gif" => data.starts_with(&[0x47, 0x49, 0x46, 0x38]),
            _ => false,
        };

        if !magic_valid {
            return Err(AppError::BadRequest(
                "文件内容不是有效的图片格式".to_string(),
            ));
        }

        // 验证文件大小（最大 2MB）
        if data.len() > 2 * 1024 * 1024 {
            return Err(AppError::BadRequest(
                "文件大小超过限制（最大 2MB）".to_string(),
            ));
        }

        if data.is_empty() {
            return Err(AppError::BadRequest("文件为空".to_string()));
        }

        file_data = Some(data.to_vec());
        file_ext = Some(ext);
    }

    let data = file_data.ok_or_else(|| AppError::BadRequest("未找到 avatar 文件".to_string()))?;
    let ext = file_ext.unwrap_or_else(|| "jpg".to_string());

    // 获取当前头像路径（用于删除旧文件）
    let old_avatar = sqlx::query_scalar::<_, Option<String>>(
        "SELECT avatar FROM service_user_service_db.users WHERE id = ?",
    )
    .bind(user_id)
    .fetch_optional(&state.db)
    .await?;

    // 生成新文件名
    let timestamp = chrono::Utc::now().timestamp();
    let new_filename = format!("{}_{}.{}", user_id, timestamp, ext);
    let upload_dir = std::path::Path::new("uploads/avatars");
    std::fs::create_dir_all(upload_dir)?;

    let file_path = upload_dir.join(&new_filename);
    std::fs::write(&file_path, &data)?;

    // 删除旧头像文件
    if let Some(Some(old_path)) = old_avatar {
        let old_file = std::path::Path::new(&old_path);
        if old_file.exists() {
            let _ = std::fs::remove_file(old_file);
        }
    }

    // 更新数据库
    let avatar_url = format!("/uploads/avatars/{}", new_filename);
    sqlx::query("UPDATE service_user_service_db.users SET avatar = ? WHERE id = ?")
        .bind(&avatar_url)
        .bind(user_id)
        .execute(&state.db)
        .await?;

    Ok(Json(ApiResponse::success(serde_json::json!({
        "avatar_url": avatar_url
    }))))
}
