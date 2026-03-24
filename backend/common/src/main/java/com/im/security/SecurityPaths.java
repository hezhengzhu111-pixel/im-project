package com.im.security;

import java.util.List;

public final class SecurityPaths {

    private SecurityPaths() {
    }

    private static final List<String> GATEWAY_WHITELIST_PREFIXES = List.of(
            "/actuator",
            "/v3/api-docs",
            "/swagger-ui",
            "/swagger-ui.html",
            "/api/user/login",
            "/api/user/register",
            "/api/user/check-username",
            "/api/auth/refresh",
            "/api/auth/parse",
            "/auth/refresh",
            "/auth/parse",
            "/websocket"
    );

    private static final List<String> SERVICE_WHITELIST_PREFIXES = List.of(
            "/actuator",
            "/api/actuator",
            "/v3/api-docs",
            "/swagger-ui",
            "/swagger-ui.html",
            "/api/user/register",
            "/api/user/login",
            "/user/register",
            "/user/login",
            "/api/user/check-username",
            "/user/check-username",
            "/api/user/internal",
            "/api/group/internal",
            "/static",
            "/css",
            "/js",
            "/images"
    );

    private static final List<String> INTERNAL_SECRET_ONLY_PREFIXES = List.of(
            "/api/user/internal",
            "/api/group/internal",
            "/api/auth/internal",
            "/internal/message",
            "/api/im"
    );

    public static boolean isGatewayWhiteList(String path) {
        if (path == null) {
            return true;
        }
        return hasAnyPrefix(path, GATEWAY_WHITELIST_PREFIXES);
    }

    public static boolean isGatewayInternalPath(String path) {
        if (path == null) {
            return false;
        }
        return path.startsWith("/api/user/internal")
                || path.startsWith("/api/group/internal")
                || path.startsWith("/api/auth/internal");
    }

    public static boolean isServiceWhiteList(String requestURI) {
        if (requestURI == null) {
            return true;
        }
        if (requestURI.equals("/health") || requestURI.equals("/ready")) {
            return true;
        }
        return hasAnyPrefix(requestURI, SERVICE_WHITELIST_PREFIXES);
    }

    public static boolean isInternalSecretPath(String path) {
        if (path == null) {
            return false;
        }
        return hasAnyPrefix(path, INTERNAL_SECRET_ONLY_PREFIXES);
    }

    private static boolean hasAnyPrefix(String path, List<String> prefixes) {
        for (String prefix : prefixes) {
            if (path.startsWith(prefix)) {
                return true;
            }
        }
        return false;
    }
}

