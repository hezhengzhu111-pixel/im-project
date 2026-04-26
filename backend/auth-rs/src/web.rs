use crate::dto::*;
use crate::error::AppError;
use crate::jwt::normalize_bearer;
use crate::security::{validate_gateway_identity, validate_internal_signature};
use crate::service::AuthService;
use axum::body::Bytes;
use axum::extract::{OriginalUri, Path, State};
use axum::http::{header, HeaderMap, HeaderValue, StatusCode};
use axum::routing::{get, post};
use axum::{Json, Router};
use serde::de::DeserializeOwned;

pub fn router(service: AuthService) -> Router {
    Router::new()
        .route("/refresh", post(refresh))
        .route("/parse", post(parse))
        .route("/ws-ticket", post(issue_ws_ticket))
        .route("/api/auth/internal/token", post(internal_issue_token))
        .route(
            "/api/auth/internal/user-resource/:user_id",
            get(internal_get_user_resource),
        )
        .route(
            "/api/auth/internal/validate-token",
            post(internal_validate_token),
        )
        .route("/api/auth/internal/introspect", post(internal_introspect))
        .route(
            "/api/auth/internal/ws-introspect",
            post(internal_ws_introspect),
        )
        .route(
            "/api/auth/internal/check-permission",
            post(internal_check_permission),
        )
        .route(
            "/api/auth/internal/revoke-token",
            post(internal_revoke_token),
        )
        .route(
            "/api/auth/internal/revoke-user-tokens/:user_id",
            post(internal_revoke_user_tokens),
        )
        .route(
            "/api/auth/internal/ws-ticket/consume",
            post(internal_consume_ws_ticket),
        )
        .with_state(service)
}

async fn refresh(
    State(service): State<AuthService>,
    headers: HeaderMap,
    body: Bytes,
) -> Result<(StatusCode, HeaderMap, Json<ApiResponse<TokenPairDto>>), AppError> {
    let mut request: RefreshTokenRequest = optional_json(&body)?;
    if request.refresh_token.as_deref().is_none_or(str::is_empty) {
        request.refresh_token = cookie_value(&headers, &service.state().config.refresh_cookie_name);
    }
    if request.access_token.as_deref().is_none_or(str::is_empty) {
        request.access_token = cookie_value(&headers, &service.state().config.access_cookie_name);
    }
    let token_pair = service.refresh(request).await?;
    let mut response_headers = HeaderMap::new();
    append_auth_cookies(&mut response_headers, &headers, &service, &token_pair)?;
    let mut body = token_pair.clone();
    body.refresh_token = None;
    Ok((
        StatusCode::OK,
        response_headers,
        Json(ApiResponse::success(body)),
    ))
}

async fn parse(
    State(service): State<AuthService>,
    headers: HeaderMap,
    body: Bytes,
) -> Result<Json<ApiResponse<TokenParseResultDto>>, AppError> {
    let request: ParseTokenRequest = optional_json(&body)?;
    let token = request
        .token
        .or_else(|| cookie_value(&headers, &service.state().config.access_cookie_name));
    let allow_expired = request.allow_expired.unwrap_or(false);
    let parsed = service
        .parse_access_token(token.as_deref(), allow_expired)
        .await?;
    if parsed.expired && !allow_expired {
        return Err(AppError::token_expired());
    }
    if !parsed.valid {
        return Err(AppError::token_invalid());
    }
    Ok(Json(ApiResponse::success(parsed)))
}

async fn issue_ws_ticket(
    State(service): State<AuthService>,
    headers: HeaderMap,
) -> Result<(StatusCode, HeaderMap, Json<ApiResponse<WsTicketDto>>), AppError> {
    let (user_id, username) = validate_gateway_identity(&headers, &service.state().config)?;
    let ticket = service.issue_ws_ticket(user_id, &username).await?;
    let mut response_headers = HeaderMap::new();
    append_ws_ticket_cookie(&mut response_headers, &headers, &service, &ticket)?;
    Ok((
        StatusCode::OK,
        response_headers,
        Json(ApiResponse::success(ticket)),
    ))
}

async fn internal_issue_token(
    State(service): State<AuthService>,
    headers: HeaderMap,
    OriginalUri(uri): OriginalUri,
    body: Bytes,
) -> Result<Json<ApiResponse<TokenPairDto>>, AppError> {
    validate_internal_signature(&headers, "POST", uri.path(), &body, &service.state().config)?;
    let request: IssueTokenRequest = required_json(&body)?;
    Ok(Json(ApiResponse::success(
        service.issue_token_pair(request).await?,
    )))
}

async fn internal_get_user_resource(
    State(service): State<AuthService>,
    headers: HeaderMap,
    OriginalUri(uri): OriginalUri,
    Path(user_id): Path<i64>,
) -> Result<Json<ApiResponse<AuthUserResourceDto>>, AppError> {
    validate_internal_signature(&headers, "GET", uri.path(), &[], &service.state().config)?;
    Ok(Json(ApiResponse::success(
        service.get_user_resource(user_id).await?,
    )))
}

