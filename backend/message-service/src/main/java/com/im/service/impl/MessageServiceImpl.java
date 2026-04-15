package com.im.service.impl;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.conditions.update.LambdaUpdateWrapper;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.im.dto.MessageDTO;
import com.im.dto.ReadEvent;
import com.im.dto.StatusChangeEvent;
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
import com.im.mapper.PrivateReadCursorMapper;
import com.im.service.MessageService;
import com.im.service.command.SendMessageCommand;
import com.im.service.support.UserProfileCache;
import com.im.util.MessageConverter;
import com.im.message.entity.PrivateReadCursor;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.kafka.core.KafkaTemplate;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.data.redis.core.RedisTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

import jakarta.annotation.PostConstruct;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.Collections;
import java.util.EnumMap;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ExecutionException;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.TimeoutException;
import java.util.stream.Collectors;

/**
 * 娑堟伅鏈嶅姟瀹炵幇绫? */
@Slf4j
@Service
@RequiredArgsConstructor
public class MessageServiceImpl implements MessageService {

    private static final String EVENT_TYPE_MESSAGE = "MESSAGE";
    private static final String EVENT_TYPE_READ_RECEIPT = "READ_RECEIPT";
    private static final String EVENT_TYPE_READ_SYNC = "READ_SYNC";
    private final MessageMapper messageMapper;
    private final UserServiceFeignClient userServiceFeignClient;
    private final GroupServiceFeignClient groupServiceFeignClient;
    private final RedisTemplate<String, Object> redisTemplate;
    private final GroupReadCursorMapper groupReadCursorMapper;
    private final PrivateReadCursorMapper privateReadCursorMapper;
    private final UserProfileCache userProfileCache;
    private final List<MessageHandler> messageHandlers;
    private final KafkaTemplate<String, ReadEvent> readEventKafkaTemplate;
    private final KafkaTemplate<String, StatusChangeEvent> statusChangeEventKafkaTemplate;

    private Map<MessageType, MessageHandler> handlerCache = Collections.emptyMap();
    private MessageHandler privateMessageHandler;
    private MessageHandler groupMessageHandler;

    private static final String CONVERSATION_CACHE_KEY = "conversations:user:";
    private static final String LAST_MESSAGE_CACHE_KEY = "last_message:";
    private static final long CACHE_EXPIRE_HOURS = 1;

    @Value("${im.message.text.enforce:true}")
    private boolean textEnforce;

    @Value("${im.message.text.max-length:2000}")
    private int textMaxLength;

    @Value("${im.message.system.sender-id:0}")
    private Long defaultSystemSenderId;

    @Value("${im.kafka.read-topic:im-read-topic}")
    private String readTopic;

    @Value("${im.kafka.status-topic:im-status-topic}")
    private String statusTopic;

