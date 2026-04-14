package com.im.feign;

import feign.RequestTemplate;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.slf4j.MDC;

import java.util.Collection;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;

class FeignTraceInterceptorTest {

    private final FeignTraceInterceptor interceptor = new FeignTraceInterceptor();

    @AfterEach
    void tearDown() {
        MDC.clear();
    }

    @Test
    void shouldAddXLogIdHeaderFromMdc() {
        MDC.put("traceId", "trace-123");
        RequestTemplate template = new RequestTemplate();

        interceptor.apply(template);

        Collection<String> header = template.headers().get("X-Log-Id");
        assertEquals(1, header.size());
        assertEquals("trace-123", header.iterator().next());
    }

    @Test
    void shouldSkipHeaderWhenMdcEmpty() {
        RequestTemplate template = new RequestTemplate();

        interceptor.apply(template);

        assertNull(template.headers().get("X-Log-Id"));
    }
}