async fn internal_validate_token(
    State(service): State<AuthService>,
    headers: HeaderMap,
    OriginalUri(uri): OriginalUri,
    body: Bytes,
) -> Result<Json<ApiResponse<TokenParseResultDto>>, AppError> {
    validate_internal_signature(&headers, "POST", uri.path(), &body, &service.state().config)?;
    let token = body_text(&body);
    let result = service
        .validate_access_token(
            &token,
            check_revoked(
                &headers,
                service.state().config.token_revocation_check_enabled,
            ),
        )
        .await?;
    Ok(Json(ApiResponse::success(result)))
}

async fn internal_introspect(
    State(service): State<AuthService>,
    headers: HeaderMap,
    OriginalUri(uri): OriginalUri,
    body: Bytes,
) -> Result<Json<ApiResponse<AuthIntrospectResultDto>>, AppError> {
    validate_internal_signature(&headers, "POST", uri.path(), &body, &service.state().config)?;
    let token = body_text(&body);
    let result = service
        .introspect(
            &token,
            check_revoked(
                &headers,
                service.state().config.token_revocation_check_enabled,
            ),
        )
        .await?;
    Ok(Json(ApiResponse::success(result)))
}

async fn internal_ws_introspect(
    State(service): State<AuthService>,
    headers: HeaderMap,
    OriginalUri(uri): OriginalUri,
    body: Bytes,
) -> Result<Json<ApiResponse<AuthIntrospectResultDto>>, AppError> {
    internal_introspect(State(service), headers, OriginalUri(uri), body).await
}

async fn internal_check_permission(
    State(service): State<AuthService>,
    headers: HeaderMap,
    OriginalUri(uri): OriginalUri,
    body: Bytes,
) -> Result<Json<ApiResponse<PermissionCheckResultDto>>, AppError> {
    validate_internal_signature(&headers, "POST", uri.path(), &body, &service.state().config)?;
    let request: CheckPermissionRequest = required_json(&body)?;
    Ok(Json(ApiResponse::success(
        service.check_permission(request).await?,
    )))
}

async fn internal_revoke_token(
    State(service): State<AuthService>,
    headers: HeaderMap,
    OriginalUri(uri): OriginalUri,
    body: Bytes,
) -> Result<Json<ApiResponse<TokenRevokeResultDto>>, AppError> {
    validate_internal_signature(&headers, "POST", uri.path(), &body, &service.state().config)?;
    let request: RevokeTokenRequest = required_json(&body)?;
    Ok(Json(ApiResponse::success(
        service.revoke_token(request).await?,
    )))
}

async fn internal_revoke_user_tokens(
    State(service): State<AuthService>,
    headers: HeaderMap,
    OriginalUri(uri): OriginalUri,
    Path(user_id): Path<i64>,
    body: Bytes,
) -> Result<Json<ApiResponse<()>>, AppError> {
    validate_internal_signature(&headers, "POST", uri.path(), &body, &service.state().config)?;
    service.revoke_user_tokens(user_id).await?;
    Ok(Json(ApiResponse::success_empty()))
}

async fn internal_consume_ws_ticket(
    State(service): State<AuthService>,
    headers: HeaderMap,
    OriginalUri(uri): OriginalUri,
    body: Bytes,
) -> Result<Json<ApiResponse<WsTicketConsumeResultDto>>, AppError> {
    validate_internal_signature(&headers, "POST", uri.path(), &body, &service.state().config)?;
    let request: ConsumeWsTicketRequest = required_json(&body)?;
    Ok(Json(ApiResponse::success(
        service.consume_ws_ticket(request).await?,
    )))
}

fn optional_json<T>(body: &Bytes) -> Result<T, AppError>
where
    T: DeserializeOwned + Default,
{
    if body.is_empty() {
        return Ok(T::default());
    }
    Ok(serde_json::from_slice(body)?)
}

fn required_json<T>(body: &Bytes) -> Result<T, AppError>
where
    T: DeserializeOwned,
{
    Ok(serde_json::from_slice(body)?)
}

fn body_text(body: &Bytes) -> String {
    normalize_bearer(std::str::from_utf8(body).ok()).unwrap_or_default()
}

fn check_revoked(headers: &HeaderMap, default: bool) -> bool {
    headers
        .get("X-Check-Revoked")
        .and_then(|value| value.to_str().ok())
        .map(|value| value.eq_ignore_ascii_case("true"))
        .unwrap_or(default)
}

fn cookie_value(headers: &HeaderMap, name: &str) -> Option<String> {
    let raw = headers.get(header::COOKIE)?.to_str().ok()?;
    raw.split(';').find_map(|part| {
        let (key, value) = part.trim().split_once('=')?;
        (key.trim() == name)
            .then(|| value.trim().to_string())
            .filter(|value| !value.is_empty())
    })
}

