package com.im.config;

import org.junit.jupiter.api.Test;
import org.springframework.mock.env.MockEnvironment;

import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

class GlobalRateLimitSwitchTest {

    @Test
    void shouldDefaultToEnabledWhenPropertyMissing() {
        MockEnvironment environment = new MockEnvironment();
        RateLimitGlobalProperties properties = new RateLimitGlobalProperties();

        GlobalRateLimitSwitch globalSwitch = new GlobalRateLimitSwitch(environment, properties);
        globalSwitch.refreshFromEnvironment();

        assertTrue(globalSwitch.isEnabled());
    }

    @Test
    void shouldApplyHotUpdatedEnvironmentValueImmediately() {
        MockEnvironment environment = new MockEnvironment();
        RateLimitGlobalProperties properties = new RateLimitGlobalProperties();
        GlobalRateLimitSwitch globalSwitch = new GlobalRateLimitSwitch(environment, properties);

        globalSwitch.refreshFromEnvironment();
        assertTrue(globalSwitch.isEnabled());

        environment.setProperty(RateLimitGlobalProperties.ENABLED_KEY, "false");
        globalSwitch.refreshFromEnvironment();
        assertFalse(globalSwitch.isEnabled());

        environment.setProperty(RateLimitGlobalProperties.ENABLED_KEY, "true");
        globalSwitch.refreshFromEnvironment();
        assertTrue(globalSwitch.isEnabled());
    }
}
