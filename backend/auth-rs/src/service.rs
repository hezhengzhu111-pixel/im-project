use crate::dto::*;
use crate::error::AppError;
use crate::jwt::{build_token, normalize_bearer, parse_token, sha256_hex};
use crate::AppState;
use redis::AsyncCommands;
use serde_json::Value;
use std::collections::{HashMap, HashSet};
use tokio::time::{sleep, Duration, Instant};
use uuid::Uuid;

const REFRESH_JTI_KEY_PREFIX: &str = "auth:refresh:jti:";
const PREVIOUS_REFRESH_KEY_PREFIX: &str = "auth:refresh:previous:";
const REFRESH_LOCK_KEY_PREFIX: &str = "auth:refresh:lock:";
const WS_TICKET_KEY_PREFIX: &str = "auth:ws:ticket:";
const USER_RESOURCE_KEY_PREFIX: &str = "auth:user:";
const REVOKED_TOKEN_KEY_PREFIX: &str = "auth:revoked:token:";
const REVOKED_USER_TOKENS_KEY_PREFIX: &str = "auth:revoked:user:";
const USER_REVOKE_AFTER_KEY_PREFIX: &str = "auth:user:revoke_after:";

#[derive(Clone)]
pub struct AuthService {
    state: AppState,
}

impl AuthService {
    pub fn new(state: AppState) -> Self {
        Self { state }
    }

    pub fn state(&self) -> &AppState {
        &self.state
    }

    pub async fn issue_token_pair(
        &self,
        request: IssueTokenRequest,
    ) -> Result<TokenPairDto, AppError> {
        let user_id = request
            .user_id
            .ok_or_else(|| AppError::BadRequest("userId is required".to_string()))?;
        let username = normalize_username(request.username.as_deref())
            .ok_or_else(|| AppError::BadRequest("username is required".to_string()))?;
        self.upsert_user_resource(&request).await?;
        let (dto, refresh_jti) = self.build_token_pair(user_id, &username)?;
        self.set_key_ex(
            &format!("{}{}", REFRESH_JTI_KEY_PREFIX, user_id),
            &refresh_jti,
            self.state.config.refresh_expiration_ms,
        )
        .await?;
        Ok(dto)
    }

    pub async fn parse_access_token(
        &self,
        token: Option<&str>,
        allow_expired: bool,
    ) -> Result<TokenParseResultDto, AppError> {
        let mut result = parse_token(token, &self.state.config.jwt_secret, allow_expired);
        if result.valid && !result.expired {
            if let Some(user_id) = result.user_id {
                let resource = self.get_user_resource(user_id).await.unwrap_or_default();
                result.permissions = Some(resource.resource_permissions);
            }
        }
        Ok(result)
    }

    pub async fn validate_access_token(
        &self,
        token: &str,
        check_revoked: bool,
    ) -> Result<TokenParseResultDto, AppError> {
        let normalized = normalize_bearer(Some(token)).ok_or_else(AppError::token_invalid)?;
        let parsed = self.parse_access_token(Some(&normalized), false).await?;
        if parsed.expired {
            return Err(AppError::token_expired());
        }
        if !parsed.valid {
            return Err(AppError::token_invalid());
        }
        if check_revoked && self.is_token_revoked(&normalized, Some(&parsed)).await? {
            return Err(AppError::token_invalid());
        }
        Ok(parsed)
    }

    pub async fn introspect(
        &self,
        token: &str,
        check_revoked: bool,
    ) -> Result<AuthIntrospectResultDto, AppError> {
        let parsed = self.validate_access_token(token, check_revoked).await?;
        let user_id = parsed.user_id.ok_or_else(AppError::token_invalid)?;
        let resource = self.get_user_resource(user_id).await?;
        Ok(AuthIntrospectResultDto {
            valid: true,
            expired: false,
            user_id: Some(user_id),
            username: normalize_username(resource.username.as_deref()).or(parsed.username),
            issued_at_epoch_ms: parsed.issued_at_epoch_ms,
            expires_at_epoch_ms: parsed.expires_at_epoch_ms,
            jti: parsed.jti,
            user_info: resource.user_info,
            resource_permissions: resource.resource_permissions,
            data_scopes: resource.data_scopes,
        })
    }

