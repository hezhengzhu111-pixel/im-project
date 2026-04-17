package com.im.metrics;

import com.im.enums.MessageType;
import com.im.message.entity.Message;
import io.micrometer.core.instrument.Counter;
import io.micrometer.core.instrument.Gauge;
import io.micrometer.core.instrument.MeterRegistry;
import io.micrometer.core.instrument.Timer;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;

import java.time.Duration;
import java.util.Locale;
import java.util.Set;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.function.Supplier;

@Component
@RequiredArgsConstructor
public class MessageServiceMetrics {

    private static final Set<String> CHAT_TYPES = Set.of("private", "group", "system", "unknown");

    private final MeterRegistry meterRegistry;
    private final AtomicBoolean pendingStatusBacklogGaugeBound = new AtomicBoolean(false);

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

    public void bindPendingStatusBacklogGauge(Supplier<Number> backlogSupplier) {
        if (!pendingStatusBacklogGaugeBound.compareAndSet(false, true)) {
            return;
        }
        Gauge.builder("pending_status_backlog", backlogSupplier, MessageServiceMetrics::safeValue)
                .description("Current durable pending status backlog size")
                .register(meterRegistry);
    }

    public void recordAcceptedToPersistedLatency(Duration duration) {
        Timer.builder("accepted_to_persisted_latency")
                .register(meterRegistry)
                .record(duration == null || duration.isNegative() ? Duration.ZERO : duration);
    }

    public void recordWatermarkDbFallbackHit() {
        Counter.builder("watermark_db_fallback_hits")
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

    private static double safeValue(Supplier<Number> supplier) {
        try {
            Number value = supplier == null ? null : supplier.get();
            return value == null ? 0D : value.doubleValue();
        } catch (Exception ignored) {
            return 0D;
        }
    }
}
