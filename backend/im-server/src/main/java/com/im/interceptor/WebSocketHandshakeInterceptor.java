package com.im.interceptor;

import com.im.dto.WsTicketConsumeResultDTO;
import com.im.dto.request.ConsumeWsTicketRequest;
import com.im.feign.AuthServiceFeignClient;
import com.im.metrics.ImServerMetrics;
import com.im.util.AuthCookieUtil;
import jakarta.servlet.http.HttpServletRequest;
import lombok.extern.slf4j.Slf4j;
import org.apache.commons.lang3.StringUtils;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.server.ServerHttpRequest;
import org.springframework.http.server.ServerHttpResponse;
import org.springframework.http.server.ServletServerHttpRequest;
import org.springframework.stereotype.Component;
import org.springframework.web.socket.WebSocketHandler;
import org.springframework.web.socket.server.HandshakeInterceptor;

import java.util.Map;

@Slf4j
@Component
public class WebSocketHandshakeInterceptor implements HandshakeInterceptor {

    private static final String DEFAULT_ALLOWED_ORIGINS =
            "http://localhost,http://127.0.0.1,http://localhost:5173,http://127.0.0.1:5173,http://localhost:8080,http://127.0.0.1:8080";

    @Autowired
    private AuthServiceFeignClient authServiceFeignClient;

    @Autowired(required = false)
    private ImServerMetrics metrics;

    @Value("${im.auth.cookie.ws-ticket-name:IM_WS_TICKET}")
    private String wsTicketCookieName;

    @Value("${im.auth.cookie.ws-ticket-path:/websocket}")
    private String wsTicketCookiePath;

    @Value("${im.auth.cookie.same-site:Lax}")
    private String authCookieSameSite;

    @Value("${im.auth.cookie.secure:auto}")
    private String authCookieSecure;

    @Value("${im.websocket.allowed-origins:" + DEFAULT_ALLOWED_ORIGINS + "}")
    private String allowedOrigins;

    @Override
    public boolean beforeHandshake(ServerHttpRequest request, ServerHttpResponse response,
                                   WebSocketHandler wsHandler, Map<String, Object> attributes) {
        if (!(request instanceof ServletServerHttpRequest servletRequest)) {
            recordHandshakeFailure("unsupported_request");
            return false;
        }

        HttpServletRequest httpRequest = servletRequest.getServletRequest();
        String origin = httpRequest.getHeader(HttpHeaders.ORIGIN);
        if (!isOriginAllowed(origin)) {
            recordHandshakeFailure("origin_denied");
            log.warn("WebSocket connection rejected: origin not allowed, origin={}", origin);
            response.setStatusCode(HttpStatus.FORBIDDEN);
            return false;
        }

        String ticket = extractTicket(httpRequest);
        if (StringUtils.isBlank(ticket)) {
            recordHandshakeFailure("missing_ticket");
            log.warn("WebSocket connection rejected: missing ticket");
            response.setStatusCode(HttpStatus.UNAUTHORIZED);
            return false;
        }

        String userIdFromUrl = extractUserIdFromUrl(httpRequest.getRequestURI());
        Long expectedUserId = parseUserId(userIdFromUrl);
        if (expectedUserId == null) {
            recordHandshakeFailure("invalid_user");
            log.warn("WebSocket connection rejected: invalid userId path");
            response.setStatusCode(HttpStatus.BAD_REQUEST);
            return false;
        }

        WsTicketConsumeResultDTO result = consumeWsTicket(ticket, expectedUserId);
        if (result == null || !result.isValid()) {
            String error = result == null ? "ticket validation failed" : result.getError();
            recordHandshakeFailure(result == null ? "consume_error" : (isUserMismatch(result) ? "ticket_mismatch" : "ticket_invalid"));
            log.warn("WebSocket connection rejected: userId={}, reason={}", expectedUserId, error);
            response.setStatusCode(isUserMismatch(result) ? HttpStatus.FORBIDDEN : HttpStatus.UNAUTHORIZED);
            return false;
        }

        attributes.put("userId", userIdFromUrl);
        clearWsTicketCookie(response, httpRequest);
        recordHandshakeSuccess();
        return true;
    }

    private WsTicketConsumeResultDTO consumeWsTicket(String ticket, Long userId) {
        try {
            ConsumeWsTicketRequest request = new ConsumeWsTicketRequest();
            request.setTicket(ticket);
            request.setUserId(userId);
            return authServiceFeignClient.consumeWsTicket(request);
        } catch (Exception e) {
            log.warn("Failed to consume ws ticket: {}", e.getMessage());
            return null;
        }
    }

    private boolean isUserMismatch(WsTicketConsumeResultDTO result) {
        return result != null
                && result.getError() != null
                && result.getError().contains("userId");
    }

    private String extractTicket(HttpServletRequest httpRequest) {
        String cookieTicket = AuthCookieUtil.getCookieValue(httpRequest, wsTicketCookieName);
        if (StringUtils.isNotBlank(cookieTicket)) {
            return cookieTicket;
        }
        return httpRequest.getParameter("ticket");
    }

    private void clearWsTicketCookie(ServerHttpResponse response, HttpServletRequest request) {
        boolean secure = AuthCookieUtil.resolveSecure(request, authCookieSecure);
        response.getHeaders().add(
                HttpHeaders.SET_COOKIE,
                AuthCookieUtil.clearCookie(
                        wsTicketCookieName,
                        secure,
                        authCookieSameSite,
                        wsTicketCookiePath
                ).toString()
        );
    }

    private boolean isOriginAllowed(String origin) {
        if (StringUtils.isBlank(origin)) {
            return true;
        }
        for (String allowedOrigin : resolveAllowedOrigins()) {
            if ("*".equals(allowedOrigin) || origin.equalsIgnoreCase(allowedOrigin)) {
                return true;
            }
        }
        return false;
    }

    private String[] resolveAllowedOrigins() {
        if (StringUtils.isBlank(allowedOrigins)) {
            return new String[0];
        }
        return java.util.Arrays.stream(allowedOrigins.split(","))
                .map(String::trim)
                .filter(StringUtils::isNotBlank)
                .toArray(String[]::new);
    }

    private Long parseUserId(String userIdFromUrl) {
        if (StringUtils.isBlank(userIdFromUrl)) {
            return null;
        }
        try {
            return Long.valueOf(userIdFromUrl);
        } catch (NumberFormatException ex) {
            return null;
        }
    }

    private String extractUserIdFromUrl(String requestUri) {
        if (StringUtils.isBlank(requestUri)) {
            return null;
        }
        int idx = requestUri.lastIndexOf('/');
        if (idx < 0 || idx == requestUri.length() - 1) {
            return null;
        }
        String tail = requestUri.substring(idx + 1);
        int qIdx = tail.indexOf('?');
        if (qIdx >= 0) {
            tail = tail.substring(0, qIdx);
        }
        return tail;
    }

    private void recordHandshakeSuccess() {
        if (metrics != null) {
            metrics.recordHandshakeSuccess();
        }
    }

    private void recordHandshakeFailure(String reason) {
        if (metrics != null) {
            metrics.recordHandshakeFailure(reason);
        }
    }

    @Override
    public void afterHandshake(ServerHttpRequest request, ServerHttpResponse response,
                               WebSocketHandler wsHandler, Exception exception) {
    }
}