    pub async fn refresh(&self, request: RefreshTokenRequest) -> Result<TokenPairDto, AppError> {
        let refresh_token = normalize_bearer(request.refresh_token.as_deref())
            .ok_or_else(AppError::token_invalid)?;
        let refresh_parsed = parse_token(
            Some(&refresh_token),
            &self.state.config.refresh_secret,
            true,
        );
        if refresh_parsed.expired {
            return Err(AppError::token_expired());
        }
        if !refresh_parsed.valid || refresh_parsed.token_type.as_deref() != Some("refresh") {
            return Err(AppError::token_invalid());
        }
        let user_id = refresh_parsed.user_id.ok_or_else(AppError::token_invalid)?;
        let username = normalize_username(refresh_parsed.username.as_deref())
            .ok_or_else(AppError::token_invalid)?;
        let refresh_jti = refresh_parsed.jti.ok_or_else(AppError::token_invalid)?;

        if let Some(access_token) = request
            .access_token
            .as_deref()
            .and_then(|raw| normalize_bearer(Some(raw)))
        {
            let access_parsed =
                parse_token(Some(&access_token), &self.state.config.jwt_secret, true);
            if access_parsed.user_id.is_some() && access_parsed.user_id != Some(user_id) {
                return Err(AppError::token_invalid());
            }
            if access_parsed.username.is_some()
                && access_parsed.username.as_deref() != Some(username.as_str())
            {
                return Err(AppError::token_invalid());
            }
        }

        let stored_jti = self
            .get_string(&format!("{}{}", REFRESH_JTI_KEY_PREFIX, user_id))
            .await?;
        if stored_jti.as_deref() != Some(refresh_jti.as_str()) {
            if let Some(previous) = self
                .read_previous_refresh_result(user_id, &refresh_jti)
                .await?
            {
                return Ok(previous);
            }
            return Err(AppError::token_invalid());
        }

        let lock_owner = Uuid::new_v4().to_string();
        if !self
            .try_acquire_refresh_lock(user_id, &refresh_jti, &lock_owner)
            .await?
        {
            if let Some(previous) = self
                .read_previous_refresh_result(user_id, &refresh_jti)
                .await?
            {
                return Ok(previous);
            }
            match self
                .wait_for_previous_refresh_result(user_id, &refresh_jti, &lock_owner)
                .await?
            {
                RefreshWaitOutcome::Previous(previous) => return Ok(previous),
                RefreshWaitOutcome::Acquired => {}
                RefreshWaitOutcome::Unavailable => return Err(AppError::token_invalid()),
            }
        }

        let (dto, new_refresh_jti) = self.build_token_pair(user_id, &username)?;
        self.commit_refresh_rotation(user_id, &refresh_jti, &new_refresh_jti, &dto)
            .await?;
        self.release_refresh_lock(user_id, &refresh_jti, &lock_owner)
            .await?;
        Ok(dto)
    }

    pub async fn issue_ws_ticket(
        &self,
        user_id: i64,
        username: &str,
    ) -> Result<WsTicketDto, AppError> {
        let resolved_username = match normalize_username(Some(username)) {
            Some(value) => value,
            None => self
                .resolve_resource_username(user_id)
                .await
                .unwrap_or_else(|| format!("user-{}", user_id)),
        };
        let ticket = Uuid::new_v4().to_string();
        let value = format!("{}\n{}", user_id, resolved_username);
        let ttl = self.state.config.ws_ticket_ttl_seconds;
        let mut conn = self.state.redis.clone();
        let _: () = conn
            .set_ex(format!("{}{}", WS_TICKET_KEY_PREFIX, ticket), value, ttl)
            .await?;
        Ok(WsTicketDto {
            ticket: Some(ticket),
            expires_in_ms: Some((ttl as i64) * 1000),
        })
    }

