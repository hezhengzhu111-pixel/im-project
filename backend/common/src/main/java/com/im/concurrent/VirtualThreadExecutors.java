package com.im.concurrent;

import java.lang.reflect.Method;
import java.util.concurrent.ExecutorService;

public final class VirtualThreadExecutors {

    private VirtualThreadExecutors() {
    }

    public static ExecutorService tryNewVirtualThreadPerTaskExecutor() {
        try {
            Method method = java.util.concurrent.Executors.class.getMethod("newVirtualThreadPerTaskExecutor");
            Object executor = method.invoke(null);
            if (executor instanceof ExecutorService executorService) {
                return executorService;
            }
            return null;
        } catch (Throwable ignored) {
            return null;
        }
    }
}

