package com.im.metrics;

import io.micrometer.core.instrument.*;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;

import java.time.Duration;
import java.util.Locale;
import java.util.Set;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.function.Supplier;

@Component
@RequiredArgsConstructor
public class ImServerMetrics {

    private static final Set<String> HANDSHAKE_REASONS = Set.of(
            "success",
            "origin_denied",
            "missing_ticket",
            "invalid_user",
            "invalid_gateway_signature",
            "ticket_invalid",
            "ticket_mismatch",
            "consume_error",
            "unsupported_request"
    );
    private static final Set<String> PUSH_TYPES = Set.of(
            "MESSAGE",
            "SYSTEM",
            "READ_RECEIPT",
            "READ_SYNC",
            "ONLINE_STATUS",
            "OTHER"
    );
    private static final Set<String> RETRY_ACTIONS = Set.of("enqueue", "requeue", "drop");
    private static final Set<String> RETRY_REASONS = Set.of(
            "invalid_item",
            "expired",
            "max_attempts",
            "ws_push_failed",
            "retry_failed"
    );
    private static final Set<String> DISPATCH_STAGES = Set.of(
            "raw_empty",
            "raw_json",
            "event_null",
            "target_users_empty",
            "target_user_null",
            "payload_empty",
            "payload_invalid",
            "payload_json",
            "load_local_sessions",
            "session_id_empty",
            "dispatch_session",
            "session"
    );
    private static final Set<String> LISTENER_REASONS = Set.of(
            "accepted",
            "executor_rejected",
            "submit_failed",
            "dispatch_failed"
    );
    private static final Set<String> ROUTE_TRANSITIONS = Set.of("online", "offline");

    private final MeterRegistry meterRegistry;
    private final AtomicBoolean connectionGaugesBound = new AtomicBoolean(false);
    private final AtomicBoolean retryQueueGaugesBound = new AtomicBoolean(false);

    public void bindConnectionGauges(Supplier<Number> currentConnections, Supplier<Number> localUsers) {
        if (!connectionGaugesBound.compareAndSet(false, true)) {
            return;
        }
        Gauge.builder("im.websocket.connections.current", currentConnections, ImServerMetrics::safeValue)
                .description("Current local websocket session count")
                .register(meterRegistry);
        Gauge.builder("im.websocket.users.local", localUsers, ImServerMetrics::safeValue)
                .description("Current local online user count")
                .register(meterRegistry);
    }

    public void bindRetryQueueGauges(Supplier<Number> readyQueueSize, Supplier<Number> delayedQueueSize) {
        if (!retryQueueGaugesBound.compareAndSet(false, true)) {
            return;
        }
        Gauge.builder("im.websocket.retry.queue.size", readyQueueSize, ImServerMetrics::safeValue)
                .description("Current websocket retry queue size")
                .tag("state", "ready")
                .register(meterRegistry);
        Gauge.builder("im.websocket.retry.queue.size", delayedQueueSize, ImServerMetrics::safeValue)
                .description("Current websocket retry queue size")
                .tag("state", "delayed")
                .register(meterRegistry);
    }

    public void recordHandshakeSuccess() {
        recordHandshake("success", "success");
    }

    public void recordHandshakeFailure(String reason) {
        recordHandshake("failure", normalize(reason, HANDSHAKE_REASONS, "unsupported_request"));
    }

    public void recordPush(String type, boolean success, Duration duration) {
        String normalizedResult = success ? "success" : "failure";
        String normalizedType = normalizePushType(type);
        Tags tags = Tags.of("result", normalizedResult, "type", normalizedType);
        Counter.builder("im.websocket.push.total")
                .tags(tags)
                .register(meterRegistry)
                .increment();
        Timer.builder("im.websocket.push.duration")
                .tags(tags)
                .register(meterRegistry)
                .record(duration == null || duration.isNegative() ? Duration.ZERO : duration);
    }

    public void recordListenerSubmit(boolean success, String reason) {
        String normalizedReason = success ? "accepted" : normalize(reason, LISTENER_REASONS, "submit_failed");
        Counter.builder("im.websocket.listener.submit.total")
                .tag("result", success ? "success" : "failure")
                .tag("reason", normalizedReason)
                .register(meterRegistry)
                .increment();
    }

    public void recordDispatch(boolean success, String stage) {
        Counter.builder("im.websocket.dispatch.total")
                .tag("result", success ? "success" : "failure")
                .tag("stage", normalize(stage, DISPATCH_STAGES, "dispatch_session"))
                .register(meterRegistry)
                .increment();
    }

    public void recordRetry(String action, String reason) {
        Counter.builder("im.websocket.retry.total")
                .tag("action", normalize(action, RETRY_ACTIONS, "drop"))
                .tag("reason", normalize(reason, RETRY_REASONS, "retry_failed"))
                .register(meterRegistry)
                .increment();
    }

    public void recordDuplicateDeliveryPrevented() {
        Counter.builder("duplicate_delivery_prevented")
                .register(meterRegistry)
                .increment();
    }

    public void recordRouteRegistryStateTransition(String transition) {
        Counter.builder("route_registry_state_transitions")
                .tag("transition", normalize(transition, ROUTE_TRANSITIONS, "offline"))
                .register(meterRegistry)
                .increment();
    }

    private void recordHandshake(String result, String reason) {
        Counter.builder("im.websocket.handshake.total")
                .tag("result", result)
                .tag("reason", normalize(reason, HANDSHAKE_REASONS, "unsupported_request"))
                .register(meterRegistry)
                .increment();
    }

    private String normalizePushType(String type) {
        String normalized = normalizeUpper(type);
        return PUSH_TYPES.contains(normalized) ? normalized : "OTHER";
    }

    private static String normalize(String value, Set<String> allowed, String fallback) {
        String normalized = value == null ? "" : value.trim().toLowerCase(Locale.ROOT);
        return allowed.contains(normalized) ? normalized : fallback;
    }

    private static String normalizeUpper(String value) {
        return value == null ? "" : value.trim().toUpperCase(Locale.ROOT);
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
