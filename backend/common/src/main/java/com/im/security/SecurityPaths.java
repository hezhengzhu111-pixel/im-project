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
        if (path.startsWith("/api/v1/user/login") || path.startsWith("/api/v1/user/register") || path.startsWith("/api/v1/user/check-username")) {
            return true;
        }
        if (path.startsWith("/api/v1/auth/refresh") || path.startsWith("/api/v1/auth/parse")) {
            return true;
        }
        return path.startsWith("/api/v1/im");
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
        if (requestURI.startsWith("/api/v1/user/register") || requestURI.startsWith("/api/v1/user/login")) {
            return true;
        }
        if (requestURI.startsWith("/api/v1/user/internal") || requestURI.startsWith("/api/v1/group/internal")) {
            return true;
        }
        if (requestURI.startsWith("/api/v1/im")) {
            return true;
        }
        return requestURI.startsWith("/static")
                || requestURI.startsWith("/css")
                || requestURI.startsWith("/js")
                || requestURI.startsWith("/images");
    }
}

