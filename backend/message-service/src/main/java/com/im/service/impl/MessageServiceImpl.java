package com.im.service.impl;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.conditions.update.LambdaUpdateWrapper;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.im.dto.GroupMemberDTO;
import com.im.dto.MessageDTO;
import com.im.dto.ReadReceiptDTO;
import com.im.dto.request.SendGroupMessageRequest;
import com.im.dto.request.SendPrivateMessageRequest;
import com.im.dto.ConversationDTO;
import com.im.enums.MessageType;
import com.im.handler.GroupMessageHandler;
import com.im.handler.MessageHandler;
import com.im.handler.PrivateMessageHandler;
import com.im.handler.SystemMessageHandler;
import com.im.message.entity.GroupReadCursor;
import com.im.message.entity.Message;
import com.im.exception.BusinessException;
import com.im.feign.GroupServiceFeignClient;
import com.im.feign.UserServiceFeignClient;
import com.im.mapper.GroupReadCursorMapper;
import com.im.mapper.MessageMapper;
import com.im.metrics.MessageServiceMetrics;
import com.im.service.OutboxService;
import com.im.service.MessageService;
import com.im.service.command.SendMessageCommand;
import com.im.service.support.UserProfileCache;
import com.im.util.MessageConverter;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.redisson.api.RLock;
import org.redisson.api.RedissonClient;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.data.redis.core.RedisTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionTemplate;
import org.springframework.util.StringUtils;

import jakarta.annotation.PostConstruct;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.Collections;
import java.util.EnumMap;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.TimeUnit;
import java.util.stream.Collectors;

