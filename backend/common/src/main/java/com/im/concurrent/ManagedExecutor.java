package com.im.concurrent;

import java.util.Objects;
import java.util.concurrent.Executor;

public final class ManagedExecutor implements Executor, AutoCloseable {

    private final Executor delegate;
    private final Runnable closeAction;

    public ManagedExecutor(Executor delegate, Runnable closeAction) {
        this.delegate = Objects.requireNonNull(delegate, "delegate");
        this.closeAction = closeAction == null ? () -> { } : closeAction;
    }

    @Override
    public void execute(Runnable command) {
        delegate.execute(command);
    }

    @Override
    public void close() {
        closeAction.run();
    }
}

