package com.im.handler;

import com.im.dto.MessageDTO;
import com.im.dto.UserDTO;
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

import java.util.ArrayList;
import java.util.List;

@Component
public class PrivateMessageHandler extends AbstractMessageHandler<PrivateMessageHandler.PrivateMessageContext> {

    private static final String EVENT_TYPE_MESSAGE = "MESSAGE";

    private final UserServiceFeignClient userServiceFeignClient;
    private final UserProfileCache userProfileCache;

    @Value("${im.outbox.topic.private-message:PRIVATE_MESSAGE}")
    private String privateMessageTopic;

    @Value("${im.message.system.sender-id:0}")
    private Long defaultSystemSenderId;

    public PrivateMessageHandler(MessageMapper messageMapper,
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
    public boolean supports(SendMessageCommand command) {
        return command != null && !command.isGroup();
    }

    @Override
    protected PrivateMessageContext buildContext(SendMessageCommand command) {
        Long receiverId = command.getReceiverId();
        if (command.isSystemMessage()) {
            Long actualSenderId = command.getSenderId() == null ? defaultSystemSenderId : command.getSenderId();
            validateMessageContent(command.getMessageType(), command.getContent(), command.getMediaUrl());
            if (!Boolean.TRUE.equals(userServiceFeignClient.exists(receiverId))) {
                throw new BusinessException("receiver user not exists");
            }
            return new PrivateMessageContext(
                    actualSenderId,
                    receiverId,
                    userProfileCache.getUser(actualSenderId),
                    userProfileCache.getUser(receiverId),
                    true
            );
        }

        Long senderId = command.getSenderId();
        UserDTO sender = userProfileCache.getUser(senderId);
        UserDTO receiver = userProfileCache.getUser(receiverId);
        if (sender == null || receiver == null) {
            throw new BusinessException("user not found");
        }
        if (!Boolean.TRUE.equals(userProfileCache.isFriend(senderId, receiverId))) {
            throw new BusinessException("receiver is not a friend");
        }
        validateMessageContent(command.getMessageType(), command.getContent(), command.getMediaUrl());
        requireClientMessageId(command.getClientMessageId());
        return new PrivateMessageContext(senderId, receiverId, sender, receiver, false);
    }

    @Override
    protected String buildLockKey(SendMessageCommand command, PrivateMessageContext context) {
        if (context.systemMessage()) {
            return buildConversationLockKey(true, context.actualSenderId(), context.receiverId());
        }
        return buildSendMessageLockKey(context.actualSenderId(), command.getClientMessageId());
    }

    @Override
    protected SendTxResult doInTransaction(SendMessageCommand command, PrivateMessageContext context) {
        if (!context.systemMessage()) {
            Message existingMessage = findExistingMessageByClientMessageId(context.actualSenderId(), command.getClientMessageId());
            if (existingMessage != null) {
                return new SendTxResult(existingMessage, false);
            }
        }

        Message message = createBaseMessage(command, context.actualSenderId());
        message.setReceiverId(context.receiverId());
        message.setIsGroupChat(false);
        persistMessage(message, context.receiverId());
        enqueuePrivateMessage(message, context);
        return new SendTxResult(message, true);
    }

    @Override
    protected void afterTransaction(SendMessageCommand command, PrivateMessageContext context, SendTxResult txResult) {
        if (txResult.created()) {
            clearConversationCache(context.actualSenderId(), context.receiverId(), true);
        }
    }

    @Override
    protected MessageDTO buildResult(SendMessageCommand command, PrivateMessageContext context, Message message) {
        String senderName = context.systemMessage() && context.sender() == null
                ? "SYSTEM"
                : context.sender() == null ? null : context.sender().getUsername();
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
        return command.isSystemMessage() ? "failed to send system message" : "failed to send message";
    }

    private void enqueuePrivateMessage(Message message, PrivateMessageContext context) {
        MessageDTO messageDTO = buildResult(null, context, message);
        String payload = com.alibaba.fastjson2.JSON.toJSONString(messageDTO);
        String key = buildPrivateConversationKey(context.actualSenderId(), context.receiverId());
        outboxService.enqueueAfterCommit(
                privateMessageTopic,
                EVENT_TYPE_MESSAGE,
                key,
                payload,
                message.getId(),
                privateMessageTargets(context)
        );
    }

    private List<Long> privateMessageTargets(PrivateMessageContext context) {
        List<Long> targetUserIds = new ArrayList<>(2);
        targetUserIds.add(context.receiverId());
        if (!context.systemMessage()) {
            targetUserIds.add(context.actualSenderId());
        }
        return normalizeMessageTargets(targetUserIds);
    }

    record PrivateMessageContext(
            Long actualSenderId,
            Long receiverId,
            UserDTO sender,
            UserDTO receiver,
            boolean systemMessage
    ) {
    }
}