/**
 * 消息服务实现类
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class MessageServiceImpl implements MessageService {

    private static final String EVENT_TYPE_MESSAGE = "MESSAGE";
    private static final String EVENT_TYPE_READ_RECEIPT = "READ_RECEIPT";
    private static final String EVENT_TYPE_READ_SYNC = "READ_SYNC";
    // FIX: 高并发下允许短暂等待锁，避免零等待导致正常请求直接失败。
    private static final long CONVERSATION_LOCK_WAIT_SECONDS = 2L;
    private final MessageMapper messageMapper;
    private final UserServiceFeignClient userServiceFeignClient;
    private final GroupServiceFeignClient groupServiceFeignClient;
    private final RedisTemplate<String, Object> redisTemplate;
    private final OutboxService outboxService;
    private final GroupReadCursorMapper groupReadCursorMapper;
    private final UserProfileCache userProfileCache;
    private final RedissonClient redissonClient;
    private final TransactionTemplate transactionTemplate;
    private final List<MessageHandler> messageHandlers;

    private Map<MessageType, MessageHandler> handlerCache = Collections.emptyMap();
    private MessageHandler privateMessageHandler;
    private MessageHandler groupMessageHandler;

    @Autowired(required = false)
    private MessageServiceMetrics metrics;
    
    private static final String CONVERSATION_CACHE_KEY = "conversations:user:";
    private static final String LAST_MESSAGE_CACHE_KEY = "last_message:";
    private static final long CACHE_EXPIRE_HOURS = 1;

    @Value("${im.message.text.enforce:true}")
    private boolean textEnforce;

    @Value("${im.message.text.max-length:2000}")
    private int textMaxLength;

    @Value("${im.message.lock.ttl-seconds:5}")
    private long conversationLockTtlSeconds;

    @Value("${im.outbox.topic.private-message:PRIVATE_MESSAGE}")
    private String privateMessageTopic = "PRIVATE_MESSAGE";

    @Value("${im.outbox.topic.group-message:GROUP_MESSAGE}")
    private String groupMessageTopic = "GROUP_MESSAGE";

    @Value("${im.outbox.topic.read-receipt:READ_RECEIPT}")
    private String readReceiptTopic = "READ_RECEIPT";

    @Value("${im.message.system.sender-id:0}")
    private Long defaultSystemSenderId;

    @PostConstruct
    public void initHandlerCache() {
        EnumMap<MessageType, MessageHandler> typeHandlers = new EnumMap<>(MessageType.class);
        for (MessageHandler messageHandler : messageHandlers) {
            if (messageHandler instanceof PrivateMessageHandler) {
                this.privateMessageHandler = messageHandler;
                for (MessageType type : MessageType.values()) {
                    if (messageHandler.supports(type)) {
                        typeHandlers.putIfAbsent(type, messageHandler);
                    }
                }
                continue;
            }
            if (messageHandler instanceof GroupMessageHandler) {
                this.groupMessageHandler = messageHandler;
                continue;
            }
            if (messageHandler instanceof SystemMessageHandler) {
                for (MessageType type : MessageType.values()) {
                    if (messageHandler.supports(type)) {
                        typeHandlers.put(type, messageHandler);
                    }
                }
            }
        }
        this.handlerCache = Collections.unmodifiableMap(typeHandlers);
    }

    @Override
    public MessageDTO sendPrivateMessage(Long senderId, SendPrivateMessageRequest request) {
        return sendMessage(toPrivateCommand(senderId, request));
        /*
                throw new BusinessException("发送消息失败");
            }
        */
    }

    private Message createMessageData(SendPrivateMessageRequest request, Long senderId, Long receiverId)  {
        Message message = new Message();
        message.setSenderId(senderId);
        message.setReceiverId(receiverId);
        message.setClientMessageId(normalizeClientMessageId(request.getClientMessageId()));
        message.setMessageType(request.getMessageType());
        if (request.getMessageType() == MessageType.TEXT || request.getMessageType() == MessageType.SYSTEM) {
            message.setContent(request.getContent());
        } else {
            message.setMediaUrl(request.getMediaUrl());
        }
        message.setReplyToMessageId(request.getReplyToMessageId());
        message.setStatus(Message.MessageStatus.SENT);
        return message;
    }

    @Override
    public MessageDTO sendGroupMessage(Long senderId, SendGroupMessageRequest request) {
        return sendMessage(toGroupCommand(senderId, request));
        /*
        if (!StringUtils.hasText(groupId)) {
            throw new BusinessException("群组ID不能为空");
        }
        String clientMessageId = requireClientMessageId(request.getClientMessageId());
        request.setClientMessageId(clientMessageId);
        Long groupIdLong = Long.valueOf(groupId);
        GroupSendInput input = groupSendInput(senderId, groupIdLong, request);
        String lockKey = buildSendMessageLockKey(senderId, clientMessageId);
        RLock conversationLock = acquireConversationLock(lockKey);
        try {
            SendMessageTxResult txResult = transactionTemplate.execute(status -> {
                Message existingMessage = findExistingMessageByClientMessageId(senderId, input.request().getClientMessageId());
                if (existingMessage != null) {
                    return new SendMessageTxResult(existingMessage, false);
                }
                Message savedMessage = groupSendProcess(input);
                enqueueGroupMessage(input, savedMessage);
                return new SendMessageTxResult(savedMessage, true);
            });
            if (txResult == null) {
                throw new BusinessException("发送消息失败");
            }
            if (txResult.created()) {
                clearConversationCache(null, input.groupId(), false);
            }
            return buildGroupMessageDTO(input, txResult.message());
        } finally {
            releaseConversationLock(conversationLock);
        }
        */
    }

    @Override
    public MessageDTO sendSystemMessage(Long receiverId, String content, Long senderId) {
        return sendMessage(toSystemCommand(receiverId, content, senderId));
        /*
        if (receiverId == null || receiverId <= 0) {
            throw new IllegalArgumentException("receiverId cannot be null");
        }
        Long actualSenderId = senderId == null ? defaultSystemSenderId : senderId;
        validateMessageContent(MessageType.SYSTEM, content, null);

        if (!Boolean.TRUE.equals(userServiceFeignClient.exists(receiverId))) {
            throw new BusinessException("receiver user not exists");
        }

        String lockKey = buildConversationLockKey(true, actualSenderId, receiverId);
        RLock conversationLock = acquireConversationLock(lockKey);
        try {
            SendMessageTxResult txResult = transactionTemplate.execute(status -> {
                SendPrivateMessageRequest request = new SendPrivateMessageRequest();
                request.setReceiverId(String.valueOf(receiverId));
                request.setMessageType(MessageType.SYSTEM);
                request.setContent(content);

                Message messageData = createMessageData(request, actualSenderId, receiverId);
                messageData.setIsGroupChat(false);
                persistMessage(messageData, receiverId);
                enqueueSystemMessage(actualSenderId, receiverId, messageData);
                return new SendMessageTxResult(messageData, true);
            });
            if (txResult == null) {
                throw new BusinessException("发送系统消息失败");
            }
            clearConversationCache(actualSenderId, receiverId, true);
            return buildSystemMessageDTO(actualSenderId, receiverId, txResult.message());
        } finally {
            releaseConversationLock(conversationLock);
        }
        */
    }

    @Override
    public MessageDTO sendMessage(SendMessageCommand command) {
        return resolveHandler(command).handle(command);
    }

    private MessageHandler resolveHandler(SendMessageCommand command) {
        if (command == null || command.getMessageType() == null) {
            throw new BusinessException("messageType cannot be null");
        }
        if (command.isSystemMessage()) {
            MessageHandler messageHandler = handlerCache.get(MessageType.SYSTEM);
            if (messageHandler == null) {
                throw new BusinessException("no system message handler");
            }
            return messageHandler;
        }
        if (command.isGroup()) {
            if (groupMessageHandler == null) {
                throw new BusinessException("no group message handler");
            }
            return groupMessageHandler;
        }
        MessageHandler messageHandler = handlerCache.get(command.getMessageType());
        if (messageHandler == null) {
            throw new BusinessException("no matching message handler");
        }
        return messageHandler;
    }

    private SendMessageCommand toPrivateCommand(Long senderId, SendPrivateMessageRequest request) {
        return SendMessageCommand.builder()
                .senderId(senderId)
                .receiverId(request == null || !StringUtils.hasText(request.getReceiverId()) ? null : Long.valueOf(request.getReceiverId()))
                .isGroup(false)
                .messageType(request == null ? null : request.getMessageType())
                .clientMessageId(request == null ? null : request.getClientMessageId())
                .content(request == null ? null : request.getContent())
                .extra(request == null ? null : request.getExtra())
                .mediaUrl(request == null ? null : request.getMediaUrl())
                .mediaSize(request == null ? null : request.getMediaSize())
                .mediaName(request == null ? null : request.getMediaName())
                .thumbnailUrl(request == null ? null : request.getThumbnailUrl())
                .duration(request == null ? null : request.getDuration())
                .locationInfo(request == null ? null : request.getLocationInfo())
                .replyToMessageId(request == null ? null : request.getReplyToMessageId())
                .build();
    }

    private SendMessageCommand toGroupCommand(Long senderId, SendGroupMessageRequest request) {
        return SendMessageCommand.builder()
                .senderId(senderId)
                .groupId(request == null || !StringUtils.hasText(request.getGroupId()) ? null : Long.valueOf(request.getGroupId()))
                .isGroup(true)
                .messageType(request == null ? null : request.getMessageType())
                .clientMessageId(request == null ? null : request.getClientMessageId())
                .content(request == null ? null : request.getContent())
                .extra(request == null ? null : request.getExtra())
                .mediaUrl(request == null ? null : request.getMediaUrl())
                .mediaSize(request == null ? null : request.getMediaSize())
                .mediaName(request == null ? null : request.getMediaName())
                .thumbnailUrl(request == null ? null : request.getThumbnailUrl())
                .duration(request == null ? null : request.getDuration())
                .locationInfo(request == null ? null : request.getLocationInfo())
                .replyToMessageId(request == null ? null : request.getReplyToMessageId())
                .build();
    }

    private SendMessageCommand toSystemCommand(Long receiverId, String content, Long senderId) {
        return SendMessageCommand.builder()
                .senderId(senderId)
                .receiverId(receiverId)
                .isGroup(false)
                .messageType(MessageType.SYSTEM)
                .content(content)
                .build();
    }

    private PrivateSendInput privateSendInput(Long senderId, Long receiverId, SendPrivateMessageRequest request) {
        var sender = userProfileCache.getUser(senderId);
        var receiver = userProfileCache.getUser(receiverId);
        if (sender == null || receiver == null) {
            throw new BusinessException("用户不存在");
        }
        // OPTIMIZE: TODO: 优化此处同步 Feign 调用，建议引入本地 Caffeine 缓存或 Redis 缓存监听成员关系变更，防止拖垮消息发送性能。
        if (!Boolean.TRUE.equals(userProfileCache.isFriend(senderId, receiverId))) {
            throw new BusinessException("只能向好友发送消息");
        }
        validateMessageContent(request.getMessageType(), request.getContent(), request.getMediaUrl());
        return new PrivateSendInput(senderId, receiverId, request, sender, receiver);
    }

    private Message privateSendProcess(PrivateSendInput input) {
        Message messageData = createMessageData(input.request(), input.senderId(), input.receiverId());
        messageData.setIsGroupChat(false);
        persistMessage(messageData, input.receiverId());
        return messageData;
    }

    private MessageDTO buildPrivateMessageDTO(PrivateSendInput input, Message savedMessage) {
        MessageDTO messageDTO = MessageConverter.convertToDTO(
                savedMessage,
                input.sender().getUsername(),
                input.sender().getAvatar(),
                input.receiver().getUsername(),
                input.receiver().getAvatar(),
                null
        );
        messageDTO.setGroup(false);
        return messageDTO;
    }

    private void enqueuePrivateMessage(PrivateSendInput input, Message savedMessage) {
        MessageDTO messageDTO = buildPrivateMessageDTO(input, savedMessage);
        String payload = com.alibaba.fastjson2.JSON.toJSONString(messageDTO);
        String key = buildPrivateConversationKey(input.senderId(), input.receiverId());
        outboxService.enqueueAfterCommit(
                privateMessageTopic,
                EVENT_TYPE_MESSAGE,
                key,
                payload,
                savedMessage.getId(),
                privateConversationTargets(input.senderId(), input.receiverId())
        );
    }

    private GroupSendInput groupSendInput(Long senderId, Long groupIdLong, SendGroupMessageRequest request) {
        var sender = userProfileCache.getUser(senderId);
        if (sender == null) {
            throw new BusinessException("用户不存在");
        }
        if (!Boolean.TRUE.equals(groupServiceFeignClient.exists(groupIdLong))) {
            throw new BusinessException("群组不存在");
        }
        // OPTIMIZE: TODO: 优化此处同步 Feign 调用，建议引入本地 Caffeine 缓存或 Redis 缓存监听成员关系变更，防止拖垮消息发送性能。
        if (!Boolean.TRUE.equals(userProfileCache.isGroupMember(groupIdLong, senderId))) {
            throw new BusinessException("只有群成员才能发送消息");
        }
        validateMessageContent(request.getMessageType(), request.getContent(), request.getMediaUrl());
        // OPTIMIZE: 高并发发消息链路中强依赖同步调用 memberIds 会成为严重瓶颈。后续需重构为获取带本地过期机制的缓存，或由下层消费者去处理 Fan-out。
        List<Long> memberIds = userProfileCache.getGroupMemberIds(groupIdLong);
        return new GroupSendInput(senderId, groupIdLong, request, sender, memberIds);
    }

    private Message groupSendProcess(GroupSendInput input) {
        Message messageData = createMessageData(input.request(), input.senderId());
        persistMessage(messageData, input.groupId());
        return messageData;
    }

    private MessageDTO buildGroupMessageDTO(GroupSendInput input, Message savedMessage) {
        // FIX: 群消息 Outbox payload 不再携带群成员列表，避免千人群消息写放大。
        MessageDTO messageDTO = MessageConverter.convertToDTO(
                savedMessage,
                input.sender().getUsername(),
                input.sender().getAvatar(),
                null,
                null,
                null
        );
        messageDTO.setGroup(true);
        return messageDTO;
    }

    private void enqueueGroupMessage(GroupSendInput input, Message savedMessage) {
        MessageDTO messageDTO = buildGroupMessageDTO(input, savedMessage);
        String payload = com.alibaba.fastjson2.JSON.toJSONString(messageDTO);
        String key = buildGroupConversationKey(input.groupId());
        outboxService.enqueueAfterCommit(
                groupMessageTopic,
                EVENT_TYPE_MESSAGE,
                key,
                payload,
                savedMessage.getId(),
                normalizeMessageTargets(input.memberIds())
        );
    }

    private record PrivateSendInput(
            Long senderId,
            Long receiverId,
            SendPrivateMessageRequest request,
            com.im.dto.UserDTO sender,
            com.im.dto.UserDTO receiver
    ) {
    }

    private record GroupSendInput(
            Long senderId,
            Long groupId,
            SendGroupMessageRequest request,
            com.im.dto.UserDTO sender,
            List<Long> memberIds
    ) {
    }

    private record SendMessageTxResult(
            Message message,
            boolean created
    ) {
    }

    private void persistMessage(Message message, Long targetId) {
        try {
            messageMapper.insert(message);
            recordPersist(message, true);
            logMessageSaveResult(message == null ? null : message.getSenderId(), targetId, resolveMessageLogContent(message), true);
        } catch (Exception exception) {
            recordPersist(message, false);
            logMessageSaveResult(message == null ? null : message.getSenderId(), targetId, resolveMessageLogContent(message), false);
            throw exception;
        }
    }

    private void recordPersist(Message message, boolean success) {
        if (metrics != null) {
            metrics.recordPersist(message, success);
        }
    }

    private String resolveMessageLogContent(Message message) {
        if (message == null) {
            return "";
        }
        String rawContent = StringUtils.hasText(message.getContent()) ? message.getContent() : message.getMediaUrl();
        if (!StringUtils.hasText(rawContent)) {
            return "";
        }
        return rawContent.replace("\r", " ").replace("\n", " ");
    }

    private void logMessageSaveResult(Long senderId, Long targetId, String content, boolean success) {
        String senderIdText = senderId == null ? "" : String.valueOf(senderId);
        String targetIdText = targetId == null ? "" : String.valueOf(targetId);
        String safeContent = content == null ? "" : content;
        String status = success ? "success" : "fail";
        log.info("\u53d1\u9001id\u3010{}\u3011\uff0c\u63a5\u6536id\u3010{}\u3011\uff0c\u6d88\u606f\u5185\u5bb9\u3010{}\u3011\u72b6\u6001\u3010{}\u3011",
                senderIdText,
                targetIdText,
                safeContent,
                status);
    }

    private Message createMessageData(SendGroupMessageRequest request, Long senderId) {
        Message message = new Message();
        message.setSenderId(senderId);
        message.setClientMessageId(normalizeClientMessageId(request.getClientMessageId()));
        message.setMessageType(request.getMessageType());
        if (request.getMessageType() == MessageType.TEXT || request.getMessageType() == MessageType.SYSTEM) {
            message.setContent(request.getContent());
        } else {
            message.setMediaUrl(request.getMediaUrl());
        }
        message.setReplyToMessageId(request.getReplyToMessageId());
        message.setStatus(Message.MessageStatus.SENT);
        message.setGroupId(Long.valueOf(request.getGroupId()));
        message.setIsGroupChat(true);
        return message;
    }

    @Override
    // 移除 @Cacheable 注解，完全由内部手动管理缓存，避免与手动逻辑冲突
    public List<ConversationDTO> getConversations(Long userId) {
        String cacheKey = CONVERSATION_CACHE_KEY + userId;
        
        @SuppressWarnings("unchecked")
        List<ConversationDTO> cachedConversations = (List<ConversationDTO>) redisTemplate.opsForValue().get(cacheKey);
        if (cachedConversations != null) {
            return cachedConversations;
        }
        
        List<com.im.dto.UserDTO> friends = userServiceFeignClient.friendList(userId);
        List<com.im.dto.GroupInfoDTO> groups = groupServiceFeignClient.listUserGroups(userId);
        if (friends == null) {
            friends = List.of();
        }
        if (groups == null) {
            groups = List.of();
        }

        List<ConversationDTO> conversations = new ArrayList<>();
        conversations.addAll(buildPrivateConversations(userId, friends));
        conversations.addAll(buildGroupConversations(userId, groups));
        conversations.sort((c1, c2) -> {
            if (c1.getLastMessageTime() == null && c2.getLastMessageTime() == null) return 0;
            if (c1.getLastMessageTime() == null) return 1;
            if (c2.getLastMessageTime() == null) return -1;
            return c2.getLastMessageTime().compareTo(c1.getLastMessageTime());
        });
        
        redisTemplate.opsForValue().set(cacheKey, conversations, CACHE_EXPIRE_HOURS, TimeUnit.HOURS);
        
        return conversations;
    }
    
    /**
     * 批量获取最后消息，减少数据库查询
     */
 
    
    /**
     * 获取未读消息数量
     */
    private Long getUnreadCount(Long userId, Long targetId, boolean isPrivate) {
        try {
            if (userId == null || targetId == null) {
                return 0L;
            }
            if (isPrivate) {
                Long cnt = messageMapper.selectCount(new LambdaQueryWrapper<Message>()
                        .eq(Message::getReceiverId, userId)
                        .eq(Message::getSenderId, targetId)
                        .eq(Message::getIsGroupChat, false)
                        .eq(Message::getStatus, 1));
                return cnt == null ? 0L : cnt;
            } else {
                GroupReadCursor cursor = groupReadCursorMapper.selectOne(new LambdaQueryWrapper<GroupReadCursor>()
                        .eq(GroupReadCursor::getGroupId, targetId)
                        .eq(GroupReadCursor::getUserId, userId)
                        .last("limit 1"));
                LocalDateTime lastReadAt = cursor == null ? null : cursor.getLastReadAt();
                LambdaQueryWrapper<Message> wrapper = new LambdaQueryWrapper<Message>()
                        .eq(Message::getGroupId, targetId)
                        .eq(Message::getIsGroupChat, true)
                        .ne(Message::getSenderId, userId)
                        .ne(Message::getStatus, 5);
                if (lastReadAt != null) {
                    wrapper.gt(Message::getCreatedTime, lastReadAt);
                }
                Long cnt = messageMapper.selectCount(wrapper);
                return cnt == null ? 0L : cnt;
            }
        } catch (Exception e) {
            log.warn("获取未读消息数量失败，userId: {}, targetId: {}, isPrivate: {}", userId, targetId, isPrivate, e);
            return 0L;
        }
    }
    
    @Override
    public void markAsRead(Long userId, String conversationId) {
        try {
            ReadMarkInput input = markReadInput(userId, conversationId);
            RLock conversationLock = acquireConversationLock(input.lockKey());
            try {
                ReadMarkProcessResult processResult = markReadProcess(input);
                if (processResult == null) {
                    throw new BusinessException("标记消息已读失败");
                }
                markReadOutput(input, processResult);
            } finally {
                releaseConversationLock(conversationLock);
            }
        } catch (NumberFormatException e) {
            log.warn("会话ID格式错误: {}", conversationId);
            throw new BusinessException("会话ID格式错误");
        } catch (BusinessException e) {
            log.warn("标记消息已读失败，用户ID: {}, 会话ID: {}, reason: {}",
                    userId, conversationId, e.getMessage());
            throw e;
        } catch (Exception e) {
            log.error("标记消息已读失败，用户ID: {}, 会话ID: {}", userId, conversationId, e);
            throw new BusinessException("标记消息已读失败");
        }
    }

    private ReadMarkInput markReadInput(Long userId, String conversationId) {
        LocalDateTime now = LocalDateTime.now();
        ReadConversationTarget target = parseReadConversationTarget(userId, conversationId);
        if (target.isGroup()) {
            validateGroupConversationAccess(userId, target.groupId());
        } else {
            validatePrivateConversationAccess(userId, target.targetUserId());
        }
        String lockKey = target.isGroup()
                ? buildConversationLockKey(false, null, target.groupId())
                : buildConversationLockKey(true, userId, target.targetUserId());
        return new ReadMarkInput(userId, conversationId, now, target, lockKey);
    }

    private ReadMarkProcessResult markReadProcess(ReadMarkInput input) {
        return transactionTemplate.execute(status -> {
            int updatedCount;
            Long lastReadMessageId;
            if (input.target().isGroup()) {
                updateGroupReadCursor(input.userId(), input.target().groupId(), input.now());
                updatedCount = 0;
                Message lastRead = messageMapper.selectOne(new LambdaQueryWrapper<Message>()
                        .eq(Message::getGroupId, input.target().groupId())
                        .eq(Message::getIsGroupChat, true)
                        .ne(Message::getStatus, Message.MessageStatus.DELETED)
                        .orderByDesc(Message::getId)
                        .last("limit 1"));
                lastReadMessageId = lastRead == null ? null : lastRead.getId();
            } else {
                updatedCount = markPrivateConversationRead(input.userId(), input.target().targetUserId(), input.now());
                Message lastRead = messageMapper.selectOne(new LambdaQueryWrapper<Message>()
                        .eq(Message::getReceiverId, input.userId())
                        .eq(Message::getSenderId, input.target().targetUserId())
                        .eq(Message::getIsGroupChat, false)
                        .eq(Message::getStatus, Message.MessageStatus.READ)
                        .orderByDesc(Message::getId)
                        .last("limit 1"));
                lastReadMessageId = lastRead == null ? null : lastRead.getId();
            }
            ReadMarkProcessResult processResult = new ReadMarkProcessResult(updatedCount, lastReadMessageId);
            publishPrivateReadReceipt(input, processResult);
            publishReadSync(input, processResult);
            return processResult;
        });
    }

    private void markReadOutput(ReadMarkInput input, ReadMarkProcessResult processResult) {
        log.info("用户 {} 标记会话 {} 的消息为已读，更新了 {} 条消息", input.userId(), input.conversationId(), processResult.updatedCount());

        publishGroupReadReceipts(input, processResult);
        clearConversationListCache(input.userId());
    }

    private List<ConversationDTO> buildPrivateConversations(Long userId, List<com.im.dto.UserDTO> friends) {
        if (friends == null || friends.isEmpty()) {
            return List.of();
        }
        List<Long> friendIds = extractFriendIds(friends);
        Map<Long, Message> lastMessageMap = buildPrivateLastMessageMap(userId, friendIds);
        Map<Long, Integer> unreadCountMap = buildPrivateUnreadCountMap(userId, friendIds);
        List<ConversationDTO> conversations = new ArrayList<>();
        for (com.im.dto.UserDTO friend : friends) {
            ConversationDTO conversation = buildSinglePrivateConversation(userId, friend, lastMessageMap, unreadCountMap);
            if (conversation != null) {
                conversations.add(conversation);
            }
        }
        return conversations;
    }

    private List<ConversationDTO> buildGroupConversations(Long userId, List<com.im.dto.GroupInfoDTO> groups) {
        if (groups == null || groups.isEmpty()) {
            return List.of();
        }
        List<Long> groupIds = groups.stream().map(com.im.dto.GroupInfoDTO::getId).collect(Collectors.toList());
        Map<Long, Message> lastGroupMessageMap = buildGroupLastMessageMap(groupIds);
        Map<Long, Integer> groupUnreadCountMap = buildGroupUnreadCountMap(groupIds, userId);
        List<ConversationDTO> conversations = new ArrayList<>();
        for (com.im.dto.GroupInfoDTO group : groups) {
            conversations.add(buildSingleGroupConversation(userId, group, lastGroupMessageMap, groupUnreadCountMap));
        }
        return conversations;
    }

    private ReadConversationTarget parseReadConversationTarget(Long userId, String conversationId) {
        if (conversationId.startsWith("group_")) {
            Long groupId = Long.parseLong(conversationId.substring(6));
            return new ReadConversationTarget(true, groupId, null, conversationId);
        }
        if (conversationId.contains("_")) {
            String[] parts = conversationId.split("_");
            if (parts.length != 2) {
                throw new BusinessException("私聊会话ID格式错误");
            }
            Long userId1 = Long.parseLong(parts[0]);
            Long userId2 = Long.parseLong(parts[1]);
            Long targetUserId = userId.equals(userId1) ? userId2 : userId1;
            String normalizedConversationId = buildPrivateConversationKey(userId, targetUserId);
            return new ReadConversationTarget(false, null, targetUserId, normalizedConversationId);
        }
        Long targetUserId = Long.parseLong(conversationId);
        String normalizedConversationId = buildPrivateConversationKey(userId, targetUserId);
        return new ReadConversationTarget(false, null, targetUserId, normalizedConversationId);
    }

    private void updateGroupReadCursor(Long userId, Long groupId, LocalDateTime now) {
        GroupReadCursor cursor = groupReadCursorMapper.selectOne(new LambdaQueryWrapper<GroupReadCursor>()
                .eq(GroupReadCursor::getGroupId, groupId)
                .eq(GroupReadCursor::getUserId, userId)
                .last("limit 1"));
        if (cursor != null) {
            cursor.setLastReadAt(now);
            groupReadCursorMapper.updateById(cursor);
            return;
        }
        GroupReadCursor created = new GroupReadCursor();
        created.setGroupId(groupId);
        created.setUserId(userId);
        created.setLastReadAt(now);
        try {
            groupReadCursorMapper.insert(created);
        } catch (DuplicateKeyException ex) {
            groupReadCursorMapper.update(null, new LambdaUpdateWrapper<GroupReadCursor>()
                    .eq(GroupReadCursor::getGroupId, groupId)
                    .eq(GroupReadCursor::getUserId, userId)
                    .set(GroupReadCursor::getLastReadAt, now));
        }
    }

    private int markPrivateConversationRead(Long userId, Long targetUserId, LocalDateTime now) {
        // TODO: 建议后续改造为类似群聊的私聊 ReadCursor 游标机制，避免修改原始 Message 表状态
        return messageMapper.update(null, new LambdaUpdateWrapper<Message>()
                .eq(Message::getReceiverId, userId)
                .eq(Message::getSenderId, targetUserId)
                .eq(Message::getIsGroupChat, false)
                .in(Message::getStatus, 1, 2)
                .set(Message::getStatus, Message.MessageStatus.READ)
                .set(Message::getUpdatedTime, now)
                .last("LIMIT 1000"));
    }

    private record ReadConversationTarget(boolean isGroup, Long groupId, Long targetUserId, String normalizedConversationId) {
    }

    private record ReadMarkInput(
            Long userId,
            String conversationId,
            LocalDateTime now,
            ReadConversationTarget target,
            String lockKey
    ) {
    }

    private record ReadMarkProcessResult(
            int updatedCount,
            Long lastReadMessageId
    ) {
    }
    
    /**
     * 清除会话相关缓存
     */
    private void clearConversationCache(Long userId1, Long userId2, boolean isPrivate) {
        try {
            if (isPrivate && userId1 != null && userId2 != null) {
                // FIX: 私聊缓存 Key 与锁/事件使用同一套会话标识，避免删错或漏删。
                String conversationKey = buildPrivateConversationKey(userId1, userId2);
                redisTemplate.delete(LAST_MESSAGE_CACHE_KEY + conversationKey);
                redisTemplate.delete(CONVERSATION_CACHE_KEY + userId1);
                redisTemplate.delete(CONVERSATION_CACHE_KEY + userId2);
            } else if (!isPrivate && userId2 != null) {
                // FIX: 群聊消息仅清理群会话最后一条消息缓存，避免群发时循环删除成员会话列表缓存。
                String conversationKey = buildGroupConversationKey(userId2);
                redisTemplate.delete(LAST_MESSAGE_CACHE_KEY + conversationKey);
            }
        } catch (Exception e) {
            log.warn("清除缓存失败", e);
        }
    }
    
    private void validateMessageContent(MessageType messageType, String content, String mediaUrl) {
        // 文本/系统消息内容不能为空
        if ((messageType == MessageType.TEXT || messageType == MessageType.SYSTEM) && !StringUtils.hasText(content)) {
            throw new BusinessException("消息内容不能为空");
        }

        if (messageType == MessageType.TEXT || messageType == MessageType.SYSTEM) {
            if (textEnforce && textMaxLength > 0) {
                int len = content == null ? 0 : content.codePointCount(0, content.length());
                if (len > textMaxLength) {
                    throw new BusinessException("消息内容不能超过" + textMaxLength + "字");
                }
            }
        }
        
        // 媒体消息：只接受URL（文件存COS），不再接受Base64
        if (messageType != MessageType.TEXT && messageType != MessageType.SYSTEM && !StringUtils.hasText(mediaUrl)) {
            throw new BusinessException("媒体URL不能为空");
        }
    }

    private String buildPrivateConversationKey(Long userId1, Long userId2) {
        long a = userId1 == null ? 0L : userId1;
        long b = userId2 == null ? 0L : userId2;
        long min = Math.min(a, b);
        long max = Math.max(a, b);
        return "p_" + min + "_" + max;
    }

    private String buildGroupConversationKey(Long groupId) {
        return "g_" + (groupId == null ? "0" : groupId.toString());
    }

    private String buildSendMessageLockKey(Long senderId, String clientMessageId) {
        return "msg:lock:send:" + senderId + ":" + requireClientMessageId(clientMessageId);
    }

    private String buildConversationLockKey(boolean isPrivate, Long id1, Long id2) {
        if (isPrivate) {
            return "msg:lock:" + buildPrivateConversationKey(id1, id2);
        }
        return "msg:lock:" + buildGroupConversationKey(id2);
    }

    private RLock acquireConversationLock(String lockKey) {
        RLock lock = redissonClient.getLock(lockKey);
        boolean locked;
        try {
            // FIX: 高并发下允许短暂等待锁，减少正常并发请求因为瞬时竞争被直接拒绝。
            locked = lock.tryLock(CONVERSATION_LOCK_WAIT_SECONDS, conversationLockTtlSeconds, TimeUnit.SECONDS);
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            throw new BusinessException("会话处理中，请稍后重试", e);
        } catch (Exception e) {
            throw new BusinessException("会话处理中，请稍后重试", e);
        }
        if (!locked) {
            throw new BusinessException("会话处理中，请稍后重试");
        }
        return lock;
    }

    private void releaseConversationLock(RLock lock) {
        try {
            if (lock != null && lock.isHeldByCurrentThread()) {
                lock.unlock();
            }
        } catch (Exception ex) {
            log.warn("释放会话锁失败", ex);
        }
    }

    @Override
    public List<MessageDTO> getPrivateMessages(Long userId, Long friendId, int page, int size) {
        log.info("获取私聊消息历史: userId={}, friendId={}, page={}, size={}", userId, friendId, page, size);
        validatePrivateConversationAccess(userId, friendId);
        
        Page<Message> mpPage = new Page<>(Math.max(1, page + 1L), Math.max(1, size));
        LambdaQueryWrapper<Message> wrapper = new LambdaQueryWrapper<Message>()
                .eq(Message::getIsGroupChat, false)
                .ne(Message::getStatus, 5)
                .and(w -> w.eq(Message::getSenderId, userId).eq(Message::getReceiverId, friendId)
                        .or()
                        .eq(Message::getSenderId, friendId).eq(Message::getReceiverId, userId))
                .orderByDesc(Message::getCreatedTime);
        Page<Message> result = messageMapper.selectPage(mpPage, wrapper);
        List<Message> messages = result.getRecords();
        
        log.info("获取到私聊消息数量: {}", messages.size());
        return toPrivateMessageDTOs(messages, userId, friendId);
    }
    @Override
    public List<MessageDTO> getGroupMessages(Long userId, Long groupId, int page, int size) {
        log.info("获取群聊消息历史: userId={}, groupId={}, page={}, size={}", userId, groupId, page, size);
        validateGroupConversationAccess(userId, groupId);
        
        Page<Message> mpPage = new Page<>(Math.max(1, page + 1L), Math.max(1, size));
        LambdaQueryWrapper<Message> wrapper = new LambdaQueryWrapper<Message>()
                .eq(Message::getGroupId, groupId)
                .eq(Message::getIsGroupChat, true)
                .ne(Message::getStatus, 5)
                .orderByDesc(Message::getCreatedTime);
        Page<Message> result = messageMapper.selectPage(mpPage, wrapper);
        List<Message> messages = result.getRecords();
        
        log.info("获取到群聊消息数量: {}", messages.size());
        return toGroupMessageDTOs(messages);
    }

    @Override
    public List<MessageDTO> getPrivateMessagesCursor(Long userId,
                                                     Long friendId,
                                                     Long lastMessageId,
                                                     LocalDateTime beforeTimestamp,
                                                     Long afterMessageId,
                                                     int limit) {
        int realLimit = Math.min(Math.max(1, limit), 200);
        validatePrivateConversationAccess(userId, friendId);

        LambdaQueryWrapper<Message> wrapper = new LambdaQueryWrapper<Message>()
                .eq(Message::getIsGroupChat, false)
                .ne(Message::getStatus, 5)
                .and(w -> w.eq(Message::getSenderId, userId).eq(Message::getReceiverId, friendId)
                        .or()
                        .eq(Message::getSenderId, friendId).eq(Message::getReceiverId, userId));

        if (afterMessageId != null) {
            wrapper.gt(Message::getId, afterMessageId).orderByAsc(Message::getId).last("limit " + realLimit);
        } else {
            if (lastMessageId != null) {
                wrapper.lt(Message::getId, lastMessageId);
            }
            if (beforeTimestamp != null) {
                wrapper.lt(Message::getCreatedTime, beforeTimestamp);
            }
            wrapper.orderByDesc(Message::getId).last("limit " + realLimit);
        }

        List<Message> messages = messageMapper.selectList(wrapper);
        return toPrivateMessageDTOs(messages, userId, friendId);
    }

    @Override
    public List<MessageDTO> getGroupMessagesCursor(Long userId,
                                                   Long groupId,
                                                   Long lastMessageId,
                                                   LocalDateTime beforeTimestamp,
                                                   Long afterMessageId,
                                                   int limit) {
        int realLimit = Math.min(Math.max(1, limit), 200);
        validateGroupConversationAccess(userId, groupId);

        LambdaQueryWrapper<Message> wrapper = new LambdaQueryWrapper<Message>()
                .eq(Message::getGroupId, groupId)
                .eq(Message::getIsGroupChat, true)
                .ne(Message::getStatus, 5);

        if (afterMessageId != null) {
            wrapper.gt(Message::getId, afterMessageId).orderByAsc(Message::getId).last("limit " + realLimit);
        } else {
            if (lastMessageId != null) {
                wrapper.lt(Message::getId, lastMessageId);
            }
            if (beforeTimestamp != null) {
                wrapper.lt(Message::getCreatedTime, beforeTimestamp);
            }
            wrapper.orderByDesc(Message::getId).last("limit " + realLimit);
        }

        List<Message> messages = messageMapper.selectList(wrapper);
        return toGroupMessageDTOs(messages);
    }

    @Override
    @Transactional
    public MessageDTO recallMessage(Long userId, Long messageId) {
        Message recallTarget = recallInput(userId, messageId);
        MessageDTO result = statusChangeProcess(recallTarget, Message.MessageStatus.RECALLED);
        return statusChangeOutput(result);
    }

    @Override
    @Transactional
    public MessageDTO deleteMessage(Long userId, Long messageId) {
        Message deleteTarget = deleteInput(userId, messageId);
        MessageDTO result = statusChangeProcess(deleteTarget, Message.MessageStatus.DELETED);
        return statusChangeOutput(result);
    }

    private Message recallInput(Long userId, Long messageId) {
        if (userId == null || messageId == null) {
            throw new IllegalArgumentException("参数不能为空");
        }
        Message msg = messageMapper.selectById(messageId);
        if (msg == null || msg.getStatus() == Message.MessageStatus.DELETED) {
            throw new BusinessException("消息不存在");
        }
        if (msg.getSenderId() == null || !msg.getSenderId().equals(userId)) {
            throw new SecurityException("只能撤回自己发送的消息");
        }
        if (msg.getCreatedTime() != null && msg.getCreatedTime().plusMinutes(2).isBefore(LocalDateTime.now())) {
            throw new BusinessException("只能撤回2分钟内的消息");
        }
        return msg;
    }

    private Message deleteInput(Long userId, Long messageId) {
        if (userId == null || messageId == null) {
            throw new IllegalArgumentException("参数不能为空");
        }
        Message msg = messageMapper.selectById(messageId);
        if (msg == null) {
            throw new BusinessException("消息不存在");
        }
        if (msg.getSenderId() == null || !msg.getSenderId().equals(userId)) {
            throw new SecurityException("只能删除自己发送的消息");
        }
        return msg;
    }

    private MessageDTO statusChangeProcess(Message msg, Integer status) {
        return applyMessageStatusAndPublish(msg, status);
    }

    private MessageDTO statusChangeOutput(MessageDTO dto) {
        return dto;
    }

    private void validatePrivateConversationAccess(Long userId, Long friendId) {
        if (!Boolean.TRUE.equals(userServiceFeignClient.exists(userId))) {
            throw new BusinessException("用户不存在");
        }
        if (!Boolean.TRUE.equals(userServiceFeignClient.exists(friendId))) {
            throw new BusinessException("好友不存在");
        }
        if (!Boolean.TRUE.equals(userProfileCache.isFriend(userId, friendId))) {
            throw new BusinessException("不是好友关系，无法查看聊天记录");
        }
    }

    private void validateGroupConversationAccess(Long userId, Long groupId) {
        if (!Boolean.TRUE.equals(userServiceFeignClient.exists(userId))) {
            throw new BusinessException("用户不存在");
        }
        if (!Boolean.TRUE.equals(groupServiceFeignClient.exists(groupId))) {
            throw new BusinessException("群组不存在");
        }
        if (!Boolean.TRUE.equals(userProfileCache.isGroupMember(groupId, userId))) {
            throw new BusinessException("不是群成员，无法查看群聊记录");
        }
    }

    private List<MessageDTO> toPrivateMessageDTOs(List<Message> messages, Long userId, Long friendId) {
        var me = userProfileCache.getUser(userId);
        var friend = userProfileCache.getUser(friendId);
        return messages.stream()
                .map(m -> {
                    var sender = m.getSenderId() != null && m.getSenderId().equals(userId) ? me : friend;
                    var receiver = m.getSenderId() != null && m.getSenderId().equals(userId) ? friend : me;
                    MessageDTO dto = MessageConverter.convertToDTO(
                            m,
                            sender == null ? null : sender.getUsername(),
                            sender == null ? null : sender.getAvatar(),
                            receiver == null ? null : receiver.getUsername(),
                            receiver == null ? null : receiver.getAvatar(),
                            null
                    );
                    if (dto != null) {
                        dto.setGroup(false);
                    }
                    return dto;
                })
                .collect(Collectors.toList());
    }

    private List<MessageDTO> toGroupMessageDTOs(List<Message> messages) {
        return messages.stream()
                .map(m -> {
                    var sender = userProfileCache.getUser(m.getSenderId());
                    MessageDTO dto = MessageConverter.convertToDTO(
                            m,
                            sender == null ? null : sender.getUsername(),
                            sender == null ? null : sender.getAvatar(),
                            null,
                            null,
                            null
                    );
                    if (dto != null) {
                        dto.setGroup(true);
                    }
                    return dto;
                })
                .collect(Collectors.toList());
    }

    private MessageDTO applyMessageStatusAndPublish(Message msg, Integer status) {
        updateMessageStatus(msg, status);
        clearStatusChangeConversationCache(msg);
        MessageDTO dto = buildStatusChangedMessageDTO(msg);
        publishStatusChangedMessage(msg, dto);
        return dto;
    }

    private List<Long> extractFriendIds(List<com.im.dto.UserDTO> friends) {
        return friends.stream()
                .map(com.im.dto.UserDTO::getId)
                .filter(StringUtils::hasText)
                .map(Long::valueOf)
                .collect(Collectors.toList());
    }

    private Map<Long, Message> buildPrivateLastMessageMap(Long userId, List<Long> friendIds) {
        List<Message> lastPrivateMessages = friendIds.isEmpty()
                ? List.of()
                : messageMapper.selectLastPrivateMessagesBatch(userId, friendIds);
        Map<Long, Message> lastMessageMap = new HashMap<>();
        for (Message message : lastPrivateMessages) {
            Long friendId = message.getSenderId().equals(userId) ? message.getReceiverId() : message.getSenderId();
            lastMessageMap.put(friendId, message);
        }
        return lastMessageMap;
    }

    private Map<Long, Integer> buildPrivateUnreadCountMap(Long userId, List<Long> friendIds) {
        List<MessageMapper.CountPair> unreadCounts = friendIds.isEmpty()
                ? List.of()
                : messageMapper.countUnreadPrivateMessagesBatch(userId, friendIds);
        Map<Long, Integer> unreadCountMap = new HashMap<>();
        for (MessageMapper.CountPair result : unreadCounts) {
            if (result.getSenderId() != null && result.getCnt() != null) {
                unreadCountMap.put(result.getSenderId(), result.getCnt().intValue());
            }
        }
        return unreadCountMap;
    }

    private ConversationDTO buildSinglePrivateConversation(
            Long userId,
            com.im.dto.UserDTO friend,
            Map<Long, Message> lastMessageMap,
            Map<Long, Integer> unreadCountMap
    ) {
        Long friendIdLong = friend.getId() == null ? null : Long.valueOf(friend.getId());
        if (friendIdLong != null && friendIdLong.equals(userId)) {
            return null;
        }
        Message lastMessage = friendIdLong == null ? null : lastMessageMap.get(friendIdLong);
        Integer unreadCount = friendIdLong == null ? 0 : unreadCountMap.getOrDefault(friendIdLong, 0);
        return ConversationDTO.builder()
                .conversationId(friend.getId())
                .conversationType(1)
                .conversationName(friend.getNickname() != null ? friend.getNickname() : friend.getUsername())
                .conversationAvatar(friend.getAvatar())
                .lastMessage(lastMessage != null ? lastMessage.getContent() : "")
                .lastMessageType(lastMessage != null ? lastMessage.getMessageType() : null)
                .lastMessageSenderId(lastMessage != null ? lastMessage.getSenderId().toString() : null)
                .lastMessageSenderName(lastMessage != null
                        ? (lastMessage.getSenderId().equals(userId) ? "我" : friend.getNickname()) : null)
                .lastMessageTime(lastMessage != null ? lastMessage.getCreatedTime() : null)
                .unreadCount(unreadCount.longValue())
                .isOnline(false)
                .isPinned(false)
                .isMuted(false)
                .build();
    }

    private Map<Long, Message> buildGroupLastMessageMap(List<Long> groupIds) {
        List<Message> lastGroupMessages = groupIds.isEmpty()
                ? List.of()
                : messageMapper.selectLastGroupMessagesBatch(groupIds);
        Map<Long, Message> lastGroupMessageMap = new HashMap<>();
        for (Message message : lastGroupMessages) {
            lastGroupMessageMap.put(message.getGroupId(), message);
        }
        return lastGroupMessageMap;
    }

    private Map<Long, Integer> buildGroupUnreadCountMap(List<Long> groupIds, Long userId) {
        List<MessageMapper.CountPair> groupUnreadCounts = groupIds.isEmpty()
                ? List.of()
                : messageMapper.countUnreadGroupMessagesByUserCursors(groupIds, userId);
        Map<Long, Integer> groupUnreadCountMap = new HashMap<>();
        for (MessageMapper.CountPair result : groupUnreadCounts) {
            if (result.getGroupId() != null && result.getCnt() != null) {
                groupUnreadCountMap.put(result.getGroupId(), result.getCnt().intValue());
            }
        }
        return groupUnreadCountMap;
    }

    private ConversationDTO buildSingleGroupConversation(
            Long userId,
            com.im.dto.GroupInfoDTO group,
            Map<Long, Message> lastGroupMessageMap,
            Map<Long, Integer> groupUnreadCountMap
    ) {
        Message lastMessage = lastGroupMessageMap.get(group.getId());
        Integer unreadCount = groupUnreadCountMap.getOrDefault(group.getId(), 0);
        return ConversationDTO.builder()
                .conversationId(group.getId().toString())
                .conversationType(2)
                .conversationName(group.getName())
                .conversationAvatar(group.getAvatar())
                .lastMessage(lastMessage != null ? lastMessage.getContent() : "")
                .lastMessageType(lastMessage != null ? lastMessage.getMessageType() : null)
                .lastMessageSenderId(lastMessage != null ? lastMessage.getSenderId().toString() : null)
                .lastMessageSenderName(lastMessage != null
                        ? (lastMessage.getSenderId().equals(userId) ? "我" : "群成员") : null)
                .lastMessageTime(lastMessage != null ? lastMessage.getCreatedTime() : null)
                .unreadCount(unreadCount.longValue())
                .isOnline(false)
                .isPinned(false)
                .isMuted(false)
                .build();
    }

    private void publishPrivateReadReceipt(ReadMarkInput input, ReadMarkProcessResult processResult) {
        if (processResult.updatedCount() <= 0 || input.target().isGroup() || input.target().targetUserId() == null) {
            return;
        }
        ReadReceiptDTO receipt = buildReadReceipt(input, processResult);
        String payload = com.alibaba.fastjson2.JSON.toJSONString(receipt);
        outboxService.enqueueAfterCommit(
                readReceiptTopic,
                EVENT_TYPE_READ_RECEIPT,
                "rr_" + input.target().targetUserId(),
                payload,
                processResult.lastReadMessageId(),
                List.of(input.target().targetUserId())
        );
    }

    private void publishReadSync(ReadMarkInput input, ReadMarkProcessResult processResult) {
        if (input == null || input.userId() == null) {
            return;
        }
        ReadReceiptDTO receipt = buildReadReceipt(input, processResult);
        String payload = com.alibaba.fastjson2.JSON.toJSONString(receipt);
        outboxService.enqueueAfterCommit(
                readReceiptTopic,
                EVENT_TYPE_READ_SYNC,
                "rs_" + input.userId(),
                payload,
                processResult.lastReadMessageId(),
                List.of(input.userId())
        );
    }

    private ReadReceiptDTO buildReadReceipt(ReadMarkInput input, ReadMarkProcessResult processResult) {
        return ReadReceiptDTO.builder()
                .conversationId(input.target().normalizedConversationId())
                .readerId(input.userId())
                .toUserId(input.target().targetUserId())
                .readAt(input.now())
                .lastReadMessageId(processResult.lastReadMessageId())
                .build();
    }

    private void publishGroupReadReceipts(ReadMarkInput input, ReadMarkProcessResult processResult) {
        if (!input.target().isGroup() || input.target().groupId() == null) {
            return;
        }
        // OPTIMIZE: 高并发发消息链路中强依赖同步调用 memberIds 会成为严重瓶颈。后续需重构为获取带本地过期机制的缓存，或由下层消费者去处理 Fan-out。
        // FIX: 群已读事件不再做全员实时广播，避免千人群下产生 O(N^2) WebSocket/Outbox 风暴。
        log.debug(
                "群已读事件仅更新本地 cursor，不进行全员 WebSocket 广播以避免 O(N^2) 风暴: groupId={}, readerId={}",
                input.target().groupId(),
                input.userId()
        );
    }

    private Message findExistingMessageByClientMessageId(Long senderId, String clientMessageId) {
        String normalizedClientMessageId = normalizeClientMessageId(clientMessageId);
        if (senderId == null || !StringUtils.hasText(normalizedClientMessageId)) {
            return null;
        }
        return messageMapper.selectOne(new LambdaQueryWrapper<Message>()
                .eq(Message::getSenderId, senderId)
                .eq(Message::getClientMessageId, normalizedClientMessageId)
                .last("limit 1"));
    }

    private String normalizeClientMessageId(String clientMessageId) {
        if (!StringUtils.hasText(clientMessageId)) {
            return null;
        }
        return clientMessageId.trim();
    }

    private String requireClientMessageId(String clientMessageId) {
        String normalizedClientMessageId = normalizeClientMessageId(clientMessageId);
        if (!StringUtils.hasText(normalizedClientMessageId)) {
            throw new BusinessException("clientMessageId不能为空");
        }
        return normalizedClientMessageId;
    }

    private MessageDTO buildSystemMessageDTO(Long senderId, Long receiverId, Message messageData) {
        var sender = userProfileCache.getUser(senderId);
        var receiver = userProfileCache.getUser(receiverId);
        MessageDTO messageDTO = MessageConverter.convertToDTO(
                messageData,
                sender == null ? "SYSTEM" : sender.getUsername(),
                sender == null ? null : sender.getAvatar(),
                receiver == null ? null : receiver.getUsername(),
                receiver == null ? null : receiver.getAvatar(),
                null
        );
        messageDTO.setGroup(false);
        return messageDTO;
    }

    private void enqueueSystemMessage(Long senderId, Long receiverId, Message messageData) {
        MessageDTO messageDTO = buildSystemMessageDTO(senderId, receiverId, messageData);
        String payload = com.alibaba.fastjson2.JSON.toJSONString(messageDTO);
        String key = buildPrivateConversationKey(senderId, receiverId);
        outboxService.enqueueAfterCommit(
                privateMessageTopic,
                EVENT_TYPE_MESSAGE,
                key,
                payload,
                messageData.getId(),
                List.of(receiverId)
        );
    }

    private List<Long> filterMessageTargets(List<Long> targetUserIds, Long excludeUserId) {
        if (targetUserIds == null) {
            return List.of();
        }
        return targetUserIds.stream()
                .filter(userId -> userId != null && !userId.equals(excludeUserId))
                .distinct()
                .collect(Collectors.toList());
    }

    private void clearConversationListCache(Long userId) {
        try {
            redisTemplate.delete(CONVERSATION_CACHE_KEY + userId);
        } catch (Exception cacheError) {
            log.warn("清理会话缓存失败: userId={}", userId, cacheError);
        }
    }

    private void updateMessageStatus(Message msg, Integer status) {
        LocalDateTime now = LocalDateTime.now();
        LambdaUpdateWrapper<Message> uw = new LambdaUpdateWrapper<Message>()
                .eq(Message::getId, msg.getId())
                .set(Message::getStatus, status)
                .set(Message::getUpdatedTime, now);
        messageMapper.update(null, uw);
        msg.setStatus(status);
        msg.setUpdatedTime(now);
    }

    private void clearStatusChangeConversationCache(Message msg) {
        boolean isGroup = Boolean.TRUE.equals(msg.getIsGroupChat());
        if (isGroup) {
            clearConversationCache(null, msg.getGroupId(), false);
            return;
        }
        clearConversationCache(msg.getSenderId(), msg.getReceiverId(), true);
    }

    private MessageDTO buildStatusChangedMessageDTO(Message msg) {
        boolean isGroup = Boolean.TRUE.equals(msg.getIsGroupChat());
        var sender = userProfileCache.getUser(msg.getSenderId());
        var receiver = !isGroup && msg.getReceiverId() != null ? userProfileCache.getUser(msg.getReceiverId()) : null;
        // FIX: 群消息状态变更的 Outbox payload 不再携带群成员列表，避免撤回/删除消息写放大。
        MessageDTO dto = MessageConverter.convertToDTO(
                msg,
                sender == null ? null : sender.getUsername(),
                sender == null ? null : sender.getAvatar(),
                receiver == null ? null : receiver.getUsername(),
                receiver == null ? null : receiver.getAvatar(),
                null
        );
        if (dto != null) {
            dto.setGroup(isGroup);
        }
        return dto;
    }

    private void publishStatusChangedMessage(Message msg, MessageDTO dto) {
        boolean isGroup = Boolean.TRUE.equals(msg.getIsGroupChat());
        String payload = com.alibaba.fastjson2.JSON.toJSONString(dto);
        if (isGroup) {
            // FIX: 群状态变更的投递目标与 DTO payload 解耦，避免 payload 瘦身后丢失 Fan-out 目标。
            List<Long> memberIds = userProfileCache.getGroupMemberIds(msg.getGroupId());
            outboxService.enqueueAfterCommit(
                    groupMessageTopic,
                    EVENT_TYPE_MESSAGE,
                    buildGroupConversationKey(msg.getGroupId()),
                    payload,
                    msg.getId(),
                    normalizeMessageTargets(memberIds)
            );
            return;
        }
        outboxService.enqueueAfterCommit(
                privateMessageTopic,
                EVENT_TYPE_MESSAGE,
                buildPrivateConversationKey(msg.getSenderId(), msg.getReceiverId()),
                payload,
                msg.getId(),
                privateConversationTargets(msg.getSenderId(), msg.getReceiverId())
        );
    }

    private List<Long> privateConversationTargets(Long senderId, Long receiverId) {
        List<Long> targetUserIds = new ArrayList<>(2);
        targetUserIds.add(receiverId);
        targetUserIds.add(senderId);
        return normalizeMessageTargets(targetUserIds);
    }

    private List<Long> normalizeMessageTargets(List<Long> targetUserIds) {
        if (targetUserIds == null) {
            return List.of();
        }
        return targetUserIds.stream()
                .filter(userId -> userId != null && userId > 0)
                .distinct()
                .collect(Collectors.toList());
    }

    private List<GroupMemberDTO> buildGroupRecipients(Long groupId, Long senderId, List<Long> memberIds) {
        if (groupId == null || memberIds == null) {
            return null;
        }
        return memberIds.stream()
                .filter(id -> id != null && !id.equals(senderId))
                .map(id -> GroupMemberDTO.builder().groupId(groupId).userId(id).build())
                .collect(Collectors.toList());
    }
}
