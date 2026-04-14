package com.im.handler;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.im.dto.MessageDTO;
import com.im.enums.MessageType;
import com.im.exception.BusinessException;
import com.im.mapper.MessageMapper;
import com.im.message.entity.Message;
import com.im.metrics.MessageServiceMetrics;
import com.im.service.OutboxService;
import com.im.service.command.SendMessageCommand;
import lombok.extern.slf4j.Slf4j;
import org.redisson.api.RLock;
import org.redisson.api.RedissonClient;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.data.redis.core.RedisTemplate;
import org.springframework.transaction.support.TransactionTemplate;
import org.springframework.util.StringUtils;

import java.util.List;
import java.util.concurrent.TimeUnit;
import java.util.stream.Collectors;

@Slf4j
public abstract class AbstractMessageHandler<C> implements MessageHandler {

    private static final long CONVERSATION_LOCK_WAIT_SECONDS = 2L;
    private static final String CONVERSATION_CACHE_KEY = "conversations:user:";
    private static final String LAST_MESSAGE_CACHE_KEY = "last_message:";

    protected final MessageMapper messageMapper;
    protected final RedisTemplate<String, Object> redisTemplate;
    protected final OutboxService outboxService;
    protected final RedissonClient redissonClient;
    protected final TransactionTemplate transactionTemplate;

    @Autowired(required = false)
    protected MessageServiceMetrics metrics;

    @Value("${im.message.text.enforce:true}")
    private boolean textEnforce;

    @Value("${im.message.text.max-length:2000}")
    private int textMaxLength;

    @Value("${im.message.lock.ttl-seconds:5}")
    private long conversationLockTtlSeconds;

    protected AbstractMessageHandler(MessageMapper messageMapper,
                                     RedisTemplate<String, Object> redisTemplate,
                                     OutboxService outboxService,
                                     RedissonClient redissonClient,
                                     TransactionTemplate transactionTemplate) {
        this.messageMapper = messageMapper;
        this.redisTemplate = redisTemplate;
        this.outboxService = outboxService;
        this.redissonClient = redissonClient;
        this.transactionTemplate = transactionTemplate;
    }

    @Override
    public final MessageDTO handle(SendMessageCommand command) {
        validateBasicParams(command);
        C context = buildContext(command);
        String lockKey = buildLockKey(command, context);
        RLock lock = acquireConversationLock(lockKey);
        try {
            SendTxResult txResult = executeInTransaction(command, context);
            afterTransaction(command, context, txResult);
            return buildResult(command, context, txResult.message());
        } finally {
            releaseConversationLock(lock);
        }
    }

    protected abstract C buildContext(SendMessageCommand command);

    protected abstract String buildLockKey(SendMessageCommand command, C context);

    protected abstract SendTxResult doInTransaction(SendMessageCommand command, C context);

    protected abstract void afterTransaction(SendMessageCommand command, C context, SendTxResult txResult);

    protected abstract MessageDTO buildResult(SendMessageCommand command, C context, Message message);

    protected String transactionFailureMessage(SendMessageCommand command) {
        return "failed to send message";
    }

    protected SendTxResult executeInTransaction(SendMessageCommand command, C context) {
        SendTxResult txResult = transactionTemplate.execute(status -> doInTransaction(command, context));
        if (txResult == null) {
            throw new BusinessException(transactionFailureMessage(command));
        }
        return txResult;
    }

    protected void validateBasicParams(SendMessageCommand command) {
        if (command == null) {
            throw new IllegalArgumentException("sendMessageCommand cannot be null");
        }
        if (command.getMessageType() == null) {
            throw new BusinessException("messageType cannot be null");
        }
        if (command.isGroup()) {
            if (command.getGroupId() == null) {
                throw new BusinessException("groupId cannot be null");
            }
            if (command.getReceiverId() != null) {
                throw new BusinessException("receiverId must be null for group message");
            }
            return;
        }
        if (command.getReceiverId() == null) {
            throw new BusinessException("receiverId cannot be null");
        }
        if (command.getGroupId() != null) {
            throw new BusinessException("groupId must be null for private message");
        }
    }

    protected void validateMessageContent(MessageType messageType, String content, String mediaUrl) {
        if ((messageType == MessageType.TEXT || messageType == MessageType.SYSTEM) && !StringUtils.hasText(content)) {
            throw new BusinessException("message content cannot be blank");
        }

        if (messageType == MessageType.TEXT || messageType == MessageType.SYSTEM) {
            if (textEnforce && textMaxLength > 0) {
                int len = content == null ? 0 : content.codePointCount(0, content.length());
                if (len > textMaxLength) {
                    throw new BusinessException("message content exceeds max length " + textMaxLength);
                }
            }
        }

        if (messageType != MessageType.TEXT && messageType != MessageType.SYSTEM && !StringUtils.hasText(mediaUrl)) {
            throw new BusinessException("mediaUrl cannot be blank");
        }
    }

