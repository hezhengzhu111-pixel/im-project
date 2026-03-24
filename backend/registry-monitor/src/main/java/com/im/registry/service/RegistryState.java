package com.im.registry.service;

import com.im.registry.model.RegistryAlert;
import lombok.Getter;

import java.time.Instant;
import java.util.ArrayList;
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.atomic.AtomicReference;

@Getter
public class RegistryState {

    private final Map<String, Set<String>> instancesByService = new ConcurrentHashMap<>();
    private final Map<String, Integer> countsByService = new ConcurrentHashMap<>();
    private final AtomicReference<Instant> lastSuccessfulPollAt = new AtomicReference<>(null);
    private final AtomicReference<Instant> lastFailedPollAt = new AtomicReference<>(null);
    private final AtomicReference<String> lastError = new AtomicReference<>(null);

    private final Object alertLock = new Object();
    private final List<RegistryAlert> alerts = new ArrayList<>();
    private final int maxAlerts = 200;

    public void markPollSuccess() {
        lastSuccessfulPollAt.set(Instant.now());
        lastError.set(null);
    }

    public void markPollFailure(Exception e) {
        lastFailedPollAt.set(Instant.now());
        lastError.set(e == null ? null : e.getMessage());
    }

    public void addAlert(RegistryAlert alert) {
        if (alert == null) {
            return;
        }
        synchronized (alertLock) {
            alerts.add(0, alert);
            if (alerts.size() > maxAlerts) {
                alerts.subList(maxAlerts, alerts.size()).clear();
            }
        }
    }

    public List<RegistryAlert> getAlertsSnapshot() {
        synchronized (alertLock) {
            return Collections.unmodifiableList(new ArrayList<>(alerts));
        }
    }

    public Map<String, Integer> getCountsSnapshot() {
        return Collections.unmodifiableMap(new LinkedHashMap<>(countsByService));
    }
}

