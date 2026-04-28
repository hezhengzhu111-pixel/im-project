use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "PascalCase")]
pub enum ImEventType {
    MessageCreated,
    MessageRead,
    MessageRecalled,
    MessageDeleted,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "UPPERCASE")]
pub enum MessageType {
    Text,
    Image,
    File,
    Voice,
    Video,
    System,
}

impl MessageType {
    pub fn from_text(value: &str) -> Self {
        match value.trim().to_ascii_uppercase().as_str() {
            "IMAGE" => Self::Image,
            "FILE" => Self::File,
            "VOICE" => Self::Voice,
            "VIDEO" => Self::Video,
            "SYSTEM" => Self::System,
            _ => Self::Text,
        }
    }

    pub fn db_code(&self) -> i32 {
        match self {
            Self::Text => 1,
            Self::Image => 2,
            Self::File => 3,
            Self::Voice => 4,
            Self::Video => 5,
            Self::System => 7,
        }
    }

    pub fn as_str(&self) -> &'static str {
        match self {
            Self::Text => "TEXT",
            Self::Image => "IMAGE",
            Self::File => "FILE",
            Self::Voice => "VOICE",
            Self::Video => "VIDEO",
            Self::System => "SYSTEM",
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "UPPERCASE")]
pub enum MessageStatus {
    Sent,
    Delivered,
    Read,
    Recalled,
    Deleted,
}

impl MessageStatus {
    pub fn from_text(value: &str) -> Self {
        match value.trim().to_ascii_uppercase().as_str() {
            "DELIVERED" => Self::Delivered,
            "READ" => Self::Read,
            "RECALLED" => Self::Recalled,
            "DELETED" => Self::Deleted,
            _ => Self::Sent,
        }
    }

    pub fn db_code(&self) -> i32 {
        match self {
            Self::Sent => 1,
            Self::Delivered => 2,
            Self::Read => 3,
            Self::Recalled => 4,
            Self::Deleted => 5,
        }
    }

    pub fn as_str(&self) -> &'static str {
        match self {
            Self::Sent => "SENT",
            Self::Delivered => "DELIVERED",
            Self::Read => "READ",
            Self::Recalled => "RECALLED",
            Self::Deleted => "DELETED",
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MessageDto {
    pub id: String,
    pub message_id: String,
    pub client_message_id: Option<String>,
    pub sender_id: String,
    pub sender_name: Option<String>,
    pub sender_avatar: Option<String>,
    pub receiver_id: Option<String>,
    pub receiver_name: Option<String>,
    pub group_id: Option<String>,
    pub group_name: Option<String>,
    pub group_avatar: Option<String>,
    pub is_group_chat: bool,
    pub is_group: bool,
    pub message_type: String,
    pub content: Option<String>,
    pub media_url: Option<String>,
    pub media_size: Option<i64>,
    pub media_name: Option<String>,
    pub thumbnail_url: Option<String>,
    pub duration: Option<i32>,
    pub location_info: Option<String>,
    pub status: String,
    pub reply_to_message_id: Option<String>,
    pub created_time: String,
    pub created_at: String,
    pub updated_time: Option<String>,
    pub updated_at: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ReadReceipt {
    pub conversation_id: String,
    pub reader_id: String,
    pub to_user_id: Option<String>,
    pub read_at: String,
    pub last_read_message_id: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ImEvent {
    pub event_id: String,
    pub event_type: ImEventType,
    pub conversation_id: String,
    pub message_id: Option<String>,
    pub sender_id: Option<String>,
    pub receiver_id: Option<String>,
    pub group_id: Option<String>,
    pub target_user_id: Option<String>,
    pub group: bool,
    pub new_status: Option<String>,
    pub payload: Option<MessageDto>,
    pub read_receipt: Option<ReadReceipt>,
    pub timestamp: DateTime<Utc>,
}

impl ImEvent {
    pub fn new(event_type: ImEventType, conversation_id: String) -> Self {
        Self {
            event_id: Uuid::new_v4().to_string(),
            event_type,
            conversation_id,
            message_id: None,
            sender_id: None,
            receiver_id: None,
            group_id: None,
            target_user_id: None,
            group: false,
            new_status: None,
            payload: None,
            read_receipt: None,
            timestamp: Utc::now(),
        }
    }
}
