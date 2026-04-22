package com.im.handler;

import com.alibaba.fastjson2.JSON;
import com.alibaba.fastjson2.JSONObject;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;
import org.springframework.web.socket.WebSocketSession;

import java.util.List;

@Slf4j
@Component
@RequiredArgsConstructor
public class WsMessageDispatcher {

    private static final String HEARTBEAT_TYPE = "HEARTBEAT";

    private final List<WsMessageHandler> handlers;

    public DispatchResult dispatch(WebSocketSession session, String userId, String payloadStr) {
        if (payloadStr == null || payloadStr.isBlank()) {
            return DispatchResult.EMPTY_PAYLOAD;
        }

        String type = "UNKNOWN";
        JSONObject json = null;

        if ("PING".equalsIgnoreCase(payloadStr)) {
            type = HEARTBEAT_TYPE;
        } else if (payloadStr.startsWith("{")) {
            try {
                json = JSON.parseObject(payloadStr);
                type = json.getString("type");
            } catch (Exception e) {
                log.warn("WebSocket message parse failed: {}", payloadStr);
                return DispatchResult.INVALID_PAYLOAD;
            }
        }

        for (WsMessageHandler handler : handlers) {
            if (handler.supports(type)) {
                handler.handle(session, userId, json);
                return HEARTBEAT_TYPE.equalsIgnoreCase(type)
                        ? DispatchResult.HEARTBEAT_OK
                        : DispatchResult.BUSINESS_OK;
            }
        }

        log.debug("No matching WebSocket message handler. type={}", type);
        return DispatchResult.UNSUPPORTED_TYPE;
    }

    public enum DispatchResult {
        HEARTBEAT_OK,
        BUSINESS_OK,
        INVALID_PAYLOAD,
        UNSUPPORTED_TYPE,
        EMPTY_PAYLOAD
    }
}
