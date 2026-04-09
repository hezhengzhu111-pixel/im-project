package com.im.service;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.redisson.api.RMapCache;
import org.redisson.api.RedissonClient;
import org.springframework.test.util.ReflectionTestUtils;

import java.util.concurrent.TimeUnit;

import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class ProcessedMessageDeduplicatorTest {

    @Mock
    private RedissonClient redissonClient;

    @Mock
    private RMapCache<String, Boolean> mapCache;

    private ProcessedMessageDeduplicator deduplicator;

    @BeforeEach
    void setUp() {
        deduplicator = new ProcessedMessageDeduplicator(redissonClient);
        ReflectionTestUtils.setField(deduplicator, "ttlMs", 300000L);
        when(redissonClient.<String, Boolean>getMapCache("im:message:processed:cache")).thenReturn(mapCache);
        deduplicator.init();
    }

    @Test
    void markProcessed_shouldUseShortTtlWindow() {
        when(mapCache.putIfAbsent(eq("evt-1:2:session-a"), eq(Boolean.TRUE), eq(300000L), eq(TimeUnit.MILLISECONDS)))
                .thenReturn(null);

        assertTrue(deduplicator.markProcessed("evt-1:2:session-a"));
        verify(mapCache).putIfAbsent("evt-1:2:session-a", Boolean.TRUE, 300000L, TimeUnit.MILLISECONDS);
    }

    @Test
    void isProcessed_shouldReadFromCache() {
        when(mapCache.containsKey("evt-1:2:session-a")).thenReturn(true);

        assertTrue(deduplicator.isProcessed("evt-1:2:session-a"));
        assertFalse(deduplicator.isProcessed(null));
    }
}
