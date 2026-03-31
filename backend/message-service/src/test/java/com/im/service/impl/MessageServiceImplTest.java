package com.im.service.impl;

import com.baomidou.mybatisplus.core.MybatisConfiguration;
import com.baomidou.mybatisplus.core.metadata.TableInfoHelper;
import com.im.component.MessageRateLimiter;
import com.im.dto.MessageDTO;
import com.im.dto.UserDTO;
import com.im.dto.request.SendGroupMessageRequest;
import com.im.dto.request.SendPrivateMessageRequest;
import com.im.entity.Message;
import com.im.enums.MessageType;
import com.im.exception.BusinessException;
import com.im.feign.GroupServiceFeignClient;
import com.im.feign.UserServiceFeignClient;
import com.im.mapper.GroupReadCursorMapper;
import com.im.mapper.MessageMapper;
import com.im.service.OutboxService;
import com.im.service.support.UserProfileCache;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.apache.ibatis.builder.MapperBuilderAssistant;
import org.redisson.api.RLock;
import org.redisson.api.RedissonClient;
import org.springframework.data.redis.core.RedisTemplate;
import org.springframework.data.redis.core.ValueOperations;
import org.springframework.test.util.ReflectionTestUtils;

import java.time.LocalDateTime;
import java.util.List;
import java.util.concurrent.TimeUnit;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.argThat;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.doAnswer;
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
                redissonClient
        );
        ReflectionTestUtils.setField(service, "textEnforce", true);
        ReflectionTestUtils.setField(service, "textMaxLength", 2000);
        ReflectionTestUtils.setField(service, "conversationLockTtlSeconds", 5L);

        lenient().when(redisTemplate.opsForValue()).thenReturn(valueOperations);
        lenient().when(redissonClient.getLock(anyString())).thenReturn(conversationLock);
        lenient().when(conversationLock.tryLock(eq(0L), anyLong(), eq(TimeUnit.SECONDS))).thenReturn(true);
        lenient().when(conversationLock.isHeldByCurrentThread()).thenReturn(true);
    }

    @Test
    void sendPrivateMessageShouldPublishOutbox() {
        SendPrivateMessageRequest request = privateText("2", "hello");
        when(messageRateLimiter.canSendMessage(1L)).thenReturn(true);
        when(userProfileCache.getUser(1L)).thenReturn(user(1L, "u1"));
        when(userProfileCache.getUser(2L)).thenReturn(user(2L, "u2"));
        when(userServiceFeignClient.isFriend(1L, 2L)).thenReturn(true);
        doAnswer(invocation -> {
            Message msg = invocation.getArgument(0);
            msg.setId(100L);
            return 1;
        }).when(messageMapper).insert(any(Message.class));

        MessageDTO result = service.sendPrivateMessage(1L, request);

        assertNotNull(result);
        assertEquals("hello", result.getContent());
        assertEquals(2L, result.getReceiverId());
        verify(outboxService).enqueueAfterCommit(eq("im-private-message-topic"), eq("p_1_2"), anyString(), eq(100L));
        verify(redissonClient).getLock("msg:lock:p_1_2");
        verify(conversationLock).unlock();
    }

    @Test
    void sendPrivateMessageShouldNotUnlockWhenLockNoLongerHeld() {
        SendPrivateMessageRequest request = privateText("2", "hello");
        when(conversationLock.isHeldByCurrentThread()).thenReturn(false);
        when(messageRateLimiter.canSendMessage(1L)).thenReturn(true);
        when(userProfileCache.getUser(1L)).thenReturn(user(1L, "u1"));
        when(userProfileCache.getUser(2L)).thenReturn(user(2L, "u2"));
        when(userServiceFeignClient.isFriend(1L, 2L)).thenReturn(true);
        doAnswer(invocation -> {
            Message msg = invocation.getArgument(0);
            msg.setId(101L);
            return 1;
        }).when(messageMapper).insert(any(Message.class));

        service.sendPrivateMessage(1L, request);

        verify(conversationLock, never()).unlock();
    }

    @Test
    void sendPrivateMessageShouldRejectWhenConversationBusy() throws InterruptedException {
        SendPrivateMessageRequest request = privateText("2", "hello");
        when(conversationLock.tryLock(eq(0L), anyLong(), eq(TimeUnit.SECONDS))).thenReturn(false);

        assertThrows(BusinessException.class, () -> service.sendPrivateMessage(1L, request));

        verify(messageMapper, never()).insert(any(Message.class));
        verify(conversationLock, never()).unlock();
    }

    @Test
    void sendGroupMessageShouldPublishOutbox() {
        SendGroupMessageRequest request = groupText("8", "group-hi");
        when(messageRateLimiter.canSendMessage(1L)).thenReturn(true);
        when(userProfileCache.getUser(1L)).thenReturn(user(1L, "u1"));
        when(groupServiceFeignClient.exists(8L)).thenReturn(true);
        when(groupServiceFeignClient.isMember(8L, 1L)).thenReturn(true);
        when(groupServiceFeignClient.memberIds(8L)).thenReturn(List.of(1L, 2L, 3L));
        doAnswer(invocation -> {
            Message msg = invocation.getArgument(0);
            msg.setId(200L);
            return 1;
        }).when(messageMapper).insert(any(Message.class));

        MessageDTO result = service.sendGroupMessage(1L, request);

        assertNotNull(result);
        assertTrue(result.isGroup());
        assertEquals(2, result.getGroupMembers().size());
        verify(outboxService).enqueueAfterCommit(eq("im-group-message-topic"), eq("g_8"), anyString(), eq(200L));
        verify(redissonClient).getLock("msg:lock:g_8");
        verify(conversationLock).unlock();
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
        verify(outboxService).enqueueAfterCommit(eq("im-private-message-topic"), eq("p_1_2"), anyString(), eq(302L));
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
        assertEquals(2, result.getGroupMembers().size());
        verify(outboxService).enqueueAfterCommit(eq("im-group-message-topic"), eq("g_8"), anyString(), eq(401L));
        verify(redisTemplate, never()).convertAndSend(anyString(), anyString());
    }

    @Test
    void markAsReadShouldRejectWhenConversationBusy() throws InterruptedException {
        when(userServiceFeignClient.exists(1L)).thenReturn(true);
        when(userServiceFeignClient.exists(2L)).thenReturn(true);
        when(userServiceFeignClient.isFriend(1L, 2L)).thenReturn(true);
        when(conversationLock.tryLock(eq(0L), anyLong(), eq(TimeUnit.SECONDS))).thenReturn(false);

        assertThrows(BusinessException.class, () -> service.markAsRead(1L, "2"));

        verify(messageMapper, never()).update(any(), any());
    }

    @Test
    void markAsReadShouldPublishCanonicalGroupReadReceiptConversationId() {
        Message lastMessage = new Message();
        lastMessage.setId(900L);
        when(userServiceFeignClient.exists(1L)).thenReturn(true);
        when(groupServiceFeignClient.exists(8L)).thenReturn(true);
        when(groupServiceFeignClient.isMember(8L, 1L)).thenReturn(true);
        when(groupServiceFeignClient.memberIds(8L)).thenReturn(List.of(1L, 2L, 3L));
        when(groupReadCursorMapper.selectOne(any())).thenReturn(null);
        when(messageMapper.selectOne(any())).thenReturn(lastMessage);

        service.markAsRead(1L, "group_8");

        verify(outboxService).enqueueAfterCommit(
                eq("im-read-receipt-topic"),
                eq("grr_8_2"),
                argThat(payload -> payload != null && payload.contains("\"conversationId\":\"group_8\"")),
                eq(900L)
        );
        verify(outboxService).enqueueAfterCommit(
                eq("im-read-receipt-topic"),
                eq("grr_8_3"),
                argThat(payload -> payload != null && payload.contains("\"conversationId\":\"group_8\"")),
                eq(900L)
        );
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

    private SendPrivateMessageRequest privateText(String receiverId, String content) {
        SendPrivateMessageRequest request = new SendPrivateMessageRequest();
        request.setReceiverId(receiverId);
        request.setMessageType(MessageType.TEXT);
        request.setContent(content);
        return request;
    }

    private SendGroupMessageRequest groupText(String groupId, String content) {
        SendGroupMessageRequest request = new SendGroupMessageRequest();
        request.setGroupId(groupId);
        request.setMessageType(MessageType.TEXT);
        request.setContent(content);
        return request;
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