fn append_auth_cookies(
    headers: &mut HeaderMap,
    request_headers: &HeaderMap,
    service: &AuthService,
    token_pair: &TokenPairDto,
) -> Result<(), AppError> {
    let secure = resolve_secure(request_headers, &service.state().config.auth_cookie_secure);
    if let Some(access) = token_pair.access_token.as_deref() {
        headers.append(
            header::SET_COOKIE,
            cookie_header(
                &service.state().config.access_cookie_name,
                access,
                token_pair.expires_in_ms.unwrap_or_default(),
                secure,
                &service.state().config.auth_cookie_same_site,
                "/",
            )?,
        );
    }
    if let Some(refresh) = token_pair.refresh_token.as_deref() {
        headers.append(
            header::SET_COOKIE,
            cookie_header(
                &service.state().config.refresh_cookie_name,
                refresh,
                token_pair.refresh_expires_in_ms.unwrap_or_default(),
                secure,
                &service.state().config.auth_cookie_same_site,
                "/",
            )?,
        );
    }
    Ok(())
}

fn append_ws_ticket_cookie(
    headers: &mut HeaderMap,
    request_headers: &HeaderMap,
    service: &AuthService,
    ticket: &WsTicketDto,
) -> Result<(), AppError> {
    let Some(ticket_value) = ticket.ticket.as_deref() else {
        return Ok(());
    };
    let secure = resolve_secure(
        request_headers,
        &service.state().config.ws_ticket_cookie_secure,
    );
    headers.append(
        header::SET_COOKIE,
        cookie_header(
            &service.state().config.ws_ticket_cookie_name,
            ticket_value,
            ticket.expires_in_ms.unwrap_or_default(),
            secure,
            &service.state().config.ws_ticket_cookie_same_site,
            &service.state().config.ws_ticket_cookie_path,
        )?,
    );
    Ok(())
}

fn cookie_header(
    name: &str,
    value: &str,
    max_age_ms: i64,
    secure: bool,
    same_site: &str,
    path: &str,
) -> Result<HeaderValue, AppError> {
    let max_age = if max_age_ms <= 0 {
        -1
    } else {
        std::cmp::max(1, max_age_ms / 1000)
    };
    let secure_attr = if secure { "; Secure" } else { "" };
    let normalized_path = if path.trim().starts_with('/') {
        path.trim()
    } else {
        "/"
    };
    HeaderValue::from_str(&format!(
        "{}={}; Max-Age={}; Path={}; HttpOnly; SameSite={}{}",
        name,
        value,
        max_age,
        normalized_path,
        if same_site.trim().is_empty() {
            "Lax"
        } else {
            same_site.trim()
        },
        secure_attr
    ))
    .map_err(|err| AppError::BadRequest(format!("invalid cookie header: {}", err)))
}

fn resolve_secure(headers: &HeaderMap, configured: &str) -> bool {
    match configured.trim().to_ascii_lowercase().as_str() {
        "true" => true,
        "false" => false,
        _ => headers
            .get("X-Forwarded-Proto")
            .and_then(|value| value.to_str().ok())
            .is_some_and(|proto| proto.eq_ignore_ascii_case("https")),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn should_read_tokens_from_cookie_header() {
        let mut headers = HeaderMap::new();
        headers.insert(
            header::COOKIE,
            HeaderValue::from_static("a=1; IM_ACCESS_TOKEN=abc; IM_REFRESH_TOKEN=def"),
        );

        assert_eq!(
            Some("abc".to_string()),
            cookie_value(&headers, "IM_ACCESS_TOKEN")
        );
        assert_eq!(
            Some("def".to_string()),
            cookie_value(&headers, "IM_REFRESH_TOKEN")
        );
        assert_eq!(None, cookie_value(&headers, "missing"));
    }

    #[test]
    fn should_normalize_plain_text_token_body() {
        assert_eq!("abc", body_text(&Bytes::from_static(b"\"Bearer abc\"")));
        assert_eq!("abc", body_text(&Bytes::from_static(b"Bearer abc")));
    }

    #[test]
    fn should_build_cookie_header_with_secure_auto() {
        let cookie =
            cookie_header("IM_WS_TICKET", "ticket", 30_000, true, "Lax", "/websocket").unwrap();
        let value = cookie.to_str().unwrap();

        assert!(value.contains("IM_WS_TICKET=ticket"));
        assert!(value.contains("Max-Age=30"));
        assert!(value.contains("Path=/websocket"));
        assert!(value.contains("HttpOnly"));
        assert!(value.contains("SameSite=Lax"));
        assert!(value.contains("Secure"));
    }

    #[test]
    fn should_resolve_forwarded_https_as_secure() {
        let mut headers = HeaderMap::new();
        headers.insert("X-Forwarded-Proto", HeaderValue::from_static("https"));

        assert!(resolve_secure(&headers, "auto"));
        assert!(!resolve_secure(&headers, "false"));
        assert!(resolve_secure(&HeaderMap::new(), "true"));
    }

    #[test]
    fn should_resolve_check_revoked_header() {
        let mut headers = HeaderMap::new();
        headers.insert("X-Check-Revoked", HeaderValue::from_static("false"));

        assert!(!check_revoked(&headers, true));
        assert!(check_revoked(&HeaderMap::new(), true));
    }
}
