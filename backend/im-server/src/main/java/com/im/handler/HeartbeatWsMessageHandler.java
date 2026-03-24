package com.im.handler;

import com.alibaba.fastjson2.JSON;
import org.springframework.stereotype.Component;
import org.springframework.web.socket.TextMessage;
import org.springframework.web.socket.WebSocketSession;

import java.util.HashMap;
import java.util.Map;

@Component
public class HeartbeatWsMessageHandler implements WsMessageHandler {

    @Override
    public boolean supports(String type) {
        return "HEARTBEAT".equalsIgnoreCase(type) || "PING".equalsIgnoreCase(type);
    }

    @Override
    public void handle(WebSocketSession session, String userId, com.alibaba.fastjson2.JSONObject payload) {
        try {
            if (session.isOpen()) {
                Map<String, String> response = new HashMap<>();
                response.put("type", "HEARTBEAT");
                response.put("content", "PONG");
                session.sendMessage(new TextMessage(JSON.toJSONString(response)));
            }
        } catch (Exception e) {
            // log error
        }
    }
}
