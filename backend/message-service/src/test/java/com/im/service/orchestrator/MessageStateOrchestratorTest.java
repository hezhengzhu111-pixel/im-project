package com.im.service.orchestrator;

import com.im.dto.MessageDTO;
import com.im.dto.MessageEvent;
import com.im.dto.StatusChangeEvent;
import com.im.dto.UserDTO;
import com.im.enums.MessageEventType;
import com.im.enums.MessageType;
import com.im.feign.GroupServiceFeignClient;
import com.im.feign.UserServiceFeignClient;
import com.im.handler.GroupMessageHandler;
import com.im.handler.MessageHandler;
import com.im.handler.PrivateMessageHandler;
import com.im.handler.SystemMessageHandler;
import com.im.mapper.GroupReadCursorMapper;
import com.im.mapper.MessageMapper;
import com.im.mapper.PrivateReadCursorMapper;
import com.im.message.entity.Message;
import com.im.service.ConversationCacheUpdater;
import com.im.service.command.SendMessageCommand;
import com.im.service.support.*;
import com.im.utils.SnowflakeIdGenerator;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.InOrder;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.test.util.ReflectionTestUtils;

import java.time.LocalDateTime;
import java.util.List;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class MessageStateOrchestratorTest {

    @Mock
    private SnowflakeIdGenerator snowflakeIdGenerator;

    @Mock
    private HotMessageRedisRepository hotMessageRedisRepository;

    @Mock
    private AcceptedMessageProjectionService acceptedMessageProjectionService;

    @Mock
    private MessageMapper messageMapper;

    @Mock
    private UserProfileCache userProfileCache;

    @Mock
    private PersistenceWatermarkService persistenceWatermarkService;

    @Mock
    private PendingStatusEventService pendingStatusEventService;

    @Mock
    private ConversationCacheUpdater conversationCacheUpdater;

    @Mock
    private GroupReadCursorMapper groupReadCursorMapper;

    @Mock
    private PrivateReadCursorMapper privateReadCursorMapper;

    @Mock
    private GroupServiceFeignClient groupServiceFeignClient;

    @Mock
    private UserServiceFeignClient userServiceFeignClient;

    private MessageStateOrchestrator orchestrator;

    @BeforeEach
    void setUp() {
        orchestrator = new MessageStateOrchestrator(
                snowflakeIdGenerator,
                hotMessageRedisRepository,
                acceptedMessageProjectionService,
                messageMapper,
                userProfileCache,
                persistenceWatermarkService,
                pendingStatusEventService,
                conversationCacheUpdater,
                groupReadCursorMapper,
                privateReadCursorMapper
        );
        ReflectionTestUtils.setField(orchestrator, "defaultSystemSenderId", 0L);
        lenient().when(hotMessageRedisRepository.getMessageIdByClientMessageId(anyLong(), anyString())).thenReturn(null);
    }

    @Test
    void privateMessageShouldExecuteAcceptedStageThroughOrchestrator() {
        PrivateMessageHandler handler = new PrivateMessageHandler(userProfileCache);
        when(snowflakeIdGenerator.nextId()).thenReturn(9001L);
        when(userProfileCache.getUser(1L)).thenReturn(user("1", "alice"));
        when(userProfileCache.getUser(2L)).thenReturn(user("2", "bob"));
        when(userProfileCache.isFriend(1L, 2L)).thenReturn(true);
        when(acceptedMessageProjectionService.reserveAcceptedMessage(any(MessageEvent.class))).thenReturn(null);

        MessageDTO result = orchestrator.handleAcceptedSend(privateCommand(), () -> handler);

        assertEquals(9001L, result.getId());
        assertEquals(MessageDTO.ACK_STAGE_ACCEPTED, result.getAckStage());
        ArgumentCaptor<MessageEvent> eventCaptor = ArgumentCaptor.forClass(MessageEvent.class);
        InOrder inOrder = inOrder(acceptedMessageProjectionService);
        inOrder.verify(acceptedMessageProjectionService).reserveAcceptedMessage(eventCaptor.capture());
        inOrder.verify(acceptedMessageProjectionService).projectAcceptedFirstSeen(any(MessageEvent.class));
        MessageEvent event = eventCaptor.getValue();
        assertEquals(MessageEventType.MESSAGE, event.getEventType());
        assertEquals("p_1_2", event.getConversationId());
        assertEquals("client-1", event.getClientMessageId());
    }

    @Test
    void groupMessageShouldExecuteAcceptedStageThroughOrchestrator() {
        GroupMessageHandler handler = new GroupMessageHandler(groupServiceFeignClient, userProfileCache);
        when(snowflakeIdGenerator.nextId()).thenReturn(9002L);
        when(userProfileCache.getUser(1L)).thenReturn(user("1", "alice"));
        when(groupServiceFeignClient.exists(8L)).thenReturn(true);
        when(userProfileCache.isGroupMember(8L, 1L)).thenReturn(true);
        when(acceptedMessageProjectionService.reserveAcceptedMessage(any(MessageEvent.class))).thenReturn(null);

        MessageDTO result = orchestrator.handleAcceptedSend(groupCommand(), () -> handler);

        assertEquals(9002L, result.getId());
        assertTrue(result.isGroup());
        ArgumentCaptor<MessageEvent> eventCaptor = ArgumentCaptor.forClass(MessageEvent.class);
        verify(acceptedMessageProjectionService).projectAcceptedFirstSeen(eventCaptor.capture());
        assertEquals("g_8", eventCaptor.getValue().getConversationId());
    }

    @Test
    void systemMessageShouldExecuteAcceptedStageThroughOrchestrator() {
        SystemMessageHandler handler = new SystemMessageHandler(userServiceFeignClient, userProfileCache);
        when(snowflakeIdGenerator.nextId()).thenReturn(9003L);
        when(userServiceFeignClient.exists(2L)).thenReturn(true);
        when(userProfileCache.getUser(0L)).thenReturn(null);
        when(userProfileCache.getUser(2L)).thenReturn(user("2", "bob"));
        when(acceptedMessageProjectionService.reserveAcceptedMessage(any(MessageEvent.class))).thenReturn(null);

        MessageDTO result = orchestrator.handleAcceptedSend(systemCommand(), () -> handler);

        assertEquals(9003L, result.getId());
        assertEquals("sys-9003", result.getClientMessageId());
        verify(acceptedMessageProjectionService).projectAcceptedFirstSeen(any(MessageEvent.class));
    }

    @Test
    void duplicateClientMessageIdShouldReturnStableHotResultWithoutDuplicateAcceptedSideEffects() {
        MessageDTO hotMessage = MessageDTO.builder()
                .id(9010L)
                .senderId(1L)
                .receiverId(2L)
                .clientMessageId("client-1")
                .messageType(MessageType.TEXT)
                .content("hello")
                .ackStage(MessageDTO.ACK_STAGE_ACCEPTED)
                .build();
        MessageHandler handler = mock(MessageHandler.class);
        when(hotMessageRedisRepository.getMessageIdByClientMessageId(1L, "client-1")).thenReturn(9010L);
        when(hotMessageRedisRepository.getHotMessage(9010L)).thenReturn(hotMessage);

        MessageDTO result = orchestrator.handleAcceptedSend(privateCommand(), () -> handler);

        assertSame(hotMessage, result);
        verify(handler, never()).prepare(any(), any());
        verify(acceptedMessageProjectionService, never()).reserveAcceptedMessage(any(MessageEvent.class));
        verify(acceptedMessageProjectionService, never()).projectAcceptedFirstSeen(any(MessageEvent.class));
    }

    @Test
    void advancePersistedShouldBeHandledByOrchestrator() {
        MessageEvent event = messageEvent(1000L, "p_1_2");
        when(pendingStatusEventService.listByMessageId(1000L)).thenReturn(List.of());

        MessageStateOrchestrator.PersistedStageResult result = orchestrator.advancePersisted(event);

        assertEquals("p_1_2", result.conversationId());
        assertEquals(0, result.replayedPendingCount());
        verify(persistenceWatermarkService).markPersisted("p_1_2", 1000L);
        verify(acceptedMessageProjectionService).markPersisted(event);
    }

    @Test
    void statusEventBeforePersistedShouldBacklogThenReplayAfterPersisted() {
        StatusChangeEvent event = StatusChangeEvent.builder()
                .messageId(1001L)
                .conversationId("p_1_2")
                .senderId(1L)
                .receiverId(2L)
                .newStatus(Message.MessageStatus.RECALLED)
                .changedAt(LocalDateTime.of(2026, 4, 16, 10, 5))
                .payload(MessageDTO.builder().id(1001L).status("RECALLED").build())
                .build();
        when(messageMapper.selectById(1001L))
                .thenReturn(null)
                .thenReturn(persistedMessage(1001L, Message.MessageStatus.SENT, LocalDateTime.of(2026, 4, 16, 10, 0)));
        when(messageMapper.updateById(any(Message.class))).thenReturn(1);
        when(pendingStatusEventService.listByMessageId(1001L)).thenReturn(List.of(event));

        MessageStateOrchestrator.StatusStageResult first = orchestrator.applyStatusEvent(event);
        MessageStateOrchestrator.PersistedStageResult second = orchestrator.advancePersisted(messageEvent(1001L, "p_1_2"));

        assertEquals(MessageStateOrchestrator.StatusDisposition.BACKLOGGED, first.disposition());
        assertEquals(1, second.replayedPendingCount());
        verify(pendingStatusEventService).store(event);
        verify(conversationCacheUpdater).applyStatusChange(event);
        verify(pendingStatusEventService).remove(1001L, Message.MessageStatus.RECALLED);
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

    private MessageEvent messageEvent(Long messageId, String conversationId) {
        return MessageEvent.builder()
                .eventType(MessageEventType.MESSAGE)
                .messageId(messageId)
                .conversationId(conversationId)
                .senderId(1L)
                .receiverId(2L)
                .clientMessageId("client-" + messageId)
                .clientMsgId("client-" + messageId)
                .messageType(MessageType.TEXT)
                .content("hello")
                .createdTime(LocalDateTime.of(2026, 4, 16, 10, 0))
                .updatedTime(LocalDateTime.of(2026, 4, 16, 10, 0))
                .payload(MessageDTO.builder()
                        .id(messageId)
                        .senderId(1L)
                        .receiverId(2L)
                        .clientMessageId("client-" + messageId)
                        .messageType(MessageType.TEXT)
                        .content("hello")
                        .ackStage(MessageDTO.ACK_STAGE_ACCEPTED)
                        .createdTime(LocalDateTime.of(2026, 4, 16, 10, 0))
                        .build())
                .build();
    }

    private Message persistedMessage(Long messageId, Integer status, LocalDateTime updatedTime) {
        Message message = new Message();
        message.setId(messageId);
        message.setStatus(status);
        message.setUpdatedTime(updatedTime);
        return message;
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
