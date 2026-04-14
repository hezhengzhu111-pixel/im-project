package com.im.gateway.filter;

import com.im.security.SecurityPaths;
import org.springframework.cloud.gateway.filter.GatewayFilterChain;
import org.springframework.cloud.gateway.filter.GlobalFilter;
import org.springframework.core.Ordered;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Component;
import org.springframework.web.server.ServerWebExchange;
import reactor.core.publisher.Mono;

@Component
public class TraceIdRouteHeaderFilter implements GlobalFilter, Ordered {
    private static final String ROUTE_HEADER = "X-Gateway-Route";

    @Override
    public Mono<Void> filter(ServerWebExchange exchange, GatewayFilterChain chain) {
        String path = exchange.getRequest().getURI().getPath();

        if (shouldEnforceRouteHeader(path)) {
            String route = exchange.getRequest().getHeaders().getFirst(ROUTE_HEADER);
            if (route == null || route.isBlank() || !"true".equalsIgnoreCase(route.trim())) {
                exchange.getResponse().setStatusCode(HttpStatus.BAD_REQUEST);
                return exchange.getResponse().setComplete();
            }
        }
        return chain.filter(exchange);
    }

    private boolean shouldEnforceRouteHeader(String path) {
        if (path == null) {
            return false;
        }
        // Public/whitelist routes (login/register/refresh/etc.) should not require gateway route header.
        if (SecurityPaths.isGatewayWhiteList(path)) {
            return false;
        }
        if (path.startsWith("/actuator")) {
            return false;
        }
        if (path.startsWith("/v3/api-docs") || path.startsWith("/swagger-ui") || path.startsWith("/swagger-ui.html")) {
            return false;
        }
        if (path.startsWith("/websocket")) {
            return false;
        }
        return true;
    }

    @Override
    public int getOrder() {
        return -200;
    }
}
