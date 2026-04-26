use crate::dto::now_ms;
use crate::service::ImService;
use kafka::consumer::{Consumer, FetchOffset, GroupOffsetStorage};
use redis::AsyncCommands;
use serde_json::{json, Map, Value};
use std::collections::BTreeSet;
use std::thread;
use std::time::Duration;

#[derive(Clone, Copy)]
enum EventKind {
    Chat,
    Read,
    Status,
}

pub fn spawn_consumers(service: ImService) {
    if !service.config().kafka_enabled {
        tracing::info!("kafka consumers disabled for im-server-rs");
        return;
    }
    let topics = vec![
        (service.config().kafka_chat_topic.clone(), EventKind::Chat),
        (service.config().kafka_read_topic.clone(), EventKind::Read),
        (
            service.config().kafka_status_topic.clone(),
            EventKind::Status,
        ),
    ];
    let handle = tokio::runtime::Handle::current();
    for (topic, kind) in topics {
        let service_for_thread = service.clone();
        let handle_for_thread = handle.clone();
        thread::spawn(move || {
            run_consumer_loop(service_for_thread, handle_for_thread, topic, kind);
        });
    }
}

fn run_consumer_loop(
    service: ImService,
    handle: tokio::runtime::Handle,
    topic: String,
    kind: EventKind,
) {
    loop {
        match create_consumer(&service, &topic) {
            Ok(mut consumer) => loop {
                match consumer.poll() {
                    Ok(message_sets) => {
                        for message_set in message_sets.iter() {
                            for message in message_set.messages() {
                                let payload = String::from_utf8_lossy(message.value).to_string();
                                handle.block_on(handle_payload(service.clone(), kind, &payload));
                            }
                            if let Err(err) = consumer.consume_messageset(message_set) {
                                tracing::warn!(topic = %topic, error = %err, "consume kafka messageset failed");
                            }
                        }
                        if let Err(err) = consumer.commit_consumed() {
                            tracing::warn!(topic = %topic, error = %err, "commit kafka offset failed");
                        }
                    }
                    Err(err) => {
                        tracing::warn!(topic = %topic, error = %err, "poll kafka topic failed");
                        thread::sleep(Duration::from_secs(2));
                        break;
                    }
                }
            },
            Err(err) => {
                tracing::warn!(topic = %topic, error = %err, "create kafka consumer failed");
                thread::sleep(Duration::from_secs(3));
            }
        }
    }
}

fn create_consumer(service: &ImService, topic: &str) -> kafka::error::Result<Consumer> {
    let hosts = service
        .config()
        .kafka_bootstrap_servers
        .split(',')
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(ToOwned::to_owned)
        .collect::<Vec<_>>();
    let group_id = format!(
        "{}.{}.{}",
        service.config().kafka_group_prefix,
        sanitize_group_component(&service.config().instance_id),
        sanitize_group_component(topic)
    );
    Consumer::from_hosts(hosts)
        .with_topic(topic.to_string())
        .with_group(group_id)
        .with_fallback_offset(resolve_offset(&service.config().kafka_auto_offset_reset))
        .with_offset_storage(Some(GroupOffsetStorage::Kafka))
        .create()
}

async fn handle_payload(service: ImService, kind: EventKind, payload: &str) {
    let event = match serde_json::from_str::<Value>(payload) {
        Ok(value) => value,
        Err(err) => {
            tracing::warn!(error = %err, "skip invalid kafka json payload");
            return;
        }
    };
    match kind {
        EventKind::Chat => handle_chat_event(service, event).await,
        EventKind::Read => handle_read_event(service, event).await,
        EventKind::Status => handle_status_event(service, event).await,
    }
}

async fn handle_chat_event(service: ImService, event: Value) {
    let event_type = string_field(&event, "eventType").unwrap_or_default();
    match event_type.as_str() {
        "MESSAGE" | "MESSAGE_STATUS_CHANGED" => {
            let message = resolve_message_payload(&event);
            if is_group_event(&event, &message) {
                push_group_message(service, &event, message, &event_type).await;
            } else {
                push_private_message(service, &event, message, &event_type).await;
            }
        }
        "READ_RECEIPT" | "READ_SYNC" => {
            let receipt = resolve_read_receipt_payload(&event);
            let target =
                to_i64(receipt.get("to_user_id")).or_else(|| to_i64(event.get("receiverId")));
            if let Some(target) = target {
                let ws_type = if event_type == "READ_SYNC" {
                    "READ_SYNC"
                } else {
                    "READ_RECEIPT"
                };
                service.push_to_user(target, ws_type, receipt).await;
            }
        }
        _ => {}
    }
}

