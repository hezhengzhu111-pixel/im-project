package com.im.config;

import lombok.RequiredArgsConstructor;
import org.apache.commons.lang3.StringUtils;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.cloud.client.serviceregistry.Registration;
import org.springframework.core.env.Environment;
import org.springframework.stereotype.Component;

import java.net.InetAddress;

@Component
@RequiredArgsConstructor
public class ImNodeIdentity {

    private final Environment environment;
    private final ObjectProvider<Registration> registrationProvider;

    @Value("${im.instance-id:}")
    private String configuredInstanceId;

    private volatile String cachedInstanceId;

    public String getInstanceId() {
        String current = cachedInstanceId;
        if (StringUtils.isNotBlank(current)) {
            return current;
        }
        synchronized (this) {
            if (StringUtils.isBlank(cachedInstanceId)) {
                cachedInstanceId = resolveInstanceId();
            }
            return cachedInstanceId;
        }
    }

    private String resolveInstanceId() {
        if (StringUtils.isNotBlank(configuredInstanceId)) {
            return configuredInstanceId.trim();
        }

        Registration registration = registrationProvider.getIfAvailable();
        if (registration != null && StringUtils.isNotBlank(registration.getInstanceId())) {
            return registration.getInstanceId().trim();
        }

        String host = environment.getProperty("spring.cloud.client.ip-address");
        if (StringUtils.isBlank(host)) {
            host = environment.getProperty("HOSTNAME");
        }
        if (StringUtils.isBlank(host)) {
            try {
                host = InetAddress.getLocalHost().getHostAddress();
            } catch (Exception ignored) {
                host = "127.0.0.1";
            }
        }

        String port = environment.getProperty("local.server.port",
                environment.getProperty("server.port", "0"));
        return host + ":" + port;
    }
}
