package com.im.metrics;

import com.im.enums.MessageType;
import com.im.message.entity.Message;
import io.micrometer.core.instrument.Counter;
import io.micrometer.core.instrument.MeterRegistry;
import io.micrometer.core.instrument.Tags;
import io.micrometer.core.instrument.Timer;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;

import java.time.Duration;
import java.util.Locale;
import java.util.Set;

@Component
@RequiredArgsConstructor
public class MessageServiceMetrics {

    private static final Set<String> CHAT_TYPES = Set.of("private", "group", "system", "unknown");
    private static final Set<String> EVENT_TYPES = Set.of("MESSAGE", "READ_RECEIPT", "READ_SYNC", "OTHER");
    private static final Set<String> PUBLISH_RESULTS = Set.of("success", "failure", "skipped");

    private final MeterRegistry meterRegistry;

    public void recordPersist(Message message, boolean success) {
        recordPersist(resolveChatType(message), success);
    }

    public void recordPersist(String chatType, boolean success) {
        Counter.builder("im.message.persist.total")
                .tag("result", success ? "success" : "failure")
                .tag("chat_type", normalize(chatType, CHAT_TYPES, "unknown"))
                .register(meterRegistry)
                .increment();
    }

    public void recordOutboxEnqueue(String eventType) {
        Counter.builder("im.message.outbox.enqueue.total")
                .tag("event_type", normalizeEventType(eventType))
                .register(meterRegistry)
                .increment();
    }

    public void recordOutboxPublish(String eventType, String result, Duration duration) {
        String normalizedResult = normalize(result, PUBLISH_RESULTS, "failure");
        Tags tags = Tags.of("result", normalizedResult, "event_type", normalizeEventType(eventType));
        Counter.builder("im.message.outbox.publish.total")
                .tags(tags)
                .register(meterRegistry)
                .increment();
        Timer.builder("im.message.outbox.publish.duration")
                .tags(tags)
                .register(meterRegistry)
                .record(duration == null || duration.isNegative() ? Duration.ZERO : duration);
    }

    private String resolveChatType(Message message) {
        if (message == null) {
            return "unknown";
        }
        if (message.getMessageType() == MessageType.SYSTEM) {
            return "system";
        }
        if (Boolean.TRUE.equals(message.getIsGroupChat())) {
            return "group";
        }
        if (Boolean.FALSE.equals(message.getIsGroupChat())) {
            return "private";
        }
        return "unknown";
    }

    private String normalizeEventType(String eventType) {
        String normalized = eventType == null ? "" : eventType.trim().toUpperCase(Locale.ROOT);
        return EVENT_TYPES.contains(normalized) ? normalized : "OTHER";
    }

    private String normalize(String value, Set<String> allowed, String fallback) {
        String normalized = value == null ? "" : value.trim().toLowerCase(Locale.ROOT);
        return allowed.contains(normalized) ? normalized : fallback;
    }
}
