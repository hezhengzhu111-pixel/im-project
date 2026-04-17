package com.im.metrics;

import io.micrometer.core.instrument.Counter;
import io.micrometer.core.instrument.MeterRegistry;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;

import java.util.Locale;
import java.util.Set;

@Component
@RequiredArgsConstructor
public class AuthServiceMetrics {

    private static final Set<String> WS_TICKET_RESULTS = Set.of("success", "expired_or_missing", "invalid");

    private final MeterRegistry meterRegistry;

    public void recordWsTicketConsumeResult(String result) {
        Counter.builder("ws_ticket_consume_results")
                .tag("result", normalize(result, "invalid"))
                .register(meterRegistry)
                .increment();
    }

    private String normalize(String value, String fallback) {
        String normalized = value == null ? "" : value.trim().toLowerCase(Locale.ROOT);
        return WS_TICKET_RESULTS.contains(normalized) ? normalized : fallback;
    }
}
