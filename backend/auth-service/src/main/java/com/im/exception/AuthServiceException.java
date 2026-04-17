package com.im.exception;

import com.im.enums.ApiErrorCode;

public class AuthServiceException extends BusinessException {

    public AuthServiceException(ApiErrorCode errorCode) {
        super(errorCode);
    }

    public AuthServiceException(ApiErrorCode errorCode, String message) {
        super(errorCode, message);
    }

    public AuthServiceException(ApiErrorCode errorCode, Throwable cause) {
        super(errorCode, cause);
    }

    public AuthServiceException(ApiErrorCode errorCode, String message, Throwable cause) {
        super(errorCode, message, cause);
    }
}
