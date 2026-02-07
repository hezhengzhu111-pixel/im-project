package com.im.service.impl;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.conditions.update.LambdaUpdateWrapper;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.im.component.MessageRateLimiter;
import com.im.dto.GroupMemberDTO;
import com.im.dto.MessageDTO;
import com.im.dto.ReadReceiptDTO;
import com.im.dto.request.SendGroupMessageRequest;
import com.im.dto.request.SendPrivateMessageRequest;
import com.im.entity.Message;
import com.im.dto.ConversationDTO;
import com.im.enums.MessageType;
import com.im.exception.BusinessException;
import com.im.feign.GroupServiceFeignClient;
import com.im.feign.UserServiceFeignClient;
import com.im.entity.GroupReadCursor;
import com.im.mapper.GroupReadCursorMapper;
import com.im.mapper.MessageMapper;
import com.im.service.OutboxService;
import com.im.service.MessageService;
import com.im.service.support.UserProfileCache;
import com.im.util.MessageConverter;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;
// 移除未使用的 Cacheable 导入
import org.springframework.cache.annotation.CacheEvict;
import org.springframework.data.redis.core.RedisTemplate;
import java.util.List;
import java.util.ArrayList;
import java.util.Map;
import java.util.HashMap;
import java.util.concurrent.TimeUnit;
import java.util.stream.Collectors;
import java.time.LocalDateTime;

