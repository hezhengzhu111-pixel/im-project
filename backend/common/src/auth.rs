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
    if token.len() > 1 && token.starts_with('"') && token.ends_with('"') {
        token = token[1..token.len() - 1].trim().to_string();
    }
    if let Some(rest) = token.strip_prefix("Bearer ") {
        token = rest.trim().to_string();
    }
    (!token.is_empty()).then_some(token)
}

pub fn validate_access_token(token: &str, secret: &str) -> anyhow::Result<Identity> {
    let mut validation = Validation::new(Algorithm::HS512);
    validation.validate_exp = true;
    let data = decode::<Claims>(
        token,
        &DecodingKey::from_secret(&padded_hs512_secret(secret)),
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

pub fn sign_gateway_headers(user_id: i64, username: &str, secret: &str) -> Vec<(String, String)> {
    let user_b64 = base64_url("null");
    let perms_b64 = base64_url("null");
    let data_b64 = base64_url("null");
    let ts = crate::time::now_ms().to_string();
    let nonce = Uuid::new_v4().to_string();
    let canonical = format!(
        "userId={}&username={}&user={}&perms={}&data={}&ts={}&nonce={}",
        user_id, username, user_b64, perms_b64, data_b64, ts, nonce
    );
    let signature = hmac_sha256_base64_url(secret, canonical.as_bytes());
    vec![
        ("X-User-Id".to_string(), user_id.to_string()),
        ("X-Username".to_string(), username.to_string()),
        ("X-Auth-User".to_string(), user_b64),
        ("X-Auth-Perms".to_string(), perms_b64),
        ("X-Auth-Data".to_string(), data_b64),
        ("X-Auth-Ts".to_string(), ts),
        ("X-Auth-Nonce".to_string(), nonce),
        ("X-Auth-Sign".to_string(), signature),
    ]
}

pub fn hmac_sha256_base64_url(secret: &str, payload: &[u8]) -> String {
    let mut mac = Hmac::<Sha256>::new_from_slice(secret.as_bytes()).expect("hmac accepts any key");
    mac.update(payload);
    URL_SAFE_NO_PAD.encode(mac.finalize().into_bytes())
}

pub fn constant_time_eq(left: &str, right: &str) -> bool {
    left.as_bytes().ct_eq(right.as_bytes()).into()
}

pub fn base64_url(value: &str) -> String {
    URL_SAFE_NO_PAD.encode(value.as_bytes())
}

fn padded_hs512_secret(secret: &str) -> Vec<u8> {
    let bytes = secret.as_bytes();
    if bytes.len() >= 64 {
        return bytes.to_vec();
    }
    let mut padded = vec![0_u8; 64];
    if bytes.is_empty() {
        return padded;
    }
    for index in 0..64 {
        padded[index] = bytes[index % bytes.len()];
    }
    padded
}
