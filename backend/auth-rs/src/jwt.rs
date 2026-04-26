use crate::dto::{now_ms, TokenParseResultDto};
use base64::engine::general_purpose::URL_SAFE_NO_PAD;
use base64::Engine;
use jsonwebtoken::{decode, encode, Algorithm, DecodingKey, EncodingKey, Header, Validation};
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Claims {
    #[serde(rename = "userId")]
    pub user_id: i64,
    pub username: String,
    pub typ: String,
    pub jti: String,
    pub sub: String,
    pub iat: i64,
    pub exp: i64,
}

pub fn build_token(
    secret: &str,
    expiration_ms: i64,
    user_id: i64,
    username: &str,
    typ: &str,
    jti: &str,
) -> anyhow::Result<String> {
    let now_ms = now_ms();
    let claims = Claims {
        user_id,
        username: username.to_string(),
        typ: typ.to_string(),
        jti: jti.to_string(),
        sub: username.to_string(),
        iat: now_ms / 1000,
        exp: (now_ms + expiration_ms) / 1000,
    };
    Ok(encode(
        &Header::new(Algorithm::HS512),
        &claims,
        &EncodingKey::from_secret(&padded_hs512_secret(secret)),
    )?)
}

pub fn parse_token(token: Option<&str>, secret: &str, allow_expired: bool) -> TokenParseResultDto {
    let Some(normalized) = normalize_bearer(token) else {
        return TokenParseResultDto {
            valid: false,
            expired: false,
            error: Some("TOKEN_EMPTY".to_string()),
            ..Default::default()
        };
    };

    let mut validation = Validation::new(Algorithm::HS512);
    validation.validate_exp = false;
    match decode::<Claims>(
        &normalized,
        &DecodingKey::from_secret(&padded_hs512_secret(secret)),
        &validation,
    ) {
        Ok(data) => {
            let claims = data.claims;
            let expired = claims.exp * 1000 <= now_ms();
            let mut result = TokenParseResultDto {
                valid: !expired,
                expired,
                error: expired.then(|| "TOKEN_EXPIRED".to_string()),
                user_id: Some(claims.user_id),
                username: Some(claims.username),
                token_type: Some(claims.typ),
                jti: Some(claims.jti),
                issued_at_epoch_ms: Some(claims.iat * 1000),
                expires_at_epoch_ms: Some(claims.exp * 1000),
                permissions: None,
            };
            if expired && !allow_expired {
                result.clear_identity();
            }
            result
        }
        Err(_) => TokenParseResultDto {
            valid: false,
            expired: false,
            error: Some("TOKEN_INVALID".to_string()),
            ..Default::default()
        },
    }
}

pub fn normalize_bearer(token: Option<&str>) -> Option<String> {
    let mut value = token?.trim().to_string();
    if value.len() > 1 && value.starts_with('"') && value.ends_with('"') {
        value = value[1..value.len() - 1].trim().to_string();
    }
    if value.starts_with("Bearer ") {
        value = value["Bearer ".len()..].trim().to_string();
    }
    (!value.is_empty()).then_some(value)
}

pub fn sha256_hex(value: &str) -> String {
    use sha2::{Digest, Sha256};
    let digest = Sha256::digest(value.as_bytes());
    digest.iter().map(|byte| format!("{:02x}", byte)).collect()
}

pub fn sha256_base64_url(value: &[u8]) -> String {
    use sha2::{Digest, Sha256};
    URL_SAFE_NO_PAD.encode(Sha256::digest(value))
}

fn padded_hs512_secret(secret: &str) -> Vec<u8> {
    let bytes = secret.as_bytes();
    if bytes.len() >= 64 {
        return bytes.to_vec();
    }
    let source = if bytes.is_empty() {
        b"".as_slice()
    } else {
        bytes
    };
    let mut padded = vec![0_u8; 64];
    for index in 0..64 {
        padded[index] = if source.is_empty() {
            0
        } else {
            source[index % source.len()]
        };
    }
    padded
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn should_build_and_parse_hs512_token() {
        let token = build_token("short-secret", 60_000, 7, "alice", "access", "jti-1").unwrap();
        let parsed = parse_token(Some(&token), "short-secret", false);
        assert!(parsed.valid);
        assert_eq!(Some(7), parsed.user_id);
        assert_eq!(Some("alice".to_string()), parsed.username);
        assert_eq!(Some("access".to_string()), parsed.token_type);
    }

    #[test]
    fn should_normalize_bearer_and_quotes() {
        assert_eq!(
            Some("abc".to_string()),
            normalize_bearer(Some("\"Bearer abc\""))
        );
        assert_eq!(
            Some("abc".to_string()),
            normalize_bearer(Some("Bearer abc"))
        );
    }
}
