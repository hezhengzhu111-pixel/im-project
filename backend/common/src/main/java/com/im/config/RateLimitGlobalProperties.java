package com.im.config;

import org.springframework.boot.context.properties.ConfigurationProperties;

@ConfigurationProperties(prefix = RateLimitGlobalProperties.PREFIX)
public class RateLimitGlobalProperties {

    public static final String PREFIX = "rate.limit.global";
    public static final String ENABLED_KEY = PREFIX + ".enabled";
    public static final String SWITCH_HEADER = "X-Rate-Limit-Global-Enabled";

    /**
     * 全局限流总开关，默认开启。
     */
    private boolean enabled = true;

    public boolean isEnabled() {
        return enabled;
    }

    public void setEnabled(boolean enabled) {
        this.enabled = enabled;
    }
}
