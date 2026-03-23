package com.im.handler;

import com.alibaba.fastjson2.JSONObject;
import org.springframework.web.socket.WebSocketSession;

public interface WsMessageHandler {
    boolean supports(String type);
    void handle(WebSocketSession session, String userId, JSONObject payload);
}
