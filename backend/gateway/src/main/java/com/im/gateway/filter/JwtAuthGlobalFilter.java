package com.im.gateway.filter;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.im.config.GlobalRateLimitSwitch;
import com.im.config.RateLimitGlobalProperties;
import com.im.dto.ApiResponse;
import com.im.gateway.auth.*;
import com.im.security.SecurityPaths;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.cloud.client.loadbalancer.reactive.ReactorLoadBalancerExchangeFilterFunction;
import org.springframework.cloud.gateway.filter.GatewayFilterChain;
import org.springframework.cloud.gateway.filter.GlobalFilter;
import org.springframework.core.Ordered;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.server.reactive.ServerHttpRequest;
import org.springframework.stereotype.Component;
import org.springframework.web.reactive.function.client.ExchangeFunction;
import org.springframework.web.reactive.function.client.WebClient;
import org.springframework.web.server.ServerWebExchange;
import reactor.core.publisher.Mono;

import java.nio.charset.StandardCharsets;
import java.time.Duration;

@Component
@Slf4j
public class JwtAuthGlobalFilter implements GlobalFilter, Ordered {
    private static final String HEADER_GATEWAY_ROUTE = "X-Gateway-Route";
    private static final String HEADER_RATE_LIMIT_GLOBAL_ENABLED = RateLimitGlobalProperties.SWITCH_HEADER;

    private final ObjectMapper objectMapper;
    private final GlobalRateLimitSwitch globalRateLimitSwitch;
    private final GatewayTokenExtractor tokenExtractor;
    private final GatewayIdentityHeaderSupport identityHeaderSupport;
    private final GatewayAuthClient authClient;
    private final GatewayAuthSessionCache sessionCache;

    @Value("${im.internal.header:X-Internal-Secret}")
    private String internalHeaderName;

    @Value("${im.internal.secret}")
    private String internalSecret;

    @Value("${im.gateway.auth.secret}")
    private String gatewayAuthSecret;

    @Value("${jwt.header:Authorization}")
    private String jwtHeader;

    @Value("${jwt.prefix:Bearer }")
    private String jwtPrefix;

    @Value("${im.auth.cookie.access-token-name:IM_ACCESS_TOKEN}")
    private String accessTokenCookieName;

    @Value("${im.auth.cookie.refresh-token-name:IM_REFRESH_TOKEN}")
    private String refreshTokenCookieName;

    @Value("${im.gateway.ws-auth-cache.enabled:true}")
    private boolean wsAuthCacheEnabled = true;

    @Value("${im.gateway.ws-auth-cache.ttl-ms:5000}")
    private long wsAuthCacheTtlMs = 5000L;

    @Autowired
    public JwtAuthGlobalFilter(ObjectMapper objectMapper,
                               GlobalRateLimitSwitch globalRateLimitSwitch,
                               ObjectProvider<ReactorLoadBalancerExchangeFilterFunction> loadBalancerFilterProvider,
                               @Value("${im.gateway.auth-service-url:http://127.0.0.1:8084}") String authServiceUrl,
                               @Value("${im.gateway.auth.request-timeout-ms:3000}") long requestTimeoutMs) {
        this(objectMapper,
                globalRateLimitSwitch,
                new GatewayTokenExtractor(),
                new GatewayIdentityHeaderSupport(objectMapper),
                new GatewayAuthClient(
                        buildWebClient(authServiceUrl, loadBalancerFilterProvider.getIfAvailable(), null),
                        Duration.ofMillis(Math.max(1L, requestTimeoutMs))),
                new GatewayAuthSessionCache());
    }

    JwtAuthGlobalFilter(ObjectMapper objectMapper,
                        GlobalRateLimitSwitch globalRateLimitSwitch,
                        String authServiceUrl,
                        long requestTimeoutMs,
                        ExchangeFunction exchangeFunction) {
        this(objectMapper,
                globalRateLimitSwitch,
                new GatewayTokenExtractor(),
                new GatewayIdentityHeaderSupport(objectMapper),
                new GatewayAuthClient(
                        buildWebClient(authServiceUrl, null, exchangeFunction),
                        Duration.ofMillis(Math.max(1L, requestTimeoutMs))),
                new GatewayAuthSessionCache());
    }

