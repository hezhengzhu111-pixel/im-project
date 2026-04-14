package com.im.handler;

import com.baomidou.mybatisplus.core.MybatisConfiguration;
import com.baomidou.mybatisplus.core.metadata.TableInfoHelper;
import com.im.dto.MessageDTO;
import com.im.dto.UserDTO;
import com.im.enums.MessageType;
import com.im.exception.BusinessException;
import com.im.feign.UserServiceFeignClient;
import com.im.mapper.MessageMapper;
import com.im.message.entity.Message;
import com.im.metrics.MessageServiceMetrics;
import com.im.service.OutboxService;
import com.im.service.command.SendMessageCommand;
import com.im.service.support.UserProfileCache;
import io.micrometer.core.instrument.simple.SimpleMeterRegistry;
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
import org.springframework.test.util.ReflectionTestUtils;
import org.springframework.transaction.TransactionStatus;
import org.springframework.transaction.support.TransactionCallback;
import org.springframework.transaction.support.TransactionTemplate;

import java.util.concurrent.TimeUnit;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.doAnswer;
import static org.mockito.Mockito.inOrder;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class PrivateMessageHandlerTest {

    @Mock
    private MessageMapper messageMapper;
    @Mock
    private RedisTemplate<String, Object> redisTemplate;
    @Mock
    private OutboxService outboxService;
    @Mock
    private RedissonClient redissonClient;
    @Mock
    private TransactionTemplate transactionTemplate;
    @Mock
    private UserServiceFeignClient userServiceFeignClient;
    @Mock
    private UserProfileCache userProfileCache;
    @Mock
    private RLock conversationLock;
    @Mock
    private TransactionStatus transactionStatus;

    private PrivateMessageHandler handler;
    private SimpleMeterRegistry meterRegistry;

    @BeforeEach
    void setUp() throws InterruptedException {
        TableInfoHelper.initTableInfo(new MapperBuilderAssistant(new MybatisConfiguration(), "private-handler-test"), Message.class);
        handler = new PrivateMessageHandler(
                messageMapper,
                redisTemplate,
                outboxService,
                redissonClient,
                transactionTemplate,
                userServiceFeignClient,
                userProfileCache
        );
        meterRegistry = new SimpleMeterRegistry();
        ReflectionTestUtils.setField(handler, "metrics", new MessageServiceMetrics(meterRegistry));
        ReflectionTestUtils.setField(handler, "privateMessageTopic", "PRIVATE_MESSAGE");
        ReflectionTestUtils.setField(handler, "defaultSystemSenderId", 1L);
        ReflectionTestUtils.setField(handler, "textEnforce", true);
        ReflectionTestUtils.setField(handler, "textMaxLength", 2000);
        ReflectionTestUtils.setField(handler, "conversationLockTtlSeconds", 5L);

        lenient().when(redissonClient.getLock(anyString())).thenReturn(conversationLock);
        lenient().when(conversationLock.tryLock(eq(2L), anyLong(), eq(TimeUnit.SECONDS))).thenReturn(true);
        lenient().when(conversationLock.isHeldByCurrentThread()).thenReturn(true);
        lenient().doAnswer(invocation -> {
            TransactionCallback<?> callback = invocation.getArgument(0);
            return callback.doInTransaction(transactionStatus);
        }).when(transactionTemplate).execute(any());
    }

    @Test
    void handlePrivateMessageShouldPublishOutbox() {
        SendMessageCommand command = SendMessageCommand.builder()
                .senderId(1L)
                .receiverId(2L)
                .isGroup(false)
                .messageType(MessageType.TEXT)
                .clientMessageId("private-2")
                .content("hello")
                .build();
        when(userProfileCache.getUser(1L)).thenReturn(user(1L, "u1"));
        when(userProfileCache.getUser(2L)).thenReturn(user(2L, "u2"));
        when(userProfileCache.isFriend(1L, 2L)).thenReturn(true);
        doAnswer(invocation -> {
            Message msg = invocation.getArgument(0);
            msg.setId(100L);
            return 1;
        }).when(messageMapper).insert(any(Message.class));

        MessageDTO result = handler.handle(command);

        assertNotNull(result);
        assertEquals("hello", result.getContent());
        assertEquals(2L, result.getReceiverId());
        verify(outboxService).enqueueAfterCommit(
                eq("PRIVATE_MESSAGE"),
                eq("MESSAGE"),
                eq("p_1_2"),
                anyString(),
                eq(100L),
                eq(java.util.List.of(2L, 1L))
        );
        assertEquals(1.0, persistCount("success", "private"));
        verify(redisTemplate).delete("last_message:p_1_2");
        verify(redisTemplate).delete("conversations:user:1");
        verify(redisTemplate).delete("conversations:user:2");
        verify(userServiceFeignClient, never()).isFriend(anyLong(), anyLong());
        verify(redissonClient).getLock("msg:lock:send:1:private-2");
        InOrder inOrder = inOrder(transactionTemplate, redisTemplate, conversationLock);
        inOrder.verify(transactionTemplate).execute(any());
        inOrder.verify(redisTemplate).delete("last_message:p_1_2");
        inOrder.verify(conversationLock).unlock();
    }

    @Test
    void handlePrivateMessageShouldRejectWhenClientMessageIdMissing() {
        SendMessageCommand command = SendMessageCommand.builder()
                .senderId(1L)
                .receiverId(2L)
                .isGroup(false)
                .messageType(MessageType.TEXT)
                .content("hello")
                .build();
        when(userProfileCache.getUser(1L)).thenReturn(user(1L, "u1"));
        when(userProfileCache.getUser(2L)).thenReturn(user(2L, "u2"));
        when(userProfileCache.isFriend(1L, 2L)).thenReturn(true);

        assertThrows(BusinessException.class, () -> handler.handle(command));

        verify(redissonClient, never()).getLock(anyString());
        verify(transactionTemplate, never()).execute(any());
    }

    @Test
    void handleSystemMessageShouldUseConversationLockAndSkipFriendCheck() {
        SendMessageCommand command = SendMessageCommand.builder()
                .senderId(1L)
                .receiverId(2L)
                .isGroup(false)
                .messageType(MessageType.SYSTEM)
                .content("system-hi")
                .build();
        when(userServiceFeignClient.exists(2L)).thenReturn(true);
        when(userProfileCache.getUser(1L)).thenReturn(user(1L, "system"));
        when(userProfileCache.getUser(2L)).thenReturn(user(2L, "u2"));
        doAnswer(invocation -> {
            Message msg = invocation.getArgument(0);
            msg.setId(250L);
            return 1;
        }).when(messageMapper).insert(any(Message.class));

        MessageDTO result = handler.handle(command);

        assertNotNull(result);
        assertEquals("system-hi", result.getContent());
        verify(redissonClient).getLock("msg:lock:p_1_2");
        assertEquals(1.0, persistCount("success", "system"));
        verify(userServiceFeignClient, never()).isFriend(anyLong(), anyLong());
        InOrder inOrder = inOrder(transactionTemplate, conversationLock);
        inOrder.verify(transactionTemplate).execute(any());
        inOrder.verify(conversationLock).unlock();
    }

    private UserDTO user(Long id, String username) {
        return UserDTO.builder()
                .id(String.valueOf(id))
                .username(username)
                .nickname(username)
                .avatar("avatar-" + id)
                .build();
    }

    private double persistCount(String result, String chatType) {
        return meterRegistry.counter("im.message.persist.total", "result", result, "chat_type", chatType).count();
    }
}
