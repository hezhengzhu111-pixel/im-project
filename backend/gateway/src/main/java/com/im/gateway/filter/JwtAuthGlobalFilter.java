package com.im.gateway.filter;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.github.benmanes.caffeine.cache.Cache;
import com.github.benmanes.caffeine.cache.Caffeine;
import com.im.config.GlobalRateLimitSwitch;
import com.im.config.RateLimitGlobalProperties;
import com.im.dto.ApiResponse;
import com.im.dto.AuthUserResourceDTO;
import com.im.dto.JwtLocalValidationResult;
import com.im.enums.AuthErrorCode;
import com.im.enums.JwtLocalValidationStatus;
import com.im.security.SecurityPaths;
import com.im.util.AuthHeaderUtil;
import com.im.util.JwtLocalTokenValidator;
import io.micrometer.core.instrument.MeterRegistry;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.cloud.client.loadbalancer.reactive.ReactorLoadBalancerExchangeFilterFunction;
import org.springframework.cloud.gateway.filter.GatewayFilterChain;
import org.springframework.cloud.gateway.filter.GlobalFilter;
import org.springframework.core.Ordered;
import org.springframework.core.ParameterizedTypeReference;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.server.reactive.ServerHttpRequest;
import org.springframework.stereotype.Component;
import org.springframework.web.reactive.function.client.ExchangeFunction;
import org.springframework.web.reactive.function.client.WebClient;
import org.springframework.web.server.ServerWebExchange;
import reactor.core.Exceptions;
import reactor.core.publisher.Mono;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.time.Duration;
import java.util.UUID;
import java.util.concurrent.TimeoutException;

@Component
@Slf4j
public class JwtAuthGlobalFilter implements GlobalFilter, Ordered {
    private static final String HEADER_USER_ID = "X-User-Id";
    private static final String HEADER_USERNAME = "X-Username";
    private static final String HEADER_AUTH_USER = "X-Auth-User";
    private static final String HEADER_AUTH_PERMS = "X-Auth-Perms";
    private static final String HEADER_AUTH_DATA = "X-Auth-Data";
    private static final String HEADER_AUTH_TS = "X-Auth-Ts";
    private static final String HEADER_AUTH_NONCE = "X-Auth-Nonce";
    private static final String HEADER_AUTH_SIGN = "X-Auth-Sign";
    private static final String HEADER_GATEWAY_ROUTE = "X-Gateway-Route";
    private static final String HEADER_RATE_LIMIT_GLOBAL_ENABLED = RateLimitGlobalProperties.SWITCH_HEADER;
    private static final int AUTH_CACHE_MAX_SIZE = 10_000;
    private static final Duration AUTH_CACHE_TTL = Duration.ofSeconds(10);
    private static final ParameterizedTypeReference<ApiResponse<AuthUserResourceDTO>> USER_RESOURCE_RESPONSE_TYPE =
            new ParameterizedTypeReference<ApiResponse<AuthUserResourceDTO>>() {
            };

    private final ObjectMapper objectMapper;
    private final GlobalRateLimitSwitch globalRateLimitSwitch;
    private final WebClient webClient;
    private final Duration authServiceTimeout;
    private final Cache<String, AuthenticatedSession> authResultCache;

    @Autowired(required = false)
    private MeterRegistry meterRegistry;

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

    @Value("${jwt.secret}")
    private String accessSecret;

    @Value("${im.auth.cookie.access-token-name:IM_ACCESS_TOKEN}")
    private String accessTokenCookieName;

    @Value("${im.auth.cookie.refresh-token-name:IM_REFRESH_TOKEN}")
    private String refreshTokenCookieName;

    @Autowired
    public JwtAuthGlobalFilter(ObjectMapper objectMapper,
                               GlobalRateLimitSwitch globalRateLimitSwitch,
                               ObjectProvider<ReactorLoadBalancerExchangeFilterFunction> loadBalancerFilterProvider,
                               @Value("${im.gateway.auth-service-url:http://127.0.0.1:8084}") String authServiceUrl,
                               @Value("${im.gateway.auth.request-timeout-ms:3000}") long requestTimeoutMs) {
        this(objectMapper,
                globalRateLimitSwitch,
                requestTimeoutMs,
                buildWebClient(authServiceUrl, loadBalancerFilterProvider.getIfAvailable(), null));
    }

    JwtAuthGlobalFilter(ObjectMapper objectMapper,
                        GlobalRateLimitSwitch globalRateLimitSwitch,
                        String authServiceUrl,
                        long requestTimeoutMs,
                        ExchangeFunction exchangeFunction) {
        this(objectMapper,
                globalRateLimitSwitch,
                requestTimeoutMs,
                buildWebClient(authServiceUrl, null, exchangeFunction));
    }

