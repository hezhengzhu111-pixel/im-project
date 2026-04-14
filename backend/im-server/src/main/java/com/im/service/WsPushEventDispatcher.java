package com.im.service;

import com.alibaba.fastjson2.JSON;
import com.im.dto.MessageDTO;
import com.im.dto.ReadReceiptDTO;
import com.im.dto.WsPushEvent;
import com.im.entity.UserSession;
import com.im.metrics.ImServerMetrics;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
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
    private static final String EVENT_TYPE_READ_SYNC = "READ_SYNC";

    private final IImService imService;
    private final ProcessedMessageDeduplicator deduplicator;
    private final MessageRetryQueue retryQueue;

    @Autowired(required = false)
    private ImServerMetrics metrics;

    public void dispatchRaw(String raw) {
        if (!StringUtils.hasText(raw)) {
            recordInvalidEvent("raw_empty");
            return;
        }
        WsPushEvent event;
        try {
            event = JSON.parseObject(raw, WsPushEvent.class);
        } catch (Exception e) {
            recordParseFailure("raw_json");
            log.warn("Parse ws push event raw json failed. stage={}, rawLength={}, errorType={}",
                    "raw_json", raw.length(), e.getClass().getSimpleName());
            return;
        }
        dispatchEvent(event);
    }

    public void dispatchEvent(WsPushEvent event) {
        if (event == null) {
            recordInvalidEvent("event_null");
            log.warn("Ignore invalid ws push event. reason={}", "event_null");
            return;
        }
        if (CollectionUtils.isEmpty(event.getTargetUserIds())) {
            recordInvalidEvent("target_users_empty");
            log.warn("Ignore invalid ws push event. eventId={}, reason={}", resolveEventId(event), "target_users_empty");
            return;
        }

        String eventType = normalizeEventType(event.getEventType());
        ParsedPayload parsedPayload = parsePayload(event, eventType);
        if (parsedPayload == null) {
            return;
        }

        for (Long userId : event.getTargetUserIds()) {
            if (userId == null) {
                recordInvalidEvent("target_user_null");
                log.warn("Ignore null target user in ws push event. eventId={}, reason={}",
                        resolveEventId(event), "target_user_null");
                continue;
            }
            String userIdStr = String.valueOf(userId);
            List<UserSession> localSessions;
            try {
                localSessions = imService.getLocalSessions(userIdStr);
            } catch (Exception e) {
                recordDispatchFailure("load_local_sessions");
                log.warn("Load local websocket sessions failed. eventId={}, userId={}, stage={}, error={}",
                        resolveEventId(event), userIdStr, "load_local_sessions", e.getMessage());
                continue;
            }
            if (CollectionUtils.isEmpty(localSessions)) {
                continue;
            }
            for (UserSession userSession : localSessions) {
                dispatchLocalSession(event, eventType, userIdStr, userSession, parsedPayload);
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
        MessageDTO message;
        ReadReceiptDTO receipt;
        try {
            message = isReadEvent(eventType)
                    ? null
                    : JSON.parseObject(item.getEvent().getPayload(), MessageDTO.class);
            receipt = isReadEvent(eventType)
                    ? JSON.parseObject(item.getEvent().getPayload(), ReadReceiptDTO.class)
                    : null;
        } catch (Exception e) {
            recordParseFailure("payload_json");
            log.warn("Parse retry ws push payload failed. eventId={}, eventType={}, stage={}, errorType={}",
                    resolveEventId(item.getEvent()), eventType, "payload_json", e.getClass().getSimpleName());
            return true;
        }
        return dispatchToSession(item.getEvent(), eventType, item.getUserId(), item.getSessionId(), message, receipt, false);
    }

    private ParsedPayload parsePayload(WsPushEvent event, String eventType) {
        if (!StringUtils.hasText(event.getPayload())) {
            recordInvalidEvent("payload_empty");
            log.warn("Ignore invalid ws push event. eventId={}, eventType={}, reason={}",
                    resolveEventId(event), eventType, "payload_empty");
            return null;
        }
        try {
            if (isReadEvent(eventType)) {
                ReadReceiptDTO receipt = JSON.parseObject(event.getPayload(), ReadReceiptDTO.class);
                if (receipt == null) {
                    recordInvalidEvent("payload_invalid");
                    log.warn("Ignore invalid ws push event. eventId={}, eventType={}, reason={}",
                            resolveEventId(event), eventType, "payload_invalid");
                    return null;
                }
                return new ParsedPayload(null, receipt);
            }
            MessageDTO message = JSON.parseObject(event.getPayload(), MessageDTO.class);
            if (message == null) {
                recordInvalidEvent("payload_invalid");
                log.warn("Ignore invalid ws push event. eventId={}, eventType={}, reason={}",
                        resolveEventId(event), eventType, "payload_invalid");
                return null;
            }
            return new ParsedPayload(message, null);
        } catch (Exception e) {
            recordParseFailure("payload_json");
            log.warn("Parse ws push event payload failed. eventId={}, eventType={}, stage={}, errorType={}",
                    resolveEventId(event), eventType, "payload_json", e.getClass().getSimpleName());
            return null;
        }
    }

    private void dispatchLocalSession(WsPushEvent event,
                                      String eventType,
                                      String userId,
                                      UserSession userSession,
                                      ParsedPayload parsedPayload) {
        String sessionId = resolveSessionId(userSession);
        if (!StringUtils.hasText(sessionId)) {
            recordInvalidEvent("session_id_empty");
            log.warn("Ignore websocket session with empty sessionId. eventId={}, userId={}, reason={}",
                    resolveEventId(event), userId, "session_id_empty");
            return;
        }
        try {
            dispatchToSession(event, eventType, userId, sessionId,
                    parsedPayload.message(), parsedPayload.receipt(), true);
        } catch (Exception e) {
            recordDispatchFailure("dispatch_session");
            log.warn("Dispatch ws push event to session failed. eventId={}, userId={}, sessionId={}, stage={}, error={}",
                    resolveEventId(event), userId, sessionId, "dispatch_session", e.getMessage());
        }
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

        boolean success = isReadEvent(eventType)
                ? imService.pushReadReceiptToSession(receipt, sessionId, eventType)
                : imService.pushMessageToSession(message, sessionId);
        if (success) {
            deduplicator.markProcessed(dedupKey);
            recordDispatchSuccess("session");
            return true;
        }
        if (!imService.isSessionActive(userId, sessionId)) {
            return true;
        }
        recordDispatchFailure("session");
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

    private boolean isReadEvent(String eventType) {
        return EVENT_TYPE_READ_RECEIPT.equals(eventType) || EVENT_TYPE_READ_SYNC.equals(eventType);
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

    private void recordParseFailure(String stage) {
        recordDispatchFailure(stage);
    }

    private void recordInvalidEvent(String reason) {
        recordDispatchFailure(reason);
    }

    private void recordDispatchFailure(String stage) {
        if (metrics != null) {
            metrics.recordDispatch(false, stage);
        }
    }

    private void recordDispatchSuccess(String stage) {
        if (metrics != null) {
            metrics.recordDispatch(true, stage);
        }
    }

    private record ParsedPayload(MessageDTO message, ReadReceiptDTO receipt) {
    }
}
