package com.im.gateway.auth;

import org.springframework.http.server.reactive.ServerHttpRequest;
import org.springframework.stereotype.Component;
import org.springframework.web.server.ServerWebExchange;

@Component
public class GatewayTokenExtractor {

    public GatewayAuthInput extract(ServerWebExchange exchange,
                                    String jwtHeader,
                                    String jwtPrefix,
                                    String accessTokenCookieName,
                                    String refreshTokenCookieName,
                                    String gatewayRouteHeader) {
        ServerHttpRequest request = exchange.getRequest();
        String path = request.getURI().getPath();
        String authHeader = request.getHeaders().getFirst(jwtHeader);
        String token = extractToken(exchange, authHeader, jwtPrefix, accessTokenCookieName);
        boolean authCookiePresent = hasCookie(exchange, accessTokenCookieName) || hasCookie(exchange, refreshTokenCookieName);
        boolean gatewayRouteHeaderPresent = request.getHeaders().getFirst(gatewayRouteHeader) != null;
        String method = request.getMethod() == null ? "" : request.getMethod().name();
        return new GatewayAuthInput(path, token, authCookiePresent, gatewayRouteHeaderPresent, method);
    }

    private String extractToken(ServerWebExchange exchange,
                                String authHeader,
                                String jwtPrefix,
                                String accessTokenCookieName) {
        String token = extractTokenFromHeader(authHeader, jwtPrefix);
        if (token != null && !token.isBlank()) {
            return token;
        }
        var cookie = exchange.getRequest().getCookies().getFirst(accessTokenCookieName);
        if (cookie == null) {
            return null;
        }
        String value = cookie.getValue();
        return value == null || value.isBlank() ? null : value.trim();
    }

    private String extractTokenFromHeader(String authHeader, String jwtPrefix) {
        if (authHeader == null) {
            return null;
        }
        String normalized = authHeader.trim();
        if (jwtPrefix != null && normalized.startsWith(jwtPrefix)) {
            normalized = normalized.substring(jwtPrefix.length()).trim();
        }
        return normalized.isEmpty() ? null : normalized;
    }

    private boolean hasCookie(ServerWebExchange exchange, String name) {
        return name != null && exchange.getRequest().getCookies().getFirst(name) != null;
    }
}
