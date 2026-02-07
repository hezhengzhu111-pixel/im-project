package com.im.listener;

import com.alibaba.fastjson2.JSON;
import com.alibaba.fastjson2.JSONWriter;
import com.im.dto.GroupMemberDTO;
import com.im.dto.MessageDTO;
import com.im.dto.ReadReceiptDTO;
import com.im.entity.UserSession;
import com.im.service.IImService;
import com.im.service.MessageRetryQueue;
import com.im.service.ProcessedMessageDeduplicator;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.kafka.annotation.KafkaListener;
import org.springframework.kafka.support.Acknowledgment;
import org.springframework.kafka.support.KafkaHeaders;
import org.springframework.messaging.handler.annotation.Header;
import org.springframework.stereotype.Component;
import org.springframework.web.socket.TextMessage;
import org.springframework.beans.factory.annotation.Qualifier;

import java.util.HashMap;
import java.util.Map;
import java.util.concurrent.Executor;

@Slf4j
@Component
public class KafkaMessageListener {

    @Autowired
    private IImService imService;

    @Autowired
    private MessageRetryQueue retryQueue;

    @Autowired
    private ProcessedMessageDeduplicator deduplicator;

    @Autowired
    @Qualifier("imServerExecutor")
    private Executor executor;

    @KafkaListener(topics = "im-private-message-topic", groupId = "im-private-message-group", 
                   containerFactory = "kafkaListenerContainerFactory")
    public void handlePrivateMessage(String message, 
                                   @Header(KafkaHeaders.RECEIVED_PARTITION) int partition,
                                   @Header(KafkaHeaders.OFFSET) long offset,
                                   Acknowledgment acknowledgment) {
        try {
            log.debug("接收私聊消息: partition={}, offset={}", partition, offset);

            MessageDTO msg;
            try {
                msg = JSON.parseObject(message, MessageDTO.class);
            } catch (Exception parseError) {
                log.error("私聊消息反序列化失败: partition={}, offset={}, payload={}", partition, offset, message, parseError);
                return;
            }

            if (msg != null && msg.getId() != null) {
                String key = String.valueOf(msg.getId()) + ":" + String.valueOf(msg.getStatus());
                if (!deduplicator.tryMarkProcessed(key)) {
                    log.debug("重复私聊消息已忽略: key={}, partition={}, offset={}", key, partition, offset);
                    return;
                }
            }

            executor.execute(() -> {
                try {
                    pushToUser(msg, msg.getReceiverId());
                    log.debug("私聊消息已处理: id={}, senderId={}, receiverId={}", msg.getId(), msg.getSenderId(), msg.getReceiverId());
                } catch (Exception e) {
                    log.error("私聊消息推送异常: id={}, payload={}", msg.getId(), message, e);
                }
            });
        } catch (Exception e) {
            log.error("处理私聊消息异常: {}", message, e);
            throw e;
        } finally {
            acknowledgment.acknowledge();
        }
    }

    @KafkaListener(topics = "im-group-message-topic", groupId = "im-group-message-group",
                   containerFactory = "kafkaListenerContainerFactory")
    public void handleGroupMessage(String message,
                                 @Header(KafkaHeaders.RECEIVED_PARTITION) int partition,
                                 @Header(KafkaHeaders.OFFSET) long offset,
                                 Acknowledgment acknowledgment) {
        try {
            log.debug("接收群聊消息: partition={}, offset={}", partition, offset);

            MessageDTO msg;
            try {
                msg = JSON.parseObject(message, MessageDTO.class);
            } catch (Exception parseError) {
                log.error("群聊消息反序列化失败: partition={}, offset={}, payload={}", partition, offset, message, parseError);
                return;
            }

            if (msg != null && msg.getId() != null) {
                String key = String.valueOf(msg.getId()) + ":" + String.valueOf(msg.getStatus());
                if (!deduplicator.tryMarkProcessed(key)) {
                    log.debug("重复群聊消息已忽略: key={}, partition={}, offset={}", key, partition, offset);
                    return;
                }
            }

            executor.execute(() -> {
                try {
                    pushGroupMessage(msg);
                    log.debug("群聊消息已处理: id={}, senderId={}, groupId={}", msg.getId(), msg.getSenderId(), msg.getGroupId());
                } catch (Exception e) {
                    log.error("群聊消息推送异常: id={}, payload={}", msg.getId(), message, e);
                }
            });
        } catch (Exception e) {
            log.error("处理群聊消息异常: {}", message, e);
            throw e;
        } finally {
            acknowledgment.acknowledge();
        }
    }

