use im_common::event::E2eeEnvelopeDto;
use serde::{de, Deserialize, Deserializer, Serialize};
use serde_json;

/// 私聊消息发送请求体。
///
/// `receiver_id` 支持数字和字符串两种 JSON 格式（通过 `deserialize_i64` 兼容）。
/// E2EE messages must use the Rust v2 envelope. Legacy header/ciphertext
/// payloads are rejected for new messages.
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct SendPrivateRequest {
    #[serde(deserialize_with = "deserialize_i64")]
    pub receiver_id: i64,
    pub client_message_id: Option<String>,
    pub message_type: Option<String>,
    pub content: Option<String>,
    pub media_url: Option<String>,
    pub media_size: Option<i64>,
    pub media_name: Option<String>,
    pub thumbnail_url: Option<String>,
    pub duration: Option<i32>,
    pub encrypted: Option<bool>,
    pub e2ee_header: Option<String>,
    pub e2ee_device_id: Option<String>,
    pub e2ee_sender_identity_key: Option<String>,
    pub e2ee_ephemeral_key: Option<String>,
    pub e2ee_envelope: Option<E2eeEnvelopeDto>,
    pub e2ee_envelopes: Option<Vec<PrivateDeviceEnvelopeRequest>>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct PrivateDeviceEnvelopeRequest {
    #[serde(deserialize_with = "deserialize_i64")]
    pub recipient_user_id: i64,
    pub recipient_device_id: String,
    pub envelope: E2eeEnvelopeDto,
}

/// 群聊消息发送请求体。
///
/// `mentioned_user_ids` 为可选的 @提及列表，服务端会校验被提及用户是否为群成员。
/// 发送者自身会被自动排除在 @提及列表之外。
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct SendGroupRequest {
    #[serde(deserialize_with = "deserialize_i64")]
    pub group_id: i64,
    pub client_message_id: Option<String>,
    pub message_type: Option<String>,
    pub content: Option<String>,
    pub media_url: Option<String>,
    pub media_size: Option<i64>,
    pub media_name: Option<String>,
    pub thumbnail_url: Option<String>,
    pub duration: Option<i32>,
    pub mentioned_user_ids: Option<Vec<String>>,
    pub encrypted: Option<bool>,
    pub e2ee_envelope: Option<E2eeEnvelopeDto>,
}

/// 历史消息查询参数，支持游标分页和数量限制。
///
/// `last_message_id`：返回此 ID 之前的消息（向前翻页）；
/// `after_message_id`：返回此 ID 之后的消息（向后翻页）；
/// `limit`/`size`：每页数量，取值范围 [1, 100]，默认 20。
#[derive(Debug, Deserialize)]
pub(crate) struct HistoryQuery {
    pub size: Option<i64>,
    pub limit: Option<i64>,
    pub last_message_id: Option<i64>,
    pub after_message_id: Option<i64>,
    #[serde(alias = "deviceId")]
    pub device_id: Option<String>,
}

/// 消息客户端配置，告知前端当前的消息约束。
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct MessageConfig {
    pub text_enforce: bool,
    pub text_max_length: i32,
}

/// 会话摘要 DTO，用于会话列表展示。
///
/// `conversation_type`：1=私聊，2=群聊。
/// `unread_count` 从 Redis Hash（`im:user:{uid}:unread`）中读取，
/// 群聊未读数通过 `group_seq - read_seq` 计算。
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct ConversationDto {
    pub conversation_id: String,
    pub conversation_type: i32,
    pub target_id: String,
    pub conversation_name: String,
    pub conversation_avatar: Option<String>,
    pub last_message: String,
    pub last_message_type: String,
    pub last_message_sender_id: Option<String>,
    pub last_message_sender_name: Option<String>,
    pub last_message_time: Option<String>,
    pub unread_count: i64,
    pub is_online: bool,
    pub is_pinned: bool,
    pub is_muted: bool,
}

pub(crate) struct GroupConversationSource {
    pub(crate) group_id: i64,
    pub(crate) name: String,
    pub(crate) avatar: Option<String>,
}

pub(crate) struct BuildMessageInput {
    pub(crate) receiver_id: Option<i64>,
    pub(crate) group_id: Option<i64>,
    pub(crate) client_message_id: Option<String>,
    pub(crate) message_type: Option<String>,
    pub(crate) content: Option<String>,
    pub(crate) media_url: Option<String>,
    pub(crate) media_size: Option<i64>,
    pub(crate) media_name: Option<String>,
    pub(crate) thumbnail_url: Option<String>,
    pub(crate) duration: Option<i32>,
    pub(crate) encrypted: Option<bool>,
    pub(crate) e2ee_header: Option<String>,
    pub(crate) e2ee_device_id: Option<String>,
    pub(crate) e2ee_sender_identity_key: Option<String>,
    pub(crate) e2ee_ephemeral_key: Option<String>,
    pub(crate) e2ee_envelope: Option<E2eeEnvelopeDto>,
}

pub(crate) fn deserialize_i64<'de, D>(deserializer: D) -> Result<i64, D::Error>
where
    D: Deserializer<'de>,
{
    let value = serde_json::Value::deserialize(deserializer)?;
    match value {
        serde_json::Value::Number(number) => number
            .as_i64()
            .or_else(|| number.as_u64().and_then(|item| i64::try_from(item).ok()))
            .ok_or_else(|| de::Error::custom("invalid integer")),
        serde_json::Value::String(text) => text
            .trim()
            .parse()
            .map_err(|_| de::Error::custom("invalid integer")),
        _ => Err(de::Error::custom("invalid integer")),
    }
}

pub(crate) struct ConversationTarget {
    pub(crate) conversation_id: String,
    pub(crate) frontend_conversation_id: String,
    pub(crate) peer_id: Option<i64>,
    pub(crate) group_id: Option<i64>,
}

pub(crate) struct DbScope {
    pub(crate) left_id: i64,
    pub(crate) right_id: i64,
    pub(crate) group_id: Option<i64>,
}