async fn handle_read_event(service: ImService, event: Value) {
    let Some(reader_id) = to_i64(event.get("userId")) else {
        return;
    };
    if string_field(&event, "conversationId").is_none() {
        return;
    }
    let receipt = json!({
        "conversationId": event.get("conversationId").cloned().unwrap_or(Value::Null),
        "readerId": reader_id,
        "to_user_id": event.get("targetUserId").cloned().unwrap_or(Value::Null),
        "read_at": event.get("timestamp").cloned().unwrap_or(Value::Null),
        "last_read_message_id": event.get("lastReadMessageId").cloned().unwrap_or(Value::Null),
    });
    if bool_field(&event, "group") || to_i64(event.get("groupId")).is_some() {
        for member_id in
            resolve_group_member_ids(&service, &event, to_i64(event.get("groupId"))).await
        {
            service
                .push_to_user(member_id, "READ_RECEIPT", receipt.clone())
                .await;
        }
        return;
    }
    service
        .push_to_user(reader_id, "READ_RECEIPT", receipt.clone())
        .await;
    if let Some(target) = to_i64(event.get("targetUserId")) {
        if target != reader_id {
            service.push_to_user(target, "READ_RECEIPT", receipt).await;
        }
    }
}

async fn handle_status_event(service: ImService, event: Value) {
    let Some(message_id) = to_i64(event.get("messageId")) else {
        return;
    };
    let Some(payload) = event
        .get("payload")
        .filter(|value| value.is_object())
        .cloned()
    else {
        return;
    };
    if bool_field(&event, "group")
        || to_i64(event.get("groupId")).is_some()
        || bool_field(&payload, "isGroup")
    {
        let group_id = to_i64(event.get("groupId")).or_else(|| to_i64(payload.get("groupId")));
        for member_id in resolve_group_member_ids(&service, &payload, group_id).await {
            service
                .push_to_user(member_id, "MESSAGE_STATUS_CHANGED", payload.clone())
                .await;
        }
        return;
    }
    let sender = to_i64(event.get("senderId")).or_else(|| to_i64(payload.get("senderId")));
    let receiver = to_i64(event.get("receiverId")).or_else(|| to_i64(payload.get("receiverId")));
    if let Some(sender) = sender {
        service
            .push_to_user(sender, "MESSAGE_STATUS_CHANGED", payload.clone())
            .await;
    }
    if let Some(receiver) = receiver {
        if Some(receiver) != sender {
            service
                .push_to_user(receiver, "MESSAGE_STATUS_CHANGED", payload)
                .await;
        }
    }
    tracing::debug!(message_id, "processed status change event");
}

async fn push_private_message(service: ImService, event: &Value, message: Value, event_type: &str) {
    let sender = to_i64(event.get("senderId")).or_else(|| to_i64(message.get("senderId")));
    let receiver = to_i64(event.get("receiverId")).or_else(|| to_i64(message.get("receiverId")));
    if let Some(receiver) = receiver {
        service
            .push_to_user(receiver, event_type, message.clone())
            .await;
    }
    if let Some(sender) = sender {
        if Some(sender) != receiver {
            service.push_to_user(sender, event_type, message).await;
        }
    }
}

async fn push_group_message(service: ImService, event: &Value, message: Value, event_type: &str) {
    let group_id = to_i64(event.get("groupId")).or_else(|| to_i64(message.get("groupId")));
    for member_id in resolve_group_member_ids(&service, &message, group_id).await {
        service
            .push_to_user(member_id, event_type, message.clone())
            .await;
    }
}