    @KafkaListener(topics = "im-read-receipt-topic", groupId = "im-read-receipt-group",
                   containerFactory = "kafkaListenerContainerFactory")
    public void handleReadReceipt(String message,
                                  @Header(KafkaHeaders.RECEIVED_PARTITION) int partition,
                                  @Header(KafkaHeaders.OFFSET) long offset,
                                  Acknowledgment acknowledgment) {
        try {
            ReadReceiptDTO receipt;
            try {
                receipt = JSON.parseObject(message, ReadReceiptDTO.class);
            } catch (Exception parseError) {
                log.error("已读回执反序列化失败: partition={}, offset={}, payload={}", partition, offset, message, parseError);
                return;
            }
            if (receipt == null || receipt.getToUserId() == null) {
                return;
            }
            executor.execute(() -> {
                try {
                    pushReadReceipt(receipt);
                } catch (Exception e) {
                    log.error("已读回执推送异常: payload={}", message, e);
                }
            });
        } catch (Exception e) {
            log.error("处理已读回执异常: {}", message, e);
            throw e;
        } finally {
            acknowledgment.acknowledge();
        }
    }

    private void pushGroupMessage(MessageDTO msg) {
        if (msg.getGroupMembers() == null) {
            return;
        }
        for (GroupMemberDTO member : msg.getGroupMembers()) {
            if (member == null || member.getUserId() == null) {
                continue;
            }
            if (member.getUserId().equals(msg.getSenderId())) {
                continue;
            }
            pushToUser(msg, member.getUserId());
        }
    }

    private void pushToUser(MessageDTO message, Long userId) {
        if (userId == null) return;
        String userIdStr = userId.toString();
        
        UserSession userSession = imService.getSessionUserMap().get(userIdStr);
        
        // 构造 WebSocket 消息格式
        Map<String, Object> wsMessage = new HashMap<>();
        wsMessage.put("type", "MESSAGE");
        wsMessage.put("data", message);
        wsMessage.put("timestamp", System.currentTimeMillis());
        
        String textMessage = JSON.toJSONString(wsMessage, JSONWriter.Feature.WriteLongAsString);

        if (userSession != null && userSession.getWebSocketSession() != null && userSession.getWebSocketSession().isOpen()) {
            try {
                userSession.getWebSocketSession().sendMessage(new TextMessage(textMessage));
                log.debug("消息已推送给用户: {} -> {}", message.getSenderId(), userIdStr);
            } catch (Exception e) {
                log.error("推送消息失败: {}", e.getMessage(), e);
                retryQueue.enqueue(userIdStr, message, e.getMessage());
            }
        } else {
            log.warn("用户 {} 不在线或连接断开，消息未推送", userIdStr);
            retryQueue.enqueue(userIdStr, message, "offline");
        }
    }

    private void pushReadReceipt(ReadReceiptDTO receipt) {
        Long userId = receipt.getToUserId();
        if (userId == null) return;
        String userIdStr = userId.toString();
        UserSession userSession = imService.getSessionUserMap().get(userIdStr);

        Map<String, Object> wsMessage = new HashMap<>();
        wsMessage.put("type", "READ_RECEIPT");
        wsMessage.put("data", receipt);
        wsMessage.put("timestamp", System.currentTimeMillis());

        String textMessage = JSON.toJSONString(wsMessage, JSONWriter.Feature.WriteLongAsString);

        if (userSession != null && userSession.getWebSocketSession() != null && userSession.getWebSocketSession().isOpen()) {
            try {
                userSession.getWebSocketSession().sendMessage(new TextMessage(textMessage));
            } catch (Exception e) {
                log.error("推送已读回执失败: {}", e.getMessage(), e);
            }
        }
    }
}
