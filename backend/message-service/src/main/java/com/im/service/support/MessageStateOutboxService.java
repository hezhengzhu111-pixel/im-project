package com.im.service.support;

import com.alibaba.fastjson2.JSON;
import com.im.dto.ReadEvent;
import com.im.dto.StatusChangeEvent;
import com.im.mapper.MessageStateOutboxMapper;
import com.im.message.entity.MessageStateOutbox;
import lombok.RequiredArgsConstructor;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;

import java.time.LocalDateTime;

@Service
@RequiredArgsConstructor
public class MessageStateOutboxService {

    public static final String EVENT_TYPE_READ = "READ";
    public static final String EVENT_TYPE_STATUS_CHANGE = "STATUS_CHANGE";
    public static final String DISPATCH_STATUS_PENDING = "PENDING";

    private final MessageStateOutboxMapper messageStateOutboxMapper;

    public void enqueueReadEvent(ReadEvent event, String topic, String routingKey) {
        ReadEvent normalizedEvent = normalizeReadEvent(event);
        insert(buildOutbox(
                buildReadIdempotencyKey(normalizedEvent),
                EVENT_TYPE_READ,
                topic,
                routingKey,
                JSON.toJSONString(normalizedEvent),
                normalizedEvent.getTimestamp()
        ));
    }

    public void enqueueStatusChangeEvent(StatusChangeEvent event, String topic, String routingKey) {
        StatusChangeEvent normalizedEvent = normalizeStatusChangeEvent(event);
        insert(buildOutbox(
                buildStatusIdempotencyKey(normalizedEvent),
                EVENT_TYPE_STATUS_CHANGE,
                topic,
                routingKey,
                JSON.toJSONString(normalizedEvent),
                normalizedEvent.getChangedAt()
        ));
    }

    private void insert(MessageStateOutbox outbox) {
        try {
            messageStateOutboxMapper.insert(outbox);
        } catch (DuplicateKeyException ignored) {
            // Idempotent replay of the same logical state event should keep the existing outbox row.
        }
    }

    private MessageStateOutbox buildOutbox(String idempotencyKey,
                                           String eventType,
                                           String topic,
                                           String routingKey,
                                           String payloadJson,
                                           LocalDateTime createdTime) {
        LocalDateTime now = createdTime == null ? LocalDateTime.now() : createdTime;
        MessageStateOutbox outbox = new MessageStateOutbox();
        outbox.setIdempotencyKey(idempotencyKey);
        outbox.setEventType(eventType);
        outbox.setTopic(StringUtils.hasText(topic) ? topic.trim() : null);
        outbox.setRoutingKey(StringUtils.hasText(routingKey) ? routingKey.trim() : null);
        outbox.setPayloadJson(payloadJson);
        outbox.setDispatchStatus(DISPATCH_STATUS_PENDING);
        outbox.setAttemptCount(0);
        outbox.setNextAttemptTime(now);
        outbox.setCreatedTime(now);
        outbox.setUpdatedTime(now);
        return outbox;
    }

    private ReadEvent normalizeReadEvent(ReadEvent event) {
        if (event == null) {
            throw new IllegalArgumentException("read event cannot be null");
        }
        if (event.getTimestamp() == null) {
            event.setTimestamp(LocalDateTime.now());
        }
        return event;
    }

    private StatusChangeEvent normalizeStatusChangeEvent(StatusChangeEvent event) {
        if (event == null) {
            throw new IllegalArgumentException("status change event cannot be null");
        }
        if (event.getChangedAt() == null) {
            event.setChangedAt(LocalDateTime.now());
        }
        return event;
    }

    private String buildReadIdempotencyKey(ReadEvent event) {
        return "READ:"
                + event.getUserId()
                + ':'
                + event.getConversationId()
                + ':'
                + event.getLastReadMessageId()
                + ':'
                + event.getTimestamp();
    }

    private String buildStatusIdempotencyKey(StatusChangeEvent event) {
        return "STATUS:"
                + event.getMessageId()
                + ':'
                + event.getNewStatus()
                + ':'
                + event.getChangedAt();
    }
}
