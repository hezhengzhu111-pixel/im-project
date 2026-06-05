use super::*;
use crate::auth::identity_from_headers;
use crate::error::AppError;
use crate::web::AppState;
use axum::extract::{Path, State};
use axum::http::HeaderMap;
use axum::Json;
use im_rs_common::api::ApiResponse;
use sqlx::Row;

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

/// 发起端到端加密协商请求。
///
/// POST /api/e2ee/request
///
/// 业务目的：向目标用户发起 E2EE 会话协商，创建 pending 状态的会话记录。
/// 认证要求：需要有效的 JWT access token。
/// 安全约束：
/// - session_id 格式为 `{id_a}_{id_b}` 或 `p_{id_a}_{id_b}`，发起者必须是其中一方；
/// - 双方必须存在真实好友关系（im_friend 双向 status=1）；
/// - 仅保存公钥材料，不保存任何私钥；
/// - 已 encrypted 的会话不能被普通 request 覆盖，需走 rotate/rekey；
/// - 同一 requester 对 pending 重复 request 幂等返回；
/// - pending 状态下另一方 request 返回 Conflict，不允许翻转 requester/target。
pub(crate) async fn request_encryption(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(request): Json<E2eeSessionRequest>,
) -> Result<Json<ApiResponse<String>>, AppError> {
    let identity = identity_from_headers(&headers, &state.config)?;
    validate_session_id(&request.session_id)?;
    validate_optional_key(request.identity_key.as_deref(), "identity_key")?;
    validate_optional_key(request.signed_pre_key.as_deref(), "signed_pre_key")?;

    if let Some(ref payload) = request.request_payload_json {
        if payload.len() > MAX_PAYLOAD_LEN {
            return Err(AppError::BadRequest(
                "request_payload_json too large".to_string(),
            ));
        }
    }

    // 验证调用者是合法参与者 + 好友关系存在
    let peer_user_id =
        ensure_e2ee_session_participant(&state.db, identity.user_id, &request.session_id).await?;

    // 加载现有协商状态
    let existing = load_negotiation_state(&state.db, &request.session_id).await?;

    if let Some((ref status, ref existing_requester, _, _, _)) = existing {
        match status.as_str() {
            "encrypted" => {
                // 已加密的会话不能被普通 request 重置为 pending，
                // 需要走 rotate/rekey 接口进行重新协商。
                return Err(AppError::Conflict(
                    "session already encrypted; use rotate to renegotiate".to_string(),
                ));
            }
            "pending" if *existing_requester == identity.user_id => {
                // 同一 requester 重复 request：幂等，仅更新 payload
                sqlx::query(
                    "UPDATE service_user_service_db.e2ee_sessions \
                     SET request_payload_json = ?, updated_time = NOW() \
                     WHERE session_id = ?",
                )
                .bind(&request.request_payload_json)
                .bind(&request.session_id)
                .execute(&state.db)
                .await?;

                let negotiation = load_negotiation_state(&state.db, &request.session_id).await?;
                let (cur_sv, cur_ut) = negotiation
                    .map(|(_, _, _, sv, ut)| (sv, Some(ut)))
                    .unwrap_or((1, None));
                let requester_name = resolve_user_display_name(&state, identity.user_id)
                    .await?
                    .unwrap_or_else(|| identity.username.clone());
                let push = E2eeNegotiationPush {
                    action: "request".to_string(),
                    session_id: request.session_id.clone(),
                    requester_id: identity.user_id.to_string(),
                    requester_name,
                    target_user_id: peer_user_id.to_string(),
                    request_payload_json: request.request_payload_json.clone(),
                    updated_time: cur_ut.map(|t| t.and_utc().to_rfc3339()),
                    state_version: Some(cur_sv),
                };
                let _ = push_negotiation_event(&state, peer_user_id, &push).await;
                return Ok(Json(ApiResponse::success("ok".to_string())));
            }
            "pending" => {
                return Err(AppError::Conflict(
                    "pending request already exists".to_string(),
                ));
            }
            "rejected" | "plaintext" => {
                // 允许重新发起协商
            }
            s => {
                return Err(AppError::Conflict(format!(
                    "cannot request encryption in '{s}' state"
                )));
            }
        }
    }

    // INSERT 或 UPDATE（非 encrypted、非同一 requester 的 pending）
    if existing.is_some() {
        sqlx::query(
            "UPDATE service_user_service_db.e2ee_sessions \
             SET requester_id = ?, target_user_id = ?, status = 'pending', \
                 request_payload_json = ?, state_version = state_version + 1, \
                 updated_time = NOW() \
             WHERE session_id = ?",
        )
        .bind(identity.user_id)
        .bind(peer_user_id)
        .bind(&request.request_payload_json)
        .bind(&request.session_id)
        .execute(&state.db)
        .await?;
    } else {
        sqlx::query(
            "INSERT INTO service_user_service_db.e2ee_sessions \
             (session_id, requester_id, target_user_id, status, request_payload_json, state_version) \
             VALUES (?, ?, ?, 'pending', ?, 1)",
        )
        .bind(&request.session_id)
        .bind(identity.user_id)
        .bind(peer_user_id)
        .bind(&request.request_payload_json)
        .execute(&state.db)
        .await?;
    }

    // 重新加载以获取更新后的 state_version 和 updated_time
    let updated_state = load_negotiation_state(&state.db, &request.session_id).await?;
    let (state_version, updated_time) = updated_state
        .map(|(_, _, _, sv, ut)| (sv, Some(ut)))
        .unwrap_or((1, None));

    let requester_name = resolve_user_display_name(&state, identity.user_id)
        .await?
        .unwrap_or_else(|| identity.username.clone());
    let push = E2eeNegotiationPush {
        action: "request".to_string(),
        session_id: request.session_id.clone(),
        requester_id: identity.user_id.to_string(),
        requester_name,
        target_user_id: peer_user_id.to_string(),
        request_payload_json: request.request_payload_json.clone(),
        updated_time: updated_time.map(|t| t.and_utc().to_rfc3339()),
        state_version: Some(state_version),
    };
    if let Err(error) = push_negotiation_event(&state, peer_user_id, &push).await {
        tracing::warn!(
            error = %error,
            session_id = %request.session_id,
            target_user_id = %peer_user_id,
            "failed to push e2ee negotiation request"
        );
    }

    Ok(Json(ApiResponse::success("ok".to_string())))
}

