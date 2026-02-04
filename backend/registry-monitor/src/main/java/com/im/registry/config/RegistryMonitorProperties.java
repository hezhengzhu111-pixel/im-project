package com.im.registry.config;

import lombok.Data;
import org.springframework.boot.context.properties.ConfigurationProperties;

@Data
@ConfigurationProperties(prefix = "im.registry-monitor")
public class RegistryMonitorProperties {

    private Nacos nacos = new Nacos();
    private Poll poll = new Poll();
    private Alert alert = new Alert();

    @Data
    public static class Nacos {
        private String baseUrl = "http://127.0.0.1:8850/nacos";
    }

    @Data
    public static class Poll {
        private long intervalMs = 5000;
    }

    @Data
    public static class Alert {
        private double fluctuationThreshold = 0.2;
    }
}