    private JwtAuthGlobalFilter(ObjectMapper objectMapper,
                                GlobalRateLimitSwitch globalRateLimitSwitch,
                                GatewayTokenExtractor tokenExtractor,
                                GatewayIdentityHeaderSupport identityHeaderSupport,
                                GatewayAuthClient authClient,
                                GatewayAuthSessionCache sessionCache) {
        this.objectMapper = objectMapper;
        this.globalRateLimitSwitch = globalRateLimitSwitch;
        this.tokenExtractor = tokenExtractor;
        this.identityHeaderSupport = identityHeaderSupport;
        this.authClient = authClient;
        this.sessionCache = sessionCache;
    }

    private static WebClient buildWebClient(String authServiceUrl,
                                            ReactorLoadBalancerExchangeFilterFunction loadBalancerFilter,
                                            ExchangeFunction exchangeFunction) {
        WebClient.Builder builder = WebClient.builder();
        if (exchangeFunction != null) {
            builder.exchangeFunction(exchangeFunction);
        }
        String baseUrl = authServiceUrl == null || authServiceUrl.isBlank()
                ? "http://127.0.0.1:8084"
                : authServiceUrl.trim();
        if (baseUrl.startsWith("lb://")) {
            if (loadBalancerFilter != null) {
                builder.filter(loadBalancerFilter);
            }
            baseUrl = "http://" + baseUrl.substring("lb://".length());
        }
        return builder.baseUrl(baseUrl).build();
    }

    @Override
    public Mono<Void> filter(ServerWebExchange exchange, GatewayFilterChain chain) {
        ServerWebExchange sanitizedExchange = identityHeaderSupport.sanitizeIncoming(exchange, internalHeaderName);
        ServerWebExchange switchAwareExchange = applyGlobalRateLimitHeader(sanitizedExchange);
        GatewayAuthInput input = filterInput(switchAwareExchange);
        InputStageResult inputStageResult = filterInputStage(input);
        Mono<Void> inputOutput = filterInputOutput(switchAwareExchange, chain, inputStageResult);
        if (inputOutput != null) {
            return inputOutput;
        }

        Mono<ServerWebExchange> authenticatedExchange = authenticateAndDecorate(switchAwareExchange, input.token())
                .onErrorResume(GatewayAuthException.class, ex -> writeGatewayAuthFailure(switchAwareExchange, ex))
                .onErrorResume(Throwable.class,
                        ex -> writeStatus(switchAwareExchange, HttpStatus.SERVICE_UNAVAILABLE).then(Mono.empty()));

        return authenticatedExchange.flatMap(chain::filter);
    }

    private ServerWebExchange applyGlobalRateLimitHeader(ServerWebExchange exchange) {
        String switchValue = Boolean.toString(globalRateLimitSwitch.isEnabled());
        exchange.getResponse().getHeaders().set(HEADER_RATE_LIMIT_GLOBAL_ENABLED, switchValue);
        ServerHttpRequest request = exchange.getRequest().mutate()
                .headers(headers -> headers.set(HEADER_RATE_LIMIT_GLOBAL_ENABLED, switchValue))
                .build();
        return exchange.mutate().request(request).build();
    }

    private GatewayAuthInput filterInput(ServerWebExchange exchange) {
        return tokenExtractor.extract(
                exchange,
                jwtHeader,
                jwtPrefix,
                accessTokenCookieName,
                refreshTokenCookieName,
                HEADER_GATEWAY_ROUTE
        );
    }

    private InputStageResult filterInputStage(GatewayAuthInput input) {
        if (requiresCookieCsrfCheck(input)) {
            return InputStageResult.reject(HttpStatus.FORBIDDEN);
        }
        if (SecurityPaths.isGatewayWhiteList(input.path())) {
            return InputStageResult.passThrough();
        }
        if (SecurityPaths.isGatewayInternalPath(input.path())) {
            return InputStageResult.reject(HttpStatus.FORBIDDEN);
        }
        if (requiresGatewayRouteHeader(input)) {
            return InputStageResult.reject(HttpStatus.BAD_REQUEST);
        }
        if (input.token() == null || input.token().trim().isEmpty()) {
            return InputStageResult.reject(HttpStatus.UNAUTHORIZED);
        }
        return null;
    }

