package com.im.concurrent;

import org.junit.jupiter.api.Test;

import java.util.concurrent.CountDownLatch;
import java.util.concurrent.Executors;
import java.util.concurrent.RejectedExecutionException;
import java.util.concurrent.TimeUnit;

import static org.assertj.core.api.Assertions.assertThatThrownBy;

class BoundedExecutorTest {

    @Test
    void shouldRejectWhenMaxConcurrencyExceeded() throws Exception {
        CountDownLatch started = new CountDownLatch(1);
        CountDownLatch release = new CountDownLatch(1);

        BoundedExecutor executor = new BoundedExecutor(Executors.newSingleThreadExecutor(), 1);
        executor.execute(() -> {
            started.countDown();
            try {
                release.await(2, TimeUnit.SECONDS);
            } catch (InterruptedException ignored) {
                Thread.currentThread().interrupt();
            }
        });

        started.await(2, TimeUnit.SECONDS);

        assertThatThrownBy(() -> executor.execute(() -> { }))
                .isInstanceOf(RejectedExecutionException.class);

        release.countDown();
    }
}

