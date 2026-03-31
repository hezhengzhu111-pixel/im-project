package com.im.service;

import com.alibaba.fastjson2.JSON;
import com.im.dto.MessageDTO;
import com.im.dto.ReadReceiptDTO;
import com.im.dto.WsPushEvent;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;
import org.springframework.util.CollectionUtils;
import org.springframework.util.StringUtils;

import java.util.List;

@Slf4j
@Component
@RequiredArgsConstructor
public class WsPushEventDispatcher {

    private static final String EVENT_TYPE_MESSAGE = "MESSAGE";
    private static final String EVENT_TYPE_READ_RECEIPT = "READ_RECEIPT";

    private final IImService imService;
    private final ProcessedMessageDeduplicator deduplicator;
    private final MessageRetryQueue retryQueue;

    public void dispatchRaw(String raw) {
        if (!StringUtils.hasText(raw)) {
            return;
        }
        WsPushEvent event = JSON.parseObject(raw, WsPushEvent.class);
        dispatchEvent(event);
    }

    public void dispatchEvent(WsPushEvent event) {
        if (event == null || CollectionUtils.isEmpty(event.getTargetUserIds())) {
            return;
        }
        for (Long userId : event.getTargetUserIds()) {
            if (userId == null) {
                continue;
            }
            dispatchToSingleUser(event, userId, true);
        }
    }

    public boolean dispatchRetryItem(MessageRetryQueue.RetryItem item) {
        if (item == null || item.getEvent() == null || !StringUtils.hasText(item.getUserId())) {
            return true;
        }
        if (!imService.hasLocalSession(item.getUserId()) || !imService.isRouteOwnedByCurrentInstance(item.getUserId())) {
            return true;
        }
        Long userId = Long.valueOf(item.getUserId());
        return dispatchToSingleUser(item.getEvent(), userId, false);
    }

    private boolean dispatchToSingleUser(WsPushEvent event, Long userId, boolean allowRetry) {
        String dedupKey = resolveEventId(event) + ":" + userId;
        if (deduplicator.isProcessed(dedupKey)) {
            return true;
        }

        String eventType = normalizeEventType(event.getEventType());
        boolean success;
        if (EVENT_TYPE_READ_RECEIPT.equals(eventType)) {
            ReadReceiptDTO receipt = JSON.parseObject(event.getPayload(), ReadReceiptDTO.class);
            success = imService.pushReadReceiptToUser(receipt, userId);
        } else {
            MessageDTO messageDTO = JSON.parseObject(event.getPayload(), MessageDTO.class);
            success = imService.pushMessageToUser(messageDTO, userId);
        }

        if (success) {
            deduplicator.markProcessed(dedupKey);
            return true;
        }
        if (allowRetry) {
            retryQueue.enqueue(String.valueOf(userId), copyForUser(event, userId), "ws_push_failed");
        }
        return false;
    }

    private WsPushEvent copyForUser(WsPushEvent event, Long userId) {
        return WsPushEvent.builder()
                .eventId(resolveEventId(event))
                .eventType(normalizeEventType(event.getEventType()))
                .messageId(event.getMessageId())
                .targetUserIds(List.of(userId))
                .payload(event.getPayload())
                .createdAt(event.getCreatedAt())
                .version(event.getVersion())
                .build();
    }

    private String normalizeEventType(String eventType) {
        if (!StringUtils.hasText(eventType)) {
            return EVENT_TYPE_MESSAGE;
        }
        return eventType.trim().toUpperCase();
    }

    private String resolveEventId(WsPushEvent event) {
        if (event != null && StringUtils.hasText(event.getEventId())) {
            return event.getEventId();
        }
        Long messageId = event == null ? null : event.getMessageId();
        return normalizeEventType(event == null ? null : event.getEventType()) + ":" + (messageId == null ? "unknown" : messageId);
    }
}
