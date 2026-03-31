package com.im.listener;

import com.im.service.WsPushEventDispatcher;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.data.redis.connection.Message;
import org.springframework.data.redis.connection.MessageListener;
import org.springframework.stereotype.Component;

import java.nio.charset.StandardCharsets;

@Slf4j
@Component
@RequiredArgsConstructor
public class WsPushRedisSubscriber implements MessageListener {

    private final WsPushEventDispatcher dispatcher;

    @Override
    public void onMessage(Message message, byte[] pattern) {
        if (message == null || message.getBody() == null) {
            return;
        }
        String raw = new String(message.getBody(), StandardCharsets.UTF_8);
        try {
            dispatcher.dispatchRaw(raw);
        } catch (Exception e) {
            log.error("Consume ws push event failed. payload={}", raw, e);
            throw e;
        }
    }
}