    pub async fn consume_ws_ticket(
        &self,
        request: ConsumeWsTicketRequest,
    ) -> Result<WsTicketConsumeResultDto, AppError> {
        let Some(ticket) = normalize_username(request.ticket.as_deref()) else {
            return Ok(invalid_ws_ticket("ticket is required"));
        };
        let Some(expected_user_id) = request.user_id else {
            return Ok(invalid_ws_ticket("userId is required"));
        };
        let payload = self.consume_ws_ticket_payload(&ticket).await?;
        let Some(payload) = payload else {
            return Ok(invalid_ws_ticket("ticket is invalid or expired"));
        };
        let Some((actual_user_id, username)) = parse_ws_ticket_payload(&payload) else {
            return Ok(invalid_ws_ticket("ticket payload is invalid"));
        };
        if actual_user_id != expected_user_id {
            return Ok(WsTicketConsumeResultDto {
                valid: false,
                status: Some(WS_TICKET_STATUS_USER_MISMATCH.to_string()),
                user_id: Some(actual_user_id),
                username: Some(username),
                error: Some("ticket userId mismatch".to_string()),
            });
        }
        Ok(WsTicketConsumeResultDto {
            valid: true,
            status: Some(WS_TICKET_STATUS_VALID.to_string()),
            user_id: Some(actual_user_id),
            username: Some(username),
            error: None,
        })
    }

    pub async fn get_user_resource(&self, user_id: i64) -> Result<AuthUserResourceDto, AppError> {
        let key = format!("{}{}", USER_RESOURCE_KEY_PREFIX, user_id);
        if let Some(cached) = self.get_string(&key).await? {
            if let Ok(dto) = serde_json::from_str::<AuthUserResourceDto>(&cached) {
                if dto.user_id.is_some() {
                    let mut conn = self.state.redis.clone();
                    let _: bool = conn
                        .expire(&key, self.state.config.resource_cache_ttl_seconds as i64)
                        .await?;
                }
                return Ok(dto);
            }
        }
        Ok(AuthUserResourceDto {
            user_id: Some(user_id),
            username: None,
            user_info: HashMap::new(),
            resource_permissions: Vec::new(),
            data_scopes: HashMap::new(),
        })
    }

    pub async fn check_permission(
        &self,
        request: CheckPermissionRequest,
    ) -> Result<PermissionCheckResultDto, AppError> {
        let input = request.clone();
        let Some(user_id) = input.user_id else {
            return Ok(permission_result(input, false, "userId is required"));
        };
        let resource = self.get_user_resource(user_id).await?;
        let permissions = resource.resource_permissions;
        let granted = has_global_permission(&permissions)
            || input
                .permission
                .as_deref()
                .is_some_and(|permission| permissions.iter().any(|p| p == permission))
            || has_resource_permission(
                &permissions,
                input.resource.as_deref(),
                input.action.as_deref(),
            );
        Ok(permission_result(
            input,
            granted,
            if granted {
                "permission granted"
            } else {
                "permission denied"
            },
        ))
    }

    pub async fn revoke_token(
        &self,
        request: RevokeTokenRequest,
    ) -> Result<TokenRevokeResultDto, AppError> {
        let Some(token) = normalize_bearer(request.token.as_deref()) else {
            return Ok(TokenRevokeResultDto {
                success: false,
                message: Some("token is required".to_string()),
                ..Default::default()
            });
        };
        let parsed = self.parse_access_token(Some(&token), true).await?;
        let Some(user_id) = parsed.user_id else {
            return Ok(TokenRevokeResultDto {
                success: false,
                message: Some("token parse failed".to_string()),
                ..Default::default()
            });
        };
        let hash = sha256_hex(&token);
        let revoked_key = format!("{}{}", REVOKED_TOKEN_KEY_PREFIX, hash);
        if self.key_exists(&revoked_key).await? {
            return Ok(TokenRevokeResultDto {
                success: false,
                message: Some("token already revoked".to_string()),
                user_id: Some(user_id),
                token_type: parsed.token_type,
            });
        }
        let mut conn = self.state.redis.clone();
        let _: () = conn
            .set_ex(
                &revoked_key,
                "1",
                self.state.config.revoked_token_ttl_seconds,
            )
            .await?;
        let user_revoked_key = format!("{}{}", REVOKED_USER_TOKENS_KEY_PREFIX, user_id);
        let _: i64 = conn.sadd(&user_revoked_key, hash).await?;
        let _: bool = conn
            .expire(
                &user_revoked_key,
                self.state.config.revoked_token_ttl_seconds as i64,
            )
            .await?;
        Ok(TokenRevokeResultDto {
            success: true,
            message: Some(
                request
                    .reason
                    .unwrap_or_else(|| "token revoked".to_string()),
            ),
            user_id: Some(user_id),
            token_type: parsed.token_type,
        })
    }

