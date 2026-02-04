package com.im.perf;

import com.im.concurrent.BoundedExecutor;
import com.im.concurrent.VirtualThreadExecutors;

import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.Executor;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;

public class VirtualThreadBlockingIoBenchmark {

    public static void main(String[] args) throws Exception {
        int tasks = args.length > 0 ? Integer.parseInt(args[0]) : 5000;
        int platformPoolSize = args.length > 1 ? Integer.parseInt(args[1]) : 64;
        int blockingMs = args.length > 2 ? Integer.parseInt(args[2]) : 20;
        int vtMaxConcurrency = args.length > 3 ? Integer.parseInt(args[3]) : 2000;

        System.out.println("java=" + Runtime.version());
        System.out.println("tasks=" + tasks + ", platformPoolSize=" + platformPoolSize + ", blockingMs=" + blockingMs + ", vtMaxConcurrency=" + vtMaxConcurrency);

        ExecutorService platform = Executors.newFixedThreadPool(platformPoolSize);
        try {
            BenchmarkResult platformResult = run(platform, tasks, blockingMs);
            System.out.println("[platform] elapsedMs=" + platformResult.elapsedMs + ", tasksPerSec=" + platformResult.tasksPerSec);
        } finally {
            platform.shutdownNow();
        }

        ExecutorService virtual = VirtualThreadExecutors.tryNewVirtualThreadPerTaskExecutor();
        if (virtual == null) {
            System.out.println("[virtual] not supported on this JDK");
            return;
        }
        try {
            Executor bounded = new BoundedExecutor(virtual, vtMaxConcurrency);
            BenchmarkResult virtualResult = run(bounded, tasks, blockingMs);
            System.out.println("[virtual]  elapsedMs=" + virtualResult.elapsedMs + ", tasksPerSec=" + virtualResult.tasksPerSec);
        } finally {
            virtual.shutdownNow();
        }
    }

    private static BenchmarkResult run(Executor executor, int tasks, int blockingMs) throws Exception {
        for (int i = 0; i < 3; i++) {
            runOnce(executor, 500, 1);
        }

        BenchmarkResult result = runOnce(executor, tasks, blockingMs);
        if (result.elapsedMs <= 0) {
            result.elapsedMs = 1;
        }
        result.tasksPerSec = (long) ((tasks * 1000.0) / result.elapsedMs);
        return result;
    }

    private static BenchmarkResult runOnce(Executor executor, int tasks, int blockingMs) throws Exception {
        CountDownLatch latch = new CountDownLatch(tasks);
        List<Throwable> errors = new ArrayList<>();

        long start = System.nanoTime();
        for (int i = 0; i < tasks; i++) {
            executor.execute(() -> {
                try {
                    TimeUnit.MILLISECONDS.sleep(blockingMs);
                } catch (Throwable t) {
                    synchronized (errors) {
                        errors.add(t);
                    }
                } finally {
                    latch.countDown();
                }
            });
        }
        latch.await(60, TimeUnit.SECONDS);
        long elapsedMs = TimeUnit.NANOSECONDS.toMillis(System.nanoTime() - start);

        if (!errors.isEmpty()) {
            throw new RuntimeException("Benchmark errors: " + errors.size(), errors.get(0));
        }
        return new BenchmarkResult(elapsedMs);
    }

    private static final class BenchmarkResult {
        private long elapsedMs;
        private long tasksPerSec;

        private BenchmarkResult(long elapsedMs) {
            this.elapsedMs = elapsedMs;
        }
    }
}

