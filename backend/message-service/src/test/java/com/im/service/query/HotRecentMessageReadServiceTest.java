package com.im.service.query;

import com.im.dto.MessageDTO;
import com.im.dto.UserDTO;
import com.im.enums.MessageType;
import com.im.mapper.MessageMapper;
import com.im.message.entity.Message;
import com.im.service.support.HotMessageRedisRepository;
import com.im.service.support.PersistenceWatermarkService;
import com.im.service.support.UserProfileCache;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.test.util.ReflectionTestUtils;

import java.time.LocalDateTime;
import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class HotRecentMessageReadServiceTest {

    @Mock
    private HotMessageRedisRepository hotMessageRedisRepository;

    @Mock
    private MessageMapper messageMapper;

    @Mock
    private PersistenceWatermarkService persistenceWatermarkService;

    @Mock
    private UserProfileCache userProfileCache;

    private HotRecentMessageReadService hotRecentMessageReadService;

    @BeforeEach
    void setUp() {
        hotRecentMessageReadService = new HotRecentMessageReadService(
                hotMessageRedisRepository,
                messageMapper,
                persistenceWatermarkService,
                userProfileCache
        );
        ReflectionTestUtils.setField(hotRecentMessageReadService, "defaultSystemSenderId", 0L);
        lenient().when(userProfileCache.getUser(1L)).thenReturn(user(1L, "alice"));
        lenient().when(userProfileCache.getUser(2L)).thenReturn(user(2L, "bob"));
        lenient().when(userProfileCache.getUser(3L)).thenReturn(user(3L, "charlie"));
    }

    @Test
    void loadLatestMessagesShouldNotQueryDbWhenHotWindowAlreadySatisfiesLimit() {
        when(hotMessageRedisRepository.getRecentMessages("p_1_2", 500)).thenReturn(List.of(
                hotMessage(3L, 1L, 2L, null, "hot-3", null, LocalDateTime.of(2026, 4, 16, 1, 0), false),
                hotMessage(2L, 1L, 2L, null, "hot-2", null, LocalDateTime.of(2026, 4, 16, 0, 59), false)
        ));

        List<MessageDTO> messages = hotRecentMessageReadService.loadLatestMessages("p_1_2", 2);

        assertEquals(List.of(3L, 2L), messages.stream().map(MessageDTO::getId).toList());
        verify(persistenceWatermarkService, never()).getPersistedWatermark(any());
        verify(messageMapper, never()).selectList(any());
    }

    @Test
    void loadLatestMessagesShouldNotQueryDbWhenWatermarkIsMissing() {
        when(hotMessageRedisRepository.getRecentMessages("p_1_2", 500)).thenReturn(List.of(
                hotMessage(3L, 1L, 2L, null, "hot-3", null, LocalDateTime.of(2026, 4, 16, 1, 0), false)
        ));
        when(persistenceWatermarkService.getPersistedWatermark("p_1_2")).thenReturn(null);

        List<MessageDTO> messages = hotRecentMessageReadService.loadLatestMessages("p_1_2", 3);

        assertEquals(List.of(3L), messages.stream().map(MessageDTO::getId).toList());
        verify(messageMapper, never()).selectList(any());
    }

    @Test
    void loadLatestMessagesShouldRestrictDbFallbackByWatermark() {
        when(hotMessageRedisRepository.getRecentMessages("p_1_2", 500)).thenReturn(List.of(
                hotMessage(3L, 1L, 2L, null, "hot-3", null, LocalDateTime.of(2026, 4, 16, 1, 0), false)
        ));
        when(persistenceWatermarkService.getPersistedWatermark("p_1_2")).thenReturn(2L);
        when(messageMapper.selectList(any())).thenReturn(List.of(
                persistedMessage(2L, 1L, 2L, null, "db-2", LocalDateTime.of(2026, 4, 16, 0, 59), false),
                persistedMessage(1L, 2L, 1L, null, "db-1", LocalDateTime.of(2026, 4, 16, 0, 58), false)
        ));

        List<MessageDTO> messages = hotRecentMessageReadService.loadLatestMessages("p_1_2", 3);

        assertEquals(List.of(3L, 2L, 1L), messages.stream().map(MessageDTO::getId).toList());
        verify(persistenceWatermarkService).getPersistedWatermark("p_1_2");
        verify(messageMapper).selectList(any());
    }

    @Test
    void loadCursorMessagesShouldReturnHotOnlyWhenAfterMessageIdAlreadyReachesWatermark() {
        when(hotMessageRedisRepository.getRecentMessages("p_1_2", 500)).thenReturn(List.of(
                hotMessage(7L, 1L, 2L, null, "hot-7", null, LocalDateTime.of(2026, 4, 16, 1, 5), false),
                hotMessage(8L, 2L, 1L, null, "hot-8", null, LocalDateTime.of(2026, 4, 16, 1, 6), false)
        ));
        when(persistenceWatermarkService.getPersistedWatermark("p_1_2")).thenReturn(6L);

        List<MessageDTO> messages = hotRecentMessageReadService.loadCursorMessages("p_1_2", null, null, 6L, 10);

        assertEquals(List.of(7L, 8L), messages.stream().map(MessageDTO::getId).toList());
        verify(messageMapper, never()).selectList(any());
    }

    @Test
    void loadCursorMessagesShouldRestrictDbFallbackByWatermark() {
        when(hotMessageRedisRepository.getRecentMessages("p_1_2", 500)).thenReturn(List.of(
                hotMessage(5L, 1L, 2L, null, "hot-5", null, LocalDateTime.of(2026, 4, 16, 1, 7), false)
        ));
        when(persistenceWatermarkService.getPersistedWatermark("p_1_2")).thenReturn(6L);
        when(messageMapper.selectList(any())).thenReturn(List.of(
                persistedMessage(6L, 2L, 1L, null, "db-6", LocalDateTime.of(2026, 4, 16, 1, 8), false)
        ));

        List<MessageDTO> messages = hotRecentMessageReadService.loadCursorMessages("p_1_2", null, null, 4L, 10);

        assertEquals(List.of(5L, 6L), messages.stream().map(MessageDTO::getId).toList());
        verify(persistenceWatermarkService).getPersistedWatermark("p_1_2");
        verify(messageMapper).selectList(any());
    }

    @Test
    void resolveLatestVisibleMessageIdShouldReturnNullWhenHotAndWatermarkAreBothMissing() {
        when(hotMessageRedisRepository.getRecentMessages("p_1_2", 500)).thenReturn(List.of());
        when(persistenceWatermarkService.getPersistedWatermark("p_1_2")).thenReturn(null);

        Long messageId = hotRecentMessageReadService.resolveLatestVisibleMessageId("p_1_2");

        assertNull(messageId);
        verify(messageMapper, never()).selectOne(any());
    }

    @Test
    void resolveLatestVisibleMessageIdShouldRestrictDbFallbackByWatermark() {
        when(hotMessageRedisRepository.getRecentMessages("p_1_2", 500)).thenReturn(List.of());
        when(persistenceWatermarkService.getPersistedWatermark("p_1_2")).thenReturn(7L);
        when(messageMapper.selectOne(any())).thenReturn(persistedMessage(7L, 2L, 1L, null, "db-latest",
                LocalDateTime.of(2026, 4, 16, 1, 9), false));

        Long messageId = hotRecentMessageReadService.resolveLatestVisibleMessageId("p_1_2");

        assertEquals(7L, messageId);
        verify(persistenceWatermarkService).getPersistedWatermark("p_1_2");
        verify(messageMapper).selectOne(any());
    }

    @Test
    void resolveLatestVisibleMessageIdShouldPreferHotAndSkipDeletedMessages() {
        when(hotMessageRedisRepository.getRecentMessages("p_1_2", 500)).thenReturn(List.of(
                hotMessage(9L, 1L, 2L, null, "deleted", "DELETED", LocalDateTime.of(2026, 4, 16, 1, 10), false),
                hotMessage(8L, 1L, 2L, null, "visible", null, LocalDateTime.of(2026, 4, 16, 1, 9), false)
        ));

        Long messageId = hotRecentMessageReadService.resolveLatestVisibleMessageId("p_1_2");

        assertEquals(8L, messageId);
        verify(persistenceWatermarkService, never()).getPersistedWatermark(any());
        verify(messageMapper, never()).selectOne(any());
    }

    private MessageDTO hotMessage(Long id,
                                  Long senderId,
                                  Long receiverId,
                                  Long groupId,
                                  String content,
                                  String status,
                                  LocalDateTime createdTime,
                                  boolean group) {
        MessageDTO message = MessageDTO.builder()
                .id(id)
                .senderId(senderId)
                .receiverId(receiverId)
                .groupId(groupId)
                .content(content)
                .status(status)
                .messageType(MessageType.TEXT)
                .createdTime(createdTime)
                .senderName("hot-" + senderId)
                .receiverName(receiverId == null ? null : "hot-" + receiverId)
                .build();
        message.setGroup(group);
        return message;
    }

    private Message persistedMessage(Long id,
                                     Long senderId,
                                     Long receiverId,
                                     Long groupId,
                                     String content,
                                     LocalDateTime createdTime,
                                     boolean group) {
        Message message = new Message();
        message.setId(id);
        message.setSenderId(senderId);
        message.setReceiverId(receiverId);
        message.setGroupId(groupId);
        message.setContent(content);
        message.setMessageType(MessageType.TEXT);
        message.setStatus(Message.MessageStatus.SENT);
        message.setIsGroupChat(group);
        message.setCreatedTime(createdTime);
        message.setUpdatedTime(createdTime);
        return message;
    }

    private UserDTO user(Long id, String username) {
        return UserDTO.builder()
                .id(String.valueOf(id))
                .username(username)
                .nickname(username)
                .avatar(username + ".png")
                .build();
    }
}