    protected Message findExistingMessageByClientMessageId(Long senderId, String clientMessageId) {
        String normalizedClientMessageId = normalizeClientMessageId(clientMessageId);
        if (senderId == null || !StringUtils.hasText(normalizedClientMessageId)) {
            return null;
        }
        return messageMapper.selectOne(new LambdaQueryWrapper<Message>()
                .eq(Message::getSenderId, senderId)
                .eq(Message::getClientMessageId, normalizedClientMessageId)
                .last("limit 1"));
    }

    protected String normalizeClientMessageId(String clientMessageId) {
        if (!StringUtils.hasText(clientMessageId)) {
            return null;
        }
        return clientMessageId.trim();
    }

    protected String requireClientMessageId(String clientMessageId) {
        String normalizedClientMessageId = normalizeClientMessageId(clientMessageId);
        if (!StringUtils.hasText(normalizedClientMessageId)) {
            throw new BusinessException("clientMessageId cannot be blank");
        }
        return normalizedClientMessageId;
    }

    protected Message createBaseMessage(SendMessageCommand command, Long senderId) {
        Message message = new Message();
        message.setSenderId(senderId);
        message.setClientMessageId(normalizeClientMessageId(command.getClientMessageId()));
        message.setMessageType(command.getMessageType());
        if (command.getMessageType() == MessageType.TEXT || command.getMessageType() == MessageType.SYSTEM) {
            message.setContent(command.getContent());
        } else {
            message.setMediaUrl(command.getMediaUrl());
        }
        message.setMediaSize(command.getMediaSize());
        message.setMediaName(command.getMediaName());
        message.setThumbnailUrl(command.getThumbnailUrl());
        message.setDuration(command.getDuration());
        message.setLocationInfo(command.getLocationInfo());
        message.setReplyToMessageId(command.getReplyToMessageId());
        message.setStatus(Message.MessageStatus.SENT);
        return message;
    }

    protected void persistMessage(Message message, Long targetId) {
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

    protected List<Long> filterMessageTargets(List<Long> targetUserIds, Long excludeUserId) {
        if (targetUserIds == null) {
            return List.of();
        }
        return targetUserIds.stream()
                .filter(userId -> userId != null && !userId.equals(excludeUserId))
                .distinct()
                .collect(Collectors.toList());
    }

    protected List<Long> normalizeMessageTargets(List<Long> targetUserIds) {
        if (targetUserIds == null) {
            return List.of();
        }
        return targetUserIds.stream()
                .filter(userId -> userId != null && userId > 0)
                .distinct()
                .collect(Collectors.toList());
    }

    protected void clearConversationCache(Long userId1, Long userId2, boolean isPrivate) {
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
            log.warn("failed to clear conversation cache", e);
        }
    }

    protected String buildPrivateConversationKey(Long userId1, Long userId2) {
        long a = userId1 == null ? 0L : userId1;
        long b = userId2 == null ? 0L : userId2;
        long min = Math.min(a, b);
        long max = Math.max(a, b);
        return "p_" + min + "_" + max;
    }

    protected String buildGroupConversationKey(Long groupId) {
        return "g_" + (groupId == null ? "0" : groupId.toString());
    }

    protected String buildSendMessageLockKey(Long senderId, String clientMessageId) {
        return "msg:lock:send:" + senderId + ":" + requireClientMessageId(clientMessageId);
    }

    protected String buildConversationLockKey(boolean isPrivate, Long id1, Long id2) {
        if (isPrivate) {
            return "msg:lock:" + buildPrivateConversationKey(id1, id2);
        }
        return "msg:lock:" + buildGroupConversationKey(id2);
    }

    protected RLock acquireConversationLock(String lockKey) {
        RLock lock = redissonClient.getLock(lockKey);
        boolean locked;
        try {
            locked = lock.tryLock(CONVERSATION_LOCK_WAIT_SECONDS, conversationLockTtlSeconds, TimeUnit.SECONDS);
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            throw new BusinessException("conversation is busy", e);
        } catch (Exception e) {
            throw new BusinessException("conversation is busy", e);
        }
        if (!locked) {
            throw new BusinessException("conversation is busy");
        }
        return lock;
    }

    protected void releaseConversationLock(RLock lock) {
        try {
            if (lock != null && lock.isHeldByCurrentThread()) {
                lock.unlock();
            }
        } catch (Exception ex) {
            log.warn("failed to release conversation lock", ex);
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
        log.info("sendId={}, targetId={}, content={}, status={}",
                senderIdText,
                targetIdText,
                safeContent,
                status);
    }

    private void recordPersist(Message message, boolean success) {
        if (metrics != null) {
            metrics.recordPersist(message, success);
        }
    }

    protected record SendTxResult(Message message, boolean created) {
    }
}