    pub async fn revoke_user_tokens(&self, user_id: i64) -> Result<(), AppError> {
        let mut conn = self.state.redis.clone();
        let _: () = conn
            .set_ex(
                format!("{}{}", USER_REVOKE_AFTER_KEY_PREFIX, user_id),
                crate::dto::now_ms().to_string(),
                self.state.config.revoked_token_ttl_seconds,
            )
            .await?;
        let _: i64 = conn
            .del(format!("{}{}", REFRESH_JTI_KEY_PREFIX, user_id))
            .await?;
        let _: i64 = conn
            .del(format!("{}{}", USER_RESOURCE_KEY_PREFIX, user_id))
            .await?;
        let keys: Vec<String> = conn
            .keys(format!("{}{}:*", PREVIOUS_REFRESH_KEY_PREFIX, user_id))
            .await
            .unwrap_or_default();
        if !keys.is_empty() {
            let _: i64 = conn.del(keys).await?;
        }
        let _: i64 = conn
            .del(format!("{}{}", REVOKED_USER_TOKENS_KEY_PREFIX, user_id))
            .await?;
        Ok(())
    }

    async fn upsert_user_resource(&self, request: &IssueTokenRequest) -> Result<(), AppError> {
        let Some(user_id) = request.user_id else {
            return Ok(());
        };
        let mut user_info = HashMap::new();
        insert_value(&mut user_info, "id", request.user_id.map(Value::from));
        insert_value(
            &mut user_info,
            "username",
            request.username.clone().map(Value::from),
        );
        insert_value(
            &mut user_info,
            "nickname",
            request.nickname.clone().map(Value::from),
        );
        insert_value(
            &mut user_info,
            "avatar",
            request.avatar.clone().map(Value::from),
        );
        insert_value(
            &mut user_info,
            "email",
            request.email.clone().map(Value::from),
        );
        insert_value(
            &mut user_info,
            "phone",
            request.phone.clone().map(Value::from),
        );

        let mut permissions = request
            .permissions
            .iter()
            .filter_map(|permission| normalize_username(Some(permission)))
            .collect::<Vec<_>>();
        if self.is_admin(request) {
            let mut set: HashSet<String> = permissions.into_iter().collect();
            for permission in ["admin", "log:read", "file:delete", "file:read"] {
                set.insert(permission.to_string());
            }
            permissions = set.into_iter().collect();
            permissions.sort();
        }

        let dto = AuthUserResourceDto {
            user_id: Some(user_id),
            username: request.username.clone(),
            user_info,
            resource_permissions: permissions,
            data_scopes: HashMap::new(),
        };
        let json = serde_json::to_string(&dto)?;
        let mut conn = self.state.redis.clone();
        let _: () = conn
            .set_ex(
                format!("{}{}", USER_RESOURCE_KEY_PREFIX, user_id),
                json,
                self.state.config.resource_cache_ttl_seconds,
            )
            .await?;
        Ok(())
    }

    async fn is_token_revoked(
        &self,
        token: &str,
        parsed: Option<&TokenParseResultDto>,
    ) -> Result<bool, AppError> {
        if self
            .key_exists(&format!(
                "{}{}",
                REVOKED_TOKEN_KEY_PREFIX,
                sha256_hex(token)
            ))
            .await?
        {
            return Ok(true);
        }
        let Some(parsed) = parsed else {
            return Ok(false);
        };
        let (Some(user_id), Some(iat)) = (parsed.user_id, parsed.issued_at_epoch_ms) else {
            return Ok(false);
        };
        let revoke_after = self
            .get_string(&format!("{}{}", USER_REVOKE_AFTER_KEY_PREFIX, user_id))
            .await?;
        Ok(revoke_after
            .and_then(|value| value.parse::<i64>().ok())
            .is_some_and(|revoke_after_ms| iat <= revoke_after_ms))
    }

