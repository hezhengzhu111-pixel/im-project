package com.im.handler;

import com.im.dto.MessageDTO;
import com.im.dto.UserDTO;
import com.im.enums.MessageType;
import com.im.exception.BusinessException;
import com.im.feign.UserServiceFeignClient;
import com.im.mapper.MessageMapper;
import com.im.message.entity.Message;
import com.im.service.OutboxService;
import com.im.service.command.SendMessageCommand;
import com.im.service.support.UserProfileCache;
import com.im.util.MessageConverter;
import org.redisson.api.RedissonClient;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.data.redis.core.RedisTemplate;
import org.springframework.stereotype.Component;
import org.springframework.transaction.support.TransactionTemplate;

import java.util.List;

@Component
public class SystemMessageHandler extends AbstractMessageHandler<SystemMessageHandler.SystemMessageContext> {

    private static final String EVENT_TYPE_MESSAGE = "MESSAGE";

    private final UserServiceFeignClient userServiceFeignClient;
    private final UserProfileCache userProfileCache;

    @Value("${im.outbox.topic.private-message:PRIVATE_MESSAGE}")
    private String privateMessageTopic;

    @Value("${im.message.system.sender-id:0}")
    private Long defaultSystemSenderId;

    public SystemMessageHandler(MessageMapper messageMapper,
                                RedisTemplate<String, Object> redisTemplate,
                                OutboxService outboxService,
                                RedissonClient redissonClient,
                                TransactionTemplate transactionTemplate,
                                UserServiceFeignClient userServiceFeignClient,
                                UserProfileCache userProfileCache) {
        super(messageMapper, redisTemplate, outboxService, redissonClient, transactionTemplate);
        this.userServiceFeignClient = userServiceFeignClient;
        this.userProfileCache = userProfileCache;
    }

    @Override
    public boolean supports(MessageType type) {
        return MessageType.SYSTEM == type;
    }

    @Override
    protected SystemMessageContext buildContext(SendMessageCommand command) {
        Long receiverId = command.getReceiverId();
        Long actualSenderId = command.getSenderId() == null ? defaultSystemSenderId : command.getSenderId();
        validateMessageContent(command.getMessageType(), command.getContent(), command.getMediaUrl());
        if (!Boolean.TRUE.equals(userServiceFeignClient.exists(receiverId))) {
            throw new BusinessException("receiver user not exists");
        }
        return new SystemMessageContext(
                actualSenderId,
                receiverId,
                userProfileCache.getUser(actualSenderId),
                userProfileCache.getUser(receiverId)
        );
    }

    @Override
    protected String buildLockKey(SendMessageCommand command, SystemMessageContext context) {
        return buildConversationLockKey(true, context.actualSenderId(), context.receiverId());
    }

    @Override
    protected SendTxResult doInTransaction(SendMessageCommand command, SystemMessageContext context) {
        Message message = createBaseMessage(command, context.actualSenderId());
        message.setReceiverId(context.receiverId());
        message.setIsGroupChat(false);
        persistMessage(message, context.receiverId());
        enqueueSystemMessage(message, context);
        return new SendTxResult(message, true);
    }

    @Override
    protected void afterTransaction(SendMessageCommand command, SystemMessageContext context, SendTxResult txResult) {
        if (txResult.created()) {
            clearConversationCache(context.actualSenderId(), context.receiverId(), true);
        }
    }

    @Override
    protected MessageDTO buildResult(SendMessageCommand command, SystemMessageContext context, Message message) {
        String senderName = context.sender() == null ? "SYSTEM" : context.sender().getUsername();
        MessageDTO messageDTO = MessageConverter.convertToDTO(
                message,
                senderName,
                context.sender() == null ? null : context.sender().getAvatar(),
                context.receiver() == null ? null : context.receiver().getUsername(),
                context.receiver() == null ? null : context.receiver().getAvatar(),
                null
        );
        messageDTO.setGroup(false);
        return messageDTO;
    }

    @Override
    protected String transactionFailureMessage(SendMessageCommand command) {
        return "failed to send system message";
    }

    private void enqueueSystemMessage(Message message, SystemMessageContext context) {
        MessageDTO messageDTO = buildResult(null, context, message);
        String payload = com.alibaba.fastjson2.JSON.toJSONString(messageDTO);
        String key = buildPrivateConversationKey(context.actualSenderId(), context.receiverId());
        outboxService.enqueueAfterCommit(
                privateMessageTopic,
                EVENT_TYPE_MESSAGE,
                key,
                payload,
                message.getId(),
                List.of(context.receiverId())
        );
    }

    record SystemMessageContext(
            Long actualSenderId,
            Long receiverId,
            UserDTO sender,
            UserDTO receiver
    ) {
    }
}
