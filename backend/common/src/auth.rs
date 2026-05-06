use base64::engine::general_purpose::URL_SAFE_NO_PAD;
use base64::Engine;
use hmac::{Hmac, Mac};
use jsonwebtoken::{decode, Algorithm, DecodingKey, Validation};
use serde::{Deserialize, Serialize};
use sha2::Sha256;
use subtle::ConstantTimeEq;
use uuid::Uuid;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Claims {
    #[serde(rename = "userId")]
    pub user_id: i64,
    pub username: String,
    pub typ: String,
    pub jti: Option<String>,
    pub sub: Option<String>,
    pub iat: Option<i64>,
    pub exp: i64,
}

#[derive(Debug, Clone)]
pub struct Identity {
    pub user_id: i64,
    pub username: String,
}

pub fn parse_bearer(value: Option<&str>) -> Option<String> {
    let mut token = value?.trim().to_string();
    if let Some(unquoted) = token
        .strip_prefix('"')
        .and_then(|value| value.strip_suffix('"'))
    {
        token = unquoted.trim().to_string();
    }
    if let Some(rest) = token.strip_prefix("Bearer ") {
        token = rest.trim().to_string();
    }
    (!token.is_empty()).then_some(token)
}

pub fn validate_access_token(token: &str, secret: &str) -> anyhow::Result<Identity> {
    if secret.len() < 64 {
        anyhow::bail!(
            "JWT secret must be at least 64 bytes (got {} bytes)",
            secret.len()
        );
    }
    let mut validation = Validation::new(Algorithm::HS512);
    validation.validate_exp = true;
    let data = decode::<Claims>(
        token,
        &DecodingKey::from_secret(secret.as_bytes()),
        &validation,
    )?;
    if data.claims.typ != "access" {
        anyhow::bail!("token type is not access");
    }
    Ok(Identity {
        user_id: data.claims.user_id,
        username: data.claims.username,
    })
}

pub fn sign_gateway_headers(
    user_id: i64,
    username: &str,
    secret: &str,
) -> anyhow::Result<Vec<(String, String)>> {
    let user_b64 = base64_url("null");
    let perms_b64 = base64_url("null");
    let data_b64 = base64_url("null");
    let ts = crate::time::now_ms().to_string();
    let nonce = Uuid::new_v4().to_string();
    let canonical = format!(
        "userId={}&username={}&user={}&perms={}&data={}&ts={}&nonce={}",
        user_id, username, user_b64, perms_b64, data_b64, ts, nonce
    );
    let signature = hmac_sha256_base64_url(secret, canonical.as_bytes())?;
    Ok(vec![
        ("X-User-Id".to_string(), user_id.to_string()),
        ("X-Username".to_string(), username.to_string()),
        ("X-Auth-User".to_string(), user_b64),
        ("X-Auth-Perms".to_string(), perms_b64),
        ("X-Auth-Data".to_string(), data_b64),
        ("X-Auth-Ts".to_string(), ts),
        ("X-Auth-Nonce".to_string(), nonce),
        ("X-Auth-Sign".to_string(), signature),
    ])
}

pub fn hmac_sha256_base64_url(secret: &str, payload: &[u8]) -> anyhow::Result<String> {
    let mut mac = Hmac::<Sha256>::new_from_slice(secret.as_bytes())
        .map_err(|error| anyhow::anyhow!("invalid hmac key: {error}"))?;
    mac.update(payload);
    Ok(URL_SAFE_NO_PAD.encode(mac.finalize().into_bytes()))
}

pub fn constant_time_eq(left: &str, right: &str) -> bool {
    left.as_bytes().ct_eq(right.as_bytes()).into()
}

pub fn base64_url(value: &str) -> String {
    URL_SAFE_NO_PAD.encode(value.as_bytes())
}

/// Returns an error if the JWT secret is empty or shorter than 64 bytes.
pub fn validate_jwt_secret(name: &str, secret: &str) -> anyhow::Result<()> {
    if secret.is_empty() {
        anyhow::bail!("{name} must not be empty");
    }
    if secret.len() < 64 {
        anyhow::bail!(
            "{name} must be at least 64 bytes (got {} bytes)",
            secret.len()
        );
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use jsonwebtoken::{encode, Algorithm, EncodingKey, Header};

    fn sign_token(secret: &str) -> String {
        let claims = Claims {
            user_id: 1,
            username: "test".to_string(),
            typ: "access".to_string(),
            jti: Some("jti1".to_string()),
            sub: Some("test".to_string()),
            iat: Some(1_000_000),
            exp: 9_999_999_999,
        };
        encode(
            &Header::new(Algorithm::HS512),
            &claims,
            &EncodingKey::from_secret(secret.as_bytes()),
        )
        .expect("encode should succeed")
    }

    #[test]
    fn empty_secret_validate_access_token_fails() {
        let token = sign_token(&"a".repeat(64));
        let result = validate_access_token(&token, "");
        assert!(result.is_err(), "empty secret should fail");
        assert!(
            result.unwrap_err().to_string().contains("64 bytes"),
            "error should mention length requirement"
        );
    }

    #[test]
    fn short_secret_validate_access_token_fails() {
        let short = "short-secret";
        let token = sign_token(&"a".repeat(64));
        let result = validate_access_token(&token, short);
        assert!(result.is_err(), "short secret should fail");
        assert!(
            result.unwrap_err().to_string().contains("64 bytes"),
            "error should mention length requirement"
        );
    }

    #[test]
    fn valid_secret_sign_and_validate_succeeds() {
        let secret = "a-valid-secret-that-is-exactly-sixty-four-bytes-long-for-testing-ok!!!";
        assert!(secret.len() >= 64, "test secret must be >= 64 bytes");
        let token = sign_token(secret);
        let identity = validate_access_token(&token, secret).expect("should succeed");
        assert_eq!(identity.user_id, 1);
        assert_eq!(identity.username, "test");
    }

    #[test]
    fn validate_jwt_secret_empty_fails() {
        let result = validate_jwt_secret("JWT_SECRET", "");
        assert!(result.is_err());
        assert!(result
            .unwrap_err()
            .to_string()
            .contains("must not be empty"));
    }

    #[test]
    fn validate_jwt_secret_short_fails() {
        let result = validate_jwt_secret("JWT_SECRET", "short");
        assert!(result.is_err());
        assert!(result.unwrap_err().to_string().contains("64 bytes"));
    }

    #[test]
    fn validate_jwt_secret_64_bytes_passes() {
        let secret = "a".repeat(64);
        assert!(validate_jwt_secret("JWT_SECRET", &secret).is_ok());
    }
}
