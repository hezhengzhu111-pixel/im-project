package com.im.metrics;

import com.im.enums.MessageType;
import com.im.message.entity.Message;
import io.micrometer.core.instrument.Counter;
import io.micrometer.core.instrument.MeterRegistry;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;

import java.util.Locale;
import java.util.Set;

@Component
@RequiredArgsConstructor
public class MessageServiceMetrics {

    private static final Set<String> CHAT_TYPES = Set.of("private", "group", "system", "unknown");

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

    private String normalize(String value, Set<String> allowed, String fallback) {
        String normalized = value == null ? "" : value.trim().toLowerCase(Locale.ROOT);
        return allowed.contains(normalized) ? normalized : fallback;
    }
}
