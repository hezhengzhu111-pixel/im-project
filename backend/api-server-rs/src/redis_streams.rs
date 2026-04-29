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
    pipe: &mut redis::Pipeline,
    stream_key: &str,
    stream_max_len: usize,
    event_id: &str,
    conversation_id: &str,
    payload: &str,
) {
    pipe.cmd("XADD")
        .arg(stream_key)
        .arg("MAXLEN")
        .arg("~")
        .arg(stream_max_len.max(1))
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
    loop {
        let pending = read_group_events_from(redis, stream, group, consumer, count, 0, "0")?;
        if pending.is_empty() {
            break;
        }
        let (stale_ids, ready) = split_stale_events(pending);
        if !stale_ids.is_empty() {
            ack_stale(redis, stream, group, &stale_ids)?;
        }
        if !ready.is_empty() {
            return Ok(ready);
        }
        if stale_ids.is_empty() {
            break;
        }
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

fn split_stale_events(events: Vec<StreamEvent>) -> (Vec<String>, Vec<StreamEvent>) {
    let mut stale_ids = Vec::new();
    let mut ready = Vec::new();
    for event in events {
        if event.payload.is_empty() {
            stale_ids.push(event.stream_id);
        } else {
            ready.push(event);
        }
    }
    (stale_ids, ready)
}

fn ack_stale(
    redis: &mut redis::Connection,
    stream: &str,
    group: &str,
    stale_ids: &[String],
) -> redis::RedisResult<()> {
    let acknowledged: i64 = redis::cmd("XACK")
        .arg(stream)
        .arg(group)
        .arg(stale_ids)
        .query(redis)?;
    tracing::warn!(
        stream,
        group,
        stale_count = stale_ids.len(),
        acknowledged,
        "acked stale redis stream pending entries"
    );
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn should_split_stale_stream_events() -> Result<(), &'static str> {
        let events = vec![
            StreamEvent {
                stream_id: "1-0".to_string(),
                payload: String::new(),
            },
            StreamEvent {
                stream_id: "2-0".to_string(),
                payload: "{}".to_string(),
            },
        ];

        let (stale, ready) = split_stale_events(events);

        if stale.len() != 1 || stale.first().map(String::as_str) != Some("1-0") {
            return Err("stale stream id should be collected");
        }
        if ready.len() != 1 || ready.first().map(|event| event.payload.as_str()) != Some("{}") {
            return Err("non-empty payload should remain ready");
        }
        Ok(())
    }
}
