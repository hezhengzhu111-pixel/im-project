package com.im.handler;

import com.im.dto.MessageDTO;
import com.im.dto.MessageEvent;
import com.im.dto.UserDTO;
import com.im.exception.BusinessException;
import com.im.message.entity.Message;
import com.im.service.command.SendMessageCommand;
import com.im.service.support.AcceptedMessageProjectionService;
import com.im.service.support.UserProfileCache;
import com.im.util.MessageConverter;
import com.im.utils.SnowflakeIdGenerator;
import org.springframework.data.redis.core.RedisTemplate;
import org.springframework.kafka.core.KafkaTemplate;
import org.springframework.stereotype.Component;

@Component
public class PrivateMessageHandler extends AbstractMessageHandler<PrivateMessageHandler.PrivateMessageContext> {

    private final UserProfileCache userProfileCache;

    public PrivateMessageHandler(RedisTemplate<String, Object> redisTemplate,
                                 KafkaTemplate<String, MessageEvent> kafkaTemplate,
                                 SnowflakeIdGenerator snowflakeIdGenerator,
                                 AcceptedMessageProjectionService acceptedMessageProjectionService,
                                 UserProfileCache userProfileCache) {
        super(redisTemplate, kafkaTemplate, snowflakeIdGenerator, acceptedMessageProjectionService);
        this.userProfileCache = userProfileCache;
    }

    @Override
    public boolean supports(com.im.enums.MessageType type) {
        return type != null && type != com.im.enums.MessageType.SYSTEM;
    }

    @Override
    protected PrivateMessageContext buildContext(SendMessageCommand command) {
        Long receiverId = command.getReceiverId();
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
        return new PrivateMessageContext(senderId, receiverId, sender, receiver);
    }

    @Override
    protected Message buildMessage(SendMessageCommand command, PrivateMessageContext context, Long messageId) {
        Message message = createBaseMessage(command, messageId, context.actualSenderId());
        message.setReceiverId(context.receiverId());
        message.setIsGroupChat(false);
        return message;
    }

    @Override
    protected String buildConversationId(SendMessageCommand command, PrivateMessageContext context, Message message) {
        return buildPrivateConversationKey(context.actualSenderId(), context.receiverId());
    }

    @Override
    protected MessageDTO buildResult(SendMessageCommand command, PrivateMessageContext context, Message message) {
        MessageDTO messageDTO = MessageConverter.convertToDTO(
                message,
                context.sender().getUsername(),
                context.sender().getAvatar(),
                context.receiver().getUsername(),
                context.receiver().getAvatar(),
                null
        );
        messageDTO.setGroup(false);
        return messageDTO;
    }

    @Override
    protected String transactionFailureMessage(SendMessageCommand command) {
        return "failed to send message";
    }

    record PrivateMessageContext(
            Long actualSenderId,
            Long receiverId,
            UserDTO sender,
            UserDTO receiver
    ) {
    }
}
