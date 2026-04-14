package com.im.gateway.filter;

import cn.hutool.core.lang.Snowflake;
import org.slf4j.MDC;
import org.springframework.cloud.gateway.filter.GatewayFilterChain;
import org.springframework.cloud.gateway.filter.GlobalFilter;
import org.springframework.core.Ordered;
import org.springframework.http.server.reactive.ServerHttpRequest;
import org.springframework.stereotype.Component;
import org.springframework.util.StringUtils;
import org.springframework.web.server.ServerWebExchange;
import reactor.core.publisher.Mono;

@Component
public class TraceIdFilter implements GlobalFilter, Ordered {

    public static final String TRACE_ID_HEADER = "X-Log-Id";
    public static final String TRACE_ID_MDC_KEY = "traceId";

    private final Snowflake snowflake;

    public TraceIdFilter(Snowflake snowflake) {
        this.snowflake = snowflake;
    }

    @Override
    public Mono<Void> filter(ServerWebExchange exchange, GatewayFilterChain chain) {
        String traceId = exchange.getRequest().getHeaders().getFirst(TRACE_ID_HEADER);
        if (!StringUtils.hasText(traceId)) {
            traceId = String.valueOf(snowflake.nextId());
        }
        String finalTraceId = traceId;

        ServerHttpRequest mutatedRequest = exchange.getRequest().mutate()
                .headers(headers -> headers.set(TRACE_ID_HEADER, finalTraceId))
                .build();

        ServerWebExchange mutatedExchange = exchange.mutate().request(mutatedRequest).build();
        mutatedExchange.getResponse().getHeaders().set(TRACE_ID_HEADER, finalTraceId);
        mutatedExchange.getResponse().beforeCommit(() -> {
            mutatedExchange.getResponse().getHeaders().set(TRACE_ID_HEADER, finalTraceId);
            return Mono.empty();
        });

        return Mono.defer(() -> {
                    MDC.put(TRACE_ID_MDC_KEY, finalTraceId);
                    return chain.filter(mutatedExchange);
                })
                .doFinally(signalType -> MDC.remove(TRACE_ID_MDC_KEY));
    }

    @Override
    public int getOrder() {
        return -300;
    }
}
