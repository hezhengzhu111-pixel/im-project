package com.im.config;

import org.junit.jupiter.api.Test;

import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;

import static org.junit.jupiter.api.Assertions.assertTrue;

class BackendServiceLogbackConfigTest {

    @Test
    void allBackendServiceLogbackPatternsShouldIncludeThrowableOutput() throws Exception {
        Path backendDir = Path.of("").toAbsolutePath().normalize().getParent();
        List<String> modules = List.of(
                "auth-service",
                "common",
                "file-service",
                "gateway",
                "group-service",
                "im-server",
                "log-service",
                "message-service",
                "registry-monitor",
                "user-service"
        );

        for (String module : modules) {
            Path logbackPath = backendDir.resolve(module).resolve("src/main/resources/logback-spring.xml");
            String xml = Files.readString(logbackPath, StandardCharsets.UTF_8);
            assertTrue(
                    xml.contains("%ex{full}"),
                    () -> "logback pattern should include throwable output: " + logbackPath
            );
        }
    }
}