    private boolean requiresCookieCsrfCheck(GatewayAuthInput input) {
        return input.authCookiePresent()
                && isUnsafeMethod(input.method())
                && !input.gatewayRouteHeaderPresent();
    }

    private boolean isUnsafeMethod(String method) {
        return "POST".equalsIgnoreCase(method)
                || "PUT".equalsIgnoreCase(method)
                || "PATCH".equalsIgnoreCase(method)
                || "DELETE".equalsIgnoreCase(method);
    }

    private boolean requiresGatewayRouteHeader(GatewayAuthInput input) {
        return !input.gatewayRouteHeaderPresent() && !isWebSocketPath(input.path());
    }

    private Mono<Void> filterInputOutput(ServerWebExchange exchange, GatewayFilterChain chain, InputStageResult stageResult) {
        if (stageResult == null) {
            return null;
        }
        if (stageResult.shouldPassThrough()) {
            return chain.filter(exchange);
        }
        return writeStatus(exchange, stageResult.rejectStatus());
    }

    private Mono<ServerWebExchange> authenticateAndDecorate(ServerWebExchange exchange, String token) {
        return Mono.defer(() -> {
            if (isWebSocketPath(exchange)) {
                return authenticateWebSocketAndDecorate(exchange, token);
            }
            return authClient.introspect(token, "/api/auth/internal/introspect", internalHeaderName, internalSecret)
                    .map(session -> mutateExchange(exchange, session));
        });
    }

    private Mono<ServerWebExchange> authenticateWebSocketAndDecorate(ServerWebExchange exchange, String token) {
        return sessionCache.authenticateWebSocket(
                        token,
                        wsAuthCacheEnabled,
                        wsAuthCacheTtlMs,
                        () -> authClient.introspect(token, "/api/auth/internal/ws-introspect", internalHeaderName, internalSecret))
                .map(session -> mutateExchange(exchange, session));
    }

    private ServerWebExchange mutateExchange(ServerWebExchange exchange, GatewayAuthSession session) {
        return identityHeaderSupport.decorate(
                exchange,
                session.userId(),
                session.username(),
                session.userResource(),
                internalHeaderName,
                internalSecret,
                gatewayAuthSecret,
                globalRateLimitSwitch.isEnabled()
        );
    }

    private Mono<ServerWebExchange> writeGatewayAuthFailure(ServerWebExchange exchange, GatewayAuthException ex) {
        if (ex.errorCode() == null) {
            return writeStatus(exchange, ex.status()).then(Mono.empty());
        }
        exchange.getResponse().setStatusCode(ex.status());
        exchange.getResponse().getHeaders().setContentType(MediaType.APPLICATION_JSON);
        ApiResponse<Void> body = ApiResponse.error(ex.errorCode().getCode(), ex.errorCode().getMessage());
        return Mono.fromCallable(() -> objectMapper.writeValueAsBytes(body))
                .flatMap(bytes -> exchange.getResponse()
                        .writeWith(Mono.just(exchange.getResponse().bufferFactory().wrap(bytes))))
                .onErrorResume(writeEx -> {
                    byte[] fallback = ("{\"code\":" + ex.errorCode().getCode()
                            + ",\"message\":\"" + ex.errorCode().getMessage() + "\"}")
                            .getBytes(StandardCharsets.UTF_8);
                    return exchange.getResponse()
                            .writeWith(Mono.just(exchange.getResponse().bufferFactory().wrap(fallback)));
                })
                .then(Mono.empty());
    }

    private Mono<Void> writeStatus(ServerWebExchange exchange, HttpStatus status) {
        exchange.getResponse().setStatusCode(status);
        return exchange.getResponse().setComplete();
    }

    private boolean isWebSocketPath(ServerWebExchange exchange) {
        String path = exchange == null || exchange.getRequest() == null
                ? null
                : exchange.getRequest().getURI().getPath();
        return isWebSocketPath(path);
    }

    private boolean isWebSocketPath(String path) {
        return path != null && path.startsWith("/websocket");
    }

    @Override
    public int getOrder() {
        return -100;
    }

    private record InputStageResult(boolean shouldPassThrough, HttpStatus rejectStatus) {
        private static InputStageResult passThrough() {
            return new InputStageResult(true, null);
        }

        private static InputStageResult reject(HttpStatus status) {
            return new InputStageResult(false, status);
        }
    }

}
