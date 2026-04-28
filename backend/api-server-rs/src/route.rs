use crate::config::AppConfig;
use crate::error::AppError;
use im_rs_common::time;
use redis::aio::ConnectionManager;
use redis::AsyncCommands;
use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RouteLease {
    pub session_count: i32,
    pub expires_at_epoch_ms: i64,
    #[serde(default)]
    pub internal_http_url: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ServerNode {
    pub server_id: String,
    pub internal_http_url: String,
    pub internal_ws_url: String,
    pub session_count: i32,
    pub updated_at_epoch_ms: i64,
    pub expires_at_epoch_ms: i64,
}

#[derive(Debug, Clone)]
pub struct UserRoute {
    pub server_id: String,
    pub internal_http_url: String,
    pub expires_at_epoch_ms: i64,
}

pub async fn server_nodes(
    redis: &mut ConnectionManager,
    config: &AppConfig,
) -> Result<Vec<ServerNode>, AppError> {
    let mut cursor = 0_u64;
    let mut nodes = Vec::new();
    let now = time::now_ms();
    loop {
        let (next, keys): (u64, Vec<String>) = redis::cmd("SCAN")
            .arg(cursor)
            .arg("MATCH")
            .arg(format!("{}*", config.server_registry_key_prefix))
            .arg("COUNT")
            .arg(100)
            .query_async(&mut *redis)
            .await?;
        for key in keys {
            let raw: Option<Vec<u8>> = redis.get(&key).await?;
            if let Some(node) = parse_server_node(raw.as_deref(), now) {
                nodes.push(node);
            }
        }
        if next == 0 {
            break;
        }
        cursor = next;
    }
    nodes.sort_by(|a, b| {
        a.session_count
            .cmp(&b.session_count)
            .then_with(|| a.server_id.cmp(&b.server_id))
    });
    Ok(nodes)
}

pub fn parse_user_routes(raw: Option<&[u8]>, config: &AppConfig) -> Vec<UserRoute> {
    let now = time::now_ms();
    let Some(text) = raw.and_then(extract_json_object) else {
        return Vec::new();
    };
    let Ok(snapshot) = serde_json::from_str::<BTreeMap<String, RouteLease>>(&text) else {
        return Vec::new();
    };
    snapshot
        .into_iter()
        .filter_map(|(server_id, lease)| {
            if lease.session_count <= 0 || lease.expires_at_epoch_ms <= now {
                return None;
            }
            Some(UserRoute {
                server_id,
                internal_http_url: lease
                    .internal_http_url
                    .filter(|value| !value.trim().is_empty())
                    .unwrap_or_else(|| config.im_server_url.clone()),
                expires_at_epoch_ms: lease.expires_at_epoch_ms,
            })
        })
        .collect()
}

pub fn parse_server_node(raw: Option<&[u8]>, now: i64) -> Option<ServerNode> {
    let text = raw.and_then(extract_json_object)?;
    let node = serde_json::from_str::<ServerNode>(&text).ok()?;
    if node.server_id.trim().is_empty()
        || node.internal_http_url.trim().is_empty()
        || node.internal_ws_url.trim().is_empty()
        || node.expires_at_epoch_ms <= now
    {
        return None;
    }
    Some(node)
}

fn extract_json_object(bytes: &[u8]) -> Option<String> {
    let text = String::from_utf8_lossy(bytes);
    let start = text.find('{')?;
    let end = text.rfind('}')?;
    if end < start {
        return None;
    }
    text.get(start..=end).map(ToOwned::to_owned)
}
