package com.im.gateway.filter;

import com.im.security.SecurityPaths;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.cloud.gateway.filter.GatewayFilterChain;
import org.springframework.cloud.gateway.filter.GlobalFilter;
import org.springframework.core.Ordered;
import org.springframework.http.HttpStatus;
import org.springframework.http.server.reactive.ServerHttpRequest;
import org.springframework.stereotype.Component;
import org.springframework.web.server.ServerWebExchange;
import reactor.core.publisher.Mono;

import java.util.UUID;

@Component
public class TraceIdRouteHeaderFilter implements GlobalFilter, Ordered {

    private static final Logger log = LoggerFactory.getLogger(TraceIdRouteHeaderFilter.class);

    private static final String TRACE_ID_HEADER = "X-Trace-Id";
    private static final String ROUTE_HEADER = "X-Gateway-Route";

    @Override
    public Mono<Void> filter(ServerWebExchange exchange, GatewayFilterChain chain) {
        String path = exchange.getRequest().getURI().getPath();

        String traceId = exchange.getRequest().getHeaders().getFirst(TRACE_ID_HEADER);
        if (traceId == null || traceId.isBlank()) {
            traceId = UUID.randomUUID().toString();
        }
        String finalTraceId = traceId;

        if (shouldEnforceRouteHeader(path)) {
            String route = exchange.getRequest().getHeaders().getFirst(ROUTE_HEADER);
            if (route == null || route.isBlank() || !"true".equalsIgnoreCase(route.trim())) {
                exchange.getResponse().setStatusCode(HttpStatus.BAD_REQUEST);
                exchange.getResponse().getHeaders().set(TRACE_ID_HEADER, finalTraceId);
                return exchange.getResponse().setComplete();
            }
        }

        ServerHttpRequest mutatedRequest = exchange.getRequest().mutate()
                .headers(headers -> headers.set(TRACE_ID_HEADER, finalTraceId))
                .build();

        ServerWebExchange mutatedExchange = exchange.mutate().request(mutatedRequest).build();
        mutatedExchange.getResponse().beforeCommit(() -> {
            mutatedExchange.getResponse().getHeaders().set(TRACE_ID_HEADER, finalTraceId);
            return Mono.empty();
        });

        return chain.filter(mutatedExchange)
                .doFinally(signalType -> log.info("traceId={} method={} path={}", finalTraceId,
                        exchange.getRequest().getMethod(), path));
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
