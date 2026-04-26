package com.im.gateway.auth;

import com.im.enums.AuthErrorCode;
import org.springframework.http.HttpStatus;

public class GatewayAuthException extends RuntimeException {
    private final HttpStatus status;
    private final AuthErrorCode errorCode;

    private GatewayAuthException(HttpStatus status, AuthErrorCode errorCode, String message) {
        super(message);
        this.status = status;
        this.errorCode = errorCode;
    }

    public HttpStatus status() {
        return status;
    }

    public AuthErrorCode errorCode() {
        return errorCode;
    }

    public static GatewayAuthException unauthorized(AuthErrorCode errorCode) {
        return new GatewayAuthException(HttpStatus.UNAUTHORIZED, errorCode, errorCode.getMessage());
    }

    public static GatewayAuthException gatewayTimeout(String message) {
        return new GatewayAuthException(HttpStatus.GATEWAY_TIMEOUT, null, message);
    }

    public static GatewayAuthException serviceUnavailable(String message) {
        return new GatewayAuthException(HttpStatus.SERVICE_UNAVAILABLE, null, message);
    }
}
