package com.im.gateway.filter;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.im.config.GlobalRateLimitSwitch;
import com.im.gateway.ratelimit.GatewayRateLimitPolicyRepository;
import com.im.gateway.ratelimit.GatewayRateLimitProperties;
import com.im.gateway.ratelimit.GatewayRedisRateLimitService;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.cloud.gateway.filter.GatewayFilterChain;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.mock.http.server.reactive.MockServerHttpRequest;
import org.springframework.mock.web.server.MockServerWebExchange;
import reactor.core.publisher.Mono;

import java.nio.charset.StandardCharsets;
import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class GatewayRateLimitFilterTest {

    @Mock
    private GlobalRateLimitSwitch globalRateLimitSwitch;
    @Mock
    private GatewayRateLimitPolicyRepository policyRepository;
    @Mock
    private GatewayRedisRateLimitService rateLimitService;
    @Mock
    private GatewayFilterChain chain;

    @Test
    void shouldReturn429WhenGatewayRateLimitRejects() {
        GatewayRateLimitProperties properties = new GatewayRateLimitProperties();
        GatewayRateLimitFilter filter = new GatewayRateLimitFilter(
                new ObjectMapper(),
                globalRateLimitSwitch,
                policyRepository,
                rateLimitService
        );
        MockServerWebExchange exchange = MockServerWebExchange.from(
                MockServerHttpRequest.get("/api/message/conversations").build()
        );
        when(globalRateLimitSwitch.isEnabled()).thenReturn(true);
        when(policyRepository.currentPolicy()).thenReturn(properties);
        when(rateLimitService.evaluate(any(), any())).thenReturn(Mono.just(
                new GatewayRedisRateLimitService.GatewayRateLimitEvaluation(
                        true,
                        false,
                        "message-send-user",
                        "QPS",
                        List.of()
                )
        ));

        filter.filter(exchange, chain).block();

        assertEquals(HttpStatus.TOO_MANY_REQUESTS, exchange.getResponse().getStatusCode());
        assertEquals(MediaType.APPLICATION_JSON, exchange.getResponse().getHeaders().getContentType());
        assertEquals("message-send-user", exchange.getResponse().getHeaders().getFirst("X-Rate-Limit-Rule"));
        String body = exchange.getResponse().getBodyAsString().block();
        assertTrue(body != null && body.contains("\"code\":42901"));
        verify(chain, never()).filter(any());
    }

    @Test
    void shouldPassThroughWhenDecisionIsShadowOnly() {
        GatewayRateLimitProperties properties = new GatewayRateLimitProperties();
        GatewayRateLimitFilter filter = new GatewayRateLimitFilter(
                new ObjectMapper(),
                globalRateLimitSwitch,
                policyRepository,
                rateLimitService
        );
        MockServerWebExchange exchange = MockServerWebExchange.from(
                MockServerHttpRequest.post("/api/user/login").build()
        );
        when(globalRateLimitSwitch.isEnabled()).thenReturn(true);
        when(policyRepository.currentPolicy()).thenReturn(properties);
        when(rateLimitService.evaluate(any(), any())).thenReturn(Mono.just(
                new GatewayRedisRateLimitService.GatewayRateLimitEvaluation(
                        true,
                        true,
                        "user-login-ip",
                        "QPS",
                        List.of()
                )
        ));
        when(chain.filter(any())).thenReturn(Mono.empty());

        filter.filter(exchange, chain).block();

        verify(chain).filter(any());
    }
}
