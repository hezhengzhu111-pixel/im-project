package com.im.service;

import com.alibaba.fastjson2.JSON;
import com.im.dto.MessageDTO;
import com.im.dto.ReadReceiptDTO;
import com.im.dto.WsPushEvent;
import com.im.entity.UserSession;
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

        String eventType = normalizeEventType(event.getEventType());
        MessageDTO message = EVENT_TYPE_READ_RECEIPT.equals(eventType)
                ? null
                : JSON.parseObject(event.getPayload(), MessageDTO.class);
        ReadReceiptDTO receipt = EVENT_TYPE_READ_RECEIPT.equals(eventType)
                ? JSON.parseObject(event.getPayload(), ReadReceiptDTO.class)
                : null;

        for (Long userId : event.getTargetUserIds()) {
            if (userId == null) {
                continue;
            }
            String userIdStr = String.valueOf(userId);
            for (UserSession userSession : imService.getLocalSessions(userIdStr)) {
                String sessionId = resolveSessionId(userSession);
                if (!StringUtils.hasText(sessionId)) {
                    continue;
                }
                dispatchToSession(event, eventType, userIdStr, sessionId, message, receipt, true);
            }
        }
    }

    public boolean dispatchRetryItem(MessageRetryQueue.RetryItem item) {
        if (item == null
                || item.getEvent() == null
                || !StringUtils.hasText(item.getUserId())
                || !StringUtils.hasText(item.getSessionId())) {
            return true;
        }
        if (retryQueue.isExpired(item)) {
            return true;
        }
        if (StringUtils.hasText(item.getInstanceId())
                && !item.getInstanceId().equals(imService.getCurrentInstanceId())) {
            return true;
        }
        if (!imService.isSessionActive(item.getUserId(), item.getSessionId())) {
            return true;
        }

        String eventType = normalizeEventType(item.getEvent().getEventType());
        MessageDTO message = EVENT_TYPE_READ_RECEIPT.equals(eventType)
                ? null
                : JSON.parseObject(item.getEvent().getPayload(), MessageDTO.class);
        ReadReceiptDTO receipt = EVENT_TYPE_READ_RECEIPT.equals(eventType)
                ? JSON.parseObject(item.getEvent().getPayload(), ReadReceiptDTO.class)
                : null;
        return dispatchToSession(item.getEvent(), eventType, item.getUserId(), item.getSessionId(), message, receipt, false);
    }

    private boolean dispatchToSession(WsPushEvent event,
                                      String eventType,
                                      String userId,
                                      String sessionId,
                                      MessageDTO message,
                                      ReadReceiptDTO receipt,
                                      boolean allowRetry) {
        String dedupKey = resolveEventId(event) + ":" + userId + ":" + sessionId;
        if (deduplicator.isProcessed(dedupKey)) {
            return true;
        }
        if (!imService.isSessionActive(userId, sessionId)) {
            return true;
        }

        boolean success = EVENT_TYPE_READ_RECEIPT.equals(eventType)
                ? imService.pushReadReceiptToSession(receipt, sessionId)
                : imService.pushMessageToSession(message, sessionId);
        if (success) {
            deduplicator.markProcessed(dedupKey);
            return true;
        }
        if (!imService.isSessionActive(userId, sessionId)) {
            return true;
        }
        if (allowRetry) {
            retryQueue.enqueue(userId, sessionId, copyForSession(event, userId, sessionId), "ws_push_failed");
        }
        return false;
    }

    private WsPushEvent copyForSession(WsPushEvent event, String userId, String sessionId) {
        return WsPushEvent.builder()
                .eventId(resolveEventId(event))
                .eventType(normalizeEventType(event == null ? null : event.getEventType()))
                .messageId(event == null ? null : event.getMessageId())
                .targetUserIds(StringUtils.hasText(userId) ? List.of(Long.valueOf(userId)) : List.of())
                .payload(event == null ? null : event.getPayload())
                .createdAt(event == null ? null : event.getCreatedAt())
                .version(event == null ? null : event.getVersion())
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
        return normalizeEventType(event == null ? null : event.getEventType())
                + ":"
                + (messageId == null ? "unknown" : messageId);
    }

    private String resolveSessionId(UserSession userSession) {
        if (userSession == null || userSession.getWebSocketSession() == null) {
            return null;
        }
        return userSession.getWebSocketSession().getId();
    }
}