    @Value("${im.kafka.send-timeout-ms:2000}")
    private long kafkaSendTimeoutMs = 2000L;

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
    }

    @Override
    public MessageDTO sendGroupMessage(Long senderId, SendGroupMessageRequest request) {
        return sendMessage(toGroupCommand(senderId, request));
        
    }

    @Override
    public MessageDTO sendSystemMessage(Long receiverId, String content, Long senderId) {
        return sendMessage(toSystemCommand(receiverId, content, senderId));
        
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

    @Override
    // 绉婚櫎 @Cacheable 娉ㄨВ锛屽畬鍏ㄧ敱鍐呴儴鎵嬪姩绠＄悊缂撳瓨锛岄伩鍏嶄笌鎵嬪姩閫昏緫鍐茬獊
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
     * 鎵归噺鑾峰彇鏈€鍚庢秷鎭紝鍑忓皯鏁版嵁搴撴煡璇?     */
 
    
    /**
     * 鑾峰彇鏈娑堟伅鏁伴噺
     */
    private Long getUnreadCount(Long userId, Long targetId, boolean isPrivate) {
        try {
            if (userId == null || targetId == null) {
                return 0L;
            }
            if (isPrivate) {
                PrivateReadCursor cursor = privateReadCursorMapper.selectOne(new LambdaQueryWrapper<PrivateReadCursor>()
                        .eq(PrivateReadCursor::getUserId, userId)
                        .eq(PrivateReadCursor::getPeerUserId, targetId)
                        .last("limit 1"));
                LocalDateTime lastReadAt = cursor == null ? null : cursor.getLastReadAt();
                LambdaQueryWrapper<Message> wrapper = new LambdaQueryWrapper<Message>()
                        .eq(Message::getReceiverId, userId)
                        .eq(Message::getSenderId, targetId)
                        .eq(Message::getIsGroupChat, false)
                        .ne(Message::getStatus, Message.MessageStatus.DELETED);
                if (lastReadAt != null) {
                    wrapper.gt(Message::getCreatedTime, lastReadAt);
                }
                Long cnt = messageMapper.selectCount(wrapper);
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
            log.warn("鑾峰彇鏈娑堟伅鏁伴噺澶辫触锛寀serId: {}, targetId: {}, isPrivate: {}", userId, targetId, isPrivate, e);
            return 0L;
        }
    }
    
    @Override
    public void markAsRead(Long userId, String conversationId) {
        try {
            ReadMarkInput input = markReadInput(userId, conversationId);
            Long lastReadMessageId = resolveLastReadMessageId(input);
            ReadEvent readEvent = buildReadEvent(input, lastReadMessageId);
            publishReadEvent(readEvent, input.target().normalizedConversationId());
            log.info("Accepted read event. userId={}, conversationId={}, lastReadMessageId={}",
                    userId, input.target().normalizedConversationId(), lastReadMessageId);
            if (false) {
                    throw new BusinessException("鏍囪娑堟伅宸茶澶辫触");
                }
            // legacy synchronous mark-read path removed
        } catch (NumberFormatException e) {
            log.warn("浼氳瘽ID鏍煎紡閿欒: {}", conversationId);
            throw new BusinessException("浼氳瘽ID鏍煎紡閿欒");
        } catch (BusinessException e) {
            log.warn("鏍囪娑堟伅宸茶澶辫触锛岀敤鎴稩D: {}, 浼氳瘽ID: {}, reason: {}",
                    userId, conversationId, e.getMessage());
            throw e;
        } catch (Exception e) {
            log.error("鏍囪娑堟伅宸茶澶辫触锛岀敤鎴稩D: {}, 浼氳瘽ID: {}", userId, conversationId, e);
            throw new BusinessException("鏍囪娑堟伅宸茶澶辫触");
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
        return new ReadMarkInput(userId, conversationId, now, target);
    }

    private Long resolveLastReadMessageId(ReadMarkInput input) {
        if (input == null || input.target() == null) {
            return null;
        }
        if (input.target().isGroup()) {
            Message lastMessage = messageMapper.selectOne(new LambdaQueryWrapper<Message>()
                    .eq(Message::getGroupId, input.target().groupId())
                    .eq(Message::getIsGroupChat, true)
                    .ne(Message::getStatus, Message.MessageStatus.DELETED)
                    .orderByDesc(Message::getId)
                    .last("limit 1"));
            return lastMessage == null ? null : lastMessage.getId();
        }
        Message lastMessage = messageMapper.selectOne(new LambdaQueryWrapper<Message>()
                .eq(Message::getIsGroupChat, false)
                .ne(Message::getStatus, Message.MessageStatus.DELETED)
                .and(w -> w.eq(Message::getSenderId, input.userId()).eq(Message::getReceiverId, input.target().targetUserId())
                        .or()
                        .eq(Message::getSenderId, input.target().targetUserId()).eq(Message::getReceiverId, input.userId()))
                .orderByDesc(Message::getId)
                .last("limit 1"));
        return lastMessage == null ? null : lastMessage.getId();
    }

    private ReadEvent buildReadEvent(ReadMarkInput input, Long lastReadMessageId) {
        return ReadEvent.builder()
                .userId(input.userId())
                .conversationId(input.target().normalizedConversationId())
                .targetUserId(input.target().targetUserId())
                .groupId(input.target().groupId())
                .group(input.target().isGroup())
                .lastReadMessageId(lastReadMessageId)
                .timestamp(input.now())
                .build();
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
        if (conversationId.startsWith("g_")) {
            Long groupId = Long.parseLong(conversationId.substring(2));
            return new ReadConversationTarget(true, groupId, null, "group_" + groupId);
        }
        if (conversationId.startsWith("p_")) {
            String[] parts = conversationId.split("_");
            if (parts.length != 3) {
                throw new BusinessException("缁変浇浜版导姘崇樈ID閺嶇厧绱￠柨娆掝嚖");
            }
            Long userId1 = Long.parseLong(parts[1]);
            Long userId2 = Long.parseLong(parts[2]);
            Long targetUserId = userId.equals(userId1) ? userId2 : userId1;
            String normalizedConversationId = buildPrivateConversationKey(userId, targetUserId);
            return new ReadConversationTarget(false, null, targetUserId, normalizedConversationId);
        }
        if (conversationId.contains("_")) {
            String[] parts = conversationId.split("_");
            if (parts.length != 2) {
                throw new BusinessException("绉佽亰浼氳瘽ID鏍煎紡閿欒");
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

    private record ReadConversationTarget(boolean isGroup, Long groupId, Long targetUserId, String normalizedConversationId) {
    }

    private record ReadMarkInput(
            Long userId,
            String conversationId,
            LocalDateTime now,
            ReadConversationTarget target
    ) {
    }


    /**
     * 娓呴櫎浼氳瘽鐩稿叧缂撳瓨
     */
    private void clearConversationCache(Long userId1, Long userId2, boolean isPrivate) {
        try {
            if (isPrivate && userId1 != null && userId2 != null) {
                String conversationKey = buildPrivateConversationKey(userId1, userId2);
                redisTemplate.delete(LAST_MESSAGE_CACHE_KEY + conversationKey);
                redisTemplate.delete(CONVERSATION_CACHE_KEY + userId1);
                redisTemplate.delete(CONVERSATION_CACHE_KEY + userId2);
            } else if (!isPrivate && userId2 != null) {
                String conversationKey = buildGroupConversationKey(userId2);
                redisTemplate.delete(LAST_MESSAGE_CACHE_KEY + conversationKey);
            }
        } catch (Exception e) {
            log.warn("娓呴櫎缂撳瓨澶辫触", e);
        }
    }
    
    private void validateMessageContent(MessageType messageType, String content, String mediaUrl) {
        // 鏂囨湰/绯荤粺娑堟伅鍐呭涓嶈兘涓虹┖
        if ((messageType == MessageType.TEXT || messageType == MessageType.SYSTEM) && !StringUtils.hasText(content)) {
            throw new BusinessException("娑堟伅鍐呭涓嶈兘涓虹┖");
        }

        if (messageType == MessageType.TEXT || messageType == MessageType.SYSTEM) {
            if (textEnforce && textMaxLength > 0) {
                int len = content == null ? 0 : content.codePointCount(0, content.length());
                if (len > textMaxLength) {
                    throw new BusinessException("message content cannot exceed " + textMaxLength + " characters");
                }
            }
        }
        
        // 濯掍綋娑堟伅锛氬彧鎺ュ彈URL锛堟枃浠跺瓨COS锛夛紝涓嶅啀鎺ュ彈Base64
        if (messageType != MessageType.TEXT && messageType != MessageType.SYSTEM && !StringUtils.hasText(mediaUrl)) {
            throw new BusinessException("濯掍綋URL涓嶈兘涓虹┖");
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


    @Override
    public List<MessageDTO> getPrivateMessages(Long userId, Long friendId, int page, int size) {
        log.info("鑾峰彇绉佽亰娑堟伅鍘嗗彶: userId={}, friendId={}, page={}, size={}", userId, friendId, page, size);
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
        
        log.info("鑾峰彇鍒扮鑱婃秷鎭暟閲? {}", messages.size());
        return toPrivateMessageDTOs(messages, userId, friendId);
    }
    @Override
    public List<MessageDTO> getGroupMessages(Long userId, Long groupId, int page, int size) {
        log.info("鑾峰彇缇よ亰娑堟伅鍘嗗彶: userId={}, groupId={}, page={}, size={}", userId, groupId, page, size);
        validateGroupConversationAccess(userId, groupId);
        
        Page<Message> mpPage = new Page<>(Math.max(1, page + 1L), Math.max(1, size));
        LambdaQueryWrapper<Message> wrapper = new LambdaQueryWrapper<Message>()
                .eq(Message::getGroupId, groupId)
                .eq(Message::getIsGroupChat, true)
                .ne(Message::getStatus, 5)
                .orderByDesc(Message::getCreatedTime);
        Page<Message> result = messageMapper.selectPage(mpPage, wrapper);
        List<Message> messages = result.getRecords();
        
        log.info("鑾峰彇鍒扮兢鑱婃秷鎭暟閲? {}", messages.size());
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
    public MessageDTO recallMessage(Long userId, Long messageId) {
        Message recallTarget = recallInput(userId, messageId);
        LocalDateTime now = LocalDateTime.now();
        recallTarget.setStatus(Message.MessageStatus.RECALLED);
        recallTarget.setUpdatedTime(now);
        MessageDTO result = buildStatusChangedMessageDTO(recallTarget);
        StatusChangeEvent statusChangeEvent = buildStatusChangeEvent(recallTarget, userId, result, now);
        publishStatusChangeEvent(statusChangeEvent, statusChangeEvent.getConversationId());
        return result;
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
            throw new IllegalArgumentException("鍙傛暟涓嶈兘涓虹┖");
        }
        Message msg = messageMapper.selectById(messageId);
        if (msg == null || msg.getStatus() == Message.MessageStatus.DELETED) {
            throw new BusinessException("message not found");
        }
        if (msg.getSenderId() == null || !msg.getSenderId().equals(userId)) {
            throw new SecurityException("鍙兘鎾ゅ洖鑷繁鍙戦€佺殑娑堟伅");
        }
        if (msg.getCreatedTime() != null && msg.getCreatedTime().plusMinutes(2).isBefore(LocalDateTime.now())) {
            throw new BusinessException("鍙兘鎾ゅ洖2鍒嗛挓鍐呯殑娑堟伅");
        }
        return msg;
    }

    private Message deleteInput(Long userId, Long messageId) {
        if (userId == null || messageId == null) {
            throw new IllegalArgumentException("鍙傛暟涓嶈兘涓虹┖");
        }
        Message msg = messageMapper.selectById(messageId);
        if (msg == null) {
            throw new BusinessException("message not found");
        }
        if (msg.getSenderId() == null || !msg.getSenderId().equals(userId)) {
            throw new SecurityException("鍙兘鍒犻櫎鑷繁鍙戦€佺殑娑堟伅");
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
            throw new BusinessException("user not found");
        }
        if (!Boolean.TRUE.equals(userServiceFeignClient.exists(friendId))) {
            throw new BusinessException("friend not found");
        }
        if (!Boolean.TRUE.equals(userProfileCache.isFriend(userId, friendId))) {
            throw new BusinessException("not friends, cannot view private chat history");
        }
    }

    private void validateGroupConversationAccess(Long userId, Long groupId) {
        if (!Boolean.TRUE.equals(userServiceFeignClient.exists(userId))) {
            throw new BusinessException("user not found");
        }
        if (!Boolean.TRUE.equals(groupServiceFeignClient.exists(groupId))) {
            throw new BusinessException("group not found");
        }
        if (!Boolean.TRUE.equals(userProfileCache.isGroupMember(groupId, userId))) {
            throw new BusinessException("涓嶆槸缇ゆ垚鍛橈紝鏃犳硶鏌ョ湅缇よ亰璁板綍");
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
                        ? (lastMessage.getSenderId().equals(userId) ? "me" : friend.getNickname()) : null)
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
                        ? (lastMessage.getSenderId().equals(userId) ? "me" : "group member") : null)
                .lastMessageTime(lastMessage != null ? lastMessage.getCreatedTime() : null)
                .unreadCount(unreadCount.longValue())
                .isOnline(false)
                .isPinned(false)
                .isMuted(false)
                .build();
    }

    private void publishReadEvent(ReadEvent readEvent, String routingKey) {
        if (readEvent == null) {
            throw new BusinessException("read event cannot be null");
        }
        try {
            readEventKafkaTemplate.send(readTopic, routingKey, readEvent)
                    .get(Math.max(1L, kafkaSendTimeoutMs), TimeUnit.MILLISECONDS);
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            throw new BusinessException("publish read event interrupted", e);
        } catch (ExecutionException | TimeoutException e) {
            throw new BusinessException("publish read event failed", e);
        }
    }

    private String requireClientMessageId(String clientMessageId) {
        String normalizedClientMessageId = normalizeClientMessageId(clientMessageId);
        if (!StringUtils.hasText(normalizedClientMessageId)) {
            throw new BusinessException("clientMessageId涓嶈兘涓虹┖");
        }
        return normalizedClientMessageId;
    }

    private String normalizeClientMessageId(String clientMessageId) {
        if (!StringUtils.hasText(clientMessageId)) {
            return null;
        }
        return clientMessageId.trim();
    }

    private void clearConversationListCache(Long userId) {
        try {
            redisTemplate.delete(CONVERSATION_CACHE_KEY + userId);
        } catch (Exception cacheError) {
            log.warn("娓呯悊浼氳瘽缂撳瓨澶辫触: userId={}", userId, cacheError);
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

    private StatusChangeEvent buildStatusChangeEvent(Message msg,
                                                     Long operatorUserId,
                                                     MessageDTO dto,
                                                     LocalDateTime changedAt) {
        boolean isGroup = Boolean.TRUE.equals(msg.getIsGroupChat());
        return StatusChangeEvent.builder()
                .messageId(msg.getId())
                .conversationId(isGroup ? buildGroupConversationKey(msg.getGroupId()) : buildPrivateConversationKey(msg.getSenderId(), msg.getReceiverId()))
                .operatorUserId(operatorUserId)
                .senderId(msg.getSenderId())
                .receiverId(msg.getReceiverId())
                .groupId(msg.getGroupId())
                .group(isGroup)
                .newStatus(msg.getStatus())
                .statusText(dto == null ? null : dto.getStatus())
                .changedAt(changedAt)
                .payload(dto)
                .build();
    }

    private void publishStatusChangeEvent(StatusChangeEvent statusChangeEvent, String routingKey) {
        if (statusChangeEvent == null) {
            throw new BusinessException("status change event cannot be null");
        }
        try {
            statusChangeEventKafkaTemplate.send(statusTopic, routingKey, statusChangeEvent)
                    .get(Math.max(1L, kafkaSendTimeoutMs), TimeUnit.MILLISECONDS);
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            throw new BusinessException("publish status change event interrupted", e);
        } catch (ExecutionException | TimeoutException e) {
            throw new BusinessException("publish status change event failed", e);
        }
    }

    private void publishStatusChangedMessage(Message msg, MessageDTO dto) {
        if (msg == null) {
            return;
        }
        LocalDateTime changedAt = msg.getUpdatedTime() == null ? LocalDateTime.now() : msg.getUpdatedTime();
        StatusChangeEvent statusChangeEvent = buildStatusChangeEvent(msg, msg.getSenderId(), dto, changedAt);
        publishStatusChangeEvent(statusChangeEvent, statusChangeEvent.getConversationId());
    }

}