    fn build_token_pair(
        &self,
        user_id: i64,
        username: &str,
    ) -> Result<(TokenPairDto, String), AppError> {
        let access_jti = Uuid::new_v4().to_string();
        let refresh_jti = Uuid::new_v4().to_string();
        let access_token = build_token(
            &self.state.config.jwt_secret,
            self.state.config.jwt_expiration_ms,
            user_id,
            username,
            "access",
            &access_jti,
        )?;
        let refresh_token = build_token(
            &self.state.config.refresh_secret,
            self.state.config.refresh_expiration_ms,
            user_id,
            username,
            "refresh",
            &refresh_jti,
        )?;
        Ok((
            TokenPairDto {
                access_token: Some(access_token),
                refresh_token: Some(refresh_token),
                expires_in_ms: Some(self.state.config.jwt_expiration_ms),
                refresh_expires_in_ms: Some(self.state.config.refresh_expiration_ms),
            },
            refresh_jti,
        ))
    }

    async fn read_previous_refresh_result(
        &self,
        user_id: i64,
        refresh_jti: &str,
    ) -> Result<Option<TokenPairDto>, AppError> {
        let payload = self
            .get_string(&format!(
                "{}{}:{}",
                PREVIOUS_REFRESH_KEY_PREFIX, user_id, refresh_jti
            ))
            .await?;
        let Some(payload) = payload else {
            return Ok(None);
        };
        let parts: Vec<&str> = payload.splitn(4, '\n').collect();
        if parts.len() < 4 || parts[0].is_empty() || parts[1].is_empty() {
            return Ok(None);
        }
        Ok(Some(TokenPairDto {
            access_token: Some(parts[0].to_string()),
            refresh_token: Some(parts[1].to_string()),
            expires_in_ms: parts[2]
                .parse()
                .ok()
                .or(Some(self.state.config.jwt_expiration_ms)),
            refresh_expires_in_ms: parts[3]
                .parse()
                .ok()
                .or(Some(self.state.config.refresh_expiration_ms)),
        }))
    }

    async fn commit_refresh_rotation(
        &self,
        user_id: i64,
        old_jti: &str,
        new_jti: &str,
        dto: &TokenPairDto,
    ) -> Result<(), AppError> {
        let payload = format!(
            "{}\n{}\n{}\n{}",
            dto.access_token.as_deref().unwrap_or_default(),
            dto.refresh_token.as_deref().unwrap_or_default(),
            dto.expires_in_ms.unwrap_or_default(),
            dto.refresh_expires_in_ms.unwrap_or_default()
        );
        let previous_ttl_ms = std::cmp::max(
            self.state.config.previous_refresh_grace_seconds,
            self.state.config.refresh_lock_seconds,
        ) * 1000;
        let mut conn = self.state.redis.clone();
        redis::pipe()
            .cmd("SET")
            .arg(format!("{}{}", REFRESH_JTI_KEY_PREFIX, user_id))
            .arg(new_jti)
            .arg("PX")
            .arg(self.state.config.refresh_expiration_ms)
            .ignore()
            .cmd("SET")
            .arg(format!(
                "{}{}:{}",
                PREVIOUS_REFRESH_KEY_PREFIX, user_id, old_jti
            ))
            .arg(payload)
            .arg("PX")
            .arg(previous_ttl_ms)
            .ignore()
            .query_async::<()>(&mut conn)
            .await?;
        Ok(())
    }

    async fn try_acquire_refresh_lock(
        &self,
        user_id: i64,
        refresh_jti: &str,
        lock_owner: &str,
    ) -> Result<bool, AppError> {
        let mut conn = self.state.redis.clone();
        let result: Option<String> = redis::cmd("SET")
            .arg(format!(
                "{}{}:{}",
                REFRESH_LOCK_KEY_PREFIX, user_id, refresh_jti
            ))
            .arg(lock_owner)
            .arg("EX")
            .arg(self.state.config.refresh_lock_seconds)
            .arg("NX")
            .query_async(&mut conn)
            .await?;
        Ok(result.is_some())
    }

