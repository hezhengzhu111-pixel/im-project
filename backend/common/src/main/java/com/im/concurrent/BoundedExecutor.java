package com.im.concurrent;

import java.util.Objects;
import java.util.concurrent.Executor;
import java.util.concurrent.RejectedExecutionException;
import java.util.concurrent.Semaphore;

public class BoundedExecutor implements Executor {

    private final Executor delegate;
    private final Semaphore semaphore;

    public BoundedExecutor(Executor delegate, int maxConcurrency) {
        this.delegate = Objects.requireNonNull(delegate, "delegate");
        if (maxConcurrency <= 0) {
            throw new IllegalArgumentException("maxConcurrency must be positive");
        }
        this.semaphore = new Semaphore(maxConcurrency);
    }

    @Override
    public void execute(Runnable command) {
        Objects.requireNonNull(command, "command");
        boolean acquired = semaphore.tryAcquire();
        if (!acquired) {
            throw new RejectedExecutionException("Too many concurrent tasks");
        }
        try {
            delegate.execute(() -> {
                try {
                    command.run();
                } finally {
                    semaphore.release();
                }
            });
        } catch (RuntimeException e) {
            semaphore.release();
            throw e;
        }
    }
}

