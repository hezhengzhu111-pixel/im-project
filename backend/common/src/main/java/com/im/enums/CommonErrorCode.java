package com.im.enums;

import lombok.Getter;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;

@Getter
@RequiredArgsConstructor
public enum CommonErrorCode implements ApiErrorCode {
    TOKEN_EXPIRED(40101, "TOKEN_EXPIRED", HttpStatus.UNAUTHORIZED),
    TOKEN_INVALID(40102, "TOKEN_INVALID", HttpStatus.UNAUTHORIZED),
    WS_TICKET_INVALID_OR_EXPIRED(40103, "WS_TICKET_INVALID_OR_EXPIRED", HttpStatus.UNAUTHORIZED),
    INTERNAL_AUTH_REJECTED(40104, "INTERNAL_AUTH_REJECTED", HttpStatus.UNAUTHORIZED),
    WS_QUERY_TICKET_NOT_ALLOWED(40105, "WS_QUERY_TICKET_NOT_ALLOWED", HttpStatus.UNAUTHORIZED),
    INVALID_CURSOR(40001, "INVALID_CURSOR", HttpStatus.BAD_REQUEST),
    CONVERSATION_ACCESS_DENIED(40301, "CONVERSATION_ACCESS_DENIED", HttpStatus.FORBIDDEN),
    WS_ORIGIN_NOT_ALLOWED(40302, "WS_ORIGIN_NOT_ALLOWED", HttpStatus.FORBIDDEN),
    DUPLICATE_CLIENT_MESSAGE_ID(40901, "DUPLICATE_CLIENT_MESSAGE_ID", HttpStatus.CONFLICT),
    WS_SESSION_CLOSED_OR_STALE(44001, "WS_SESSION_CLOSED_OR_STALE", HttpStatus.GONE);

    private final int code;
    private final String message;
    private final HttpStatus httpStatus;
}