    async fn wait_for_previous_refresh_result(
        &self,
        user_id: i64,
        refresh_jti: &str,
        lock_owner: &str,
    ) -> Result<RefreshWaitOutcome, AppError> {
        let timeout = Duration::from_secs(std::cmp::max(1, self.state.config.refresh_lock_seconds));
        let deadline = Instant::now() + timeout;
        loop {
            if let Some(previous) = self
                .read_previous_refresh_result(user_id, refresh_jti)
                .await?
            {
                return Ok(RefreshWaitOutcome::Previous(previous));
            }

            let stored_jti = self
                .get_string(&format!("{}{}", REFRESH_JTI_KEY_PREFIX, user_id))
                .await?;
            if stored_jti.as_deref() != Some(refresh_jti) {
                if let Some(previous) = self
                    .read_previous_refresh_result(user_id, refresh_jti)
                    .await?
                {
                    return Ok(RefreshWaitOutcome::Previous(previous));
                }
                return Ok(RefreshWaitOutcome::Unavailable);
            }

            let current_owner = self
                .get_string(&format!(
                    "{}{}:{}",
                    REFRESH_LOCK_KEY_PREFIX, user_id, refresh_jti
                ))
                .await?;
            if current_owner
                .as_deref()
                .map(str::trim)
                .unwrap_or_default()
                .is_empty()
                && self
                    .try_acquire_refresh_lock(user_id, refresh_jti, lock_owner)
                    .await?
            {
                return Ok(RefreshWaitOutcome::Acquired);
            }

            let now = Instant::now();
            if now >= deadline {
                break;
            }
            sleep(std::cmp::min(Duration::from_millis(25), deadline - now)).await;
        }

        if let Some(previous) = self
            .read_previous_refresh_result(user_id, refresh_jti)
            .await?
        {
            return Ok(RefreshWaitOutcome::Previous(previous));
        }
        let stored_jti = self
            .get_string(&format!("{}{}", REFRESH_JTI_KEY_PREFIX, user_id))
            .await?;
        if stored_jti.as_deref() == Some(refresh_jti) {
            let current_owner = self
                .get_string(&format!(
                    "{}{}:{}",
                    REFRESH_LOCK_KEY_PREFIX, user_id, refresh_jti
                ))
                .await?;
            if current_owner
                .as_deref()
                .map(str::trim)
                .unwrap_or_default()
                .is_empty()
                && self
                    .try_acquire_refresh_lock(user_id, refresh_jti, lock_owner)
                    .await?
            {
                return Ok(RefreshWaitOutcome::Acquired);
            }
        }
        Ok(RefreshWaitOutcome::Unavailable)
    }

    async fn release_refresh_lock(
        &self,
        user_id: i64,
        refresh_jti: &str,
        lock_owner: &str,
    ) -> Result<(), AppError> {
        let mut conn = self.state.redis.clone();
        let _: i64 = redis::Script::new(
            "if redis.call('GET', KEYS[1]) == ARGV[1] then return redis.call('DEL', KEYS[1]) end return 0",
        )
        .key(format!("{}{}:{}", REFRESH_LOCK_KEY_PREFIX, user_id, refresh_jti))
        .arg(lock_owner)
        .invoke_async(&mut conn)
        .await?;
        Ok(())
    }

    async fn consume_ws_ticket_payload(&self, ticket: &str) -> Result<Option<String>, AppError> {
        let mut conn = self.state.redis.clone();
        let payload: Option<String> = redis::Script::new(
            "local payload = redis.call('GET', KEYS[1]); if not payload then return nil end; redis.call('DEL', KEYS[1]); return payload",
        )
        .key(format!("{}{}", WS_TICKET_KEY_PREFIX, ticket))
        .invoke_async(&mut conn)
        .await?;
        Ok(payload)
    }

    async fn resolve_resource_username(&self, user_id: i64) -> Option<String> {
        self.get_user_resource(user_id)
            .await
            .ok()
            .and_then(|resource| {
                normalize_username(resource.username.as_deref()).or_else(|| {
                    resource
                        .user_info
                        .get("username")
                        .and_then(Value::as_str)
                        .and_then(|value| normalize_username(Some(value)))
                })
            })
    }

    async fn set_key_ex(&self, key: &str, value: &str, ttl_ms: i64) -> Result<(), AppError> {
        let mut conn = self.state.redis.clone();
        redis::cmd("SET")
            .arg(key)
            .arg(value)
            .arg("PX")
            .arg(ttl_ms)
            .query_async::<()>(&mut conn)
            .await?;
        Ok(())
    }

