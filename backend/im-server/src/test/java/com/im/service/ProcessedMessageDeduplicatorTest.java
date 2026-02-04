package com.im.service;

import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;

class ProcessedMessageDeduplicatorTest {

    @Test
    void tryMarkProcessedShouldDeduplicateWithinTtl() {
        ProcessedMessageDeduplicator deduplicator = new ProcessedMessageDeduplicator(60_000);

        assertThat(deduplicator.tryMarkProcessed("1")).isTrue();
        assertThat(deduplicator.tryMarkProcessed("1")).isFalse();
        assertThat(deduplicator.tryMarkProcessed("2")).isTrue();
    }
}

