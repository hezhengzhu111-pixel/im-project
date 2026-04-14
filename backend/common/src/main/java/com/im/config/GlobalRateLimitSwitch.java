package com.im.config;

import lombok.extern.slf4j.Slf4j;
import org.springframework.cloud.context.environment.EnvironmentChangeEvent;
import org.springframework.context.event.EventListener;
import org.springframework.core.env.Environment;
import org.springframework.stereotype.Component;

import jakarta.annotation.PostConstruct;
import java.util.Set;
import java.util.concurrent.atomic.AtomicBoolean;

@Component
@Slf4j
public class GlobalRateLimitSwitch {

    private final Environment environment;
    private final RateLimitGlobalProperties properties;
    private final AtomicBoolean enabled = new AtomicBoolean(true);

    public GlobalRateLimitSwitch(Environment environment, RateLimitGlobalProperties properties) {
        this.environment = environment;
        this.properties = properties;
    }

    @PostConstruct
    public void initialize() {
        refreshFromEnvironment();
    }

    public boolean isEnabled() {
        return enabled.get();
    }

    public void refreshFromEnvironment() {
        boolean latestValue = environment.getProperty(
                RateLimitGlobalProperties.ENABLED_KEY,
                Boolean.class,
                properties.isEnabled()
        );
        boolean previous = enabled.getAndSet(latestValue);
        if (previous != latestValue) {
            log.warn(
                    "rate limit global switch changed: key={}, enabled={}, source=environment-refresh",
                    RateLimitGlobalProperties.ENABLED_KEY,
                    latestValue
            );
            return;
        }
        log.info(
                "rate limit global switch loaded: key={}, enabled={}",
                RateLimitGlobalProperties.ENABLED_KEY,
                latestValue
        );
    }

    @EventListener(EnvironmentChangeEvent.class)
    public void onEnvironmentChange(EnvironmentChangeEvent event) {
        Set<String> keys = event.getKeys();
        if (keys == null || keys.isEmpty()) {
            refreshFromEnvironment();
            return;
        }
        if (keys.contains(RateLimitGlobalProperties.ENABLED_KEY)
                || keys.stream().anyMatch(key -> key != null && key.startsWith(RateLimitGlobalProperties.PREFIX))) {
            refreshFromEnvironment();
        }
    }
}
