package com.im.gateway;

import org.springframework.cloud.gateway.filter.GatewayFilterChain;
import org.springframework.cloud.gateway.filter.GlobalFilter;
import org.springframework.core.annotation.Order;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Component;
import org.springframework.web.server.ServerWebExchange;
import reactor.core.publisher.Mono;

import java.util.List;

/**
 * 白名单路径内置认证过滤器
 * 为白名单路径添加内部认证 Header，允许后端 JwtAuthInterceptor 通过
 */
@Component
@Order(1)
public class WhiteListAuthFilter implements GlobalFilter {

    private static final String INTERNAL_HEADER = "X-Internal-Secret";
    private static final String INTERNAL_SECRET = "im-internal-secret";

    // 白名单路径（无需 Gateway 认证，由后端服务处理）
    private static final List<String> WHITE_LIST_PATTERNS = List.of(
            "/api/user/login",
            "/api/user/register",
            "/api/user/check-username",
            "/api/auth/refresh",
            "/api/auth/parse",
            "/api/im"
    );

    @Override
    public Mono<Void> filter(ServerWebExchange exchange, GatewayFilterChain chain) {
        String path = exchange.getRequest().getPath().value();

        // 检查是否在白名单中
        if (isWhiteListed(path)) {
            // 添加内部认证 Header
            exchange = exchange.mutate()
                    .request(builder -> builder
                            .header(INTERNAL_HEADER, INTERNAL_SECRET))
                    .build();
        }

        return chain.filter(exchange);
    }

    private boolean isWhiteListed(String path) {
        return WHITE_LIST_PATTERNS.stream().anyMatch(path::startsWith);
    }
}
