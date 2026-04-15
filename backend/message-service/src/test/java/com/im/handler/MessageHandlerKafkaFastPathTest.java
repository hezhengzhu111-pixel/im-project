package com.im.handler;

import com.im.dto.MessageDTO;
import com.im.dto.MessageEvent;
import com.im.dto.UserDTO;
import com.im.enums.MessageEventType;
import com.im.enums.MessageType;
import com.im.exception.BusinessException;
import com.im.feign.GroupServiceFeignClient;
import com.im.feign.UserServiceFeignClient;
import com.im.service.command.SendMessageCommand;
import com.im.service.support.AcceptedMessageProjectionService;
import com.im.service.support.UserProfileCache;
import com.im.utils.SnowflakeIdGenerator;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.InOrder;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.data.redis.core.RedisTemplate;
import org.springframework.kafka.core.KafkaTemplate;
import org.springframework.kafka.support.SendResult;
import org.springframework.test.util.ReflectionTestUtils;

import java.util.concurrent.CompletableFuture;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class MessageHandlerKafkaFastPathTest {

    @Mock
    private RedisTemplate<String, Object> redisTemplate;

    @Mock
    private KafkaTemplate<String, MessageEvent> kafkaTemplate;

    @Mock
    private SnowflakeIdGenerator snowflakeIdGenerator;

    @Mock
    private AcceptedMessageProjectionService acceptedMessageProjectionService;

    @Mock
    private UserProfileCache userProfileCache;

    @Mock
    private GroupServiceFeignClient groupServiceFeignClient;

    @Mock
    private UserServiceFeignClient userServiceFeignClient;

    @Test
    void privateMessageShouldPublishKafkaEventWithConversationKeyAndReturnGeneratedId() {
        PrivateMessageHandler handler = new PrivateMessageHandler(
                redisTemplate,
                kafkaTemplate,
                snowflakeIdGenerator,
                acceptedMessageProjectionService,
                userProfileCache
        );
        when(snowflakeIdGenerator.nextId()).thenReturn(9001L);
        when(userProfileCache.getUser(1L)).thenReturn(user("1", "alice"));
        when(userProfileCache.getUser(2L)).thenReturn(user("2", "bob"));
        when(userProfileCache.isFriend(1L, 2L)).thenReturn(true);
        stubKafkaSuccess("p_1_2");

        MessageDTO result = handler.handle(privateCommand());

        assertEquals(9001L, result.getId());
        assertEquals("client-1", result.getClientMessageId());
        assertFalse(result.isGroup());

        MessageEvent event = captureEvent("p_1_2");
        assertEquals(MessageEventType.MESSAGE, event.getEventType());
        assertEquals(9001L, event.getMessageId());
        assertEquals("p_1_2", event.getConversationId());
        assertEquals(1L, event.getSenderId());
        assertEquals(2L, event.getReceiverId());
        assertEquals("client-1", event.getClientMsgId());
        assertEquals(MessageType.TEXT, event.getMessageType());
        assertEquals("hello", event.getContent());
        assertNotNull(event.getTimestamp());
        assertNotNull(event.getCreatedTime());
        assertEquals(9001L, event.getPayload().getId());
        InOrder inOrder = org.mockito.Mockito.inOrder(kafkaTemplate, acceptedMessageProjectionService);
        inOrder.verify(kafkaTemplate).send(eq("im-chat-topic"), eq("p_1_2"), any(MessageEvent.class));
        inOrder.verify(acceptedMessageProjectionService).projectAccepted(any(MessageEvent.class));
    }

    @Test
    void groupMessageShouldUseGroupConversationIdAsKafkaKey() {
        GroupMessageHandler handler = new GroupMessageHandler(
                redisTemplate,
                kafkaTemplate,
                snowflakeIdGenerator,
                acceptedMessageProjectionService,
                groupServiceFeignClient,
                userProfileCache
        );
        when(snowflakeIdGenerator.nextId()).thenReturn(9002L);
        when(userProfileCache.getUser(1L)).thenReturn(user("1", "alice"));
        when(groupServiceFeignClient.exists(8L)).thenReturn(true);
        when(userProfileCache.isGroupMember(8L, 1L)).thenReturn(true);
        stubKafkaSuccess("g_8");

        MessageDTO result = handler.handle(groupCommand());

        assertEquals(9002L, result.getId());
        assertTrue(result.isGroup());
        MessageEvent event = captureEvent("g_8");
        assertEquals(9002L, event.getMessageId());
        assertEquals("g_8", event.getConversationId());
        assertEquals(8L, event.getGroupId());
        assertEquals("group-hi", event.getContent());
        assertEquals(9002L, event.getPayload().getId());
        verify(acceptedMessageProjectionService).projectAccepted(any(MessageEvent.class));
    }

    @Test
    void systemMessageShouldGenerateClientMessageIdWhenMissing() {
        SystemMessageHandler handler = new SystemMessageHandler(
                redisTemplate,
                kafkaTemplate,
                snowflakeIdGenerator,
                acceptedMessageProjectionService,
                userServiceFeignClient,
                userProfileCache
        );
        when(snowflakeIdGenerator.nextId()).thenReturn(9003L);
        when(userServiceFeignClient.exists(2L)).thenReturn(true);
        when(userProfileCache.getUser(0L)).thenReturn(null);
        when(userProfileCache.getUser(2L)).thenReturn(user("2", "bob"));
        stubKafkaSuccess("p_0_2");

        MessageDTO result = handler.handle(systemCommand());

        assertEquals(9003L, result.getId());
        assertEquals("SYSTEM", result.getSenderName());
        MessageEvent event = captureEvent("p_0_2");
        assertEquals(MessageType.SYSTEM, event.getMessageType());
        assertEquals(0L, event.getSenderId());
        assertEquals(2L, event.getReceiverId());
        assertEquals("system notice", event.getContent());
        assertEquals("sys-9003", result.getClientMessageId());
        assertEquals("sys-9003", event.getClientMessageId());
        assertEquals("sys-9003", event.getClientMsgId());
        assertEquals("sys-9003", event.getPayload().getClientMessageId());
    }

    @Test
    void kafkaFailureShouldSurfaceBusinessExceptionBeforeProjection() {
        PrivateMessageHandler handler = new PrivateMessageHandler(
                redisTemplate,
                kafkaTemplate,
                snowflakeIdGenerator,
                acceptedMessageProjectionService,
                userProfileCache
        );
        when(snowflakeIdGenerator.nextId()).thenReturn(9004L);
        when(userProfileCache.getUser(1L)).thenReturn(user("1", "alice"));
        when(userProfileCache.getUser(2L)).thenReturn(user("2", "bob"));
        when(userProfileCache.isFriend(1L, 2L)).thenReturn(true);
        CompletableFuture<SendResult<String, MessageEvent>> failed = new CompletableFuture<>();
        failed.completeExceptionally(new IllegalStateException("kafka down"));
        when(kafkaTemplate.send(eq("im-chat-topic"), eq("p_1_2"), any(MessageEvent.class)))
                .thenReturn(failed);

        assertThrows(BusinessException.class, () -> handler.handle(privateCommand()));

        verify(acceptedMessageProjectionService, never()).projectAccepted(any(MessageEvent.class));
    }

    @Test
    void kafkaTimeoutShouldSurfaceBusinessExceptionBeforeProjection() {
        PrivateMessageHandler handler = new PrivateMessageHandler(
                redisTemplate,
                kafkaTemplate,
                snowflakeIdGenerator,
                acceptedMessageProjectionService,
                userProfileCache
        );
        ReflectionTestUtils.setField(handler, "kafkaSendTimeoutMs", 1L);
        when(snowflakeIdGenerator.nextId()).thenReturn(9005L);
        when(userProfileCache.getUser(1L)).thenReturn(user("1", "alice"));
        when(userProfileCache.getUser(2L)).thenReturn(user("2", "bob"));
        when(userProfileCache.isFriend(1L, 2L)).thenReturn(true);
        CompletableFuture<SendResult<String, MessageEvent>> timeoutFuture = new CompletableFuture<>();
        when(kafkaTemplate.send(eq("im-chat-topic"), eq("p_1_2"), any(MessageEvent.class)))
                .thenReturn(timeoutFuture);

        assertThrows(BusinessException.class, () -> handler.handle(privateCommand()));

        verify(acceptedMessageProjectionService, never()).projectAccepted(any(MessageEvent.class));
    }

    @Test
    void projectionFailureShouldSurfaceBusinessExceptionWithoutKafkaRetry() {
        PrivateMessageHandler handler = new PrivateMessageHandler(
                redisTemplate,
                kafkaTemplate,
                snowflakeIdGenerator,
                acceptedMessageProjectionService,
                userProfileCache
        );
        when(snowflakeIdGenerator.nextId()).thenReturn(9006L);
        when(userProfileCache.getUser(1L)).thenReturn(user("1", "alice"));
        when(userProfileCache.getUser(2L)).thenReturn(user("2", "bob"));
        when(userProfileCache.isFriend(1L, 2L)).thenReturn(true);
        stubKafkaSuccess("p_1_2");
        org.mockito.Mockito.doThrow(new BusinessException("redis failed"))
                .when(acceptedMessageProjectionService)
                .projectAccepted(any(MessageEvent.class));

        assertThrows(BusinessException.class, () -> handler.handle(privateCommand()));

        verify(kafkaTemplate).send(eq("im-chat-topic"), eq("p_1_2"), any(MessageEvent.class));
        verify(acceptedMessageProjectionService).projectAccepted(any(MessageEvent.class));
    }

    private void stubKafkaSuccess(String conversationId) {
        when(kafkaTemplate.send(eq("im-chat-topic"), eq(conversationId), any(MessageEvent.class)))
                .thenReturn(CompletableFuture.completedFuture(null));
    }

    private MessageEvent captureEvent(String conversationId) {
        ArgumentCaptor<MessageEvent> eventCaptor = ArgumentCaptor.forClass(MessageEvent.class);
        verify(kafkaTemplate).send(eq("im-chat-topic"), eq(conversationId), eventCaptor.capture());
        return eventCaptor.getValue();
    }

    private SendMessageCommand privateCommand() {
        return SendMessageCommand.builder()
                .senderId(1L)
                .receiverId(2L)
                .messageType(MessageType.TEXT)
                .clientMessageId("client-1")
                .content("hello")
                .build();
    }

    private SendMessageCommand groupCommand() {
        return SendMessageCommand.builder()
                .senderId(1L)
                .groupId(8L)
                .isGroup(true)
                .messageType(MessageType.TEXT)
                .clientMessageId("client-2")
                .content("group-hi")
                .build();
    }

    private SendMessageCommand systemCommand() {
        return SendMessageCommand.builder()
                .senderId(0L)
                .receiverId(2L)
                .messageType(MessageType.SYSTEM)
                .content("system notice")
                .build();
    }

    private UserDTO user(String id, String username) {
        return UserDTO.builder()
                .id(id)
                .username(username)
                .nickname(username)
                .avatar(username + ".png")
                .build();
    }
}
