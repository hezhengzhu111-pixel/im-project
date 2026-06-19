use super::*;
use crate::auth::identity_from_headers;
use crate::error::AppError;
use crate::web::AppState;
use axum::extract::{Query, State};
use axum::http::HeaderMap;
use axum::Json;
use im_common::api::ApiResponse;
use sqlx::Row;
use std::collections::HashMap;

const OPK_LOW_WATERMARK_THRESHOLD: i64 = 20;
const OPK_TARGET_COUNT: i64 = 100;
const OPK_CONSUMED_RETENTION_DAYS: i64 = 7;

/// X25519 公钥的字节长度（Signal/X3DH 协议标准）。

/// Ed25519 签名的字节长度。
///
/// 当前协议约定使用 Ed25519 对 signed pre-key 进行签名，签名固定为 64 字节。
/// 如果未来支持其他签名算法（如 ECDSA P-256 的 64–72 字节可变长度），
/// 需要将此处替换为范围校验。

/// 上传当前设备的 PreKey Bundle。
///
/// POST /api/keys/bundle
///
/// 业务目的：注册或更新当前设备的 E2EE 公钥材料，供其他用户发起会话协商时拉取。
/// 认证要求：需要有效的 JWT access token。
/// 安全约束：仅保存公钥（identity_key、signed_pre_key、one_time_pre_keys）及签名，
/// 不保存任何私钥。幂等操作——同一 (user_id, device_id) 会更新设备记录，
/// 删除旧的一次性预密钥后重新插入。
/// 返回语义：成功返回 "ok"。
pub(crate) async fn upload_bundle(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(request): Json<UploadBundleRequest>,
) -> Result<Json<ApiResponse<String>>, AppError> {
    let identity = identity_from_headers(&headers, &state.config)?;
    validate_bundle(&request)?;

    let user_id = identity.user_id;
    let device_id = &request.device_id;

    let mut tx = state.db.begin().await?;

    // 幂等 upsert 设备记录
    sqlx::query(
        r#"INSERT INTO service_user_service_db.e2ee_devices
           (user_id, device_id, status, identity_key, signing_identity_key, signed_pre_key, signed_pre_key_signature)
           VALUES (?, ?, 'active', ?, ?, ?, ?)
           ON DUPLICATE KEY UPDATE
             status = 'active',
             identity_key = VALUES(identity_key),
             signing_identity_key = VALUES(signing_identity_key),
             signed_pre_key = VALUES(signed_pre_key),
             signed_pre_key_signature = VALUES(signed_pre_key_signature),
             last_active_at = NOW()"#,
    )
    .bind(user_id)
    .bind(device_id)
    .bind(&request.identity_key)
    .bind(&request.signing_identity_key)
    .bind(&request.signed_pre_key)
    .bind(&request.signed_pre_key_signature)
    .execute(&mut *tx)
    .await?;

    // 删除该设备旧的一次性预密钥
    sqlx::query(
        "DELETE FROM service_user_service_db.e2ee_one_time_pre_keys \
         WHERE user_id = ? AND device_id = ?",
    )
    .bind(user_id)
    .bind(device_id)
    .execute(&mut *tx)
    .await?;

    // 同时清除该设备已有的 pre-key claim，防止重新上传后旧 claim 引用不存在的 OTK。
    sqlx::query(
        "DELETE FROM service_user_service_db.e2ee_pre_key_claims \
         WHERE target_user_id = ? AND target_device_id = ?",
    )
    .bind(user_id)
    .bind(device_id)
    .execute(&mut *tx)
    .await?;

    let signatures_by_id: HashMap<i32, String> = request
        .one_time_pre_key_signatures
        .iter()
        .map(|sig| (sig.id, sig.signature.clone()))
        .collect();

    // 批量插入新的一次性预密钥（含签名）
    for entry in &request.one_time_pre_keys {
        let signature = signatures_by_id.get(&entry.id).ok_or_else(|| {
            AppError::BadRequest(format!(
                "missing signature for one_time_pre_key id={}",
                entry.id
            ))
        })?;
        sqlx::query(
            r#"INSERT INTO service_user_service_db.e2ee_one_time_pre_keys
               (user_id, device_id, pre_key, pre_key_id, consumed, pre_key_signature)
               VALUES (?, ?, ?, ?, 0, ?)"#,
        )
        .bind(user_id)
        .bind(device_id)
        .bind(&entry.key)
        .bind(entry.id)
        .bind(signature)
        .execute(&mut *tx)
        .await?;
    }

    tx.commit().await?;

    Ok(Json(ApiResponse::success("ok".to_string())))
}

