package com.im.security;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

class SecurityPathsTest {

    @Test
    void gatewayWhiteList_shouldMatchExpectedPaths() {
        assertTrue(SecurityPaths.isGatewayWhiteList("/api/user/login"));
        assertTrue(SecurityPaths.isGatewayWhiteList("/v3/api-docs/index"));
        assertTrue(SecurityPaths.isGatewayWhiteList("/websocket/connect"));
        assertFalse(SecurityPaths.isGatewayWhiteList("/api/message/send/private"));
    }

    @Test
    void serviceWhiteList_shouldMatchExpectedPaths() {
        assertTrue(SecurityPaths.isServiceWhiteList("/actuator/health"));
        assertTrue(SecurityPaths.isServiceWhiteList("/api/auth/parse"));
        assertTrue(SecurityPaths.isServiceWhiteList("/auth/refresh"));
        assertTrue(SecurityPaths.isServiceWhiteList("/api/user/register"));
        assertTrue(SecurityPaths.isServiceWhiteList("/health"));
        assertTrue(SecurityPaths.isServiceWhiteList("/images/logo.png"));
        assertFalse(SecurityPaths.isServiceWhiteList("/api/message/get/private"));
    }

    @Test
    void serviceWhiteList_shouldNotMatchInternalOnlyPaths() {
        assertFalse(SecurityPaths.isServiceWhiteList("/api/user/internal/profile"));
        assertFalse(SecurityPaths.isServiceWhiteList("/api/group/internal/members"));
    }

    @Test
    void internalPath_shouldMatchExpectedPaths() {
        assertTrue(SecurityPaths.isGatewayInternalPath("/api/user/internal/profile"));
        assertTrue(SecurityPaths.isGatewayInternalPath("/api/group/internal/members"));
        assertFalse(SecurityPaths.isGatewayInternalPath("/api/user/login"));
    }

    @Test
    void internalSecretPath_shouldMatchExpectedPaths() {
        assertTrue(SecurityPaths.isInternalSecretPath("/api/im/online-status"));
        assertTrue(SecurityPaths.isInternalSecretPath("/internal/message/system/private"));
        assertFalse(SecurityPaths.isInternalSecretPath("/api/user/login"));
    }
}
