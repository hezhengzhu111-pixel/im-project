package com.im.interceptor;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.im.dto.WsTicketConsumeResultDTO;
import com.im.dto.request.ConsumeWsTicketRequest;
import com.im.enums.CommonErrorCode;
import com.im.feign.AuthServiceFeignClient;
import com.im.metrics.ImServerMetrics;
import com.im.util.ApiErrorResponseWriter;
import com.im.util.AuthCookieUtil;
import jakarta.servlet.http.HttpServletRequest;
import lombok.extern.slf4j.Slf4j;
import org.apache.commons.lang3.StringUtils;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpHeaders;
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
    private final ObjectMapper objectMapper = new ObjectMapper();

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
            return reject(response, CommonErrorCode.INTERNAL_AUTH_REJECTED, "unsupported_request",
                    "WebSocket connection rejected. errorCode={}, reason=unsupported_request",
                    CommonErrorCode.INTERNAL_AUTH_REJECTED.getMessage());
        }

        HttpServletRequest httpRequest = servletRequest.getServletRequest();
        String origin = httpRequest.getHeader(HttpHeaders.ORIGIN);
        if (StringUtils.isBlank(origin) && !allowBlankOrigin) {
            return reject(response, CommonErrorCode.WS_ORIGIN_NOT_ALLOWED, "origin_denied",
                    "WebSocket connection rejected. errorCode={}, origin=blank",
                    CommonErrorCode.WS_ORIGIN_NOT_ALLOWED.getMessage());
        }
        if (StringUtils.isNotBlank(origin) && !isOriginAllowed(origin)) {
            return reject(response, CommonErrorCode.WS_ORIGIN_NOT_ALLOWED, "origin_denied",
                    "WebSocket connection rejected. errorCode={}, origin={}",
                    CommonErrorCode.WS_ORIGIN_NOT_ALLOWED.getMessage(), origin);
        }

        TicketResolution ticketResolution = resolveTicket(httpRequest);
        if (ticketResolution.queryRejected()) {
            return reject(response, CommonErrorCode.WS_QUERY_TICKET_NOT_ALLOWED, "missing_ticket",
                    "WebSocket connection rejected. errorCode={}, source=query",
                    CommonErrorCode.WS_QUERY_TICKET_NOT_ALLOWED.getMessage());
        }
        String ticket = ticketResolution.ticket();
        if (StringUtils.isBlank(ticket)) {
            return reject(response, CommonErrorCode.WS_TICKET_INVALID_OR_EXPIRED, "missing_ticket",
                    "WebSocket connection rejected. errorCode={}, ticketSummary=missing",
                    CommonErrorCode.WS_TICKET_INVALID_OR_EXPIRED.getMessage());
        }

        Long expectedUserId = extractTrustedUserId(httpRequest);
        if (expectedUserId == null) {
            return reject(response, CommonErrorCode.INTERNAL_AUTH_REJECTED, "invalid_user",
                    "WebSocket connection rejected. errorCode={}, ticketSummary={}",
                    CommonErrorCode.INTERNAL_AUTH_REJECTED.getMessage(), summarizeSecret(ticket));
        }

        WsTicketConsumeResultDTO result = consumeWsTicket(ticket, expectedUserId);
        if (result == null || !result.isValid()) {
            CommonErrorCode errorCode = isUserMismatch(result)
                    ? CommonErrorCode.INTERNAL_AUTH_REJECTED
                    : CommonErrorCode.WS_TICKET_INVALID_OR_EXPIRED;
            String reason = result == null ? "consume_error" : (isUserMismatch(result) ? "ticket_mismatch" : "ticket_invalid");
            log.debug("WebSocket rejection detail. errorCode={}, reason={}, userId={}, ticketSummary={}, status={}, error={}",
                    errorCode.getMessage(),
                    reason,
                    expectedUserId,
                    summarizeSecret(ticket),
                    result == null ? null : result.getStatus(),
                    result == null ? null : result.getError());
            return reject(response, errorCode, reason,
                    "WebSocket connection rejected. errorCode={}, reason={}, userId={}, ticketSummary={}",
                    errorCode.getMessage(), reason, expectedUserId, summarizeSecret(ticket));
        }
        if (result.getUserId() == null) {
            log.debug("WebSocket rejection detail. errorCode={}, reason=consume_error, userId={}, ticketSummary={}, status={}",
                    CommonErrorCode.WS_TICKET_INVALID_OR_EXPIRED.getMessage(),
                    expectedUserId,
                    summarizeSecret(ticket),
                    result.getStatus());
            return reject(response, CommonErrorCode.WS_TICKET_INVALID_OR_EXPIRED, "consume_error",
                    "WebSocket connection rejected. errorCode={}, reason=consume_error, userId={}, ticketSummary={}",
                    CommonErrorCode.WS_TICKET_INVALID_OR_EXPIRED.getMessage(), expectedUserId, summarizeSecret(ticket));
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

    private TicketResolution resolveTicket(HttpServletRequest httpRequest) {
        String cookieTicket = AuthCookieUtil.getCookieValue(httpRequest, wsTicketCookieName);
        if (StringUtils.isNotBlank(cookieTicket)) {
            return new TicketResolution(cookieTicket, false);
        }
        String queryTicket = httpRequest == null ? null : httpRequest.getParameter("ticket");
        if (StringUtils.isNotBlank(queryTicket) && !allowQueryTicket) {
            return new TicketResolution(null, true);
        }
        if (allowQueryTicket && StringUtils.isNotBlank(queryTicket)) {
            return new TicketResolution(queryTicket, false);
        }
        return new TicketResolution(null, false);
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

    private boolean reject(ServerHttpResponse response,
                           CommonErrorCode errorCode,
                           String metricReason,
                           String logMessage,
                           Object... logArgs) {
        recordHandshakeFailure(metricReason);
        log.warn(logMessage, logArgs);
        ApiErrorResponseWriter.writeServerError(objectMapper, response, errorCode);
        return false;
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

    private record TicketResolution(String ticket, boolean queryRejected) {
    }
}
