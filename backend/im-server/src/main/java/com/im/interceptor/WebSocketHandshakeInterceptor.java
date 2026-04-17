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

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
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

    @Value("${im.auth.cookie.ws-ticket-same-site:Lax}")
    private String wsTicketCookieSameSite;

    @Value("${im.auth.cookie.ws-ticket-secure:auto}")
    private String wsTicketCookieSecure;

    @Value("${im.gateway.user-id-header:X-User-Id}")
    private String gatewayUserIdHeader;

    @Value("${im.websocket.allowed-origins:" + DEFAULT_ALLOWED_ORIGINS + "}")
    private String allowedOrigins;

    @Value("${im.websocket.allow-blank-origin:false}")
    private boolean allowBlankOrigin;

    @Value("${im.websocket.allow-query-ticket:false}")
    private boolean allowQueryTicket;

    @Override
    public boolean beforeHandshake(ServerHttpRequest request, ServerHttpResponse response,
                                   WebSocketHandler wsHandler, Map<String, Object> attributes) {
        if (!(request instanceof ServletServerHttpRequest servletRequest)) {
            recordHandshakeFailure("unsupported_request");
            return false;
        }

        HttpServletRequest httpRequest = servletRequest.getServletRequest();
        String origin = httpRequest.getHeader(HttpHeaders.ORIGIN);
        if (StringUtils.isBlank(origin) && !allowBlankOrigin) {
            recordHandshakeFailure("origin_denied");
            log.warn("WebSocket connection rejected: blank origin not allowed");
            response.setStatusCode(HttpStatus.FORBIDDEN);
            return false;
        }
        if (StringUtils.isNotBlank(origin) && !isOriginAllowed(origin)) {
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

        Long expectedUserId = extractTrustedUserId(httpRequest);
        if (expectedUserId == null) {
            recordHandshakeFailure("invalid_user");
            log.warn("WebSocket connection rejected: trusted userId missing or invalid");
            response.setStatusCode(HttpStatus.UNAUTHORIZED);
            return false;
        }

        WsTicketConsumeResultDTO result = consumeWsTicket(ticket, expectedUserId);
        if (result == null || !result.isValid()) {
            String reason = result == null ? "consume_error" : (isUserMismatch(result) ? "ticket_mismatch" : "ticket_invalid");
            recordHandshakeFailure(reason);
            log.warn("WebSocket connection rejected. reason={}, userId={}, ticketSummary={}",
                    reason, expectedUserId, summarizeSecret(ticket));
            log.debug("WebSocket rejection detail. reason={}, userId={}, ticketSummary={}, status={}, error={}",
                    reason,
                    expectedUserId,
                    summarizeSecret(ticket),
                    result == null ? null : result.getStatus(),
                    result == null ? null : result.getError());
            response.setStatusCode(isUserMismatch(result) ? HttpStatus.FORBIDDEN : HttpStatus.UNAUTHORIZED);
            return false;
        }
        if (result.getUserId() == null) {
            recordHandshakeFailure("consume_error");
            log.warn("WebSocket connection rejected. reason=consume_error, userId={}, ticketSummary={}",
                    expectedUserId, summarizeSecret(ticket));
            log.debug("WebSocket rejection detail. reason=consume_error, userId={}, ticketSummary={}, status={}",
                    expectedUserId, summarizeSecret(ticket), result.getStatus());
            response.setStatusCode(HttpStatus.UNAUTHORIZED);
            return false;
        }

        attributes.put("userId", String.valueOf(result.getUserId()));
        attributes.put("username", result.getUsername());
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
            log.warn("Failed to consume ws ticket. userId={}, ticketSummary={}, errorType={}",
                    userId, summarizeSecret(ticket), e.getClass().getSimpleName());
            log.debug("Failed to consume ws ticket detail. userId={}, ticketSummary={}",
                    userId, summarizeSecret(ticket), e);
            return null;
        }
    }

    private boolean isUserMismatch(WsTicketConsumeResultDTO result) {
        return result != null
                && (WsTicketConsumeResultDTO.STATUS_USER_MISMATCH.equals(result.getStatus())
                || (result.getError() != null && result.getError().contains("userId")));
    }

    private String extractTicket(HttpServletRequest httpRequest) {
        String cookieTicket = AuthCookieUtil.getCookieValue(httpRequest, wsTicketCookieName);
        if (StringUtils.isNotBlank(cookieTicket)) {
            return cookieTicket;
        }
        if (!allowQueryTicket) {
            return null;
        }
        return httpRequest.getParameter("ticket");
    }

    private void clearWsTicketCookie(ServerHttpResponse response, HttpServletRequest request) {
        boolean secure = AuthCookieUtil.resolveSecure(request, wsTicketCookieSecure);
        response.getHeaders().add(
                HttpHeaders.SET_COOKIE,
                AuthCookieUtil.clearCookie(
                        wsTicketCookieName,
                        secure,
                        wsTicketCookieSameSite,
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

    private Long extractTrustedUserId(HttpServletRequest httpRequest) {
        if (httpRequest == null || StringUtils.isBlank(gatewayUserIdHeader)) {
            return null;
        }
        String rawUserId = httpRequest.getHeader(gatewayUserIdHeader);
        if (StringUtils.isBlank(rawUserId)) {
            return null;
        }
        try {
            return Long.valueOf(rawUserId.trim());
        } catch (NumberFormatException ex) {
            return null;
        }
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

    private String summarizeSecret(String value) {
        if (StringUtils.isBlank(value)) {
            return "missing";
        }
        try {
            byte[] digest = MessageDigest.getInstance("SHA-256").digest(value.trim().getBytes(StandardCharsets.UTF_8));
            StringBuilder sb = new StringBuilder();
            for (int i = 0; i < Math.min(6, digest.length); i++) {
                sb.append(String.format("%02x", digest[i]));
            }
            return "sha256:" + sb + ",len=" + value.trim().length();
        } catch (Exception e) {
            return "len=" + value.trim().length();
        }
    }

    @Override
    public void afterHandshake(ServerHttpRequest request, ServerHttpResponse response,
                               WebSocketHandler wsHandler, Exception exception) {
    }
}
