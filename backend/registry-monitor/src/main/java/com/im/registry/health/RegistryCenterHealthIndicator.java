package com.im.registry.health;

import com.im.registry.service.RegistryPoller;
import com.im.registry.service.RegistryState;
import lombok.RequiredArgsConstructor;
import org.springframework.boot.actuate.health.Health;
import org.springframework.boot.actuate.health.HealthIndicator;
import org.springframework.stereotype.Component;

import java.time.Instant;

@Component
@RequiredArgsConstructor
public class RegistryCenterHealthIndicator implements HealthIndicator {

    private final RegistryPoller registryPoller;

    @Override
    public Health health() {
        RegistryState state = registryPoller.getState();
        Instant okAt = state.getLastSuccessfulPollAt().get();
        Instant failAt = state.getLastFailedPollAt().get();
        String lastError = state.getLastError().get();

        if (okAt == null) {
            return Health.unknown()
                    .withDetail("lastSuccessfulPollAt", null)
                    .withDetail("lastFailedPollAt", failAt)
                    .withDetail("lastError", lastError)
                    .build();
        }

        Health.Builder builder = Health.up()
                .withDetail("lastSuccessfulPollAt", okAt)
                .withDetail("lastFailedPollAt", failAt)
                .withDetail("lastError", lastError);

        if (failAt != null && okAt.isBefore(failAt)) {
            builder = Health.down()
                    .withDetail("lastSuccessfulPollAt", okAt)
                    .withDetail("lastFailedPollAt", failAt)
                    .withDetail("lastError", lastError);
        }

        return builder.build();
    }
}