/// 获取目标用户的 PreKey Bundle。
///
/// GET /api/keys/bundle?userId=xxx&deviceId=yyy&conversationId=p_1_2&requesterDeviceId=abc
///
/// 业务目的：拉取目标设备的公钥材料，用于发起 X3DH 密钥协商。
/// 认证要求：需要有效的 JWT access token。
///
/// 安全约束：
/// - 强制要求 conversationId 和 requesterDeviceId，缺少任一返回 400 BadRequest。
/// - 校验 requester 和 target 均为 conversation 成员（非成员返回 403）。
/// - 校验 deviceId 属于 target 且 active（不匹配返回 403）。
/// - 校验 requesterDeviceId 属于当前登录用户且 active（不匹配返回 403）。
/// - 通过后原子 claim 一个 one-time pre-key，同一组
///   (requester, requesterDeviceId, target, targetDeviceId, conversationId)
///   重复请求幂等返回同一 pre-key。
/// - 无可用 one-time pre-key 时返回 signed pre-key fallback（one_time_pre_key 为 null）。
///
/// 返回语义：设备不存在返回 404，参数缺失返回 400，非成员/设备不匹配返回 403。
pub(crate) async fn get_bundle(
    State(state): State<AppState>,
    headers: HeaderMap,
    Query(params): Query<HashMap<String, String>>,
) -> Result<Json<ApiResponse<PreKeyBundleDto>>, AppError> {
    let identity = identity_from_headers(&headers, &state.config)?;

    let target_user_id = parse_user_id(
        params
            .get("userId")
            .ok_or_else(|| AppError::BadRequest("missing userId".to_string()))?,
    )?;

    let device_id = params
        .get("deviceId")
        .ok_or_else(|| AppError::BadRequest("missing deviceId".to_string()))?;

    if device_id.is_empty() || device_id.len() > MAX_DEVICE_ID_LEN {
        return Err(AppError::BadRequest("invalid deviceId".to_string()));
    }

    // 查询设备信息（总是需要的，用于返回 signed pre-key 材料）
    let device_row = sqlx::query(
        r#"SELECT identity_key, COALESCE(signing_identity_key, identity_key) AS signing_identity_key,
                  signed_pre_key, signed_pre_key_signature
           FROM service_user_service_db.e2ee_devices
           WHERE user_id = ? AND device_id = ? AND status = 'active'"#,
    )
    .bind(target_user_id)
    .bind(device_id)
    .fetch_optional(&state.db)
    .await?;

    let Some(device_row) = device_row else {
        return Err(AppError::NotFound("device not found".to_string()));
    };

    let identity_key: String = device_row.get("identity_key");
    let signing_identity_key: String = device_row.get("signing_identity_key");
    let signed_pre_key: String = device_row.get("signed_pre_key");
    let signed_pre_key_signature: String = device_row.get("signed_pre_key_signature");

    // 构建基础响应（不含 one-time pre-key）
    let base_dto = PreKeyBundleDto {
        user_id: target_user_id.to_string(),
        device_id: device_id.clone(),
        identity_key: identity_key.clone(),
        signing_identity_key: signing_identity_key.clone(),
        signed_pre_key: signed_pre_key.clone(),
        signed_pre_key_signature: signed_pre_key_signature.clone(),
        one_time_pre_key: None,
        one_time_pre_key_id: None,
        one_time_pre_key_signature: None,
        opk_fallback: false,
    };

    // ---- conversationId：强制要求 ----
    let conversation_id = params
        .get("conversationId")
        .map(String::as_str)
        .filter(|s| !s.trim().is_empty())
        .ok_or_else(|| AppError::BadRequest("missing conversationId".to_string()))?;

    // ---- requesterDeviceId：强制要求 ----
    let requester_device_id = params
        .get("requesterDeviceId")
        .map(String::as_str)
        .filter(|s| !s.trim().is_empty())
        .ok_or_else(|| AppError::BadRequest("missing requesterDeviceId".to_string()))?;

    if requester_device_id.len() > MAX_DEVICE_ID_LEN {
        return Err(AppError::BadRequest(
            "invalid requesterDeviceId".to_string(),
        ));
    }

    // 1. requester 必须是 conversation 成员
    if let Err(e) = ensure_conversation_member(&state.db, identity.user_id, conversation_id).await {
        tracing::warn!(
            requester_user_id = %identity.user_id,
            target_user_id = %target_user_id,
            %conversation_id,
            error = %e,
            "get_bundle: non-member attempted to claim pre-key"
        );
        return Err(e);
    }

    // 2. target 必须是 conversation 成员
    if let Err(e) = ensure_conversation_member(&state.db, target_user_id, conversation_id).await {
        tracing::warn!(
            requester_user_id = %identity.user_id,
            target_user_id = %target_user_id,
            %conversation_id,
            error = %e,
            "get_bundle: target is not a conversation member"
        );
        return Err(e);
    }

    // 3. deviceId 必须属于 target_user_id 且 active
    if let Err(e) = ensure_device_belongs_to_user(&state.db, device_id, target_user_id).await {
        tracing::warn!(
            requester_user_id = %identity.user_id,
            target_user_id = %target_user_id,
            target_device_id = %device_id,
            error = %e,
            "get_bundle: device does not belong to target user"
        );
        return Err(e);
    }

    // 4. requesterDeviceId 必须属于当前登录用户且 active
    if let Err(e) =
        ensure_device_belongs_to_user(&state.db, requester_device_id, identity.user_id).await
    {
        tracing::warn!(
            requester_user_id = %identity.user_id,
            %requester_device_id,
            error = %e,
            "get_bundle: requesterDeviceId does not belong to current user"
        );
        return Err(e);
    }

    // ---- 事务内原子 claim one-time pre-key（先占位再消费） ----
    // 策略：先尝试 INSERT 占位 claim（pre-key 字段全 NULL），
    // 成功则拥有 claim 权，再消费 pre-key 并 UPDATE claim；
    // 唯一键冲突则不消费任何 pre-key，回滚后重读已有 claim。
    // 外层循环处理 stale claim：当已有 claim 引用的 OTK 已被对方消费后，
    // 删除旧 claim 并重试一次以创建新 claim。
    for _attempt in 0..2 {
        let mut tx = state.db.begin().await?;

        match sqlx::query(
            r#"INSERT INTO service_user_service_db.e2ee_pre_key_claims
           (requester_user_id, requester_device_id, target_user_id, target_device_id,
            conversation_id, one_time_pre_key_row_id, one_time_pre_key_id, one_time_pre_key)
           VALUES (?, ?, ?, ?, ?, NULL, NULL, NULL)"#,
        )
        .bind(identity.user_id)
        .bind(requester_device_id)
        .bind(target_user_id)
        .bind(device_id)
        .bind(conversation_id)
        .execute(&mut *tx)
        .await
        {
            Ok(_) => {
                // INSERT 成功：当前请求拥有 claim 权，尝试消费一个 one-time pre-key
                let otp_row = sqlx::query(
                    r#"SELECT id, pre_key, COALESCE(pre_key_id, 0) AS pre_key_id,
                          pre_key_signature
                   FROM service_user_service_db.e2ee_one_time_pre_keys
                   WHERE user_id = ? AND device_id = ? AND consumed = 0
                   LIMIT 1
                   FOR UPDATE"#,
                )
                .bind(target_user_id)
                .bind(device_id)
                .fetch_optional(&mut *tx)
                .await?;

                if let Some(ref row) = otp_row {
                    let row_id: i64 = row.get("id");
                    let pre_key: String = row.get("pre_key");
                    let pre_key_id: Option<i32> = row.try_get::<i32, _>("pre_key_id").ok();
                    let pre_key_signature: Option<String> = row
                        .try_get::<Option<String>, _>("pre_key_signature")
                        .ok()
                        .flatten();

                    sqlx::query(
                        "UPDATE service_user_service_db.e2ee_one_time_pre_keys \
                     SET consumed = 1, consumed_time = NOW() WHERE id = ?",
                    )
                    .bind(row_id)
                    .execute(&mut *tx)
                    .await?;

                    // 回填 claim 记录
                    sqlx::query(
                        r#"UPDATE service_user_service_db.e2ee_pre_key_claims
                       SET one_time_pre_key_row_id = ?,
                           one_time_pre_key_id = ?,
                           one_time_pre_key = ?
                       WHERE requester_user_id = ? AND requester_device_id = ?
                         AND target_user_id = ? AND target_device_id = ?
                         AND conversation_id = ?"#,
                    )
                    .bind(Some(row_id))
                    .bind(pre_key_id)
                    .bind(Some(&pre_key))
                    .bind(identity.user_id)
                    .bind(requester_device_id)
                    .bind(target_user_id)
                    .bind(device_id)
                    .bind(conversation_id)
                    .execute(&mut *tx)
                    .await?;

                    tx.commit().await?;

                    let mut dto = base_dto;
                    dto.one_time_pre_key = Some(pre_key);
                    dto.one_time_pre_key_id = pre_key_id;
                    dto.one_time_pre_key_signature = pre_key_signature;
                    return Ok(Json(ApiResponse::success(dto)));
                } else {
                    // 无可用 pre-key：保留空 claim（signed pre-key fallback），后续请求幂等返回相同结果
                    tx.commit().await?;
                    let mut dto = base_dto;
                    dto.opk_fallback = true;
                    return Ok(Json(ApiResponse::success(dto)));
                }
            }
            Err(sqlx::Error::Database(ref db_err)) if db_err.code().as_deref() == Some("23000") => {
                // 唯一键冲突：另一并发请求或上一次协商已创建 claim
                tx.rollback().await.ok();

                // 读取已有 claim，检查其引用的 OTK 是否仍有效
                let claim = sqlx::query(
                    r#"SELECT one_time_pre_key_row_id, one_time_pre_key_id, one_time_pre_key
                   FROM service_user_service_db.e2ee_pre_key_claims
                   WHERE requester_user_id = ? AND requester_device_id = ?
                     AND target_user_id = ? AND target_device_id = ?
                     AND conversation_id = ?"#,
                )
                .bind(identity.user_id)
                .bind(requester_device_id)
                .bind(target_user_id)
                .bind(device_id)
                .bind(conversation_id)
                .fetch_optional(&state.db)
                .await?;

                // 检查已有 claim 的 OTK 是否已被消耗（例如被 respondToNegotiation 消费后
                // 重新发起协商时，旧 claim 引用的 OTK 已不存在于本地）——如果是则删除旧
                // claim 并重试，让下一次 INSERT 创建新 claim 消费新 OTK
                let mut otk_signature: Option<String> = None;
                if let Some(ref claim_row) = claim {
                    let otk_row_id: Option<i64> = claim_row.get("one_time_pre_key_row_id");
                    if let Some(row_id) = otk_row_id {
                        let otk_row = sqlx::query(
                            "SELECT pre_key_signature FROM service_user_service_db.e2ee_one_time_pre_keys \
                         WHERE id = ?",
                        )
                        .bind(row_id)
                        .fetch_optional(&state.db)
                        .await?;

                        if otk_row.is_none() {
                            tracing::info!(
                                requester_user_id = %identity.user_id,
                                target_user_id = %target_user_id,
                                %conversation_id,
                                %row_id,
                                "e2ee_pre_key_claims stale claim detected, deleting and retrying"
                            );
                            sqlx::query(
                                "DELETE FROM service_user_service_db.e2ee_pre_key_claims \
                             WHERE requester_user_id = ? AND requester_device_id = ? \
                               AND target_user_id = ? AND target_device_id = ? \
                               AND conversation_id = ?",
                            )
                            .bind(identity.user_id)
                            .bind(requester_device_id)
                            .bind(target_user_id)
                            .bind(device_id)
                            .bind(conversation_id)
                            .execute(&state.db)
                            .await?;

                            // 旧 claim 已删除，重试循环——INSERT 将成功创建新 claim
                            continue;
                        }
                        otk_signature = otk_row
                            .and_then(|row| {
                                row.try_get::<Option<String>, _>("pre_key_signature").ok()
                            })
                            .flatten();
                    }
                }

                let mut dto = base_dto;
                if let Some(claim) = claim {
                    dto.one_time_pre_key = claim.get("one_time_pre_key");
                    dto.one_time_pre_key_id = claim.get("one_time_pre_key_id");
                    dto.one_time_pre_key_signature = otk_signature;
                    dto.opk_fallback = dto.one_time_pre_key.is_none();
                }
                return Ok(Json(ApiResponse::success(dto)));
            }
            Err(e) => return Err(e.into()),
        }
    } // end for attempt loop
      // 循环内所有分支均有 return，此处仅在重试次数耗尽时到达
    Err(AppError::Conflict(
        "pre-key claim unavailable, please retry".to_string(),
    ))
}

