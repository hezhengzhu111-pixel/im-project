package com.im.concurrent;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.slf4j.MDC;

import java.util.concurrent.atomic.AtomicReference;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;

class MdcTaskDecoratorTest {

    private final MdcTaskDecorator decorator = new MdcTaskDecorator();

    @AfterEach
    void tearDown() {
        MDC.clear();
    }

    @Test
    void shouldCopyParentTraceIdIntoDecoratedTask() {
        MDC.put("traceId", "trace-001");
        AtomicReference<String> childTraceId = new AtomicReference<>();

        Runnable decorated = decorator.decorate(() -> childTraceId.set(MDC.get("traceId")));
        decorated.run();

        assertEquals("trace-001", childTraceId.get());
        assertEquals("trace-001", MDC.get("traceId"));
    }

    @Test
    void shouldClearDecoratedContextWhenParentMdcAbsent() {
        Runnable decorated = decorator.decorate(() -> assertNull(MDC.get("traceId")));
        MDC.put("traceId", "worker-old");

        decorated.run();

        assertEquals("worker-old", MDC.get("traceId"));
    }
}
