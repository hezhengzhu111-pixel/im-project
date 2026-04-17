package com.im.enums;

import lombok.Getter;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;

@Getter
@RequiredArgsConstructor
public enum AuthErrorCode implements ApiErrorCode {
    TOKEN_EXPIRED(CommonErrorCode.TOKEN_EXPIRED),
    TOKEN_INVALID(CommonErrorCode.TOKEN_INVALID);

    private final CommonErrorCode delegate;

    @Override
    public int getCode() {
        return delegate.getCode();
    }

    @Override
    public String getMessage() {
        return delegate.getMessage();
    }

    @Override
    public HttpStatus getHttpStatus() {
        return delegate.getHttpStatus();
    }
}
