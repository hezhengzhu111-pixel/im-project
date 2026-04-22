package com.im.service.impl;

import com.im.dto.MessageDTO;
import com.im.dto.ReadEvent;
import com.im.dto.StatusChangeEvent;
import com.im.enums.MessageType;
import com.im.feign.GroupServiceFeignClient;
import com.im.feign.UserServiceFeignClient;
import com.im.mapper.GroupReadCursorMapper;
import com.im.mapper.MessageMapper;
import com.im.mapper.PrivateReadCursorMapper;
import com.im.message.entity.Message;
import com.im.service.ConversationCacheUpdater;
import com.im.service.orchestrator.MessageStateOrchestrator;
import com.im.service.query.HotConversationReadService;
import com.im.service.query.HotRecentMessageReadService;
import com.im.service.support.*;
import com.im.utils.SnowflakeIdGenerator;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.InOrder;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.data.redis.core.RedisTemplate;
import org.springframework.kafka.core.KafkaTemplate;
import org.springframework.test.util.ReflectionTestUtils;

import java.time.LocalDateTime;
import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class MessageServiceStateKafkaTest {

    @Mock
    private MessageMapper messageMapper;

    @Mock
    private UserServiceFeignClient userServiceFeignClient;

    @Mock
    private GroupServiceFeignClient groupServiceFeignClient;

    @Mock
    private RedisTemplate<String, Object> redisTemplate;

    @Mock
    private GroupReadCursorMapper groupReadCursorMapper;

    @Mock
    private PrivateReadCursorMapper privateReadCursorMapper;

    @Mock
    private UserProfileCache userProfileCache;

    @Mock
    private KafkaTemplate<String, ReadEvent> readEventKafkaTemplate;

    @Mock
    private KafkaTemplate<String, StatusChangeEvent> statusChangeEventKafkaTemplate;

    @Mock
    private HotMessageRedisRepository hotMessageRedisRepository;

    @Mock
    private AcceptedMessageProjectionService acceptedMessageProjectionService;

    @Mock
    private HotConversationReadService hotConversationReadService;

    @Mock
    private HotRecentMessageReadService hotRecentMessageReadService;

    @Mock
    private HotMessageLookupService hotMessageLookupService;

    @Mock
    private ConversationCacheUpdater conversationCacheUpdater;

    @Mock
    private SnowflakeIdGenerator snowflakeIdGenerator;

    @Mock
    private PersistenceWatermarkService persistenceWatermarkService;

    @Mock
    private PendingStatusEventService pendingStatusEventService;

    @Mock
    private MessageStateOutboxService messageStateOutboxService;

    private MessageServiceImpl messageService;

    @BeforeEach
    void setUp() {
        MessageStateOrchestrator orchestrator = new MessageStateOrchestrator(
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
        messageService = new MessageServiceImpl(
                messageMapper,
                userServiceFeignClient,
                groupServiceFeignClient,
                redisTemplate,
                groupReadCursorMapper,
                privateReadCursorMapper,
                userProfileCache,
                List.of(),
                hotConversationReadService,
                hotRecentMessageReadService,
                hotMessageLookupService,
                orchestrator,
                pendingStatusEventService,
                messageStateOutboxService
        );
        ReflectionTestUtils.setField(messageService, "readTopic", "im-read-topic");
        ReflectionTestUtils.setField(messageService, "statusTopic", "im-status-topic");
    }

    @Test
    void markAsReadShouldApplyLocalStateAndEnqueueOutboxUsingRedisLatestVisibleMessageId() {
        when(userServiceFeignClient.exists(1L)).thenReturn(true);
        when(userServiceFeignClient.exists(2L)).thenReturn(true);
        when(userProfileCache.isFriend(1L, 2L)).thenReturn(true);
        when(hotRecentMessageReadService.resolveLatestVisibleMessageId("p_1_2")).thenReturn(200L);

        messageService.markAsRead(1L, "1_2");

        ArgumentCaptor<ReadEvent> eventCaptor = ArgumentCaptor.forClass(ReadEvent.class);
        verify(messageStateOutboxService).enqueueReadEvent(eventCaptor.capture(), eq("im-read-topic"), eq("p_1_2"));
        ReadEvent event = eventCaptor.getValue();
        assertEquals(1L, event.getUserId());
        assertEquals(2L, event.getTargetUserId());
        assertEquals("p_1_2", event.getConversationId());
        assertEquals(200L, event.getLastReadMessageId());
        verify(hotRecentMessageReadService).resolveLatestVisibleMessageId("p_1_2");
        verify(privateReadCursorMapper).insert(any(com.im.message.entity.PrivateReadCursor.class));
        verify(conversationCacheUpdater).markConversationRead(any(ReadEvent.class));
        verifyNoInteractions(readEventKafkaTemplate, statusChangeEventKafkaTemplate);
    }

    @Test
    void markAsReadShouldNormalizeLegacyGroupConversationIdBeforeEnqueueingOutbox() {
        when(userServiceFeignClient.exists(1L)).thenReturn(true);
        when(groupServiceFeignClient.exists(8L)).thenReturn(true);
        when(userProfileCache.isGroupMember(8L, 1L)).thenReturn(true);
        when(hotRecentMessageReadService.resolveLatestVisibleMessageId("g_8")).thenReturn(300L);

        messageService.markAsRead(1L, "group_8");

        ArgumentCaptor<ReadEvent> eventCaptor = ArgumentCaptor.forClass(ReadEvent.class);
        verify(messageStateOutboxService).enqueueReadEvent(eventCaptor.capture(), eq("im-read-topic"), eq("g_8"));
        ReadEvent event = eventCaptor.getValue();
        assertEquals("g_8", event.getConversationId());
        assertEquals(8L, event.getGroupId());
        assertEquals(300L, event.getLastReadMessageId());
        verify(hotRecentMessageReadService).resolveLatestVisibleMessageId("g_8");
        verify(groupReadCursorMapper).insert(any(com.im.message.entity.GroupReadCursor.class));
        verifyNoInteractions(readEventKafkaTemplate, statusChangeEventKafkaTemplate);
    }

    @Test
    void recallMessageShouldPersistPendingStatusAndEnqueueOutboxWithoutDirectKafkaSend() {
        Message storedMessage = privateMessage(300L, 1L, 2L, "hello");
        when(hotMessageLookupService.requireOwnedMessageForStatusChange(1L, 300L, false, false))
                .thenReturn(storedMessage);
        when(messageMapper.selectById(300L)).thenReturn(null);

        MessageDTO result = messageService.recallMessage(1L, 300L);

        InOrder inOrder = inOrder(conversationCacheUpdater, pendingStatusEventService, messageStateOutboxService);
        ArgumentCaptor<StatusChangeEvent> eventCaptor = ArgumentCaptor.forClass(StatusChangeEvent.class);
        inOrder.verify(conversationCacheUpdater).applyStatusChange(any(StatusChangeEvent.class));
        inOrder.verify(pendingStatusEventService).store(any(StatusChangeEvent.class));
        inOrder.verify(messageStateOutboxService).enqueueStatusChangeEvent(eventCaptor.capture(), eq("im-status-topic"), eq("p_1_2"));
        StatusChangeEvent event = eventCaptor.getValue();
        assertEquals(300L, event.getMessageId());
        assertEquals(Message.MessageStatus.RECALLED, event.getNewStatus());
        assertNotNull(event.getPayload());
        assertEquals("RECALLED", event.getPayload().getStatus());
        assertEquals("RECALLED", result.getStatus());
        verify(hotMessageLookupService).requireOwnedMessageForStatusChange(1L, 300L, false, false);
        verify(messageMapper).selectById(300L);
        verify(messageMapper, never()).updateById(any(Message.class));
        verifyNoInteractions(readEventKafkaTemplate, statusChangeEventKafkaTemplate);
    }

    @Test
    void deleteMessageShouldUpdatePersistedStatusAndEnqueueOutboxWithoutDirectKafkaSend() {
        Message storedMessage = privateMessage(301L, 1L, 2L, "delete me");
        storedMessage.setStatus(Message.MessageStatus.RECALLED);
        when(hotMessageLookupService.requireOwnedMessageForStatusChange(1L, 301L, true, false))
                .thenReturn(storedMessage);
        when(messageMapper.selectById(301L)).thenReturn(privateMessage(301L, 1L, 2L, "delete me"));
        when(messageMapper.updateById(any(Message.class))).thenReturn(1);

        MessageDTO result = messageService.deleteMessage(1L, 301L);

        InOrder inOrder = inOrder(conversationCacheUpdater, pendingStatusEventService, messageStateOutboxService);
        inOrder.verify(conversationCacheUpdater).applyStatusChange(any(StatusChangeEvent.class));
        inOrder.verify(pendingStatusEventService).remove(301L, Message.MessageStatus.DELETED);
        ArgumentCaptor<StatusChangeEvent> eventCaptor = ArgumentCaptor.forClass(StatusChangeEvent.class);
        inOrder.verify(messageStateOutboxService).enqueueStatusChangeEvent(eventCaptor.capture(), eq("im-status-topic"), eq("p_1_2"));
        StatusChangeEvent event = eventCaptor.getValue();
        assertEquals(301L, event.getMessageId());
        assertEquals(Message.MessageStatus.DELETED, event.getNewStatus());
        assertEquals("DELETED", result.getStatus());
        verify(hotMessageLookupService).requireOwnedMessageForStatusChange(1L, 301L, true, false);
        verify(messageMapper).selectById(301L);
        verify(messageMapper).updateById(any(Message.class));
        verify(pendingStatusEventService, never()).store(any(StatusChangeEvent.class));
        verifyNoInteractions(readEventKafkaTemplate, statusChangeEventKafkaTemplate);
    }

    private Message privateMessage(Long id, Long senderId, Long receiverId, String content) {
        Message message = new Message();
        LocalDateTime createdTime = LocalDateTime.now().minusMinutes(1);
        message.setId(id);
        message.setSenderId(senderId);
        message.setReceiverId(receiverId);
        message.setIsGroupChat(false);
        message.setMessageType(MessageType.TEXT);
        message.setContent(content);
        message.setStatus(Message.MessageStatus.SENT);
        message.setCreatedTime(createdTime);
        message.setUpdatedTime(createdTime);
        return message;
    }
}
