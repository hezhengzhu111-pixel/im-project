package com.im.gateway.ratelimit;

import lombok.extern.slf4j.Slf4j;
import org.springframework.boot.context.properties.bind.Bindable;
import org.springframework.boot.context.properties.bind.Binder;
import org.springframework.cloud.context.environment.EnvironmentChangeEvent;
import org.springframework.context.event.EventListener;
import org.springframework.core.env.Environment;
import org.springframework.stereotype.Component;

import jakarta.annotation.PostConstruct;
import java.util.Comparator;
import java.util.Map;
import java.util.concurrent.atomic.AtomicReference;

@Component
@Slf4j
public class GatewayRateLimitPolicyRepository {

    private final Environment environment;
    private final AtomicReference<GatewayRateLimitProperties> current =
            new AtomicReference<>(new GatewayRateLimitProperties());

    public GatewayRateLimitPolicyRepository(Environment environment) {
        this.environment = environment;
    }

    @PostConstruct
    public void initialize() {
        refreshFromEnvironment();
    }

    public GatewayRateLimitProperties currentPolicy() {
        return current.get();
    }

    @EventListener(EnvironmentChangeEvent.class)
    public void onEnvironmentChange(EnvironmentChangeEvent event) {
        if (event.getKeys() == null || event.getKeys().isEmpty()) {
            refreshFromEnvironment();
            return;
        }
        boolean related = event.getKeys().stream()
                .anyMatch(key -> key != null && key.startsWith(GatewayRateLimitProperties.PREFIX));
        if (related) {
            refreshFromEnvironment();
        }
    }

    public void refreshFromEnvironment() {
        GatewayRateLimitProperties properties = Binder.get(environment)
                .bind(GatewayRateLimitProperties.PREFIX, Bindable.of(GatewayRateLimitProperties.class))
                .orElseGet(GatewayRateLimitProperties::new);
        sortRules(properties);
        current.set(properties);
        log.info(
                "gateway rate-limit policy loaded: enabled={}, mode={}, activeVersion={}, previousVersion={}, versionCount={}",
                properties.isEnabled(),
                properties.getMode(),
                properties.getActiveVersion(),
                properties.getPreviousVersion(),
                properties.getVersions().size()
        );
    }

    private void sortRules(GatewayRateLimitProperties properties) {
        for (Map.Entry<String, GatewayRateLimitProperties.RuleSet> entry : properties.getVersions().entrySet()) {
            GatewayRateLimitProperties.RuleSet ruleSet = entry.getValue();
            if (ruleSet == null || ruleSet.getRules() == null) {
                continue;
            }
            ruleSet.getRules().sort(Comparator.comparingInt(GatewayRateLimitProperties.Rule::getOrder));
        }
    }
}
