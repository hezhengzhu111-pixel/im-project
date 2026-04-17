package com.im.util;

import com.im.dto.ApiResponse;
import com.im.enums.ApiErrorCode;
import org.springframework.http.ResponseEntity;

public final class ApiErrorResponses {

    private ApiErrorResponses() {
    }

    public static ApiResponse<Void> body(ApiErrorCode errorCode) {
        if (errorCode == null) {
            return ApiResponse.error("SYSTEM_ERROR");
        }
        return ApiResponse.error(errorCode);
    }

    public static ResponseEntity<ApiResponse<Void>> response(ApiErrorCode errorCode) {
        if (errorCode == null) {
            return ResponseEntity.internalServerError().body(ApiResponse.error("SYSTEM_ERROR"));
        }
        return ResponseEntity.status(errorCode.getHttpStatus()).body(body(errorCode));
    }
}
