package com.im.gateway.filter;

import cn.hutool.core.lang.Snowflake;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.cloud.gateway.filter.GatewayFilterChain;
import org.springframework.mock.http.server.reactive.MockServerHttpRequest;
import org.springframework.mock.web.server.MockServerWebExchange;
import org.springframework.web.server.ServerWebExchange;
import reactor.core.publisher.Mono;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class TraceIdFilterTest {

    @Mock
    private Snowflake snowflake;
    @Mock
    private GatewayFilterChain chain;

    @Test
    void shouldGenerateTraceIdWhenHeaderMissing() {
        TraceIdFilter filter = new TraceIdFilter(snowflake);
        MockServerWebExchange exchange = MockServerWebExchange.from(
                MockServerHttpRequest.get("/api/user/profile").build()
        );
        when(snowflake.nextId()).thenReturn(123456789L);
        when(chain.filter(any(ServerWebExchange.class))).thenReturn(Mono.empty());

        filter.filter(exchange, chain).block();

        verify(chain).filter(any(ServerWebExchange.class));
        assertEquals("123456789", exchange.getResponse().getHeaders().getFirst(TraceIdFilter.TRACE_ID_HEADER));
    }

    @Test
    void shouldKeepIncomingTraceId() {
        TraceIdFilter filter = new TraceIdFilter(snowflake);
        MockServerWebExchange exchange = MockServerWebExchange.from(
                MockServerHttpRequest.get("/api/user/profile")
                        .header(TraceIdFilter.TRACE_ID_HEADER, "abc123")
                        .build()
        );
        when(chain.filter(any(ServerWebExchange.class))).thenReturn(Mono.empty());

        filter.filter(exchange, chain).block();

        verify(chain).filter(any(ServerWebExchange.class));
        assertEquals("abc123", exchange.getResponse().getHeaders().getFirst(TraceIdFilter.TRACE_ID_HEADER));
    }
}
