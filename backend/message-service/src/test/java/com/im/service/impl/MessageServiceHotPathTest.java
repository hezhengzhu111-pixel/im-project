package com.im.service.impl;

import com.im.dto.*;
import com.im.enums.MessageType;
import com.im.exception.BusinessException;
import com.im.feign.GroupServiceFeignClient;
import com.im.feign.UserServiceFeignClient;
import com.im.mapper.GroupReadCursorMapper;
import com.im.mapper.MessageMapper;
import com.im.mapper.PrivateReadCursorMapper;
import com.im.message.entity.Message;
import com.im.service.ConversationCacheUpdater;
import com.im.service.command.SendMessageCommand;
import com.im.service.orchestrator.MessageStateOrchestrator;
import com.im.service.query.HotConversationReadService;
import com.im.service.query.HotConversationReadService.HotConversationSkeleton;
import com.im.service.query.HotRecentMessageReadService;
import com.im.service.support.*;
import com.im.utils.SnowflakeIdGenerator;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.data.redis.core.RedisTemplate;
import org.springframework.data.redis.core.ValueOperations;
import org.springframework.kafka.core.KafkaTemplate;
import org.springframework.test.util.ReflectionTestUtils;

import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.concurrent.atomic.AtomicReference;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class MessageServiceHotPathTest {

    @Mock
    private MessageMapper messageMapper;

    @Mock
    private UserServiceFeignClient userServiceFeignClient;

    @Mock
    private GroupServiceFeignClient groupServiceFeignClient;

    @Mock
    private RedisTemplate<String, Object> redisTemplate;

    @Mock
    private ValueOperations<String, Object> valueOperations;

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
                readEventKafkaTemplate,
                statusChangeEventKafkaTemplate,
                hotConversationReadService,
                hotRecentMessageReadService,
                hotMessageLookupService,
                orchestrator
        );
        lenient().when(redisTemplate.opsForValue()).thenReturn(valueOperations);
        ReflectionTestUtils.setField(messageService, "defaultSystemSenderId", 0L);
    }

    @Test
    void sendMessageShouldReturnHotAcceptedMessageWithoutReprojectionOrDbLookup() {
        MessageDTO hotMessage = MessageDTO.builder()
                .id(1001L)
                .clientMessageId("client-1")
                .senderId(1L)
                .receiverId(2L)
                .messageType(MessageType.TEXT)
                .content("hello")
                .ackStage(MessageDTO.ACK_STAGE_ACCEPTED)
                .senderName("alice")
                .receiverName("bob")
                .createdTime(LocalDateTime.of(2026, 4, 15, 21, 0))
                .build();
        when(hotMessageRedisRepository.getMessageIdByClientMessageId(1L, "client-1")).thenReturn(1001L);
        when(hotMessageRedisRepository.getHotMessage(1001L)).thenReturn(hotMessage);

        MessageDTO result = messageService.sendMessage(SendMessageCommand.builder()
                .senderId(1L)
                .receiverId(2L)
                .messageType(MessageType.TEXT)
                .clientMessageId("client-1")
                .content("hello")
                .build());

        assertSame(hotMessage, result);
        assertEquals(MessageDTO.ACK_STAGE_ACCEPTED, result.getAckStage());
        verify(acceptedMessageProjectionService, never()).rehydrateAcceptedProjection(any());
        verify(acceptedMessageProjectionService, never()).projectAcceptedFirstSeen(any());
        verify(acceptedMessageProjectionService, never()).findDurableAcceptedMessage(any(), any());
        verify(messageMapper, never()).selectBySenderIdAndClientMessageId(any(), any());
    }

    @Test
    void sendMessageShouldRehydrateDurableAcceptedMessageWhenMappingExistsButHotProjectionMisses() {
        MessageDTO durable = messageDto(2002L, 1L, 2L, null, "persisted hello", MessageType.TEXT,
                LocalDateTime.of(2026, 4, 15, 21, 5), false);
        durable.setClientMessageId("client-db");
        durable.setAckStage(MessageDTO.ACK_STAGE_PERSISTED);
        when(hotMessageRedisRepository.getMessageIdByClientMessageId(1L, "client-db")).thenReturn(2002L);
        when(hotMessageRedisRepository.getHotMessage(2002L)).thenReturn(null);
        when(acceptedMessageProjectionService.findDurableAcceptedMessage(1L, "client-db")).thenReturn(durable);

        MessageDTO result = messageService.sendMessage(SendMessageCommand.builder()
                .senderId(1L)
                .receiverId(2L)
                .messageType(MessageType.TEXT)
                .clientMessageId("client-db")
                .content("persisted hello")
                .build());

        assertEquals(2002L, result.getId());
        assertEquals("client-db", result.getClientMessageId());
        assertEquals(MessageDTO.ACK_STAGE_PERSISTED, result.getAckStage());
        verify(acceptedMessageProjectionService).rehydrateAcceptedProjection(durable);
        verify(messageMapper, never()).selectBySenderIdAndClientMessageId(any(), any());
        verify(acceptedMessageProjectionService, never()).projectAcceptedFirstSeen(any());
    }

    @Test
    void sendMessageShouldFallbackToPersistedMessageWhenDurableAcceptedMisses() {
        Message persisted = privateMessage(2002L, 1L, 2L, "client-db", "persisted hello",
                LocalDateTime.of(2026, 4, 15, 21, 5));
        when(hotMessageRedisRepository.getMessageIdByClientMessageId(1L, "client-db")).thenReturn(2002L);
        when(hotMessageRedisRepository.getHotMessage(2002L)).thenReturn(null);
        when(acceptedMessageProjectionService.findDurableAcceptedMessage(1L, "client-db")).thenReturn(null);
        when(messageMapper.selectBySenderIdAndClientMessageId(1L, "client-db")).thenReturn(persisted);
        when(userProfileCache.getUser(1L)).thenReturn(user("1", "alice"));
        when(userProfileCache.getUser(2L)).thenReturn(user("2", "bob"));

        MessageDTO result = messageService.sendMessage(SendMessageCommand.builder()
                .senderId(1L)
                .receiverId(2L)
                .messageType(MessageType.TEXT)
                .clientMessageId("client-db")
                .content("persisted hello")
                .build());

        assertEquals(2002L, result.getId());
        assertEquals("client-db", result.getClientMessageId());
        assertEquals(MessageDTO.ACK_STAGE_PERSISTED, result.getAckStage());
        verify(acceptedMessageProjectionService).rehydrateAcceptedProjection(result);
        verify(acceptedMessageProjectionService, never()).projectAcceptedFirstSeen(any());
    }

    @Test
    void sendMessageShouldRecoverDurableAcceptedMessageWhenRedisIdempotencyMisses() {
        MessageDTO durable = messageDto(2003L, 1L, 2L, null, "persisted hello", MessageType.TEXT,
                LocalDateTime.of(2026, 4, 15, 21, 6), false);
        durable.setClientMessageId("client-db-miss");
        durable.setAckStage(MessageDTO.ACK_STAGE_ACCEPTED);
        when(hotMessageRedisRepository.getMessageIdByClientMessageId(1L, "client-db-miss")).thenReturn(null);
        when(acceptedMessageProjectionService.findDurableAcceptedMessage(1L, "client-db-miss")).thenReturn(durable);

        MessageDTO result = messageService.sendMessage(SendMessageCommand.builder()
                .senderId(1L)
                .receiverId(2L)
                .messageType(MessageType.TEXT)
                .clientMessageId("client-db-miss")
                .content("persisted hello")
                .build());

        assertEquals(2003L, result.getId());
        assertEquals(MessageDTO.ACK_STAGE_ACCEPTED, result.getAckStage());
        verify(acceptedMessageProjectionService).rehydrateAcceptedProjection(durable);
        verify(messageMapper, never()).selectBySenderIdAndClientMessageId(any(), any());
        verify(acceptedMessageProjectionService, never()).projectAcceptedFirstSeen(any());
    }

    @Test
    void sendMessageShouldNotRetryKafkaWhenAcceptedMappingExistsButProjectionIsStillUnavailable() {
        when(hotMessageRedisRepository.getMessageIdByClientMessageId(1L, "client-stuck")).thenReturn(3003L);
        when(hotMessageRedisRepository.getHotMessage(3003L)).thenReturn(null);
        when(acceptedMessageProjectionService.findDurableAcceptedMessage(1L, "client-stuck")).thenReturn(null);
        when(messageMapper.selectBySenderIdAndClientMessageId(1L, "client-stuck")).thenReturn(null);

        BusinessException exception = assertThrows(BusinessException.class, () -> messageService.sendMessage(SendMessageCommand.builder()
                .senderId(1L)
                .receiverId(2L)
                .messageType(MessageType.TEXT)
                .clientMessageId("client-stuck")
                .content("hello")
                .build()));

        assertTrue(exception.getMessage().contains("temporarily unavailable"));
        verify(acceptedMessageProjectionService, never()).rehydrateAcceptedProjection(any());
        verify(acceptedMessageProjectionService, never()).projectAcceptedFirstSeen(any());
    }

    @Test
    void sendMessageShouldKeepMessageIdStableAcrossRepeatedDurableAcceptedRetries() {
        MessageDTO durable = MessageDTO.builder()
                .id(3004L)
                .clientMessageId("client-repeat")
                .senderId(1L)
                .receiverId(2L)
                .messageType(MessageType.TEXT)
                .content("persisted retry")
                .ackStage(MessageDTO.ACK_STAGE_ACCEPTED)
                .senderName("alice")
                .receiverName("bob")
                .createdTime(LocalDateTime.of(2026, 4, 15, 21, 7))
                .build();
        when(hotMessageRedisRepository.getMessageIdByClientMessageId(1L, "client-repeat")).thenReturn((Long) null, (Long) null);
        when(acceptedMessageProjectionService.findDurableAcceptedMessage(1L, "client-repeat")).thenReturn(durable, durable);

        MessageDTO firstResult = messageService.sendMessage(SendMessageCommand.builder()
                .senderId(1L)
                .receiverId(2L)
                .messageType(MessageType.TEXT)
                .clientMessageId("client-repeat")
                .content("persisted retry")
                .build());
        MessageDTO secondResult = messageService.sendMessage(SendMessageCommand.builder()
                .senderId(1L)
                .receiverId(2L)
                .messageType(MessageType.TEXT)
                .clientMessageId("client-repeat")
                .content("persisted retry")
                .build());

        assertEquals(3004L, firstResult.getId());
        assertEquals(3004L, secondResult.getId());
        assertEquals(MessageDTO.ACK_STAGE_ACCEPTED, firstResult.getAckStage());
        assertSame(durable, secondResult);
        verify(acceptedMessageProjectionService, times(2)).rehydrateAcceptedProjection(durable);
        verify(messageMapper, never()).selectBySenderIdAndClientMessageId(any(), any());
        verify(acceptedMessageProjectionService, never()).projectAcceptedFirstSeen(any());
    }

    @Test
    void getConversationsShouldPreferHotProjectionAndKeepSystemConversationVisible() {
        when(userServiceFeignClient.friendList(2L)).thenReturn(List.of(user("3", "charlie")));
        when(groupServiceFeignClient.listUserGroups(2L)).thenReturn(List.of(group(8L, "team")));
        when(valueOperations.get("conversations:user:2")).thenReturn(null);
        when(hotConversationReadService.loadConversationSkeletons(2L, 500)).thenReturn(List.of(
                new HotConversationSkeleton(
                        "p_0_2",
                        1,
                        0L,
                        null,
                        MessageDTO.builder()
                                .id(4001L)
                                .senderId(0L)
                                .receiverId(2L)
                                .messageType(MessageType.SYSTEM)
                                .content("system notice")
                                .senderName("SYSTEM")
                                .createdTime(LocalDateTime.of(2026, 4, 15, 21, 10))
                                .build(),
                        1L,
                        LocalDateTime.of(2026, 4, 15, 21, 10)
                ),
                new HotConversationSkeleton(
                        "g_8",
                        2,
                        null,
                        8L,
                        MessageDTO.builder()
                                .id(4002L)
                                .senderId(1L)
                                .groupId(8L)
                                .messageType(MessageType.TEXT)
                                .content("group hello")
                                .senderName("alice")
                                .createdTime(LocalDateTime.of(2026, 4, 15, 21, 11))
                                .isGroup(true)
                                .build(),
                        2L,
                        LocalDateTime.of(2026, 4, 15, 21, 11)
                )
        ));
        when(messageMapper.selectLastPrivateMessagesBatch(2L, List.of(3L))).thenReturn(List.of());
        when(messageMapper.countUnreadPrivateMessagesBatch(2L, List.of(3L))).thenReturn(List.of());
        when(messageMapper.selectLastGroupMessagesBatch(List.of(8L))).thenReturn(List.of());
        when(messageMapper.countUnreadGroupMessagesByUserCursors(List.of(8L), 2L)).thenReturn(List.of());

        List<ConversationDTO> conversations = messageService.getConversations(2L);

        Map<String, ConversationDTO> byId = conversations.stream()
                .collect(java.util.stream.Collectors.toMap(ConversationDTO::getConversationId, item -> item, (left, right) -> left));
        assertEquals("SYSTEM", byId.get("0").getConversationName());
        assertEquals(1L, byId.get("0").getUnreadCount());
        assertEquals(2L, byId.get("8").getUnreadCount());
        assertTrue(byId.containsKey("3"));
        verify(hotConversationReadService).loadConversationSkeletons(2L, 500);
        verify(valueOperations).get("conversations:user:2");
        verify(valueOperations).set(eq("conversations:user:2"), any(), eq(1L), eq(java.util.concurrent.TimeUnit.HOURS));
    }

    @Test
    void getConversationsShouldReturnWarmCacheWithoutCallingFriendOrGroupServices() {
        ConversationDTO cachedConversation = ConversationDTO.builder()
                .conversationId("3")
                .conversationType(1)
                .conversationName("charlie")
                .lastMessage("cached hello")
                .lastMessageTime(LocalDateTime.of(2026, 4, 15, 21, 15))
                .unreadCount(2L)
                .build();
        when(valueOperations.get("conversations:user:2")).thenReturn(List.of(cachedConversation));

        List<ConversationDTO> conversations = messageService.getConversations(2L);

        assertEquals(1, conversations.size());
        assertEquals("3", conversations.getFirst().getConversationId());
        verify(userServiceFeignClient, never()).friendList(anyLong());
        verify(groupServiceFeignClient, never()).listUserGroups(anyLong());
        verify(hotConversationReadService, never()).loadConversationSkeletons(anyLong(), anyInt());
    }

    @Test
    void getConversationsShouldReturnSameResultForCacheMissRebuildAndWarmCache() {
        AtomicReference<Object> cacheRef = new AtomicReference<>();
        when(valueOperations.get("conversations:user:2")).thenAnswer(invocation -> cacheRef.get());
        doAnswer(invocation -> {
            cacheRef.set(invocation.getArgument(1));
            return null;
        }).when(valueOperations).set(eq("conversations:user:2"), any(), eq(1L), eq(java.util.concurrent.TimeUnit.HOURS));
        when(userServiceFeignClient.friendList(2L)).thenReturn(List.of(user("3", "charlie")));
        when(groupServiceFeignClient.listUserGroups(2L)).thenReturn(List.of(group(8L, "team")));
        when(hotConversationReadService.loadConversationSkeletons(2L, 500)).thenReturn(List.of(
                new HotConversationSkeleton(
                        "g_8",
                        2,
                        null,
                        8L,
                        MessageDTO.builder()
                                .id(4002L)
                                .senderId(1L)
                                .groupId(8L)
                                .messageType(MessageType.TEXT)
                                .content("group hello")
                                .senderName("alice")
                                .createdTime(LocalDateTime.of(2026, 4, 15, 21, 11))
                                .isGroup(true)
                                .build(),
                        2L,
                        LocalDateTime.of(2026, 4, 15, 21, 11)
                ),
                new HotConversationSkeleton(
                        "p_0_2",
                        1,
                        0L,
                        null,
                        MessageDTO.builder()
                                .id(4001L)
                                .senderId(0L)
                                .receiverId(2L)
                                .messageType(MessageType.SYSTEM)
                                .content("system notice")
                                .senderName("SYSTEM")
                                .createdTime(LocalDateTime.of(2026, 4, 15, 21, 10))
                                .build(),
                        1L,
                        LocalDateTime.of(2026, 4, 15, 21, 10)
                )
        ));
        when(messageMapper.selectLastPrivateMessagesBatch(2L, List.of(3L))).thenReturn(List.of());
        when(messageMapper.countUnreadPrivateMessagesBatch(2L, List.of(3L))).thenReturn(List.of());
        when(messageMapper.selectLastGroupMessagesBatch(List.of(8L))).thenReturn(List.of());
        when(messageMapper.countUnreadGroupMessagesByUserCursors(List.of(8L), 2L)).thenReturn(List.of());

        List<ConversationDTO> rebuilt = messageService.getConversations(2L);
        List<ConversationDTO> warm = messageService.getConversations(2L);

        assertEquals(rebuilt.stream().map(ConversationDTO::getConversationId).toList(),
                warm.stream().map(ConversationDTO::getConversationId).toList());
        assertEquals(rebuilt.stream().map(ConversationDTO::getUnreadCount).toList(),
                warm.stream().map(ConversationDTO::getUnreadCount).toList());
        verify(userServiceFeignClient, times(1)).friendList(2L);
        verify(groupServiceFeignClient, times(1)).listUserGroups(2L);
        verify(hotConversationReadService, times(1)).loadConversationSkeletons(2L, 500);
    }

    @Test
    void getConversationsShouldKeepStableOrderAcrossAsyncStatusBackwriteRebuilds() {
        when(valueOperations.get("conversations:user:2")).thenReturn(null).thenReturn(null);
        when(userServiceFeignClient.friendList(2L)).thenReturn(List.of(user("3", "charlie")));
        when(groupServiceFeignClient.listUserGroups(2L)).thenReturn(List.of(group(8L, "team")));
        HotConversationSkeleton newerConversation = new HotConversationSkeleton(
                "g_8",
                2,
                null,
                8L,
                MessageDTO.builder()
                        .id(4002L)
                        .senderId(1L)
                        .groupId(8L)
                        .messageType(MessageType.TEXT)
                        .content("group hello")
                        .senderName("alice")
                        .createdTime(LocalDateTime.of(2026, 4, 15, 21, 11))
                        .updatedTime(LocalDateTime.of(2026, 4, 15, 21, 11))
                        .isGroup(true)
                        .build(),
                2L,
                LocalDateTime.of(2026, 4, 15, 21, 11)
        );
        HotConversationSkeleton olderConversationBefore = new HotConversationSkeleton(
                "p_0_2",
                1,
                0L,
                null,
                MessageDTO.builder()
                        .id(4001L)
                        .senderId(0L)
                        .receiverId(2L)
                        .messageType(MessageType.SYSTEM)
                        .content("system notice")
                        .senderName("SYSTEM")
                        .createdTime(LocalDateTime.of(2026, 4, 15, 21, 10))
                        .updatedTime(LocalDateTime.of(2026, 4, 15, 21, 10))
                        .build(),
                1L,
                LocalDateTime.of(2026, 4, 15, 21, 10)
        );
        HotConversationSkeleton olderConversationAfter = new HotConversationSkeleton(
                "p_0_2",
                1,
                0L,
                null,
                MessageDTO.builder()
                        .id(4001L)
                        .senderId(0L)
                        .receiverId(2L)
                        .messageType(MessageType.SYSTEM)
                        .content("system notice")
                        .senderName("SYSTEM")
                        .createdTime(LocalDateTime.of(2026, 4, 15, 21, 10))
                        .updatedTime(LocalDateTime.of(2026, 4, 15, 22, 30))
                        .status("READ")
                        .build(),
                1L,
                LocalDateTime.of(2026, 4, 15, 21, 10)
        );
        when(hotConversationReadService.loadConversationSkeletons(2L, 500)).thenReturn(
                List.of(olderConversationBefore, newerConversation),
                List.of(newerConversation, olderConversationAfter)
        );
        when(messageMapper.selectLastPrivateMessagesBatch(2L, List.of(3L))).thenReturn(List.of());
        when(messageMapper.countUnreadPrivateMessagesBatch(2L, List.of(3L))).thenReturn(List.of());
        when(messageMapper.selectLastGroupMessagesBatch(List.of(8L))).thenReturn(List.of());
        when(messageMapper.countUnreadGroupMessagesByUserCursors(List.of(8L), 2L)).thenReturn(List.of());

        List<String> firstOrder = new ArrayList<>(messageService.getConversations(2L).stream()
                .map(ConversationDTO::getConversationId)
                .toList());
        List<String> secondOrder = new ArrayList<>(messageService.getConversations(2L).stream()
                .map(ConversationDTO::getConversationId)
                .toList());

        assertEquals(firstOrder, secondOrder);
    }

    @Test
    void getPrivateMessagesShouldExposeAcceptedHotMessagesOnFirstPage() {
        when(userServiceFeignClient.exists(1L)).thenReturn(true);
        when(userServiceFeignClient.exists(2L)).thenReturn(true);
        when(userProfileCache.isFriend(1L, 2L)).thenReturn(true);
        List<MessageDTO> latestMessages = List.of(
                messageDto(7002L, 1L, 2L, null, "hot first", MessageType.TEXT, LocalDateTime.of(2026, 4, 15, 21, 20), false),
                messageDto(7001L, 2L, 1L, null, "older db", MessageType.TEXT, LocalDateTime.of(2026, 4, 15, 21, 19), false)
        );
        when(hotRecentMessageReadService.loadLatestMessages("p_1_2", 2)).thenReturn(latestMessages);

        List<MessageDTO> messages = messageService.getPrivateMessages(1L, 2L, 0, 2);

        assertEquals(List.of(7002L, 7001L), messages.stream().map(MessageDTO::getId).toList());
        verify(hotRecentMessageReadService).loadLatestMessages("p_1_2", 2);
    }

    @Test
    void getGroupMessagesShouldExposeAcceptedHotMessagesOnFirstPage() {
        when(userServiceFeignClient.exists(1L)).thenReturn(true);
        when(groupServiceFeignClient.exists(8L)).thenReturn(true);
        when(userProfileCache.isGroupMember(8L, 1L)).thenReturn(true);
        List<MessageDTO> latestMessages = List.of(
                messageDto(8002L, 1L, null, 8L, "hot group", MessageType.TEXT, LocalDateTime.of(2026, 4, 15, 21, 30), true),
                messageDto(8001L, 3L, null, 8L, "older group", MessageType.TEXT, LocalDateTime.of(2026, 4, 15, 21, 29), true)
        );
        when(hotRecentMessageReadService.loadLatestMessages("g_8", 2)).thenReturn(latestMessages);

        List<MessageDTO> messages = messageService.getGroupMessages(1L, 8L, 0, 2);

        assertEquals(List.of(8002L, 8001L), messages.stream().map(MessageDTO::getId).toList());
        verify(hotRecentMessageReadService).loadLatestMessages("g_8", 2);
    }

    @Test
    void getPrivateMessagesCursorShouldDelegateToHotRecentReadService() {
        when(userServiceFeignClient.exists(1L)).thenReturn(true);
        when(userServiceFeignClient.exists(2L)).thenReturn(true);
        when(userProfileCache.isFriend(1L, 2L)).thenReturn(true);
        List<MessageDTO> cursorMessages = List.of(
                messageDto(9002L, 1L, 2L, null, "hot version", MessageType.TEXT, LocalDateTime.of(2026, 4, 15, 21, 40), false),
                messageDto(9003L, 2L, 1L, null, "next", MessageType.TEXT, LocalDateTime.of(2026, 4, 15, 21, 41), false)
        );
        when(hotRecentMessageReadService.loadCursorMessages("p_1_2", null, null, 9001L, 20)).thenReturn(cursorMessages);

        List<MessageDTO> messages = messageService.getPrivateMessagesCursor(1L, 2L, null, null, 9001L, 20);

        assertEquals(List.of(9002L, 9003L), messages.stream().map(MessageDTO::getId).toList());
        verify(hotRecentMessageReadService).loadCursorMessages("p_1_2", null, null, 9001L, 20);
        verify(messageMapper, never()).selectList(any());
    }

    @Test
    void getGroupMessagesCursorShouldDelegateToHotRecentReadService() {
        when(userServiceFeignClient.exists(1L)).thenReturn(true);
        when(groupServiceFeignClient.exists(8L)).thenReturn(true);
        when(userProfileCache.isGroupMember(8L, 1L)).thenReturn(true);
        List<MessageDTO> cursorMessages = List.of(
                messageDto(9102L, 1L, null, 8L, "hot group version", MessageType.TEXT, LocalDateTime.of(2026, 4, 15, 21, 42), true),
                messageDto(9101L, 3L, null, 8L, "older group", MessageType.TEXT, LocalDateTime.of(2026, 4, 15, 21, 41), true)
        );
        when(hotRecentMessageReadService.loadCursorMessages("g_8", 9200L, null, null, 20)).thenReturn(cursorMessages);

        List<MessageDTO> messages = messageService.getGroupMessagesCursor(1L, 8L, 9200L, null, null, 20);

        assertEquals(List.of(9102L, 9101L), messages.stream().map(MessageDTO::getId).toList());
        verify(hotRecentMessageReadService).loadCursorMessages("g_8", 9200L, null, null, 20);
    }

    private Message privateMessage(Long id,
                                   Long senderId,
                                   Long receiverId,
                                   String clientMessageId,
                                   String content,
                                   LocalDateTime createdTime) {
        Message message = new Message();
        message.setId(id);
        message.setSenderId(senderId);
        message.setReceiverId(receiverId);
        message.setClientMessageId(clientMessageId);
        message.setMessageType(MessageType.TEXT);
        message.setContent(content);
        message.setStatus(Message.MessageStatus.SENT);
        message.setIsGroupChat(false);
        message.setCreatedTime(createdTime);
        message.setUpdatedTime(createdTime);
        return message;
    }

    private MessageDTO messageDto(Long id,
                                  Long senderId,
                                  Long receiverId,
                                  Long groupId,
                                  String content,
                                  MessageType messageType,
                                  LocalDateTime createdTime,
                                  boolean group) {
        MessageDTO dto = MessageDTO.builder()
                .id(id)
                .senderId(senderId)
                .receiverId(receiverId)
                .groupId(groupId)
                .messageType(messageType)
                .content(content)
                .createdTime(createdTime)
                .senderName(senderId == null ? null : "sender-" + senderId)
                .receiverName(receiverId == null ? null : "receiver-" + receiverId)
                .build();
        dto.setGroup(group);
        return dto;
    }

    private UserDTO user(String id, String username) {
        return UserDTO.builder()
                .id(id)
                .username(username)
                .nickname(username)
                .avatar(username + ".png")
                .build();
    }

    private GroupInfoDTO group(Long id, String name) {
        return GroupInfoDTO.builder()
                .id(id)
                .name(name)
                .avatar(name + ".png")
                .build();
    }
}
