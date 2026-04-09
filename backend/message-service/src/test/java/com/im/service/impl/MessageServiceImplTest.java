package com.im.service.impl;

import com.baomidou.mybatisplus.core.MybatisConfiguration;
import com.baomidou.mybatisplus.core.conditions.update.LambdaUpdateWrapper;
import com.baomidou.mybatisplus.core.metadata.TableInfoHelper;
import com.im.component.MessageRateLimiter;
import com.im.dto.MessageDTO;
import com.im.dto.UserDTO;
import com.im.exception.BusinessException;
import com.im.feign.GroupServiceFeignClient;
import com.im.feign.UserServiceFeignClient;
import com.im.handler.MessageHandler;
import com.im.mapper.GroupReadCursorMapper;
import com.im.mapper.MessageMapper;
import com.im.message.entity.Message;
import com.im.service.OutboxService;
import com.im.service.support.UserProfileCache;
import org.apache.ibatis.builder.MapperBuilderAssistant;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InOrder;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.redisson.api.RLock;
import org.redisson.api.RedissonClient;
import org.springframework.data.redis.core.RedisTemplate;
import org.springframework.data.redis.core.ValueOperations;
import org.springframework.transaction.TransactionStatus;
import org.springframework.transaction.support.TransactionCallback;
import org.springframework.transaction.support.TransactionTemplate;