    async fn get_string(&self, key: &str) -> Result<Option<String>, AppError> {
        let mut conn = self.state.redis.clone();
        Ok(conn.get(key).await?)
    }

    async fn key_exists(&self, key: &str) -> Result<bool, AppError> {
        let mut conn = self.state.redis.clone();
        Ok(conn.exists(key).await?)
    }

    fn is_admin(&self, request: &IssueTokenRequest) -> bool {
        let Some(user_id) = request.user_id else {
            return false;
        };
        let username = request
            .username
            .as_deref()
            .unwrap_or_default()
            .trim()
            .to_ascii_lowercase();
        self.state.config.admin_user_ids.contains(&user_id)
            || (!username.is_empty()
                && self
                    .state
                    .config
                    .admin_usernames
                    .iter()
                    .any(|configured| configured.eq_ignore_ascii_case(&username)))
    }
}

fn invalid_ws_ticket(error: &str) -> WsTicketConsumeResultDto {
    WsTicketConsumeResultDto {
        valid: false,
        status: Some(WS_TICKET_STATUS_INVALID.to_string()),
        error: Some(error.to_string()),
        ..Default::default()
    }
}

fn parse_ws_ticket_payload(payload: &str) -> Option<(i64, String)> {
    let (user_id, username) = payload.split_once('\n')?;
    Some((user_id.trim().parse().ok()?, username.trim().to_string()))
}

fn permission_result(
    input: CheckPermissionRequest,
    granted: bool,
    reason: &str,
) -> PermissionCheckResultDto {
    PermissionCheckResultDto {
        user_id: input.user_id,
        permission: input.permission,
        resource: input.resource,
        action: input.action,
        granted,
        reason: Some(reason.to_string()),
    }
}

fn has_global_permission(permissions: &[String]) -> bool {
    permissions
        .iter()
        .any(|permission| permission == "*" || permission == "admin")
}

fn has_resource_permission(
    permissions: &[String],
    resource: Option<&str>,
    action: Option<&str>,
) -> bool {
    let (Some(resource), Some(action)) = (resource, action) else {
        return false;
    };
    if resource.trim().is_empty() || action.trim().is_empty() {
        return false;
    }
    let exact = format!("{}:{}", resource.trim(), action.trim());
    let wildcard = format!("{}:*", resource.trim());
    permissions
        .iter()
        .any(|permission| permission == &exact || permission == &wildcard)
}

fn normalize_username(raw: Option<&str>) -> Option<String> {
    let value = raw?.trim();
    (!value.is_empty()).then(|| value.to_string())
}

fn insert_value(map: &mut HashMap<String, Value>, key: &str, value: Option<Value>) {
    if let Some(value) = value {
        map.insert(key.to_string(), value);
    }
}

enum RefreshWaitOutcome {
    Previous(TokenPairDto),
    Acquired,
    Unavailable,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn should_parse_ws_ticket_payload() {
        assert_eq!(
            Some((42, "alice".to_string())),
            parse_ws_ticket_payload("42\nalice")
        );
        assert_eq!(None, parse_ws_ticket_payload("42"));
        assert_eq!(None, parse_ws_ticket_payload("bad\nalice"));
    }

    #[test]
    fn should_match_global_exact_and_resource_permissions() {
        assert!(has_global_permission(&["admin".to_string()]));
        assert!(has_global_permission(&["*".to_string()]));
        assert!(has_resource_permission(
            &["file:read".to_string()],
            Some("file"),
            Some("read")
        ));
        assert!(has_resource_permission(
            &["file:*".to_string()],
            Some("file"),
            Some("delete")
        ));
        assert!(!has_resource_permission(
            &["file:read".to_string()],
            Some("file"),
            Some("delete")
        ));
    }

    #[test]
    fn should_preserve_permission_check_input_in_result() {
        let input = CheckPermissionRequest {
            user_id: Some(7),
            permission: Some("file:read".to_string()),
            resource: Some("file".to_string()),
            action: Some("read".to_string()),
        };

        let result = permission_result(input, true, "permission granted");

        assert_eq!(Some(7), result.user_id);
        assert_eq!(Some("file:read".to_string()), result.permission);
        assert_eq!(Some("file".to_string()), result.resource);
        assert_eq!(Some("read".to_string()), result.action);
        assert!(result.granted);
    }
}
