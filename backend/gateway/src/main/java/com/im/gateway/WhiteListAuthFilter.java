package com.im.gateway;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.cloud.gateway.filter.GatewayFilterChain;
import org.springframework.cloud.gateway.filter.GlobalFilter;
import org.springframework.core.annotation.Order;
import org.springframework.stereotype.Component;
import org.springframework.web.server.ServerWebExchange;
import reactor.core.publisher.Mono;

import java.util.List;

@Component
@Order(1)
public class WhiteListAuthFilter implements GlobalFilter {

    private static final List<String> WHITE_LIST_PATTERNS = List.of(
            "/api/user/login",
            "/api/user/register",
            "/api/user/check-username",
            "/api/auth/refresh",
            "/api/auth/parse"
    );

    @Value("${im.internal.header:X-Internal-Secret}")
    private String internalHeaderName;

    @Value("${im.internal.secret}")
    private String internalSecret;

    @Override
    public Mono<Void> filter(ServerWebExchange exchange, GatewayFilterChain chain) {
        String path = exchange.getRequest().getPath().value();
        if (!isWhiteListed(path)) {
            return chain.filter(exchange);
        }

        ServerWebExchange mutatedExchange = exchange.mutate()
                .request(builder -> builder.header(internalHeaderName, internalSecret))
                .build();
        return chain.filter(mutatedExchange);
    }

    private boolean isWhiteListed(String path) {
        return WHITE_LIST_PATTERNS.stream().anyMatch(path::startsWith);
    }
}
