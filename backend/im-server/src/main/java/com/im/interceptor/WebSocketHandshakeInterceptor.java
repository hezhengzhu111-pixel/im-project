package com.im.interceptor;

import com.im.dto.WsTicketConsumeResultDTO;
import com.im.dto.request.ConsumeWsTicketRequest;
import com.im.feign.AuthServiceFeignClient;
import jakarta.servlet.http.HttpServletRequest;
import lombok.extern.slf4j.Slf4j;
import org.apache.commons.lang3.StringUtils;
import org.springframework.beans.factory.annotation.Autowired;
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

    @Autowired
    private AuthServiceFeignClient authServiceFeignClient;

    @Override
    public boolean beforeHandshake(ServerHttpRequest request, ServerHttpResponse response,
                                   WebSocketHandler wsHandler, Map<String, Object> attributes) {
        if (!(request instanceof ServletServerHttpRequest servletRequest)) {
            return false;
        }

        HttpServletRequest httpRequest = servletRequest.getServletRequest();
        String ticket = extractTicket(httpRequest);
        if (StringUtils.isBlank(ticket)) {
            log.warn("WebSocket connection rejected: missing ticket");
            response.setStatusCode(HttpStatus.UNAUTHORIZED);
            return false;
        }

        String userIdFromUrl = extractUserIdFromUrl(httpRequest.getRequestURI());
        Long expectedUserId = parseUserId(userIdFromUrl);
        if (expectedUserId == null) {
            log.warn("WebSocket connection rejected: invalid userId path");
            response.setStatusCode(HttpStatus.BAD_REQUEST);
            return false;
        }

        WsTicketConsumeResultDTO result = consumeWsTicket(ticket, expectedUserId);
        if (result == null || !result.isValid()) {
            String error = result == null ? "ticket validation failed" : result.getError();
            log.warn("WebSocket connection rejected: {}", error);
            response.setStatusCode(isUserMismatch(result) ? HttpStatus.FORBIDDEN : HttpStatus.UNAUTHORIZED);
            return false;
        }

        attributes.put("userId", userIdFromUrl);
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
        return httpRequest.getParameter("ticket");
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

    @Override
    public void afterHandshake(ServerHttpRequest request, ServerHttpResponse response,
                               WebSocketHandler wsHandler, Exception exception) {
    }
}