pub(crate) async fn opk_status(
    State(state): State<AppState>,
    headers: HeaderMap,
    Query(params): Query<HashMap<String, String>>,
) -> Result<Json<ApiResponse<OpkStatusDto>>, AppError> {
    let identity = identity_from_headers(&headers, &state.config)?;
    let device_id = params
        .get("deviceId")
        .map(String::as_str)
        .filter(|value| !value.trim().is_empty())
        .ok_or_else(|| AppError::BadRequest("missing deviceId".to_string()))?;
    ensure_device_belongs_to_user(&state.db, device_id, identity.user_id).await?;

    let count: i64 = sqlx::query_scalar(
        "SELECT COUNT(*) FROM service_user_service_db.e2ee_one_time_pre_keys \
         WHERE user_id = ? AND device_id = ? AND consumed = 0",
    )
    .bind(identity.user_id)
    .bind(device_id)
    .fetch_one(&state.db)
    .await?;

    Ok(Json(ApiResponse::success(OpkStatusDto {
        device_id: device_id.to_string(),
        count,
        low_watermark: count < OPK_LOW_WATERMARK_THRESHOLD,
        low_watermark_threshold: OPK_LOW_WATERMARK_THRESHOLD,
        target_count: OPK_TARGET_COUNT,
        fallback_policy: "signed_pre_key_marked".to_string(),
    })))
}