    private JwtAuthGlobalFilter(ObjectMapper objectMapper,
                                GlobalRateLimitSwitch globalRateLimitSwitch,
                                long requestTimeoutMs,
                                WebClient webClient) {
        this.objectMapper = objectMapper;
        this.globalRateLimitSwitch = globalRateLimitSwitch;
        this.webClient = webClient;
        this.authServiceTimeout = Duration.ofMillis(Math.max(1L, requestTimeoutMs));
        this.authResultCache = Caffeine.newBuilder()
                .maximumSize(AUTH_CACHE_MAX_SIZE)
                .expireAfterWrite(AUTH_CACHE_TTL)
                .build();
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
        ServerWebExchange sanitizedExchange = sanitizeIncomingExchange(exchange);
        ServerWebExchange switchAwareExchange = applyGlobalRateLimitHeader(sanitizedExchange);
        FilterInput input = filterInput(switchAwareExchange);
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

    private FilterInput filterInput(ServerWebExchange exchange) {
        String path = exchange.getRequest().getURI().getPath();
        String authHeader = exchange.getRequest().getHeaders().getFirst(jwtHeader);
        String token = extractToken(exchange, authHeader);
        boolean authCookiePresent = hasCookie(exchange, accessTokenCookieName) || hasCookie(exchange, refreshTokenCookieName);
        boolean gatewayRouteHeaderPresent = exchange.getRequest().getHeaders().getFirst(HEADER_GATEWAY_ROUTE) != null;
        String method = exchange.getRequest().getMethod() == null ? "" : exchange.getRequest().getMethod().name();
        return new FilterInput(path, token, authCookiePresent, gatewayRouteHeaderPresent, method);
    }

    private ServerWebExchange sanitizeIncomingExchange(ServerWebExchange exchange) {
        if (exchange.getRequest().getHeaders().getFirst(internalHeaderName) == null) {
            return exchange;
        }
        ServerHttpRequest sanitizedRequest = exchange.getRequest().mutate()
                .headers(headers -> headers.remove(internalHeaderName))
                .build();
        return exchange.mutate().request(sanitizedRequest).build();
    }

    private String extractToken(ServerWebExchange exchange, String authHeader) {
        String token = extractTokenFromHeader(authHeader);
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

    private InputStageResult filterInputStage(FilterInput input) {
        if (requiresCookieCsrfCheck(input)) {
            return InputStageResult.reject(HttpStatus.FORBIDDEN);
        }
        if (SecurityPaths.isGatewayWhiteList(input.path())) {
            return InputStageResult.passThrough();
        }
        if (SecurityPaths.isGatewayInternalPath(input.path())) {
            return InputStageResult.reject(HttpStatus.FORBIDDEN);
        }
        if (input.token() == null || input.token().trim().isEmpty()) {
            return InputStageResult.reject(HttpStatus.UNAUTHORIZED);
        }
        return null;
    }

    private boolean hasCookie(ServerWebExchange exchange, String name) {
        return name != null && exchange.getRequest().getCookies().getFirst(name) != null;
    }

    private boolean requiresCookieCsrfCheck(FilterInput input) {
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
            AuthContext context = validateAccessTokenLocally(exchange, token);
            AuthenticatedSession cachedSession = authResultCache.getIfPresent(token);
            if (cachedSession != null) {
                return Mono.just(mutateExchange(exchange, cachedSession));
            }
            return resolveUserResource(context.userId())
                    .map(userResource -> new AuthenticatedSession(context, userResource))
                    .flatMap(session -> {
                        authResultCache.put(token, session);
                        return Mono.just(mutateExchange(exchange, session));
                    });
        });
    }

    private AuthContext validateAccessTokenLocally(ServerWebExchange exchange, String token) {
        JwtLocalValidationResult validation = JwtLocalTokenValidator.validateAccessToken(token, accessSecret);
        if (validation.status() == JwtLocalValidationStatus.VALID) {
            recordLocalValidation("valid");
            return new AuthContext(validation.userId(), validation.username());
        }
        recordLocalValidation(validation.status() == JwtLocalValidationStatus.EXPIRED ? "expired" : "invalid");
        AuthErrorCode errorCode = validation.status() == JwtLocalValidationStatus.EXPIRED
                ? AuthErrorCode.TOKEN_EXPIRED
                : AuthErrorCode.TOKEN_INVALID;
        String tokenSummary = summarizeToken(token);
        String path = exchange.getRequest().getURI().getPath();
        log.warn("Gateway access token rejected. path={}, status={}, tokenSummary={}",
                path, validation.status(), tokenSummary);
        log.debug("Gateway access token rejection detail. path={}, status={}, tokenSummary={}, userId={}, username={}",
                path, validation.status(), tokenSummary, validation.userId(), validation.username());
        throw GatewayAuthException.unauthorized(errorCode);
    }

