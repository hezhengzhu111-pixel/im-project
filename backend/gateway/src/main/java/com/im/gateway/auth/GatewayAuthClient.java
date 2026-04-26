package com.im.gateway.auth;

import com.im.dto.ApiResponse;
import com.im.dto.AuthIntrospectResultDTO;
import com.im.dto.AuthUserResourceDTO;
import com.im.enums.AuthErrorCode;
import com.im.util.AuthHeaderUtil;
import org.springframework.core.ParameterizedTypeReference;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.web.reactive.function.client.WebClient;
import reactor.core.Exceptions;
import reactor.core.publisher.Mono;

import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.UUID;
import java.util.concurrent.TimeoutException;

public class GatewayAuthClient {
    private static final ParameterizedTypeReference<ApiResponse<AuthIntrospectResultDTO>> INTROSPECT_RESPONSE_TYPE =
            new ParameterizedTypeReference<ApiResponse<AuthIntrospectResultDTO>>() {
            };
    private static final ParameterizedTypeReference<ApiResponse<Void>> ERROR_RESPONSE_TYPE =
            new ParameterizedTypeReference<ApiResponse<Void>>() {
            };

    private final WebClient webClient;
    private final Duration authServiceTimeout;

    public GatewayAuthClient(WebClient webClient, Duration authServiceTimeout) {
        this.webClient = webClient;
        this.authServiceTimeout = authServiceTimeout;
    }

    public Mono<GatewayAuthSession> introspect(String token,
                                               String path,
                                               String internalHeaderName,
                                               String internalSecret) {
        byte[] body = token == null ? new byte[0] : token.getBytes(StandardCharsets.UTF_8);
        WebClient.RequestHeadersSpec<?> requestSpec = applyInternalAuth(webClient.post()
                        .uri(path)
                        .contentType(MediaType.TEXT_PLAIN)
                        .bodyValue(token == null ? "" : token),
                "POST",
                path,
                body,
                internalHeaderName,
                internalSecret);
        return exchangeForIntrospect(requestSpec)
                .map(this::extractApiData)
                .flatMap(dto -> {
                    if (isValidIntrospection(dto)) {
                        return Mono.just(toSession(dto));
                    }
                    return Mono.error(GatewayAuthException.unauthorized(AuthErrorCode.TOKEN_INVALID));
                });
    }

    private WebClient.RequestHeadersSpec<?> applyInternalAuth(WebClient.RequestHeadersSpec<?> requestSpec,
                                                              String method,
                                                              String path,
                                                              byte[] body,
                                                              String internalHeaderName,
                                                              String internalSecret) {
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

    private Mono<ApiResponse<AuthIntrospectResultDTO>> exchangeForIntrospect(WebClient.RequestHeadersSpec<?> requestSpec) {
        return requestSpec.exchangeToMono(response -> {
                    if (response.statusCode().is2xxSuccessful()) {
                        return response.bodyToMono(INTROSPECT_RESPONSE_TYPE)
                                .switchIfEmpty(Mono.error(GatewayAuthException.serviceUnavailable("auth service empty response")));
                    }
                    if (response.statusCode().value() == HttpStatus.UNAUTHORIZED.value()) {
                        return response.bodyToMono(ERROR_RESPONSE_TYPE)
                                .defaultIfEmpty(ApiResponse.error(AuthErrorCode.TOKEN_INVALID))
                                .flatMap(body -> Mono.error(GatewayAuthException.unauthorized(resolveAuthErrorCode(body))));
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

    private <T> T extractApiData(ApiResponse<T> response) {
        if (response == null || !Integer.valueOf(200).equals(response.getCode()) || response.getData() == null) {
            return null;
        }
        return response.getData();
    }

    private boolean isValidIntrospection(AuthIntrospectResultDTO dto) {
        return dto != null
                && dto.isValid()
                && !dto.isExpired()
                && dto.getUserId() != null
                && dto.getUsername() != null
                && !dto.getUsername().trim().isEmpty()
                && dto.getExpiresAtEpochMs() != null
                && dto.getExpiresAtEpochMs() > System.currentTimeMillis();
    }

    private GatewayAuthSession toSession(AuthIntrospectResultDTO dto) {
        AuthUserResourceDTO resource = new AuthUserResourceDTO();
        resource.setUserId(dto.getUserId());
        resource.setUsername(dto.getUsername());
        resource.setUserInfo(dto.getUserInfo());
        resource.setResourcePermissions(dto.getResourcePermissions());
        resource.setDataScopes(dto.getDataScopes());
        return new GatewayAuthSession(dto.getUserId(), dto.getUsername().trim(), resource, dto.getExpiresAtEpochMs());
    }

    private AuthErrorCode resolveAuthErrorCode(ApiResponse<?> body) {
        if (body != null && Integer.valueOf(AuthErrorCode.TOKEN_EXPIRED.getCode()).equals(body.getCode())) {
            return AuthErrorCode.TOKEN_EXPIRED;
        }
        if (body != null && AuthErrorCode.TOKEN_EXPIRED.getMessage().equals(body.getMessage())) {
            return AuthErrorCode.TOKEN_EXPIRED;
        }
        return AuthErrorCode.TOKEN_INVALID;
    }
}
