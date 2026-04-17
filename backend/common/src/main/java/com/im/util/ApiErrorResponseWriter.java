package com.im.util;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.im.enums.ApiErrorCode;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.http.MediaType;
import org.springframework.http.server.ServerHttpResponse;

import java.nio.charset.StandardCharsets;

public final class ApiErrorResponseWriter {

    private ApiErrorResponseWriter() {
    }

    public static void writeServletError(ObjectMapper objectMapper,
                                         HttpServletResponse response,
                                         ApiErrorCode errorCode) {
        if (response == null || errorCode == null) {
            return;
        }
        try {
            response.setStatus(errorCode.getHttpStatus().value());
            response.setContentType(MediaType.APPLICATION_JSON_VALUE);
            response.setCharacterEncoding(StandardCharsets.UTF_8.name());
            response.getWriter().write(objectMapper.writeValueAsString(ApiErrorResponses.body(errorCode)));
        } catch (Exception ignored) {
        }
    }

    public static void writeServerError(ObjectMapper objectMapper,
                                        ServerHttpResponse response,
                                        ApiErrorCode errorCode) {
        if (response == null || errorCode == null) {
            return;
        }
        try {
            response.setStatusCode(errorCode.getHttpStatus());
            response.getHeaders().setContentType(MediaType.APPLICATION_JSON);
            response.getBody().write(objectMapper.writeValueAsBytes(ApiErrorResponses.body(errorCode)));
            response.getBody().flush();
        } catch (Exception ignored) {
        }
    }
}
