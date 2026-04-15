package com.im.service.impl;

import com.im.dto.ConversationDTO;
import com.im.dto.GroupInfoDTO;
import com.im.dto.MessageDTO;
import com.im.dto.ReadEvent;
import com.im.dto.StatusChangeEvent;
import com.im.dto.UserDTO;
import com.im.enums.MessageType;
import com.im.exception.BusinessException;
import com.im.feign.GroupServiceFeignClient;
import com.im.feign.UserServiceFeignClient;
import com.im.mapper.GroupReadCursorMapper;
import com.im.mapper.MessageMapper;
import com.im.mapper.PrivateReadCursorMapper;
import com.im.message.entity.Message;
import com.im.service.command.SendMessageCommand;
import com.im.service.support.AcceptedMessageProjectionService;
import com.im.service.support.HotMessageRedisRepository;
import com.im.service.support.UserProfileCache;
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
import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

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

    private MessageServiceImpl messageService;

    @BeforeEach
    void setUp() {
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
                hotMessageRedisRepository,
                acceptedMessageProjectionService
        );
        lenient().when(redisTemplate.opsForValue()).thenReturn(valueOperations);
        ReflectionTestUtils.setField(messageService, "defaultSystemSenderId", 0L);
    }

    @Test
    void sendMessageShouldReturnHotAcceptedMessageAndReprojectWithoutHandlerExecution() {
        MessageDTO hotMessage = MessageDTO.builder()
                .id(1001L)
                .clientMessageId("client-1")
                .senderId(1L)
                .receiverId(2L)
                .messageType(MessageType.TEXT)
                .content("hello")
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

        assertEquals(hotMessage, result);
        verify(acceptedMessageProjectionService).projectAccepted(any());
        verify(messageMapper, never()).selectBySenderIdAndClientMessageId(any(), any());
    }

    @Test
    void sendMessageShouldRecoverPersistedAcceptedMessageWhenRedisIdempotencyMisses() {
        Message persisted = new Message();
        persisted.setId(2002L);
        persisted.setSenderId(1L);
        persisted.setReceiverId(2L);
        persisted.setClientMessageId("client-db");
        persisted.setMessageType(MessageType.TEXT);
        persisted.setContent("persisted hello");
        persisted.setStatus(Message.MessageStatus.SENT);
        persisted.setIsGroupChat(false);
        persisted.setCreatedTime(LocalDateTime.of(2026, 4, 15, 21, 5));
        persisted.setUpdatedTime(persisted.getCreatedTime());
        when(hotMessageRedisRepository.getMessageIdByClientMessageId(1L, "client-db")).thenReturn(null);
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
        verify(acceptedMessageProjectionService).projectAccepted(any());
    }

    @Test
    void sendMessageShouldNotRetryKafkaWhenAcceptedMappingExistsButProjectionIsStillUnavailable() {
        when(hotMessageRedisRepository.getMessageIdByClientMessageId(1L, "client-stuck")).thenReturn(3003L);
        when(hotMessageRedisRepository.getHotMessage(3003L)).thenReturn(null);
        when(messageMapper.selectBySenderIdAndClientMessageId(1L, "client-stuck")).thenReturn(null);

        assertThrows(BusinessException.class, () -> messageService.sendMessage(SendMessageCommand.builder()
                .senderId(1L)
                .receiverId(2L)
                .messageType(MessageType.TEXT)
                .clientMessageId("client-stuck")
                .content("hello")
                .build()));
    }

    @Test
    void getConversationsShouldPreferHotProjectionAndKeepSystemConversationVisible() {
        when(valueOperations.get("conversations:user:2")).thenReturn(null);
        when(userServiceFeignClient.friendList(2L)).thenReturn(List.of(user("3", "charlie")));
        when(groupServiceFeignClient.listUserGroups(2L)).thenReturn(List.of(group(8L, "team")));
        when(hotMessageRedisRepository.getConversationIdsForUser(2L, 500)).thenReturn(List.of("p_0_2", "g_8"));
        when(hotMessageRedisRepository.getLastMessage("p_0_2")).thenReturn(MessageDTO.builder()
                .id(4001L)
                .senderId(0L)
                .receiverId(2L)
                .messageType(MessageType.SYSTEM)
                .content("system notice")
                .senderName("SYSTEM")
                .createdTime(LocalDateTime.of(2026, 4, 15, 21, 10))
                .build());
        when(hotMessageRedisRepository.getLastMessage("g_8")).thenReturn(MessageDTO.builder()
                .id(4002L)
                .senderId(1L)
                .groupId(8L)
                .messageType(MessageType.TEXT)
                .content("group hello")
                .senderName("alice")
                .createdTime(LocalDateTime.of(2026, 4, 15, 21, 11))
                .isGroup(true)
                .build());
        when(hotMessageRedisRepository.getUnreadCount(2L, "p_0_2")).thenReturn(1L);
        when(hotMessageRedisRepository.getUnreadCount(2L, "g_8")).thenReturn(2L);
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
    }

    @Test
    void getPrivateMessagesCursorShouldMergeHotMessageBeforeDbPersistence() {
        when(userServiceFeignClient.exists(1L)).thenReturn(true);
        when(userServiceFeignClient.exists(2L)).thenReturn(true);
        when(userProfileCache.isFriend(1L, 2L)).thenReturn(true);
        when(userProfileCache.getUser(1L)).thenReturn(user("1", "alice"));
        when(userProfileCache.getUser(2L)).thenReturn(user("2", "bob"));
        when(hotMessageRedisRepository.getRecentMessages("p_1_2", 500)).thenReturn(List.of(MessageDTO.builder()
                .id(5002L)
                .clientMessageId("client-hot")
                .senderId(1L)
                .receiverId(2L)
                .messageType(MessageType.TEXT)
                .content("hot only")
                .senderName("alice")
                .receiverName("bob")
                .createdTime(LocalDateTime.of(2026, 4, 15, 21, 20))
                .build()));
        Message persisted = new Message();
        persisted.setId(5001L);
        persisted.setSenderId(2L);
        persisted.setReceiverId(1L);
        persisted.setClientMessageId("client-db");
        persisted.setMessageType(MessageType.TEXT);
        persisted.setContent("persisted");
        persisted.setStatus(Message.MessageStatus.SENT);
        persisted.setIsGroupChat(false);
        persisted.setCreatedTime(LocalDateTime.of(2026, 4, 15, 21, 19));
        persisted.setUpdatedTime(persisted.getCreatedTime());
        when(messageMapper.selectList(any())).thenReturn(List.of(persisted));

        List<MessageDTO> messages = messageService.getPrivateMessagesCursor(1L, 2L, null, null, null, 20);

        assertEquals(List.of(5002L, 5001L),
                messages.stream().map(MessageDTO::getId).toList());
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