/**
 * 消息服务实现类
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class MessageServiceImpl implements MessageService {
    
    private final MessageMapper messageMapper;
    private final UserServiceFeignClient userServiceFeignClient;
    private final GroupServiceFeignClient groupServiceFeignClient;
    private final RedisTemplate<String, Object> redisTemplate;
    private final MessageRateLimiter messageRateLimiter;
    private final org.springframework.kafka.core.KafkaTemplate<String, String> kafkaTemplate;
    private final OutboxService outboxService;
    private final GroupReadCursorMapper groupReadCursorMapper;
    private final UserProfileCache userProfileCache;
    
    private static final String CONVERSATION_CACHE_KEY = "conversations:user:";
    private static final String LAST_MESSAGE_CACHE_KEY = "last_message:";
    private static final long CACHE_EXPIRE_HOURS = 1;

    @Value("${im.message.text.enforce:true}")
    private boolean textEnforce;

    @Value("${im.message.text.max-length:2000}")
    private int textMaxLength;

    @Override
    @Transactional
    @CacheEvict(value = "conversations", key = "#senderId")
    public MessageDTO sendPrivateMessage(Long senderId, SendPrivateMessageRequest request) {
        // 检查消息限流
        if (!messageRateLimiter.canSendMessage(senderId)) {
            throw new BusinessException("发送消息过于频繁，请稍后再试");
        }
        
        Long receiverId = Long.valueOf(request.getReceiverId());
        var sender = userProfileCache.getUser(senderId);
        var receiver = userProfileCache.getUser(receiverId);
        if (sender == null || receiver == null) {
            throw new BusinessException("用户不存在");
        }
        
        // 检查是否为好友关系
        if (!Boolean.TRUE.equals(userServiceFeignClient.isFriend(senderId, receiverId))) {
            throw new BusinessException("只能向好友发送消息");
        }
        
        // 验证消息内容
        validateMessageContent(request.getMessageType(), request.getContent(), request.getMediaUrl());
        
        // 创建消息
        Message messageData = createMessageData(request, senderId, receiverId);
        messageData.setIsGroupChat(false);
        
        messageMapper.insert(messageData);
        Message savedMessage = messageData;
        
        // 记录消息发送
        messageRateLimiter.recordMessage(senderId);
        
        // 清除相关缓存
        clearConversationCache(senderId, receiverId, true);

        MessageDTO messageDTO = MessageConverter.convertToDTO(savedMessage, sender.getUsername(), sender.getAvatar(), receiver.getUsername(), receiver.getAvatar(), null);
        // 设置 isGroup 为 false，确保推送时前端能正确识别为私聊
        messageDTO.setGroup(false);
        String payload = com.alibaba.fastjson2.JSON.toJSONString(messageDTO);
        String key = buildPrivateConversationKey(senderId, receiverId);
        outboxService.enqueueAfterCommit("im-private-message-topic", key, payload, savedMessage.getId());
        return messageDTO;
    }

    private Message createMessageData(SendPrivateMessageRequest request, Long senderId, Long receiverId)  {
        Message message = new Message();
        message.setSenderId(senderId);
        message.setReceiverId(receiverId);
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
    @Transactional
    @CacheEvict(value = "conversations", key = "#senderId")
    public MessageDTO sendGroupMessage(Long senderId, SendGroupMessageRequest request) {
        // 检查消息限流
        if (!messageRateLimiter.canSendMessage(senderId)) {
            throw new BusinessException("发送消息过于频繁，请稍后再试");
        }
        
        var sender = userProfileCache.getUser(senderId);
        if (sender == null) {
            throw new BusinessException("用户不存在");
        }
        String groupId = request.getGroupId();
        if (!StringUtils.hasText(groupId)) {
            throw new BusinessException("群组ID不能为空");
        }
        Long groupIdLong = Long.valueOf(groupId);
        if (!Boolean.TRUE.equals(groupServiceFeignClient.exists(groupIdLong))) {
            throw new BusinessException("群组不存在");
        }
        if (!Boolean.TRUE.equals(groupServiceFeignClient.isMember(groupIdLong, senderId))) {
            throw new BusinessException("只有群成员才能发送消息");
        }
        
        // 验证消息内容
        validateMessageContent(request.getMessageType(), request.getContent(), request.getMediaUrl());
        
        // 创建消息
        Message messageData = createMessageData(request, senderId);
        messageMapper.insert(messageData);
        Message savedMessage = messageData;
        
        // 记录消息发送
        messageRateLimiter.recordMessage(senderId);
        
        // 清除群组相关缓存
        clearConversationCache(null, groupIdLong, false);
        
        List<Long> memberIds = groupServiceFeignClient.memberIds(groupIdLong);
        List<GroupMemberDTO> groupMembers = memberIds == null ? null : memberIds.stream()
                .filter(id -> id != null && !id.equals(senderId))
                .map(id -> GroupMemberDTO.builder().groupId(groupIdLong).userId(id).build())
                .collect(Collectors.toList());

        MessageDTO messageDTO = MessageConverter.convertToDTO(savedMessage, sender.getUsername(), sender.getAvatar(), null, null, null);
        messageDTO.setGroupMembers(groupMembers);
        String payload = com.alibaba.fastjson2.JSON.toJSONString(messageDTO);
        String key = buildGroupConversationKey(groupIdLong);
        outboxService.enqueueAfterCommit("im-group-message-topic", key, payload, savedMessage.getId());
        return messageDTO;
    }

    private Message createMessageData(SendGroupMessageRequest request, Long senderId) {
        Message message = new Message();
        message.setSenderId(senderId);
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
        
        List<ConversationDTO> conversations = new ArrayList<>();

        List<com.im.dto.UserDTO> friends = userServiceFeignClient.friendList(userId);
        List<com.im.dto.GroupInfoDTO> groups = groupServiceFeignClient.listUserGroups(userId);
        if (friends == null) {
            friends = List.of();
        }
        if (groups == null) {
            groups = List.of();
        }

        if (!friends.isEmpty()) {
                // 批量查询私聊最后消息
                List<Long> friendIds = friends.stream()
                        .map(com.im.dto.UserDTO::getId)
                        .filter(StringUtils::hasText)
                        .map(Long::valueOf)
                        .collect(Collectors.toList());
                List<Message> lastPrivateMessages = friendIds.isEmpty()
                        ? List.of()
                        : messageMapper.selectLastPrivateMessagesBatch(userId, friendIds);
                Map<Long, Message> lastMessageMap = new HashMap<>();
                
                for (Message message : lastPrivateMessages) {
                    Long friendId = message.getSenderId().equals(userId) ? message.getReceiverId() : message.getSenderId();
                    lastMessageMap.put(friendId, message);
                }
                
                // 批量统计未读消息
                List<MessageMapper.CountPair> unreadCounts = friendIds.isEmpty()
                        ? List.of()
                        : messageMapper.countUnreadPrivateMessagesBatch(userId, friendIds);
                Map<Long, Integer> unreadCountMap = new HashMap<>();
                for (MessageMapper.CountPair result : unreadCounts) {
                    if (result.getSenderId() != null && result.getCnt() != null) {
                        unreadCountMap.put(result.getSenderId(), result.getCnt().intValue());
                    }
                }
                
                // 构建私聊会话
                for (com.im.dto.UserDTO friend : friends) {
                    Long friendIdLong = friend.getId() == null ? null : Long.valueOf(friend.getId());
                    // 如果是自己，跳过（不应该在好友列表中出现自己，但为了保险起见）
                    if (friendIdLong != null && friendIdLong.equals(userId)) {
                        continue;
                    }
                    
                    Message lastMessage = friendIdLong == null ? null : lastMessageMap.get(friendIdLong);
                    Integer unreadCount = friendIdLong == null ? 0 : unreadCountMap.getOrDefault(friendIdLong, 0);
                    
                    ConversationDTO conversation = ConversationDTO.builder()
                        .conversationId(friend.getId())
                        .conversationType(1) // 私聊
                        .conversationName(friend.getNickname() != null ? friend.getNickname() : friend.getUsername())
                        .conversationAvatar(friend.getAvatar())
                        .lastMessage(lastMessage != null ? lastMessage.getContent() : "")
                        .lastMessageType(lastMessage != null ? lastMessage.getMessageType() : null)
                        .lastMessageSenderId(lastMessage != null ? lastMessage.getSenderId().toString() : null)
                        .lastMessageSenderName(lastMessage != null ? 
                            (lastMessage.getSenderId().equals(userId) ? "我" : friend.getNickname()) : null)
                        .lastMessageTime(lastMessage != null ? lastMessage.getCreatedTime() : null)
                        .unreadCount(unreadCount.longValue())
                        .isOnline(false) // TODO: 实现在线状态
                        .isPinned(false) // TODO: 实现置顶功能
                        .isMuted(false) // TODO: 实现免打扰功能
                        .build();
                        
                    conversations.add(conversation);
                }
        }
        
        if (!groups.isEmpty()) {
                // 批量查询群聊最后消息
                List<Long> groupIds = groups.stream().map(com.im.dto.GroupInfoDTO::getId).collect(Collectors.toList());
                List<Message> lastGroupMessages = groupIds.isEmpty()
                        ? List.of()
                        : messageMapper.selectLastGroupMessagesBatch(groupIds);
                Map<Long, Message> lastGroupMessageMap = new HashMap<>();
                
                for (Message message : lastGroupMessages) {
                    lastGroupMessageMap.put(message.getGroupId(), message);
                }
                
                // 批量统计群聊未读消息
                List<MessageMapper.CountPair> groupUnreadCounts = groupIds.isEmpty()
                        ? List.of()
                        : messageMapper.countUnreadGroupMessagesBatch(groupIds, userId, null);
                Map<Long, Integer> groupUnreadCountMap = new HashMap<>();
                for (MessageMapper.CountPair result : groupUnreadCounts) {
                    if (result.getGroupId() != null && result.getCnt() != null) {
                        groupUnreadCountMap.put(result.getGroupId(), result.getCnt().intValue());
                    }
                }
                
                // 构建群聊会话
                for (com.im.dto.GroupInfoDTO group : groups) {
                    Message lastMessage = lastGroupMessageMap.get(group.getId());
                    Integer unreadCount = groupUnreadCountMap.getOrDefault(group.getId(), 0);
                    
                    ConversationDTO conversation = ConversationDTO.builder()
                        .conversationId(group.getId().toString())
                        .conversationType(2) // 群聊
                        .conversationName(group.getName())
                        .conversationAvatar(group.getAvatar())
                        .lastMessage(lastMessage != null ? lastMessage.getContent() : "")
                        .lastMessageType(lastMessage != null ? lastMessage.getMessageType() : null)
                        .lastMessageSenderId(lastMessage != null ? lastMessage.getSenderId().toString() : null)
                        .lastMessageSenderName(lastMessage != null ? 
                            (lastMessage.getSenderId().equals(userId) ? "我" : "群成员") : null)
                        .lastMessageTime(lastMessage != null ? lastMessage.getCreatedTime() : null)
                        .unreadCount(unreadCount.longValue())
                        .isOnline(false) // 群聊不需要在线状态
                        .isPinned(false) // TODO: 实现置顶功能
                        .isMuted(false) // TODO: 实现免打扰功能
                        .build();
                        
                    conversations.add(conversation);
                }
        }
        
        // 按最后消息时间排序
        conversations = conversations.stream()
            .sorted((c1, c2) -> {
                if (c1.getLastMessageTime() == null && c2.getLastMessageTime() == null) return 0;
                if (c1.getLastMessageTime() == null) return 1;
                if (c2.getLastMessageTime() == null) return -1;
                return c2.getLastMessageTime().compareTo(c1.getLastMessageTime());
            })
            .collect(Collectors.toList());
        
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
    @Transactional
    public void markAsRead(Long userId, String conversationId) {
        try {
            int updatedCount = 0;
            LocalDateTime now = LocalDateTime.now();
            Long notifyUserId = null;
            String normalizedConversationId = conversationId;
            
            if (conversationId.startsWith("group_")) {
                // 群聊消息标记已读
                String groupIdStr = conversationId.substring(6); // 移除"group_"前缀
                Long groupId = Long.parseLong(groupIdStr);
                GroupReadCursor cursor = groupReadCursorMapper.selectOne(new LambdaQueryWrapper<GroupReadCursor>()
                        .eq(GroupReadCursor::getGroupId, groupId)
                        .eq(GroupReadCursor::getUserId, userId)
                        .last("limit 1"));
                if (cursor == null) {
                    cursor = new GroupReadCursor();
                    cursor.setGroupId(groupId);
                    cursor.setUserId(userId);
                }
                cursor.setLastReadAt(now);
                if (cursor.getId() == null) {
                    groupReadCursorMapper.insert(cursor);
                } else {
                    groupReadCursorMapper.updateById(cursor);
                }
                updatedCount = 0;
            } else if (conversationId.contains("_")) {
                // 私聊消息标记已读，格式为"userId1_userId2"
                String[] parts = conversationId.split("_");
                if (parts.length == 2) {
                    Long userId1 = Long.parseLong(parts[0]);
                    Long userId2 = Long.parseLong(parts[1]);
                    
                    // 确定对方用户ID
                    Long targetUserId = userId.equals(userId1) ? userId2 : userId1;
                    notifyUserId = targetUserId;
                    updatedCount = messageMapper.update(null, new LambdaUpdateWrapper<Message>()
                            .eq(Message::getReceiverId, userId)
                            .eq(Message::getSenderId, targetUserId)
                            .eq(Message::getIsGroupChat, false)
                            .in(Message::getStatus, 1, 2)
                            .set(Message::getStatus, Message.MessageStatus.READ)
                            .set(Message::getUpdatedTime, now));
                } else {
                    throw new BusinessException("私聊会话ID格式错误");
                }
            } else {
                // 兼容旧格式，直接解析为Long
                Long convId = Long.parseLong(conversationId);
                notifyUserId = convId;
                normalizedConversationId = buildPrivateConversationKey(userId, convId);
                updatedCount = messageMapper.update(null, new LambdaUpdateWrapper<Message>()
                        .eq(Message::getReceiverId, userId)
                        .eq(Message::getSenderId, convId)
                        .eq(Message::getIsGroupChat, false)
                        .in(Message::getStatus, 1, 2)
                        .set(Message::getStatus, Message.MessageStatus.READ)
                        .set(Message::getUpdatedTime, now));
            }
            
            log.info("用户 {} 标记会话 {} 的消息为已读，更新了 {} 条消息", userId, conversationId, updatedCount);

            if (updatedCount > 0 && notifyUserId != null && !conversationId.startsWith("group_")) {
                Message lastRead = messageMapper.selectOne(new LambdaQueryWrapper<Message>()
                        .eq(Message::getReceiverId, userId)
                        .eq(Message::getSenderId, notifyUserId)
                        .eq(Message::getIsGroupChat, false)
                        .eq(Message::getStatus, Message.MessageStatus.READ)
                        .orderByDesc(Message::getId)
                        .last("limit 1"));
                Long lastReadMessageId = lastRead == null ? null : lastRead.getId();

                ReadReceiptDTO receipt = ReadReceiptDTO.builder()
                        .conversationId(normalizedConversationId)
                        .readerId(userId)
                        .toUserId(notifyUserId)
                        .readAt(now)
                        .lastReadMessageId(lastReadMessageId)
                        .build();
                String payload = com.alibaba.fastjson2.JSON.toJSONString(receipt);
                outboxService.enqueueAfterCommit("im-read-receipt-topic", "rr_" + notifyUserId, payload, lastReadMessageId);
            }

            try {
                redisTemplate.delete(CONVERSATION_CACHE_KEY + userId);
            } catch (Exception cacheError) {
                log.warn("清理会话缓存失败: userId={}", userId, cacheError);
            }
        } catch (NumberFormatException e) {
            log.error("会话ID格式错误: {}", conversationId, e);
            throw new BusinessException("会话ID格式错误");
        } catch (Exception e) {
            log.error("标记消息已读失败，用户ID: {}, 会话ID: {}", userId, conversationId, e);
            throw new BusinessException("标记消息已读失败");
        }
    }
    
    /**
     * 清除会话相关缓存
     */
    private void clearConversationCache(Long userId1, Long userId2, boolean isPrivate) {
        try {
            if (isPrivate && userId1 != null && userId2 != null) {
                // 清除私聊相关缓存
                String conversationKey = "private_" + Math.min(userId1, userId2) + "_" + Math.max(userId1, userId2);
                redisTemplate.delete(LAST_MESSAGE_CACHE_KEY + conversationKey);
                redisTemplate.delete(CONVERSATION_CACHE_KEY + userId1);
                redisTemplate.delete(CONVERSATION_CACHE_KEY + userId2);
            } else if (!isPrivate && userId2 != null) {
                // 清除群聊相关缓存
                String conversationKey = "group_" + userId2;
                redisTemplate.delete(LAST_MESSAGE_CACHE_KEY + conversationKey);
                // 清除所有群成员的会话缓存
                List<Long> memberIds = groupServiceFeignClient.memberIds(userId2);
                if (memberIds != null) {
                    for (Long memberId : memberIds) {
                        if (memberId != null) {
                            redisTemplate.delete(CONVERSATION_CACHE_KEY + memberId);
                        }
                    }
                }
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

    private void sendKafkaAfterCommit(String topic, String key, String payload) {
        outboxService.enqueueAfterCommit(topic, key, payload, null);
    }
    
    @Override
    public List<MessageDTO> getPrivateMessages(Long userId, Long friendId, int page, int size) {
        log.info("获取私聊消息历史: userId={}, friendId={}, page={}, size={}", userId, friendId, page, size);
        
        // 验证用户是否存在
        if (!Boolean.TRUE.equals(userServiceFeignClient.exists(userId))) {
            throw new BusinessException("用户不存在");
        }
        
        if (!Boolean.TRUE.equals(userServiceFeignClient.exists(friendId))) {
            throw new BusinessException("好友不存在");
        }
        
        // 验证好友关系
        if (!Boolean.TRUE.equals(userServiceFeignClient.isFriend(userId, friendId))) {
            throw new BusinessException("不是好友关系，无法查看聊天记录");
        }
        
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
    
    @Override
    public List<MessageDTO> getGroupMessages(Long userId, Long groupId, int page, int size) {
        log.info("获取群聊消息历史: userId={}, groupId={}, page={}, size={}", userId, groupId, page, size);
        
        // 验证用户是否存在
        if (!Boolean.TRUE.equals(userServiceFeignClient.exists(userId))) {
            throw new BusinessException("用户不存在");
        }
        
        // 验证群组是否存在
        if (!Boolean.TRUE.equals(groupServiceFeignClient.exists(groupId))) {
            throw new BusinessException("群组不存在");
        }
        
        // 验证用户是否为群成员
        if (!Boolean.TRUE.equals(groupServiceFeignClient.isMember(groupId, userId))) {
            throw new BusinessException("不是群成员，无法查看群聊记录");
        }
        
        Page<Message> mpPage = new Page<>(Math.max(1, page + 1L), Math.max(1, size));
        LambdaQueryWrapper<Message> wrapper = new LambdaQueryWrapper<Message>()
                .eq(Message::getGroupId, groupId)
                .eq(Message::getIsGroupChat, true)
                .ne(Message::getStatus, 5)
                .orderByDesc(Message::getCreatedTime);
        Page<Message> result = messageMapper.selectPage(mpPage, wrapper);
        List<Message> messages = result.getRecords();
        
        log.info("获取到群聊消息数量: {}", messages.size());
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

    @Override
    public List<MessageDTO> getPrivateMessagesCursor(Long userId,
                                                     Long friendId,
                                                     Long lastMessageId,
                                                     LocalDateTime beforeTimestamp,
                                                     Long afterMessageId,
                                                     int limit) {
        int realLimit = Math.min(Math.max(1, limit), 200);

        if (!Boolean.TRUE.equals(userServiceFeignClient.exists(userId))) {
            throw new BusinessException("用户不存在");
        }
        if (!Boolean.TRUE.equals(userServiceFeignClient.exists(friendId))) {
            throw new BusinessException("好友不存在");
        }
        if (!Boolean.TRUE.equals(userServiceFeignClient.isFriend(userId, friendId))) {
            throw new BusinessException("不是好友关系，无法查看聊天记录");
        }

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

    @Override
    public List<MessageDTO> getGroupMessagesCursor(Long userId,
                                                   Long groupId,
                                                   Long lastMessageId,
                                                   LocalDateTime beforeTimestamp,
                                                   Long afterMessageId,
                                                   int limit) {
        int realLimit = Math.min(Math.max(1, limit), 200);

        if (!Boolean.TRUE.equals(userServiceFeignClient.exists(userId))) {
            throw new BusinessException("用户不存在");
        }
        if (!Boolean.TRUE.equals(groupServiceFeignClient.exists(groupId))) {
            throw new BusinessException("群组不存在");
        }
        if (!Boolean.TRUE.equals(groupServiceFeignClient.isMember(groupId, userId))) {
            throw new BusinessException("不是群成员，无法查看群聊记录");
        }

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

    @Override
    @Transactional
    @CacheEvict(value = "conversations", key = "#userId")
    public MessageDTO recallMessage(Long userId, Long messageId) {
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

        LambdaUpdateWrapper<Message> uw = new LambdaUpdateWrapper<Message>()
                .eq(Message::getId, messageId)
                .set(Message::getStatus, Message.MessageStatus.RECALLED)
                .set(Message::getUpdatedTime, LocalDateTime.now());
        messageMapper.update(null, uw);

        msg.setStatus(Message.MessageStatus.RECALLED);
        msg.setUpdatedTime(LocalDateTime.now());

        boolean isGroup = Boolean.TRUE.equals(msg.getIsGroupChat());
        if (isGroup) {
            clearConversationCache(null, msg.getGroupId(), false);
        } else {
            clearConversationCache(msg.getSenderId(), msg.getReceiverId(), true);
        }

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

        String payload = com.alibaba.fastjson2.JSON.toJSONString(dto);
        if (isGroup) {
            outboxService.enqueueAfterCommit("im-group-message-topic", buildGroupConversationKey(msg.getGroupId()), payload, msg.getId());
        } else {
            outboxService.enqueueAfterCommit("im-private-message-topic", buildPrivateConversationKey(msg.getSenderId(), msg.getReceiverId()), payload, msg.getId());
        }
        return dto;
    }

    @Override
    @Transactional
    @CacheEvict(value = "conversations", key = "#userId")
    public MessageDTO deleteMessage(Long userId, Long messageId) {
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

        LambdaUpdateWrapper<Message> uw = new LambdaUpdateWrapper<Message>()
                .eq(Message::getId, messageId)
                .set(Message::getStatus, Message.MessageStatus.DELETED)
                .set(Message::getUpdatedTime, LocalDateTime.now());
        messageMapper.update(null, uw);

        msg.setStatus(Message.MessageStatus.DELETED);
        msg.setUpdatedTime(LocalDateTime.now());

        boolean isGroup = Boolean.TRUE.equals(msg.getIsGroupChat());
        if (isGroup) {
            clearConversationCache(null, msg.getGroupId(), false);
        } else {
            clearConversationCache(msg.getSenderId(), msg.getReceiverId(), true);
        }

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

        String payload = com.alibaba.fastjson2.JSON.toJSONString(dto);
        if (isGroup) {
            outboxService.enqueueAfterCommit("im-group-message-topic", buildGroupConversationKey(msg.getGroupId()), payload, msg.getId());
        } else {
            outboxService.enqueueAfterCommit("im-private-message-topic", buildPrivateConversationKey(msg.getSenderId(), msg.getReceiverId()), payload, msg.getId());
        }
        return dto;
    }
}