    private void recordLocalValidation(String result) {
        if (meterRegistry != null) {
            meterRegistry.counter("gateway_auth_local_validation", "result", result).increment();
        }
    }

    private ServerWebExchange mutateExchange(ServerWebExchange exchange, AuthenticatedSession session) {
        SignedAuthHeaders signedHeaders = buildSignedAuthHeaders(session.context(), session.userResource());
        ServerHttpRequest mutatedRequest = exchange.getRequest().mutate()
                .headers(headers -> {
                    headers.remove(HEADER_USER_ID);
                    headers.remove(HEADER_USERNAME);
                    headers.remove(internalHeaderName);
                    headers.remove(HEADER_AUTH_USER);
                    headers.remove(HEADER_AUTH_PERMS);
                    headers.remove(HEADER_AUTH_DATA);
                    headers.remove(HEADER_AUTH_TS);
                    headers.remove(HEADER_AUTH_NONCE);
                    headers.remove(HEADER_AUTH_SIGN);
                    headers.remove(HEADER_RATE_LIMIT_GLOBAL_ENABLED);
                    headers.set(HEADER_USER_ID, String.valueOf(session.context().userId()));
                    headers.set(HEADER_USERNAME, session.context().username());
                    headers.set(internalHeaderName, internalSecret);
                    headers.set(HEADER_AUTH_USER, signedHeaders.userB64());
                    headers.set(HEADER_AUTH_PERMS, signedHeaders.permsB64());
                    headers.set(HEADER_AUTH_DATA, signedHeaders.dataB64());
                    headers.set(HEADER_AUTH_TS, signedHeaders.ts());
                    headers.set(HEADER_AUTH_NONCE, signedHeaders.nonce());
                    headers.set(HEADER_AUTH_SIGN, signedHeaders.signature());
                    headers.set(HEADER_RATE_LIMIT_GLOBAL_ENABLED, Boolean.toString(globalRateLimitSwitch.isEnabled()));
                })
                .build();
        return exchange.mutate().request(mutatedRequest).build();
    }

    private SignedAuthHeaders buildSignedAuthHeaders(AuthContext context, AuthUserResourceDTO userResource) {
        String userInfoJson = safeWriteJson(userResource.getUserInfo());
        String permsJson = safeWriteJson(userResource.getResourcePermissions());
        String dataJson = safeWriteJson(userResource.getDataScopes());
        String userB64 = AuthHeaderUtil.base64UrlEncode(userInfoJson);
        String permsB64 = AuthHeaderUtil.base64UrlEncode(permsJson);
        String dataB64 = AuthHeaderUtil.base64UrlEncode(dataJson);
        String ts = String.valueOf(System.currentTimeMillis());
        String nonce = UUID.randomUUID().toString();
        String signature = AuthHeaderUtil.signHmacSha256(
                gatewayAuthSecret,
                AuthHeaderUtil.buildSignedFields(
                        String.valueOf(context.userId()),
                        context.username(),
                        userB64,
                        permsB64,
                        dataB64,
                        ts,
                        nonce
                )
        );
        return new SignedAuthHeaders(userB64, permsB64, dataB64, ts, nonce, signature);
    }

    private Mono<AuthUserResourceDTO> resolveUserResource(Long userId) {
        String path = "/api/auth/internal/user-resource/" + userId;
        return exchangeForApiResponse(applyInternalAuth(webClient.get()
                                .uri(uriBuilder -> uriBuilder.path("/api/auth/internal/user-resource/{userId}").build(userId)),
                        "GET",
                        path,
                        null), USER_RESOURCE_RESPONSE_TYPE)
                .map(this::extractApiData)
                .flatMap(dto -> {
                    if (isCacheableUserResource(dto, userId)) {
                        return Mono.just(dto);
                    }
                    return Mono.error(GatewayAuthException.serviceUnavailable("auth user resource response invalid"));
                });
    }

    private WebClient.RequestHeadersSpec<?> applyInternalAuth(WebClient.RequestHeadersSpec<?> requestSpec,
                                                              String method,
                                                              String path,
                                                              byte[] body) {
        String timestamp = String.valueOf(System.currentTimeMillis());
        String nonce = UUID.randomUUID().toString();
        String bodyHash = AuthHeaderUtil.sha256Base64Url(body);
        String signature = AuthHeaderUtil.signHmacSha256(
                internalSecret,
                AuthHeaderUtil.buildInternalSignedFields(method, path, bodyHash, timestamp, nonce)
        );

        return requestSpec
                .header(AuthHeaderUtil.INTERNAL_TIMESTAMP_HEADER, timestamp)
                .header(AuthHeaderUtil.INTERNAL_NONCE_HEADER, nonce)
                .header(AuthHeaderUtil.INTERNAL_SIGNATURE_HEADER, signature)
                .header(internalHeaderName, internalSecret);
    }

