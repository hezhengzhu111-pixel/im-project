package com.im.handler;

import com.im.dto.MessageDTO;
import com.im.dto.MessageEvent;
import com.im.dto.UserDTO;
import com.im.enums.MessageType;
import com.im.exception.BusinessException;
import com.im.feign.UserServiceFeignClient;
import com.im.message.entity.Message;
import com.im.service.command.SendMessageCommand;
import com.im.service.support.AcceptedMessageProjectionService;
import com.im.service.support.UserProfileCache;
import com.im.util.MessageConverter;
import com.im.utils.SnowflakeIdGenerator;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.data.redis.core.RedisTemplate;
import org.springframework.kafka.core.KafkaTemplate;
import org.springframework.stereotype.Component;

@Component
public class SystemMessageHandler extends AbstractMessageHandler<SystemMessageHandler.SystemMessageContext> {

    private final UserServiceFeignClient userServiceFeignClient;
    private final UserProfileCache userProfileCache;

    @Value("${im.message.system.sender-id:0}")
    private Long defaultSystemSenderId;

    public SystemMessageHandler(RedisTemplate<String, Object> redisTemplate,
                                KafkaTemplate<String, MessageEvent> kafkaTemplate,
                                SnowflakeIdGenerator snowflakeIdGenerator,
                                AcceptedMessageProjectionService acceptedMessageProjectionService,
                                UserServiceFeignClient userServiceFeignClient,
                                UserProfileCache userProfileCache) {
        super(redisTemplate, kafkaTemplate, snowflakeIdGenerator, acceptedMessageProjectionService);
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
    protected Message buildMessage(SendMessageCommand command, SystemMessageContext context, Long messageId) {
        Message message = createBaseMessage(command, messageId, context.actualSenderId());
        if (!org.springframework.util.StringUtils.hasText(message.getClientMessageId())) {
            message.setClientMessageId("sys-" + messageId);
        }
        message.setReceiverId(context.receiverId());
        message.setIsGroupChat(false);
        return message;
    }

    @Override
    protected String buildConversationId(SendMessageCommand command, SystemMessageContext context, Message message) {
        return buildPrivateConversationKey(context.actualSenderId(), context.receiverId());
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

    record SystemMessageContext(
            Long actualSenderId,
            Long receiverId,
            UserDTO sender,
            UserDTO receiver
    ) {
    }
}
