package com.im.gateway;

import org.junit.jupiter.api.Test;
import org.springframework.core.io.ClassPathResource;

import java.nio.charset.StandardCharsets;

import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

class GatewayConfigurationSanityTest {

    @Test
    void gatewayProfilesShouldOnlyImportGatewayRuntimeDependencies() throws Exception {
        assertProfileIsSlim("dev");
        assertProfileIsSlim("sit");
    }

    private void assertProfileIsSlim(String profile) throws Exception {
        String application = read(profile + "/application.yml");

        assertFalse(application.contains("application-mysql.yml"));
        assertFalse(application.contains("application-kafka.yml"));
        assertFalse(application.contains("JWT_SECRET"));
        assertFalse(application.contains("token-cache-ttl-seconds"));
        assertFalse(application.contains("token-negative-cache-ttl-seconds"));
        assertFalse(application.contains("user-resource-cache-ttl-seconds"));
        assertFalse(application.contains("IM_ROUTE_"));
        assertFalse(application.contains("routing:"));
        assertTrue(application.contains("application-redis.yml"));
        assertTrue(application.contains("application-nacos.yml"));
        assertTrue(application.contains("ws-auth-cache:"));
    }

    private String read(String path) throws Exception {
        ClassPathResource resource = new ClassPathResource(path);
        assertTrue(resource.exists(), path + " should exist");
        return resource.getContentAsString(StandardCharsets.UTF_8);
    }
}
