# Prometheus Observability

This project exposes Micrometer metrics through Spring Boot Actuator. The `im-server` and `im-message-service` modules publish `/actuator/prometheus` when the Prometheus registry dependency and actuator exposure are enabled.

## Prometheus Scrape Example

```yaml
scrape_configs:
  - job_name: "im-server"
    metrics_path: "/actuator/prometheus"
    static_configs:
      - targets: ["im-server:8083"]

  - job_name: "im-message-service"
    metrics_path: "/actuator/prometheus"
    static_configs:
      - targets: ["im-message-service:8087"]
```

For local checks:

```powershell
curl.exe http://localhost:8083/actuator/prometheus | Select-String "im_websocket_"
curl.exe http://localhost:8087/actuator/prometheus | Select-String "im_message_"
```

## im-server Metrics

| Metric | Type | Labels | Location | Meaning |
| --- | --- | --- | --- | --- |
| `im.websocket.connections.current` | Gauge | `application` | `ImServiceImpl` | Current local WebSocket session count. |
| `im.websocket.users.local` | Gauge | `application` | `ImServiceImpl` | Current local online user count on this instance. |
| `im.websocket.handshake.total` | Counter | `result`, `reason`, `application` | `WebSocketHandshakeInterceptor` | WebSocket handshake successes and failures. |
| `im.websocket.push.total` | Counter | `result`, `type`, `application` | `ImServiceImpl.sendTextToSession` | WebSocket push send result. |
| `im.websocket.push.duration` | Timer | `result`, `type`, `application` | `ImServiceImpl.sendTextToSession` | WebSocket push send duration. |
| `im.websocket.retry.queue.size` | Gauge | `state`, `application` | `MessageRetryQueue` | Retry queue size, split by `ready` and `delayed`. |
| `im.websocket.retry.total` | Counter | `action`, `reason`, `application` | `MessageRetryQueue` | Retry enqueue, requeue, and drop counts. |
| `im.websocket.listener.submit.total` | Counter | `result`, `reason`, `application` | `WsPushTopicSubscriber` | Redis topic listener task submission result. |
| `im.websocket.dispatch.total` | Counter | `result`, `stage`, `application` | `WsPushEventDispatcher` | Dispatch parse, validation, and per-session delivery result. |

Fixed failure reasons include `origin_denied`, `missing_ticket`, `invalid_user`, `ticket_invalid`, `ticket_mismatch`, `consume_error`, `unsupported_request`, `executor_rejected`, `submit_failed`, `dispatch_failed`, `invalid_item`, `expired`, `max_attempts`, `ws_push_failed`, and `retry_failed`.

## message-service Metrics

| Metric | Type | Labels | Location | Meaning |
| --- | --- | --- | --- | --- |
| `im.message.persist.total` | Counter | `result`, `chat_type`, `application` | `AbstractMessageHandler.persistMessage`, `MessageServiceImpl.persistMessage` | Message persistence success/failure count. |
| `im.message.outbox.enqueue.total` | Counter | `event_type`, `application` | `OutboxService.enqueueAfterCommit` | Outbox enqueue count after a message/read event is created. |
| `im.message.outbox.publish.total` | Counter | `result`, `event_type`, `application` | `OutboxPublisher.publishById` | Outbox publish success/failure/skipped count. |
| `im.message.outbox.publish.duration` | Timer | `result`, `event_type`, `application` | `OutboxPublisher.publishById` | Outbox publish duration. |

`chat_type` is one of `private`, `group`, `system`, or `unknown`. `event_type` is one of `MESSAGE`, `READ_RECEIPT`, `READ_SYNC`, or `OTHER`.

## Low-Cardinality Rule

Metric labels must stay bounded. Do not add user IDs, session IDs, message IDs, channel names, topic names, payload content, or exception messages as labels. Dynamic values may be written to logs when needed, but metrics should use fixed enums such as `result`, `reason`, `type`, `stage`, `chat_type`, `event_type`, `state`, and `action`.