    private <T> Mono<ApiResponse<T>> exchangeForApiResponse(WebClient.RequestHeadersSpec<?> requestSpec,
                                                            ParameterizedTypeReference<ApiResponse<T>> responseType) {
        return requestSpec.exchangeToMono(response -> {
                    if (response.statusCode().is2xxSuccessful()) {
                        return response.bodyToMono(responseType)
                                .switchIfEmpty(Mono.error(GatewayAuthException.serviceUnavailable("auth service empty response")));
                    }
                    return response.releaseBody()
                            .then(Mono.error(GatewayAuthException.serviceUnavailable(
                                    "auth service transport error: " + response.statusCode().value())));
                })
                .timeout(authServiceTimeout)
                .onErrorMap(this::mapAuthServiceError);
    }

    private Throwable mapAuthServiceError(Throwable throwable) {
        Throwable unwrapped = Exceptions.unwrap(throwable);
        if (unwrapped instanceof GatewayAuthException) {
            return unwrapped;
        }
        if (unwrapped instanceof TimeoutException) {
            return GatewayAuthException.gatewayTimeout("auth service timeout");
        }
        return GatewayAuthException.serviceUnavailable("auth service unavailable");
    }

    private String safeWriteJson(Object obj) {
        try {
            return objectMapper.writeValueAsString(obj);
        } catch (Exception e) {
            return "null";
        }
    }

    private <T> T extractApiData(ApiResponse<T> response) {
        if (response == null || !Integer.valueOf(200).equals(response.getCode()) || response.getData() == null) {
            return null;
        }
        return response.getData();
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

    private boolean isCacheableUserResource(AuthUserResourceDTO dto, Long expectedUserId) {
        return dto != null && dto.getUserId() != null && expectedUserId != null && expectedUserId.equals(dto.getUserId());
    }

    private String extractTokenFromHeader(String authHeader) {
        if (authHeader == null) {
            return null;
        }
        String normalized = authHeader.trim();
        if (normalized.startsWith(jwtPrefix)) {
            normalized = normalized.substring(jwtPrefix.length()).trim();
        }
        return normalized.isEmpty() ? null : normalized;
    }

    private String summarizeToken(String token) {
        if (token == null || token.isBlank()) {
            return "missing";
        }
        String trimmed = token.trim();
        try {
            byte[] digest = MessageDigest.getInstance("SHA-256").digest(trimmed.getBytes(StandardCharsets.UTF_8));
            StringBuilder summary = new StringBuilder();
            for (int i = 0; i < Math.min(6, digest.length); i++) {
                summary.append(String.format("%02x", digest[i]));
            }
            return "sha256:" + summary + ",len=" + trimmed.length();
        } catch (Exception ex) {
            return "len=" + trimmed.length();
        }
    }

    @Override
    public int getOrder() {
        return -100;
    }

    private record FilterInput(String path, String token, boolean authCookiePresent, boolean gatewayRouteHeaderPresent,
                               String method) {
    }

    private record AuthContext(Long userId, String username) {
    }

    private record InputStageResult(boolean shouldPassThrough, HttpStatus rejectStatus) {
        private static InputStageResult passThrough() {
            return new InputStageResult(true, null);
        }

        private static InputStageResult reject(HttpStatus status) {
            return new InputStageResult(false, status);
        }
    }

    private record SignedAuthHeaders(String userB64,
                                     String permsB64,
                                     String dataB64,
                                     String ts,
                                     String nonce,
                                     String signature) {
    }

    private record AuthenticatedSession(AuthContext context, AuthUserResourceDTO userResource) {
    }

    private static final class GatewayAuthException extends RuntimeException {
        private final HttpStatus status;
        private final AuthErrorCode errorCode;

        private GatewayAuthException(HttpStatus status, AuthErrorCode errorCode, String message) {
            super(message);
            this.status = status;
            this.errorCode = errorCode;
        }

        private HttpStatus status() {
            return status;
        }

        private AuthErrorCode errorCode() {
            return errorCode;
        }

        private static GatewayAuthException unauthorized(AuthErrorCode errorCode) {
            return new GatewayAuthException(HttpStatus.UNAUTHORIZED, errorCode, errorCode.getMessage());
        }

        private static GatewayAuthException gatewayTimeout(String message) {
            return new GatewayAuthException(HttpStatus.GATEWAY_TIMEOUT, null, message);
        }

        private static GatewayAuthException serviceUnavailable(String message) {
            return new GatewayAuthException(HttpStatus.SERVICE_UNAVAILABLE, null, message);
        }
    }
}