/// 查询当前用户待确认的 E2EE 私聊协商请求。
pub(crate) async fn pending_encryption_requests(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> Result<Json<ApiResponse<Vec<PendingE2eeSessionDto>>>, AppError> {
    let identity = identity_from_headers(&headers, &state.config)?;

    // Simple query without JOIN — avoids a server crash triggered by the
    // LEFT JOIN between e2ee_sessions and users on some MySQL versions.
    let rows = sqlx::query(
        r#"SELECT session_id, requester_id, target_user_id, request_payload_json
           FROM service_user_service_db.e2ee_sessions
           WHERE target_user_id = ? AND status = 'pending'
           ORDER BY updated_time DESC
           LIMIT 20"#,
    )
    .bind(identity.user_id)
    .fetch_all(&state.db)
    .await?;

    let mut requests: Vec<PendingE2eeSessionDto> = Vec::with_capacity(rows.len());
    for row in rows {
        let requester_id: i64 = row.get("requester_id");
        let requester_name = resolve_user_display_name(&state, requester_id)
            .await?
            .unwrap_or_else(|| requester_id.to_string());

        requests.push(PendingE2eeSessionDto {
            session_id: row.get("session_id"),
            requester_id: requester_id.to_string(),
            requester_name,
            target_user_id: row.get::<i64, _>("target_user_id").to_string(),
            request_payload_json: row.get("request_payload_json"),
        });
    }

    Ok(Json(ApiResponse::success(requests)))
}

pub(crate) async fn get_encryption_status(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(session_id): Path<String>,
) -> Result<Json<ApiResponse<E2eeNegotiationStatusDto>>, AppError> {
    let identity = identity_from_headers(&headers, &state.config)?;
    validate_session_id(&session_id)?;
    ensure_e2ee_session_participant(&state.db, identity.user_id, &session_id).await?;

    let negotiation = load_negotiation_state(&state.db, &session_id).await?;
    let dto = if let Some((status, requester_id, target_user_id, state_version, updated_time)) =
        negotiation
    {
        E2eeNegotiationStatusDto {
            session_id,
            status,
            requester_id: Some(requester_id.to_string()),
            target_user_id: Some(target_user_id.to_string()),
            updated_time: Some(updated_time.and_utc().to_rfc3339()),
            state_version,
        }
    } else {
        E2eeNegotiationStatusDto {
            session_id,
            status: "plaintext".to_string(),
            requester_id: None,
            target_user_id: None,
            updated_time: None,
            state_version: 0,
        }
    };

    Ok(Json(ApiResponse::success(dto)))
}

/// 接受端到端加密协商。
///
/// POST /api/e2ee/accept
///
/// 业务目的：被请求方（target_user_id）接受加密协商请求，将会话状态从 pending 更新为 encrypted。
/// 认证要求：需要有效的 JWT access token。
/// 安全约束：只有 target_user_id（被请求方）可以接受；requester 不能接受自己的请求；
/// 已 encrypted 的会话返回 Conflict；非 pending 状态返回 Conflict。
/// 返回语义：成功返回 "ok"。
pub(crate) async fn accept_encryption(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(request): Json<E2eeSessionRequest>,
) -> Result<Json<ApiResponse<String>>, AppError> {
    let identity = identity_from_headers(&headers, &state.config)?;
    validate_session_id(&request.session_id)?;
    validate_optional_key(request.signed_pre_key.as_deref(), "signed_pre_key")?;

    // 验证调用者是合法参与者 + 好友关系存在
    ensure_e2ee_session_participant(&state.db, identity.user_id, &request.session_id).await?;

    // 加载协商状态
    let negotiation = load_negotiation_state(&state.db, &request.session_id).await?;
    let Some((status, requester_id, target_user_id, state_version, _updated_time)) = negotiation
    else {
        return Err(AppError::NotFound("session not found".to_string()));
    };

    if identity.user_id != target_user_id {
        return Err(AppError::Forbidden(
            "only target user can accept".to_string(),
        ));
    }

    match status.as_str() {
        "pending" => {
            // 正常路径：pending → encrypted
        }
        "encrypted" => {
            return Err(AppError::Conflict(
                "session is already encrypted".to_string(),
            ));
        }
        s => {
            return Err(AppError::Conflict(format!(
                "cannot accept session in '{s}' state"
            )));
        }
    }

    let result = sqlx::query(
        "UPDATE service_user_service_db.e2ee_sessions \
         SET status = 'encrypted', state_version = state_version + 1, \
             updated_time = NOW() \
         WHERE session_id = ? AND status = 'pending'",
    )
    .bind(&request.session_id)
    .execute(&state.db)
    .await?;

    if result.rows_affected() != 1 {
        return Err(AppError::Conflict(
            "session state changed, retry".to_string(),
        ));
    }

    // 重新加载以获取数据库实际的 updated_time 和 state_version
    let updated_state = load_negotiation_state(&state.db, &request.session_id).await?;
    let (db_state_version, db_updated_time) = updated_state
        .map(|(_, _, _, sv, ut)| (sv, Some(ut)))
        .unwrap_or((state_version + 1, None));

    let push = E2eeNegotiationPush {
        action: "accepted".to_string(),
        session_id: request.session_id.clone(),
        requester_id: requester_id.to_string(),
        requester_name: String::new(),
        target_user_id: target_user_id.to_string(),
        request_payload_json: None,
        updated_time: db_updated_time.map(|t| t.and_utc().to_rfc3339()),
        state_version: Some(db_state_version),
    };
    if let Err(error) = push_negotiation_event(&state, requester_id, &push).await {
        tracing::warn!(
            error = %error,
            session_id = %request.session_id,
            requester_id = %requester_id,
            "failed to push e2ee negotiation acceptance"
        );
    }

    Ok(Json(ApiResponse::success("ok".to_string())))
}

/// 拒绝端到端加密协商。
///
/// POST /api/e2ee/reject
///
/// 业务目的：被请求方拒绝加密协商请求，将会话状态从 pending 更新为 rejected。
/// 认证要求：需要有效的 JWT access token。
/// 安全约束：只有 target_user_id（被请求方）可以拒绝；已 encrypted 的会话不能 reject；
/// 非 pending 状态返回 Conflict。
/// 返回语义：成功返回 "ok"。
pub(crate) async fn reject_encryption(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(request): Json<E2eeSessionRequest>,
) -> Result<Json<ApiResponse<String>>, AppError> {
    let identity = identity_from_headers(&headers, &state.config)?;
    validate_session_id(&request.session_id)?;

    // 验证调用者是合法参与者 + 好友关系存在
    ensure_e2ee_session_participant(&state.db, identity.user_id, &request.session_id).await?;

    // 加载协商状态
    let negotiation = load_negotiation_state(&state.db, &request.session_id).await?;
    let Some((status, requester_id, target_user_id, state_version, _updated_time)) = negotiation
    else {
        return Err(AppError::NotFound("session not found".to_string()));
    };

    if identity.user_id != target_user_id {
        return Err(AppError::Forbidden(
            "only target user can reject".to_string(),
        ));
    }

    match status.as_str() {
        "pending" => {
            // 正常路径：pending → rejected
        }
        "encrypted" => {
            return Err(AppError::Conflict(
                "cannot reject an encrypted session; use disable to exit".to_string(),
            ));
        }
        s => {
            return Err(AppError::Conflict(format!(
                "cannot reject session in '{s}' state"
            )));
        }
    }

    let result = sqlx::query(
        "UPDATE service_user_service_db.e2ee_sessions \
         SET status = 'rejected', state_version = state_version + 1, \
             updated_time = NOW() \
         WHERE session_id = ? AND status = 'pending'",
    )
    .bind(&request.session_id)
    .execute(&state.db)
    .await?;

    if result.rows_affected() != 1 {
        return Err(AppError::Conflict(
            "session state changed, retry".to_string(),
        ));
    }

    // 重新加载以获取数据库实际的 updated_time 和 state_version
    let updated_state = load_negotiation_state(&state.db, &request.session_id).await?;
    let (db_state_version, db_updated_time) = updated_state
        .map(|(_, _, _, sv, ut)| (sv, Some(ut)))
        .unwrap_or((state_version + 1, None));

    let push = E2eeNegotiationPush {
        action: "rejected".to_string(),
        session_id: request.session_id.clone(),
        requester_id: requester_id.to_string(),
        requester_name: String::new(),
        target_user_id: target_user_id.to_string(),
        request_payload_json: None,
        updated_time: db_updated_time.map(|t| t.and_utc().to_rfc3339()),
        state_version: Some(db_state_version),
    };
    if let Err(error) = push_negotiation_event(&state, requester_id, &push).await {
        tracing::warn!(
            error = %error,
            session_id = %request.session_id,
            requester_id = %requester_id,
            "failed to push e2ee negotiation rejection"
        );
    }

    Ok(Json(ApiResponse::success("ok".to_string())))
}

/// 退出端到端加密通道。
///
/// POST /api/e2ee/disable
///
/// 业务目的：会话参与方退出 E2EE，将协商状态置为 plaintext 并通知对端清理本地 ratchet state。
/// 认证要求：需要有效的 JWT access token。
/// 安全约束：
/// - 调用者必须是合法会话参与者（通过 im_friend 好友关系验证）；
/// - encrypted → plaintext：记录 disabled_by、递增 state_version；
/// - pending → plaintext：取消协商，记录操作者；
/// - plaintext → plaintext：幂等返回，不插入脏记录；
/// - 推送事件包含 updated_time 和 state_version，客户端可据此丢弃旧事件。
pub(crate) async fn disable_encryption(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(request): Json<E2eeSessionRequest>,
) -> Result<Json<ApiResponse<String>>, AppError> {
    let identity = identity_from_headers(&headers, &state.config)?;
    validate_session_id(&request.session_id)?;

    // 验证调用者是合法参与者 + 好友关系存在
    let peer_user_id =
        ensure_e2ee_session_participant(&state.db, identity.user_id, &request.session_id).await?;

    // 加载现有协商状态
    let existing = load_negotiation_state(&state.db, &request.session_id).await?;

    let needs_update = if let Some((ref status, _, _, ref state_version, _)) = existing {
        match status.as_str() {
            "encrypted" | "pending" | "rejected" => {
                // 允许 disable：→ plaintext，记录 disabled_by
                true
            }
            "plaintext" => {
                // 已经是 plaintext，幂等返回
                let requester_name = resolve_user_display_name(&state, identity.user_id)
                    .await?
                    .unwrap_or_else(|| identity.username.clone());
                let push = E2eeNegotiationPush {
                    action: "disabled".to_string(),
                    session_id: request.session_id.clone(),
                    requester_id: identity.user_id.to_string(),
                    requester_name,
                    target_user_id: peer_user_id.to_string(),
                    request_payload_json: None,
                    updated_time: None,
                    state_version: Some(*state_version),
                };
                let _ = push_negotiation_event(&state, peer_user_id, &push).await;
                return Ok(Json(ApiResponse::success("ok".to_string())));
            }
            s => {
                return Err(AppError::Conflict(format!(
                    "cannot disable session in '{s}' state"
                )));
            }
        }
    } else {
        // 无现有记录
        true
    };

    if needs_update && existing.is_some() {
        let result = sqlx::query(
            "UPDATE service_user_service_db.e2ee_sessions \
             SET status = 'plaintext', request_payload_json = NULL, \
                 disabled_by = ?, disabled_at = NOW(), \
                 state_version = state_version + 1, \
                 updated_time = NOW() \
             WHERE session_id = ?",
        )
        .bind(identity.user_id)
        .bind(&request.session_id)
        .execute(&state.db)
        .await?;

        if result.rows_affected() != 1 {
            return Err(AppError::Conflict(
                "session state changed, retry".to_string(),
            ));
        }
    } else if needs_update {
        sqlx::query(
            "INSERT INTO service_user_service_db.e2ee_sessions \
             (session_id, requester_id, target_user_id, status, request_payload_json, \
              disabled_by, disabled_at, state_version) \
             VALUES (?, ?, ?, 'plaintext', NULL, ?, NOW(), 1)",
        )
        .bind(&request.session_id)
        .bind(identity.user_id)
        .bind(peer_user_id)
        .bind(identity.user_id)
        .execute(&state.db)
        .await?;
    }

    // 重新加载以获取更新后的 state_version 和 updated_time
    let updated_state = load_negotiation_state(&state.db, &request.session_id).await?;
    let (state_version, updated_time) = updated_state
        .map(|(_, _, _, sv, ut)| (sv, Some(ut)))
        .unwrap_or((1, None));

    let requester_name = resolve_user_display_name(&state, identity.user_id)
        .await?
        .unwrap_or_else(|| identity.username.clone());
    let push = E2eeNegotiationPush {
        action: "disabled".to_string(),
        session_id: request.session_id.clone(),
        requester_id: identity.user_id.to_string(),
        requester_name,
        target_user_id: peer_user_id.to_string(),
        request_payload_json: None,
        updated_time: updated_time.map(|t| t.and_utc().to_rfc3339()),
        state_version: Some(state_version),
    };
    if let Err(error) = push_negotiation_event(&state, peer_user_id, &push).await {
        tracing::warn!(
            error = %error,
            session_id = %request.session_id,
            peer_user_id = %peer_user_id,
            "failed to push e2ee disable event"
        );
    }

    Ok(Json(ApiResponse::success("ok".to_string())))
}