import java.time.LocalDateTime;
import java.util.List;
import java.util.concurrent.TimeUnit;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyList;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.ArgumentMatchers.isNull;
import static org.mockito.Mockito.doAnswer;
import static org.mockito.Mockito.inOrder;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class MessageServiceImplTest {

    @Mock
    private MessageMapper messageMapper;
    @Mock
    private UserServiceFeignClient userServiceFeignClient;
    @Mock
    private GroupServiceFeignClient groupServiceFeignClient;
    @Mock
    private RedisTemplate<String, Object> redisTemplate;
    @Mock
    private MessageRateLimiter messageRateLimiter;
    @Mock
    private OutboxService outboxService;
    @Mock
    private GroupReadCursorMapper groupReadCursorMapper;
    @Mock
    private UserProfileCache userProfileCache;
    @Mock
    private ValueOperations<String, Object> valueOperations;
    @Mock
    private RedissonClient redissonClient;
    @Mock
    private RLock conversationLock;
    @Mock
    private TransactionTemplate transactionTemplate;
    @Mock
    private TransactionStatus transactionStatus;
    @Mock
    private MessageHandler messageHandler;

    private MessageServiceImpl service;

    @BeforeEach
    void setUp() throws InterruptedException {
        TableInfoHelper.initTableInfo(new MapperBuilderAssistant(new MybatisConfiguration(), "message-service-test"), Message.class);
        service = new MessageServiceImpl(
                messageMapper,
                userServiceFeignClient,
                groupServiceFeignClient,
                redisTemplate,
                messageRateLimiter,
                outboxService,
                groupReadCursorMapper,
                userProfileCache,
                redissonClient,
                transactionTemplate,
                List.of(messageHandler)
        );

        lenient().when(redisTemplate.opsForValue()).thenReturn(valueOperations);
        lenient().when(redissonClient.getLock(anyString())).thenReturn(conversationLock);
        lenient().when(conversationLock.tryLock(eq(2L), anyLong(), eq(TimeUnit.SECONDS))).thenReturn(true);
        lenient().when(conversationLock.isHeldByCurrentThread()).thenReturn(true);
        lenient().doAnswer(invocation -> {
            TransactionCallback<?> callback = invocation.getArgument(0);
            return callback.doInTransaction(transactionStatus);
        }).when(transactionTemplate).execute(any());
    }

    @Test
    void deleteMessageShouldPublishRealtimeUpdateToReceiver() {
        Message message = new Message();
        message.setId(302L);
        message.setSenderId(1L);
        message.setReceiverId(2L);
        message.setIsGroupChat(false);
        message.setStatus(Message.MessageStatus.SENT);
        when(messageMapper.selectById(302L)).thenReturn(message);
        when(userProfileCache.getUser(1L)).thenReturn(user(1L, "sender"));
        when(userProfileCache.getUser(2L)).thenReturn(user(2L, "receiver"));

        MessageDTO result = service.deleteMessage(1L, 302L);

        assertEquals("DELETED", result.getStatus());
        assertEquals(2L, result.getReceiverId());
        verify(outboxService).enqueueAfterCommit(
                eq("PRIVATE_MESSAGE"),
                eq("MESSAGE"),
                eq("p_1_2"),
                anyString(),
                eq(302L),
                eq(List.of(2L))
        );
        verify(redisTemplate, never()).convertAndSend(anyString(), anyString());
    }

    @Test
    void recallGroupMessageShouldAttachRecipientsAndPublishRealtimeUpdate() {
        Message message = new Message();
        message.setId(401L);
        message.setSenderId(1L);
        message.setGroupId(8L);
        message.setIsGroupChat(true);
        message.setStatus(Message.MessageStatus.SENT);
        message.setCreatedTime(LocalDateTime.now().minusMinutes(1));
        when(messageMapper.selectById(401L)).thenReturn(message);
        when(userProfileCache.getUser(1L)).thenReturn(user(1L, "sender"));
        when(groupServiceFeignClient.memberIds(8L)).thenReturn(List.of(1L, 2L, 3L));

        MessageDTO result = service.recallMessage(1L, 401L);

        assertEquals("RECALLED", result.getStatus());
        assertTrue(result.isGroup());
        assertNull(result.getGroupMembers());
        verify(outboxService).enqueueAfterCommit(
                eq("GROUP_MESSAGE"),
                eq("MESSAGE"),
                eq("g_8"),
                anyString(),
                eq(401L),
                eq(List.of(2L, 3L))
        );
        verify(redisTemplate).delete("last_message:g_8");
        verify(redisTemplate, never()).delete("conversations:user:1");
        verify(redisTemplate, never()).delete("conversations:user:2");
        verify(redisTemplate, never()).delete("conversations:user:3");
        verify(redisTemplate, never()).convertAndSend(anyString(), anyString());
    }

    @Test
    void markAsReadShouldRejectWhenConversationBusy() throws InterruptedException {
        when(userServiceFeignClient.exists(1L)).thenReturn(true);
        when(userServiceFeignClient.exists(2L)).thenReturn(true);
        when(userServiceFeignClient.isFriend(1L, 2L)).thenReturn(true);
        when(conversationLock.tryLock(eq(2L), anyLong(), eq(TimeUnit.SECONDS))).thenReturn(false);

        assertThrows(BusinessException.class, () -> service.markAsRead(1L, "2"));

        verify(messageMapper, never()).update(any(), any());
        verify(transactionTemplate, never()).execute(any());
    }

    @Test
    void markAsReadShouldNotPublishGroupReadReceiptBroadcast() {
        Message lastMessage = new Message();
        lastMessage.setId(900L);
        when(userServiceFeignClient.exists(1L)).thenReturn(true);
        when(groupServiceFeignClient.exists(8L)).thenReturn(true);
        when(groupServiceFeignClient.isMember(8L, 1L)).thenReturn(true);
        when(groupReadCursorMapper.selectOne(any())).thenReturn(null);
        when(messageMapper.selectOne(any())).thenReturn(lastMessage);

        service.markAsRead(1L, "group_8");

        verify(outboxService, never()).enqueueAfterCommit(
                eq("READ_RECEIPT"),
                eq("READ_RECEIPT"),
                anyString(),
                anyString(),
                anyLong(),
                anyList()
        );
    }

    @Test
    void markAsReadShouldUnlockAfterTransactionTemplateAndLimitPrivateBatchUpdate() {
        Message lastRead = new Message();
        lastRead.setId(901L);
        when(userServiceFeignClient.exists(1L)).thenReturn(true);
        when(userServiceFeignClient.exists(2L)).thenReturn(true);
        when(userServiceFeignClient.isFriend(1L, 2L)).thenReturn(true);
        when(messageMapper.update(any(), any())).thenReturn(1);
        when(messageMapper.selectOne(any())).thenReturn(lastRead);

        service.markAsRead(1L, "2");

        @SuppressWarnings("unchecked")
        var updateWrapperCaptor = org.mockito.ArgumentCaptor.forClass(LambdaUpdateWrapper.class);
        verify(messageMapper).update(isNull(), updateWrapperCaptor.capture());
        assertTrue(updateWrapperCaptor.getValue().getSqlSegment().contains("LIMIT 1000"));
        verify(outboxService).enqueueAfterCommit(
                eq("READ_RECEIPT"),
                eq("READ_RECEIPT"),
                eq("rr_2"),
                anyString(),
                eq(901L),
                eq(List.of(2L))
        );
        InOrder inOrder = inOrder(transactionTemplate, conversationLock);
        inOrder.verify(transactionTemplate).execute(any());
        inOrder.verify(conversationLock).unlock();
    }

    @Test
    void recallMessageShouldRejectExpiredMessage() {
        Message msg = new Message();
        msg.setId(300L);
        msg.setSenderId(1L);
        msg.setCreatedTime(LocalDateTime.now().minusMinutes(5));
        msg.setStatus(Message.MessageStatus.SENT);
        when(messageMapper.selectById(300L)).thenReturn(msg);

        assertThrows(BusinessException.class, () -> service.recallMessage(1L, 300L));
    }

    @Test
    void deleteMessageShouldRejectWhenNotOwner() {
        Message msg = new Message();
        msg.setId(303L);
        msg.setSenderId(9L);
        msg.setStatus(Message.MessageStatus.SENT);
        when(messageMapper.selectById(303L)).thenReturn(msg);

        assertThrows(SecurityException.class, () -> service.deleteMessage(1L, 303L));
    }

    @Test
    void getPrivateMessagesShouldRejectWhenNotFriend() {
        when(userServiceFeignClient.exists(1L)).thenReturn(true);
        when(userServiceFeignClient.exists(2L)).thenReturn(true);
        when(userServiceFeignClient.isFriend(1L, 2L)).thenReturn(false);

        assertThrows(BusinessException.class, () -> service.getPrivateMessages(1L, 2L, 0, 20));
    }

    @Test
    void markAsReadShouldRejectInvalidConversationId() {
        assertThrows(BusinessException.class, () -> service.markAsRead(1L, "a_b"));
    }

    private UserDTO user(Long id, String username) {
        return UserDTO.builder()
                .id(String.valueOf(id))
                .username(username)
                .nickname(username)
                .avatar("avatar-" + id)
                .build();
    }
}
