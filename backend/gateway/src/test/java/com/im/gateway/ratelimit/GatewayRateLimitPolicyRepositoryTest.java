package com.im.gateway.ratelimit;

import org.junit.jupiter.api.Test;
import org.springframework.mock.env.MockEnvironment;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

class GatewayRateLimitPolicyRepositoryTest {

    @Test
    void shouldBindAndSortVersionedRules() {
        MockEnvironment environment = new MockEnvironment()
                .withProperty("im.gateway.rate-limit.enabled", "true")
                .withProperty("im.gateway.rate-limit.active-version", "v2")
                .withProperty("im.gateway.rate-limit.versions.v2.enabled", "true")
                .withProperty("im.gateway.rate-limit.versions.v2.rules[0].id", "late-rule")
                .withProperty("im.gateway.rate-limit.versions.v2.rules[0].order", "20")
                .withProperty("im.gateway.rate-limit.versions.v2.rules[1].id", "early-rule")
                .withProperty("im.gateway.rate-limit.versions.v2.rules[1].order", "10");

        GatewayRateLimitPolicyRepository repository = new GatewayRateLimitPolicyRepository(environment);
        repository.refreshFromEnvironment();

        GatewayRateLimitProperties properties = repository.currentPolicy();
        assertTrue(properties.isEnabled());
        assertEquals("v2", properties.getActiveVersion());
        assertEquals("early-rule", properties.getVersions().get("v2").getRules().get(0).getId());
        assertEquals("late-rule", properties.getVersions().get("v2").getRules().get(1).getId());
    }
}
