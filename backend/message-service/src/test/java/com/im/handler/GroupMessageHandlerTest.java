package com.im.handler;

import com.baomidou.mybatisplus.core.MybatisConfiguration;
import com.baomidou.mybatisplus.core.metadata.TableInfoHelper;
import com.im.component.MessageRateLimiter;
import com.im.dto.MessageDTO;
import com.im.dto.UserDTO;
import com.im.enums.MessageType;
import com.im.exception.BusinessException;
import com.im.feign.GroupServiceFeignClient;
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

import java.util.List;
import java.util.concurrent.TimeUnit;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.argThat;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.doAnswer;
import static org.mockito.Mockito.inOrder;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class GroupMessageHandlerTest {

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
    private GroupServiceFeignClient groupServiceFeignClient;
    @Mock
    private MessageRateLimiter messageRateLimiter;
    @Mock
    private UserProfileCache userProfileCache;
    @Mock
    private RLock conversationLock;
    @Mock
    private TransactionStatus transactionStatus;

    private GroupMessageHandler handler;
    private SimpleMeterRegistry meterRegistry;

    @BeforeEach
    void setUp() throws InterruptedException {
        TableInfoHelper.initTableInfo(new MapperBuilderAssistant(new MybatisConfiguration(), "group-handler-test"), Message.class);
        handler = new GroupMessageHandler(
                messageMapper,
                redisTemplate,
                outboxService,
                redissonClient,
                transactionTemplate,
                groupServiceFeignClient,
                messageRateLimiter,
                userProfileCache
        );
        meterRegistry = new SimpleMeterRegistry();
        ReflectionTestUtils.setField(handler, "metrics", new MessageServiceMetrics(meterRegistry));
        ReflectionTestUtils.setField(handler, "groupMessageTopic", "GROUP_MESSAGE");
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
    void handleGroupMessageShouldPublishOutbox() {
        SendMessageCommand command = SendMessageCommand.builder()
                .senderId(1L)
                .groupId(8L)
                .isGroup(true)
                .messageType(MessageType.TEXT)
                .clientMessageId("group-8")
                .content("group-hi")
                .build();
        when(messageRateLimiter.canSendMessage(1L)).thenReturn(true);
        when(userProfileCache.getUser(1L)).thenReturn(user(1L, "u1"));
        when(groupServiceFeignClient.exists(8L)).thenReturn(true);
        when(userProfileCache.isGroupMember(8L, 1L)).thenReturn(true);
        when(userProfileCache.getGroupMemberIds(8L)).thenReturn(List.of(1L, 2L, 3L));
        doAnswer(invocation -> {
            Message msg = invocation.getArgument(0);
            msg.setId(200L);
            return 1;
        }).when(messageMapper).insert(any(Message.class));

        MessageDTO result = handler.handle(command);

        assertNotNull(result);
        assertEquals(8L, result.getGroupId());
        verify(outboxService).enqueueAfterCommit(
                eq("GROUP_MESSAGE"),
                eq("MESSAGE"),
                eq("g_8"),
                argThat(payload -> payload != null && !payload.contains("groupMembers")),
                eq(200L),
                eq(List.of(1L, 2L, 3L))
        );
        assertEquals(1.0, persistCount("success", "group"));
        verify(redisTemplate).delete("last_message:g_8");
        verify(groupServiceFeignClient, never()).isMember(anyLong(), anyLong());
        verify(groupServiceFeignClient, never()).memberIds(anyLong());
        verify(redissonClient).getLock("msg:lock:send:1:group-8");
        InOrder inOrder = inOrder(transactionTemplate, redisTemplate, conversationLock);
        inOrder.verify(transactionTemplate).execute(any());
        inOrder.verify(redisTemplate).delete("last_message:g_8");
        inOrder.verify(conversationLock).unlock();
    }

    @Test
    void handleGroupMessageShouldRejectWhenClientMessageIdMissing() {
        SendMessageCommand command = SendMessageCommand.builder()
                .senderId(1L)
                .groupId(8L)
                .isGroup(true)
                .messageType(MessageType.TEXT)
                .content("group-hi")
                .build();
        when(messageRateLimiter.canSendMessage(1L)).thenReturn(true);
        when(userProfileCache.getUser(1L)).thenReturn(user(1L, "u1"));
        when(groupServiceFeignClient.exists(8L)).thenReturn(true);
        when(userProfileCache.isGroupMember(8L, 1L)).thenReturn(true);

        assertThrows(BusinessException.class, () -> handler.handle(command));

        verify(redissonClient, never()).getLock(anyString());
        verify(transactionTemplate, never()).execute(any());
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