fn resolve_message_payload(event: &Value) -> Value {
    let group_message = is_group_event(event, event.get("payload").unwrap_or(&Value::Null));
    if let Some(payload) = event.get("payload").filter(|value| value.is_object()) {
        let mut object = payload.as_object().cloned().unwrap_or_default();
        put_if_missing(&mut object, "id", event.get("messageId"));
        put_if_missing(
            &mut object,
            "clientMessageId",
            event
                .get("clientMessageId")
                .or_else(|| event.get("clientMsgId")),
        );
        put_if_missing(&mut object, "senderId", event.get("senderId"));
        put_if_missing(&mut object, "receiverId", event.get("receiverId"));
        put_if_missing(&mut object, "groupId", event.get("groupId"));
        put_if_missing(&mut object, "messageType", event.get("messageType"));
        put_if_missing(
            &mut object,
            "status",
            event.get("statusText").or_else(|| event.get("status")),
        );
        object.insert("isGroup".to_string(), Value::Bool(group_message));
        return Value::Object(object);
    }
    json!({
        "id": event.get("messageId").cloned().unwrap_or(Value::Null),
        "clientMessageId": event.get("clientMessageId").or_else(|| event.get("clientMsgId")).cloned().unwrap_or(Value::Null),
        "senderId": event.get("senderId").cloned().unwrap_or(Value::Null),
        "senderName": event.get("senderName").cloned().unwrap_or(Value::Null),
        "senderAvatar": event.get("senderAvatar").cloned().unwrap_or(Value::Null),
        "receiverId": event.get("receiverId").cloned().unwrap_or(Value::Null),
        "receiverName": event.get("receiverName").cloned().unwrap_or(Value::Null),
        "receiverAvatar": event.get("receiverAvatar").cloned().unwrap_or(Value::Null),
        "groupId": event.get("groupId").cloned().unwrap_or(Value::Null),
        "messageType": event.get("messageType").cloned().unwrap_or(Value::Null),
        "content": event.get("content").cloned().unwrap_or(Value::Null),
        "mediaUrl": event.get("mediaUrl").cloned().unwrap_or(Value::Null),
        "mediaSize": event.get("mediaSize").cloned().unwrap_or(Value::Null),
        "mediaName": event.get("mediaName").cloned().unwrap_or(Value::Null),
        "thumbnailUrl": event.get("thumbnailUrl").cloned().unwrap_or(Value::Null),
        "duration": event.get("duration").cloned().unwrap_or(Value::Null),
        "locationInfo": event.get("locationInfo").cloned().unwrap_or(Value::Null),
        "status": event.get("statusText").or_else(|| event.get("status")).cloned().unwrap_or(Value::Null),
        "replyToMessageId": event.get("replyToMessageId").cloned().unwrap_or(Value::Null),
        "createdTime": event.get("createdTime").cloned().unwrap_or(Value::Null),
        "created_at": event.get("createdTime").cloned().unwrap_or(Value::Null),
        "updatedTime": event.get("updatedTime").cloned().unwrap_or(Value::Null),
        "updated_at": event.get("updatedTime").cloned().unwrap_or(Value::Null),
        "isGroup": group_message,
    })
}

fn resolve_read_receipt_payload(event: &Value) -> Value {
    if let Some(payload) = event
        .get("readReceiptPayload")
        .filter(|value| value.is_object())
        .cloned()
    {
        return payload;
    }
    json!({
        "conversationId": event.get("conversationId").cloned().unwrap_or(Value::Null),
        "readerId": event.get("senderId").cloned().unwrap_or(Value::Null),
        "to_user_id": event.get("receiverId").cloned().unwrap_or(Value::Null),
        "read_at": event.get("updatedTime").or_else(|| event.get("createdTime")).cloned().unwrap_or(Value::Null),
        "last_read_message_id": event.get("messageId").cloned().unwrap_or(Value::Null),
    })
}

async fn resolve_group_member_ids(
    service: &ImService,
    payload: &Value,
    group_id: Option<i64>,
) -> Vec<i64> {
    let mut members = member_ids_from_payload(payload);
    if !members.is_empty() {
        return members;
    }
    let Some(group_id) = group_id else {
        return Vec::new();
    };
    members = read_group_member_cache(service, group_id)
        .await
        .unwrap_or_default();
    if !members.is_empty() {
        return members;
    }
    match service.clients().group_member_ids(group_id).await {
        Ok(member_ids) => {
            let distinct = distinct(member_ids);
            write_group_member_cache(service, group_id, &distinct).await;
            distinct
        }
        Err(err) => {
            tracing::warn!(group_id, error = %err, "load group members failed");
            Vec::new()
        }
    }
}

fn member_ids_from_payload(payload: &Value) -> Vec<i64> {
    let Some(members) = payload.get("groupMembers").and_then(Value::as_array) else {
        return Vec::new();
    };
    distinct(
        members
            .iter()
            .filter_map(|item| to_i64(item.get("userId")))
            .collect(),
    )
}

