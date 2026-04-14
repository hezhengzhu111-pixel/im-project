package com.im.config;

import com.im.concurrent.BoundedExecutor;
import com.im.concurrent.ManagedExecutor;
import com.im.concurrent.MdcTaskDecorator;
import com.im.concurrent.VirtualThreadExecutors;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.Primary;
import org.springframework.scheduling.concurrent.ThreadPoolTaskExecutor;

import java.util.concurrent.Executor;
import java.util.concurrent.ExecutorService;

@Configuration
public class ImServerAsyncConfig {

    @Value("${im.server.executor.max-concurrency:2000}")
    private int maxConcurrency;

    @Value("${im.server.executor.queue-capacity:2000}")
    private int queueCapacity;

    @Value("${im.server.executor.virtual-preferred:true}")
    private boolean virtualPreferred;

    @Bean(name = "imServerExecutor", destroyMethod = "close")
    @Primary
    public Executor imServerExecutor() {
        if (virtualPreferred) {
            ExecutorService virtual = VirtualThreadExecutors.tryNewVirtualThreadPerTaskExecutor();
            if (virtual != null) {
                Executor bounded = new BoundedExecutor(virtual, Math.max(1, maxConcurrency));
                return new ManagedExecutor(bounded, virtual::shutdown);
            }
        }

        ThreadPoolTaskExecutor executor = new ThreadPoolTaskExecutor();
        executor.setCorePoolSize(Math.max(2, Runtime.getRuntime().availableProcessors()));
        executor.setMaxPoolSize(Math.max(4, Runtime.getRuntime().availableProcessors() * 2));
        executor.setQueueCapacity(Math.max(0, queueCapacity));
        executor.setThreadNamePrefix("im-server-");
        executor.setTaskDecorator(new MdcTaskDecorator());
        executor.initialize();
        return new ManagedExecutor(executor, executor::shutdown);
    }
}
