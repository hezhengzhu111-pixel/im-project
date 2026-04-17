package com.im.config;

import org.junit.jupiter.api.Test;
import org.springframework.core.io.ClassPathResource;

import java.nio.charset.StandardCharsets;

import static org.junit.jupiter.api.Assertions.assertTrue;

class UserServiceLogbackConfigTest {

    @Test
    void logPatternShouldIncludeThrowableOutput() throws Exception {
        ClassPathResource resource = new ClassPathResource("logback-spring.xml");
        String xml = new String(resource.getInputStream().readAllBytes(), StandardCharsets.UTF_8);

        assertTrue(xml.contains("%ex{full}"), "logback pattern should include throwable output");
    }
}