async fn read_group_member_cache(service: &ImService, group_id: i64) -> Option<Vec<i64>> {
    let key = format!(
        "{}{}",
        service.config().group_members_cache_prefix,
        group_id
    );
    let mut redis = service.redis();
    let raw: redis::RedisResult<Option<Vec<u8>>> = redis.get(&key).await;
    let bytes = raw.ok().flatten()?;
    parse_member_ids(&bytes)
}

async fn write_group_member_cache(service: &ImService, group_id: i64, member_ids: &[i64]) {
    let key = format!(
        "{}{}",
        service.config().group_members_cache_prefix,
        group_id
    );
    let mut redis = service.redis();
    if let Ok(payload) = serde_json::to_string(member_ids) {
        let ttl = service.config().group_members_cache_ttl_seconds.max(1);
        let _: redis::RedisResult<()> = redis.set_ex(key, payload, ttl).await;
    }
}

fn parse_member_ids(bytes: &[u8]) -> Option<Vec<i64>> {
    let text = String::from_utf8_lossy(bytes);
    if let Ok(values) = serde_json::from_str::<Vec<i64>>(&text) {
        return Some(distinct(values));
    }
    let start = text.find('[')?;
    let end = text.rfind(']')?;
    serde_json::from_str::<Vec<i64>>(&text[start..=end])
        .ok()
        .map(distinct)
}

fn is_group_event(event: &Value, payload: &Value) -> bool {
    bool_field(event, "group")
        || to_i64(event.get("groupId")).is_some()
        || bool_field(payload, "isGroup")
        || bool_field(payload, "isGroupChat")
}

fn put_if_missing(object: &mut Map<String, Value>, key: &str, value: Option<&Value>) {
    let missing = object.get(key).is_none_or(Value::is_null);
    if missing {
        if let Some(value) = value {
            object.insert(key.to_string(), value.clone());
        }
    }
}

fn to_i64(value: Option<&Value>) -> Option<i64> {
    match value? {
        Value::Number(number) => number
            .as_i64()
            .or_else(|| number.as_u64().map(|v| v as i64)),
        Value::String(text) => text.trim().parse::<i64>().ok(),
        _ => None,
    }
}

fn string_field(value: &Value, field: &str) -> Option<String> {
    value
        .get(field)
        .and_then(Value::as_str)
        .map(str::trim)
        .filter(|text| !text.is_empty())
        .map(ToOwned::to_owned)
}

fn bool_field(value: &Value, field: &str) -> bool {
    match value.get(field) {
        Some(Value::Bool(value)) => *value,
        Some(Value::String(value)) => value.eq_ignore_ascii_case("true"),
        _ => false,
    }
}

fn distinct(values: Vec<i64>) -> Vec<i64> {
    let mut seen = BTreeSet::new();
    values
        .into_iter()
        .filter(|value| seen.insert(*value))
        .collect()
}

fn resolve_offset(value: &str) -> FetchOffset {
    if value.eq_ignore_ascii_case("earliest") {
        FetchOffset::Earliest
    } else {
        FetchOffset::Latest
    }
}

fn sanitize_group_component(value: &str) -> String {
    let sanitized: String = value
        .trim()
        .chars()
        .map(|ch| {
            if ch.is_ascii_alphanumeric() || matches!(ch, '.' | '_' | '-') {
                ch
            } else {
                '_'
            }
        })
        .collect();
    if sanitized.is_empty() {
        format!("unknown-{}", now_ms())
    } else {
        sanitized
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn should_build_message_payload_when_event_has_no_payload() {
        let event = json!({
            "eventType": "MESSAGE",
            "messageId": "100",
            "senderId": "7",
            "receiverId": "8",
            "content": "hello"
        });

        let payload = resolve_message_payload(&event);

        assert_eq!(payload["id"], "100");
        assert_eq!(payload["senderId"], "7");
        assert_eq!(payload["receiverId"], "8");
        assert_eq!(payload["content"], "hello");
    }

    #[test]
    fn should_extract_group_members_from_payload() {
        let payload = json!({
            "groupMembers": [
                {"userId": "7"},
                {"userId": 8},
                {"userId": "7"}
            ]
        });

        assert_eq!(vec![7, 8], member_ids_from_payload(&payload));
    }

    #[test]
    fn should_parse_cached_group_members_with_prefix() {
        let raw = b"\x00[7,8,7]";

        assert_eq!(vec![7, 8], parse_member_ids(raw).unwrap());
    }
}
