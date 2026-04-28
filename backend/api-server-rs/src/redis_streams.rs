use crate::config::AppConfig;
use redis::streams::StreamReadReply;

const EVENT_ID_FIELD: &str = "eventId";
const CONVERSATION_ID_FIELD: &str = "conversationId";
const PAYLOAD_FIELD: &str = "payload";

#[derive(Debug)]
pub struct StreamEvent {
    pub stream_id: String,
    pub payload: String,
}

pub fn consumer_name(role: &str) -> String {
    let key = format!(
        "IM_STREAM_{}_CONSUMER_NAME",
        role.to_ascii_uppercase().replace('-', "_")
    );
    std::env::var(key)
        .ok()
        .filter(|value| !value.trim().is_empty())
        .unwrap_or_else(|| format!("api-server-rs-{role}"))
}

pub fn ensure_group(
    redis: &mut redis::Connection,
    stream: &str,
    group: &str,
) -> anyhow::Result<()> {
    let result: redis::RedisResult<redis::Value> = redis::cmd("XGROUP")
        .arg("CREATE")
        .arg(stream)
        .arg(group)
        .arg("0")
        .arg("MKSTREAM")
        .query(redis);
    match result {
        Ok(_) => Ok(()),
        Err(error) if error.to_string().contains("BUSYGROUP") => Ok(()),
        Err(error) => Err(error.into()),
    }
}

pub fn append_event_cmd(
    config: &AppConfig,
    pipe: &mut redis::Pipeline,
    event_id: &str,
    conversation_id: &str,
    payload: &str,
) {
    pipe.cmd("XADD")
        .arg(&config.event_stream_key)
        .arg("MAXLEN")
        .arg("~")
        .arg(config.event_stream_max_len.max(1))
        .arg("*")
        .arg(EVENT_ID_FIELD)
        .arg(event_id)
        .arg(CONVERSATION_ID_FIELD)
        .arg(conversation_id)
        .arg(PAYLOAD_FIELD)
        .arg(payload)
        .ignore();
}

pub fn read_group_events(
    redis: &mut redis::Connection,
    stream: &str,
    group: &str,
    consumer: &str,
    count: usize,
    block_ms: u64,
) -> redis::RedisResult<Vec<StreamEvent>> {
    let pending = read_group_events_from(redis, stream, group, consumer, count, 0, "0")?;
    if !pending.is_empty() {
        return Ok(pending);
    }
    read_group_events_from(redis, stream, group, consumer, count, block_ms, ">")
}

pub fn ack(
    redis: &mut redis::Connection,
    stream: &str,
    group: &str,
    stream_ids: &[String],
) -> redis::RedisResult<()> {
    if stream_ids.is_empty() {
        return Ok(());
    }
    let acknowledged: i64 = redis::cmd("XACK")
        .arg(stream)
        .arg(group)
        .arg(stream_ids)
        .query(redis)?;
    tracing::debug!(stream, group, acknowledged, "acked redis stream messages");
    Ok(())
}

fn read_group_events_from(
    redis: &mut redis::Connection,
    stream: &str,
    group: &str,
    consumer: &str,
    count: usize,
    block_ms: u64,
    start_id: &str,
) -> redis::RedisResult<Vec<StreamEvent>> {
    let mut cmd = redis::cmd("XREADGROUP");
    cmd.arg("GROUP").arg(group).arg(consumer);
    cmd.arg("COUNT").arg(count.max(1));
    if block_ms > 0 {
        cmd.arg("BLOCK").arg(block_ms);
    }
    cmd.arg("STREAMS").arg(stream).arg(start_id);

    let reply: StreamReadReply = cmd.query(redis)?;
    let mut events = Vec::new();
    for key in reply.keys {
        for id in key.ids {
            let payload = id.get::<String>(PAYLOAD_FIELD).unwrap_or_default();
            events.push(StreamEvent {
                stream_id: id.id,
                payload,
            });
        }
    }
    Ok(events)
}
