package com.im.handler;

import com.im.dto.MessageDTO;
import com.im.dto.UserDTO;
import com.im.exception.BusinessException;
import com.im.feign.GroupServiceFeignClient;
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
public class GroupMessageHandler extends AbstractMessageHandler<GroupMessageHandler.GroupMessageContext> {

    private static final String EVENT_TYPE_MESSAGE = "MESSAGE";

    private final GroupServiceFeignClient groupServiceFeignClient;
    private final UserProfileCache userProfileCache;

    @Value("${im.outbox.topic.group-message:GROUP_MESSAGE}")
    private String groupMessageTopic;

    public GroupMessageHandler(MessageMapper messageMapper,
                               RedisTemplate<String, Object> redisTemplate,
                               OutboxService outboxService,
                               RedissonClient redissonClient,
                               TransactionTemplate transactionTemplate,
                               GroupServiceFeignClient groupServiceFeignClient,
                               UserProfileCache userProfileCache) {
        super(messageMapper, redisTemplate, outboxService, redissonClient, transactionTemplate);
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
        List<Long> memberIds = userProfileCache.getGroupMemberIds(groupId);
        return new GroupMessageContext(senderId, groupId, sender, memberIds);
    }

    @Override
    protected String buildLockKey(SendMessageCommand command, GroupMessageContext context) {
        return buildSendMessageLockKey(context.senderId(), command.getClientMessageId());
    }

    @Override
    protected SendTxResult doInTransaction(SendMessageCommand command, GroupMessageContext context) {
        Message existingMessage = findExistingMessageByClientMessageId(context.senderId(), command.getClientMessageId());
        if (existingMessage != null) {
            return new SendTxResult(existingMessage, false);
        }

        Message message = createBaseMessage(command, context.senderId());
        message.setGroupId(context.groupId());
        message.setIsGroupChat(true);
        persistMessage(message, context.groupId());
        enqueueGroupMessage(message, context);
        return new SendTxResult(message, true);
    }

    @Override
    protected void afterTransaction(SendMessageCommand command, GroupMessageContext context, SendTxResult txResult) {
        if (txResult.created()) {
            clearConversationCache(null, context.groupId(), false);
        }
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

    private void enqueueGroupMessage(Message message, GroupMessageContext context) {
        MessageDTO messageDTO = buildResult(null, context, message);
        String payload = com.alibaba.fastjson2.JSON.toJSONString(messageDTO);
        String key = buildGroupConversationKey(context.groupId());
        outboxService.enqueueAfterCommit(
                groupMessageTopic,
                EVENT_TYPE_MESSAGE,
                key,
                payload,
                message.getId(),
                normalizeMessageTargets(context.memberIds())
        );
    }

    record GroupMessageContext(
            Long senderId,
            Long groupId,
            UserDTO sender,
            List<Long> memberIds
    ) {
    }
}
