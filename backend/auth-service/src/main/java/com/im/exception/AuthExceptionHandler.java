package com.im.exception;

import com.im.dto.ApiResponse;
import com.im.enums.CommonErrorCode;
import com.im.util.ApiErrorResponses;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestControllerAdvice;

@RestControllerAdvice
@Slf4j
public class AuthExceptionHandler {

    @ExceptionHandler(AuthServiceException.class)
    public ResponseEntity<ApiResponse<Void>> handleAuthServiceException(AuthServiceException e) {
        log.warn("认证异常: {}", e.getMessage(), e);
        return ApiErrorResponses.response(e.getErrorCode());
    }

    @ExceptionHandler(SecurityException.class)
    public ResponseEntity<ApiResponse<Void>> handleSecurityException(SecurityException e) {
        CommonErrorCode errorCode = resolveTokenError(e);
        log.warn("认证安全异常: {}", errorCode.getMessage(), e);
        return ApiErrorResponses.response(errorCode);
    }

    @ExceptionHandler(IllegalArgumentException.class)
    @ResponseStatus(HttpStatus.BAD_REQUEST)
    public ApiResponse<Void> handleIllegalArgumentException(IllegalArgumentException e) {
        log.warn("参数异常: {}", e.getMessage(), e);
        return ApiResponse.badRequest(e.getMessage());
    }

    @ExceptionHandler(Exception.class)
    @ResponseStatus(HttpStatus.INTERNAL_SERVER_ERROR)
    public ApiResponse<Void> handleException(Exception e) {
        log.error("系统异常", e);
        return ApiResponse.error("系统异常: " + e.getMessage());
    }

    private CommonErrorCode resolveTokenError(SecurityException e) {
        String message = e == null || e.getMessage() == null ? "" : e.getMessage().toLowerCase();
        return message.contains("expired") || message.contains("过期")
                ? CommonErrorCode.TOKEN_EXPIRED
                : CommonErrorCode.TOKEN_INVALID;
    }
}
