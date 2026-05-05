use crate::config::AppConfig;
use crate::error::AppError;
use redis::aio::ConnectionManager;
use serde_json::Value;

#[derive(Debug, Default)]
pub enum TaskType {
    #[default]
    Summary,
    AutoReply,
    RagParse,
    RagQuery,
}

impl TaskType {
    pub fn as_str(&self) -> &'static str {
        match self {
            Self::Summary => "summary",
            Self::AutoReply => "auto_reply",
            Self::RagParse => "rag_parse",
            Self::RagQuery => "rag_query",
        }
    }
}

#[derive(Debug, Default)]
pub struct TaskPayload {
    pub task_type: TaskType,
    pub user_id: i64,
    pub conversation_id: Option<String>,
    pub provider: Option<String>,
    pub decrypted_key: Option<String>,
    pub messages_json: Option<String>,
    pub persona: Option<String>,
    pub task_id: Option<i64>,
    pub doc_id: Option<i64>,
    pub oss_url: Option<String>,
    pub query: Option<String>,
    pub group_id: Option<i64>,
}

pub async fn enqueue_task(
    redis: &mut ConnectionManager,
    config: &AppConfig,
    payload: TaskPayload,
) -> Result<i64, AppError> {
    let task_id = payload.task_id.unwrap_or(0);
    let mut fields: Vec<(String, String)> = Vec::new();

    fields.push(("taskType".to_string(), payload.task_type.as_str().to_string()));
    fields.push(("userId".to_string(), payload.user_id.to_string()));
    fields.push(("taskId".to_string(), task_id.to_string()));

    if let Some(ref conv) = payload.conversation_id {
        fields.push(("conversationId".to_string(), conv.clone()));
    }
    if let Some(ref provider) = payload.provider {
        fields.push(("provider".to_string(), provider.clone()));
    }
    if let Some(ref key) = payload.decrypted_key {
        fields.push(("key".to_string(), key.clone()));
    }
    if let Some(ref messages) = payload.messages_json {
        fields.push(("messages".to_string(), messages.clone()));
    }
    if let Some(ref persona) = payload.persona {
        fields.push(("persona".to_string(), persona.clone()));
    }
    if let Some(doc_id) = payload.doc_id {
        fields.push(("docId".to_string(), doc_id.to_string()));
    }
    if let Some(ref oss) = payload.oss_url {
        fields.push(("ossUrl".to_string(), oss.clone()));
    }
    if let Some(ref query) = payload.query {
        fields.push(("query".to_string(), query.clone()));
    }
    if let Some(group_id) = payload.group_id {
        fields.push(("groupId".to_string(), group_id.to_string()));
    }

    let mut cmd = redis::cmd("XADD");
    cmd.arg(&config.ai_task_stream_key)
        .arg("MAXLEN")
        .arg("~")
        .arg("10000")
        .arg("*");
    for (k, v) in &fields {
        cmd.arg(k).arg(v);
    }

    let _stream_id: String = cmd.query_async(redis).await.map_err(|e| {
        AppError::Upstream(format!("failed to enqueue AI task: {e}"))
    })?;

    Ok(task_id)
}

pub fn serialize_messages(messages: &[Value]) -> String {
    serde_json::to_string(messages).unwrap_or_else(|_| "[]".to_string())
}
