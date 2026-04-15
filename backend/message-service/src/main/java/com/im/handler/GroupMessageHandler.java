package com.im.handler;

import com.im.dto.MessageDTO;
import com.im.dto.MessageEvent;
import com.im.dto.UserDTO;
import com.im.exception.BusinessException;
import com.im.feign.GroupServiceFeignClient;
import com.im.message.entity.Message;
import com.im.service.command.SendMessageCommand;
import com.im.service.support.UserProfileCache;
import com.im.util.MessageConverter;
import com.im.utils.SnowflakeIdGenerator;
import org.springframework.data.redis.core.RedisTemplate;
import org.springframework.kafka.core.KafkaTemplate;
import org.springframework.stereotype.Component;

@Component
public class GroupMessageHandler extends AbstractMessageHandler<GroupMessageHandler.GroupMessageContext> {

    private final GroupServiceFeignClient groupServiceFeignClient;
    private final UserProfileCache userProfileCache;

    public GroupMessageHandler(RedisTemplate<String, Object> redisTemplate,
                               KafkaTemplate<String, MessageEvent> kafkaTemplate,
                               SnowflakeIdGenerator snowflakeIdGenerator,
                               GroupServiceFeignClient groupServiceFeignClient,
                               UserProfileCache userProfileCache) {
        super(redisTemplate, kafkaTemplate, snowflakeIdGenerator);
        this.groupServiceFeignClient = groupServiceFeignClient;
        this.userProfileCache = userProfileCache;
    }

    @Override
    public boolean supports(com.im.enums.MessageType type) {
        return type != null && type != com.im.enums.MessageType.SYSTEM;
    }

    @Override
    protected GroupMessageContext buildContext(SendMessageCommand command) {
        Long senderId = command.getSenderId();
        Long groupId = command.getGroupId();
        UserDTO sender = userProfileCache.getUser(senderId);
        if (sender == null) {
            throw new BusinessException("user not found");
        }
        if (!Boolean.TRUE.equals(groupServiceFeignClient.exists(groupId))) {
            throw new BusinessException("group not found");
        }
        if (!Boolean.TRUE.equals(userProfileCache.isGroupMember(groupId, senderId))) {
            throw new BusinessException("sender is not a group member");
        }
        validateMessageContent(command.getMessageType(), command.getContent(), command.getMediaUrl());
        requireClientMessageId(command.getClientMessageId());
        return new GroupMessageContext(senderId, groupId, sender);
    }

    @Override
    protected Message buildMessage(SendMessageCommand command, GroupMessageContext context, Long messageId) {
        Message message = createBaseMessage(command, messageId, context.senderId());
        message.setGroupId(context.groupId());
        message.setIsGroupChat(true);
        return message;
    }

    @Override
    protected String buildConversationId(SendMessageCommand command, GroupMessageContext context, Message message) {
        return buildGroupConversationKey(context.groupId());
    }

    @Override
    protected void afterKafkaAck(SendMessageCommand command, GroupMessageContext context, Message message) {
        clearConversationCache(null, context.groupId(), false);
    }

    @Override
    protected MessageDTO buildResult(SendMessageCommand command, GroupMessageContext context, Message message) {
        MessageDTO messageDTO = MessageConverter.convertToDTO(
                message,
                context.sender().getUsername(),
                context.sender().getAvatar(),
                null,
                null,
                null
        );
        messageDTO.setGroup(true);
        return messageDTO;
    }

    record GroupMessageContext(
            Long senderId,
            Long groupId,
            UserDTO sender
    ) {
    }
}
