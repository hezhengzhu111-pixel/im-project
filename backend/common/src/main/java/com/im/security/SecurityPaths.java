package com.im.security;

public final class SecurityPaths {

    private SecurityPaths() {
    }

    public static boolean isGatewayWhiteList(String path) {
        if (path == null) {
            return true;
        }
        if (path.startsWith("/actuator")) {
            return true;
        }
        if (path.startsWith("/v3/api-docs") || path.startsWith("/swagger-ui") || path.startsWith("/swagger-ui.html")) {
            return true;
        }
        if (path.startsWith("/api/user/login") || path.startsWith("/api/user/register") || path.startsWith("/api/user/check-username")) {
            return true;
        }
        if (path.startsWith("/api/auth/refresh") || path.startsWith("/api/auth/parse")
                || path.startsWith("/auth/refresh") || path.startsWith("/auth/parse")) {
            return true;
        }
        return path.startsWith("/websocket");
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
        if (requestURI.startsWith("/actuator") || requestURI.startsWith("/api/actuator")) {
            return true;
        }
        if (requestURI.startsWith("/v3/api-docs") || requestURI.startsWith("/swagger-ui") || requestURI.startsWith("/swagger-ui.html")) {
            return true;
        }
        if (requestURI.equals("/health") || requestURI.equals("/ready")) {
            return true;
        }
        if (requestURI.startsWith("/api/user/register") || requestURI.startsWith("/api/user/login")
                || requestURI.startsWith("/user/register") || requestURI.startsWith("/user/login")
                || requestURI.startsWith("/api/user/check-username") || requestURI.startsWith("/user/check-username")) {
            return true;
        }
        if (requestURI.startsWith("/api/user/internal") || requestURI.startsWith("/api/group/internal")) {
            return true;
        }
        return requestURI.startsWith("/static")
                || requestURI.startsWith("/css")
                || requestURI.startsWith("/js")
                || requestURI.startsWith("/images");
    }
}

