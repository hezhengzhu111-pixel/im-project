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

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

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
    void privateMessageShouldWriteAcceptedLocallyWithoutSyncKafkaAndReturnAcceptedAckStage() {
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

        MessageDTO result = handler.handle(privateCommand());

        assertEquals(9001L, result.getId());
        assertEquals("client-1", result.getClientMessageId());
        assertEquals(MessageDTO.ACK_STAGE_ACCEPTED, result.getAckStage());
        assertFalse(result.isGroup());

        ArgumentCaptor<MessageEvent> eventCaptor = ArgumentCaptor.forClass(MessageEvent.class);
        verify(acceptedMessageProjectionService).reserveAcceptedMessage(eventCaptor.capture());
        MessageEvent event = eventCaptor.getValue();
        assertEquals(MessageEventType.MESSAGE, event.getEventType());
        assertEquals(9001L, event.getMessageId());
        assertEquals("p_1_2", event.getConversationId());
        assertEquals(1L, event.getSenderId());
        assertEquals(2L, event.getReceiverId());
        assertEquals("client-1", event.getClientMsgId());
        assertEquals(MessageType.TEXT, event.getMessageType());
        assertEquals("hello", event.getContent());
        assertEquals(MessageDTO.ACK_STAGE_ACCEPTED, event.getPayload().getAckStage());

        InOrder inOrder = inOrder(acceptedMessageProjectionService);
        inOrder.verify(acceptedMessageProjectionService).reserveAcceptedMessage(any(MessageEvent.class));
        inOrder.verify(acceptedMessageProjectionService).projectAcceptedFirstSeen(any(MessageEvent.class));
        verify(kafkaTemplate, never()).send(anyString(), anyString(), any(MessageEvent.class));
    }

    @Test
    void groupMessageShouldUseGroupConversationIdAsAcceptedProjectionKey() {
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

        MessageDTO result = handler.handle(groupCommand());

        assertEquals(9002L, result.getId());
        assertEquals(MessageDTO.ACK_STAGE_ACCEPTED, result.getAckStage());
        assertTrue(result.isGroup());
        ArgumentCaptor<MessageEvent> eventCaptor = ArgumentCaptor.forClass(MessageEvent.class);
        verify(acceptedMessageProjectionService).projectAcceptedFirstSeen(eventCaptor.capture());
        MessageEvent event = eventCaptor.getValue();
        assertEquals("g_8", event.getConversationId());
        assertEquals(8L, event.getGroupId());
        assertEquals(9002L, event.getMessageId());
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

        MessageDTO result = handler.handle(systemCommand());

        assertEquals(9003L, result.getId());
        assertEquals("SYSTEM", result.getSenderName());
        assertEquals(MessageDTO.ACK_STAGE_ACCEPTED, result.getAckStage());
        ArgumentCaptor<MessageEvent> eventCaptor = ArgumentCaptor.forClass(MessageEvent.class);
        verify(acceptedMessageProjectionService).reserveAcceptedMessage(eventCaptor.capture());
        assertEquals("sys-9003", result.getClientMessageId());
        assertEquals("sys-9003", eventCaptor.getValue().getClientMessageId());
        assertEquals("sys-9003", eventCaptor.getValue().getPayload().getClientMessageId());
    }

    @Test
    void projectionFailureShouldNotBlockAcceptedResponseAfterLocalCommit() {
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
        doThrow(new BusinessException("redis failed"))
                .when(acceptedMessageProjectionService)
                .projectAcceptedFirstSeen(any(MessageEvent.class));

        MessageDTO result = handler.handle(privateCommand());

        assertEquals(9006L, result.getId());
        assertEquals(MessageDTO.ACK_STAGE_ACCEPTED, result.getAckStage());
        verify(acceptedMessageProjectionService).reserveAcceptedMessage(any(MessageEvent.class));
        verify(acceptedMessageProjectionService).projectAcceptedFirstSeen(any(MessageEvent.class));
        verify(kafkaTemplate, never()).send(anyString(), anyString(), any(MessageEvent.class));
    }

    @Test
    void duplicateAcceptedReservationShouldReturnExistingMessageWithoutCreatingDuplicateOutboxOrKafkaSend() {
        PrivateMessageHandler handler = new PrivateMessageHandler(
                redisTemplate,
                kafkaTemplate,
                snowflakeIdGenerator,
                acceptedMessageProjectionService,
                userProfileCache
        );
        MessageDTO existing = MessageDTO.builder()
                .id(9010L)
                .senderId(1L)
                .receiverId(2L)
                .clientMessageId("client-1")
                .messageType(MessageType.TEXT)
                .content("hello")
                .ackStage(MessageDTO.ACK_STAGE_ACCEPTED)
                .build();
        when(snowflakeIdGenerator.nextId()).thenReturn(9011L);
        when(userProfileCache.getUser(1L)).thenReturn(user("1", "alice"));
        when(userProfileCache.getUser(2L)).thenReturn(user("2", "bob"));
        when(userProfileCache.isFriend(1L, 2L)).thenReturn(true);
        when(acceptedMessageProjectionService.reserveAcceptedMessage(any(MessageEvent.class))).thenReturn(existing);

        MessageDTO result = handler.handle(privateCommand());

        assertSame(existing, result);
        verify(acceptedMessageProjectionService).rehydrateAcceptedProjection(existing);
        verify(acceptedMessageProjectionService, never()).projectAcceptedFirstSeen(any(MessageEvent.class));
        verify(kafkaTemplate, never()).send(anyString(), anyString(), any(MessageEvent.class));
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
