package com.im.gateway.filter;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.im.config.GlobalRateLimitSwitch;
import com.im.dto.ApiResponse;
import com.im.gateway.ratelimit.GatewayRateLimitPolicyRepository;
import com.im.gateway.ratelimit.GatewayRateLimitProperties;
import com.im.gateway.ratelimit.GatewayRedisRateLimitService;
import org.springframework.cloud.gateway.filter.GatewayFilterChain;
import org.springframework.cloud.gateway.filter.GlobalFilter;
import org.springframework.core.Ordered;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.server.reactive.ServerHttpResponse;
import org.springframework.stereotype.Component;
import org.springframework.web.server.ServerWebExchange;
import reactor.core.publisher.Mono;

import java.nio.charset.StandardCharsets;

@Component
public class GatewayRateLimitFilter implements GlobalFilter, Ordered {

    private final ObjectMapper objectMapper;
    private final GlobalRateLimitSwitch globalRateLimitSwitch;
    private final GatewayRateLimitPolicyRepository policyRepository;
    private final GatewayRedisRateLimitService rateLimitService;

    public GatewayRateLimitFilter(
            ObjectMapper objectMapper,
            GlobalRateLimitSwitch globalRateLimitSwitch,
            GatewayRateLimitPolicyRepository policyRepository,
            GatewayRedisRateLimitService rateLimitService
    ) {
        this.objectMapper = objectMapper;
        this.globalRateLimitSwitch = globalRateLimitSwitch;
        this.policyRepository = policyRepository;
        this.rateLimitService = rateLimitService;
    }

    @Override
    public Mono<Void> filter(ServerWebExchange exchange, GatewayFilterChain chain) {
        if (!globalRateLimitSwitch.isEnabled()) {
            return chain.filter(exchange);
        }
        GatewayRateLimitProperties properties = policyRepository.currentPolicy();
        return rateLimitService.evaluate(exchange, properties)
                .flatMap(evaluation -> {
                    if (evaluation.rejected() && !evaluation.shadowOnly()) {
                        return evaluation.releaseAll().then(writeTooManyRequests(exchange, properties, evaluation));
                    }
                    return Mono.usingWhen(
                            Mono.just(evaluation),
                            ignored -> chain.filter(exchange),
                            ignored -> evaluation.releaseAll(),
                            (ignored, ex) -> evaluation.releaseAll(),
                            ignored -> evaluation.releaseAll()
                    );
                });
    }

    private Mono<Void> writeTooManyRequests(
            ServerWebExchange exchange,
            GatewayRateLimitProperties properties,
            GatewayRedisRateLimitService.GatewayRateLimitEvaluation evaluation
    ) {
        ServerHttpResponse response = exchange.getResponse();
        response.setStatusCode(HttpStatus.TOO_MANY_REQUESTS);
        response.getHeaders().setContentType(MediaType.APPLICATION_JSON);
        response.getHeaders().set("Retry-After", "1");
        response.getHeaders().set("X-Rate-Limit-Rule", evaluation.ruleId());
        response.getHeaders().set("X-Rate-Limit-Reason", evaluation.reason());
        GatewayRateLimitProperties.ErrorResponse error = properties.getError() == null
                ? new GatewayRateLimitProperties.ErrorResponse()
                : properties.getError();
        ApiResponse<Void> body = ApiResponse.error(error.getCode(), error.getMessage());
        return Mono.fromCallable(() -> objectMapper.writeValueAsBytes(body))
                .flatMap(bytes -> response.writeWith(Mono.just(response.bufferFactory().wrap(bytes))))
                .onErrorResume(ex -> {
                    byte[] fallback = ("{\"code\":" + error.getCode() + ",\"message\":\"" + error.getMessage() + "\"}")
                            .getBytes(StandardCharsets.UTF_8);
                    return response.writeWith(Mono.just(response.bufferFactory().wrap(fallback)));
                });
    }

    @Override
    public int getOrder() {
        return -90;
    }
}
