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

    private final List<WsMessageHandler> handlers;

    public void dispatch(WebSocketSession session, String userId, String payloadStr) {
        if (payloadStr == null || payloadStr.isBlank()) {
            return;
        }

        String type = "UNKNOWN";
        JSONObject json = null;

        if ("PING".equalsIgnoreCase(payloadStr) || "ping".equalsIgnoreCase(payloadStr)) {
            type = "HEARTBEAT";
        } else if (payloadStr.startsWith("{")) {
            try {
                json = JSON.parseObject(payloadStr);
                type = json.getString("type");
            } catch (Exception e) {
                log.warn("WebSocket消息解析失败: {}", payloadStr);
                return;
            }
        }

        for (WsMessageHandler handler : handlers) {
            if (handler.supports(type)) {
                handler.handle(session, userId, json);
                return;
            }
        }

        log.debug("未找到对应的WebSocket消息处理器: type={}", type);
    }
}