pub(crate) async fn refill_opk(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(request): Json<RefillOpkRequest>,
) -> Result<Json<ApiResponse<OpkStatusDto>>, AppError> {
    let identity = identity_from_headers(&headers, &state.config)?;
    if request.device_id.is_empty() || request.device_id.len() > MAX_DEVICE_ID_LEN {
        return Err(AppError::BadRequest("invalid deviceId".to_string()));
    }
    ensure_device_belongs_to_user(&state.db, &request.device_id, identity.user_id).await?;
    validate_pre_key_entries(&request.one_time_pre_keys)?;
    let signatures_by_id = validate_one_time_pre_key_signatures(
        &request.one_time_pre_keys,
        &request.one_time_pre_key_signatures,
    )?;

    let mut tx = state.db.begin().await?;
    for entry in &request.one_time_pre_keys {
        let signature = signatures_by_id.get(&entry.id).ok_or_else(|| {
            AppError::BadRequest(format!(
                "missing signature for one_time_pre_key id={}",
                entry.id
            ))
        })?;
        sqlx::query(
            r#"INSERT INTO service_user_service_db.e2ee_one_time_pre_keys
               (user_id, device_id, pre_key, pre_key_id, consumed, pre_key_signature)
               VALUES (?, ?, ?, ?, 0, ?)"#,
        )
        .bind(identity.user_id)
        .bind(&request.device_id)
        .bind(&entry.key)
        .bind(entry.id)
        .bind(signature)
        .execute(&mut *tx)
        .await?;
    }
    tx.commit().await?;

    let count: i64 = sqlx::query_scalar(
        "SELECT COUNT(*) FROM service_user_service_db.e2ee_one_time_pre_keys \
         WHERE user_id = ? AND device_id = ? AND consumed = 0",
    )
    .bind(identity.user_id)
    .bind(&request.device_id)
    .fetch_one(&state.db)
    .await?;

    Ok(Json(ApiResponse::success(OpkStatusDto {
        device_id: request.device_id,
        count,
        low_watermark: count < OPK_LOW_WATERMARK_THRESHOLD,
        low_watermark_threshold: OPK_LOW_WATERMARK_THRESHOLD,
        target_count: OPK_TARGET_COUNT,
        fallback_policy: "signed_pre_key_marked".to_string(),
    })))
}

pub(crate) async fn delete_expired_opk(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> Result<Json<ApiResponse<u64>>, AppError> {
    let identity = identity_from_headers(&headers, &state.config)?;
    let result = sqlx::query(
        "DELETE FROM service_user_service_db.e2ee_one_time_pre_keys \
         WHERE user_id = ? AND consumed = 1 \
           AND consumed_time IS NOT NULL \
           AND consumed_time < DATE_SUB(NOW(), INTERVAL ? DAY)",
    )
    .bind(identity.user_id)
    .bind(OPK_CONSUMED_RETENTION_DAYS)
    .execute(&state.db)
    .await?;
    Ok(Json(ApiResponse::success(result.rows_affected())))
}
