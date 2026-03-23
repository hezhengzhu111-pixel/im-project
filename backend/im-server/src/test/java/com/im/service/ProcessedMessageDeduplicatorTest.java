package com.im.service;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.redisson.api.RMapCache;
import org.redisson.api.RedissonClient;

import java.util.concurrent.TimeUnit;

import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class ProcessedMessageDeduplicatorTest {

    @Mock
    private RedissonClient redissonClient;

    @Mock
    private RMapCache<String, Boolean> mapCache;

    @InjectMocks
    private ProcessedMessageDeduplicator deduplicator;

    @BeforeEach
    void setUp() {
        when(redissonClient.<String, Boolean>getMapCache("im:message:processed:cache")).thenReturn(mapCache);
        deduplicator.init();
    }

    @Test
    void tryMarkProcessed_NullKey_ShouldReturnFalse() {
        assertFalse(deduplicator.tryMarkProcessed(null));
    }

    @Test
    void tryMarkProcessed_NewKey_ShouldReturnTrue() {
        when(mapCache.putIfAbsent(eq("msg1"), eq(Boolean.TRUE), eq(10L), eq(TimeUnit.MINUTES)))
                .thenReturn(null);
        
        assertTrue(deduplicator.tryMarkProcessed("msg1"));
    }

    @Test
    void tryMarkProcessed_ExistingKey_ShouldReturnFalse() {
        when(mapCache.putIfAbsent(eq("msg1"), eq(Boolean.TRUE), eq(10L), eq(TimeUnit.MINUTES)))
                .thenReturn(Boolean.TRUE);
        
        assertFalse(deduplicator.tryMarkProcessed("msg1"));
    }
}
