package com.im.listener;

import com.alibaba.fastjson2.JSON;
import com.im.dto.MessageDTO;
import com.im.service.impl.ImServiceImpl;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.data.redis.connection.Message;
import org.springframework.data.redis.connection.MessageListener;
import org.springframework.stereotype.Component;

import java.nio.charset.StandardCharsets;

@Slf4j
@Component
@RequiredArgsConstructor
public class RedisMessageListener implements MessageListener {

    private final ImServiceImpl imService;
    private final com.im.service.ProcessedMessageDeduplicator deduplicator;

    @Override
    public void onMessage(Message message, byte[] pattern) {
        try {
            String payload = new String(message.getBody(), StandardCharsets.UTF_8);
            com.alibaba.fastjson2.JSONObject json = JSON.parseObject(payload);
            String type = json.getString("type");
            
            if ("MESSAGE".equals(type)) {
                MessageDTO messageDTO = json.getObject("data", MessageDTO.class);
                if (messageDTO != null && messageDTO.getId() != null) {
                    String key = messageDTO.getId() + ":" + messageDTO.getStatus();
                    if (!deduplicator.tryMarkProcessed(key)) {
                        log.debug("重复消息已忽略: key={}", key);
                        return;
                    }
                }
                if (messageDTO.isGroup()) {
                    imService.sendGroupMessage(messageDTO);
                } else {
                    imService.sendPrivateMessage(messageDTO);
                }
            } else if ("READ_RECEIPT".equals(type)) {
                com.im.dto.ReadReceiptDTO receipt = json.getObject("data", com.im.dto.ReadReceiptDTO.class);
                imService.pushReadReceipt(receipt);
            }
        } catch (Exception e) {
            log.error("RedisMessageListener 消费消息失败", e);
        }
    }
}
