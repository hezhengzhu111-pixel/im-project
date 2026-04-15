package com.im.service.query;

import com.im.dto.MessageDTO;
import com.im.enums.MessageType;
import com.im.service.query.HotConversationReadService.HotConversationSkeleton;
import com.im.service.support.HotMessageRedisRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class HotConversationReadServiceTest {

    @Mock
    private HotMessageRedisRepository hotMessageRedisRepository;

    private HotConversationReadService hotConversationReadService;

    @BeforeEach
    void setUp() {
        hotConversationReadService = new HotConversationReadService(hotMessageRedisRepository);
    }

    @Test
    void accessorMethodsShouldDelegateToRepository() {
        MessageDTO lastMessage = message(10L, 1L, 2L, null, "hello", MessageType.TEXT, LocalDateTime.of(2026, 4, 15, 22, 0), false);
        when(hotMessageRedisRepository.getConversationIdsForUser(2L, 20)).thenReturn(List.of("p_1_2"));
        when(hotMessageRedisRepository.getLastMessage("p_1_2")).thenReturn(lastMessage);
        when(hotMessageRedisRepository.getUnreadCount(2L, "p_1_2")).thenReturn(3L);

        assertEquals(List.of("p_1_2"), hotConversationReadService.listConversationIds(2L, 20));
        assertSame(lastMessage, hotConversationReadService.getLastMessage("p_1_2"));
        assertEquals(3L, hotConversationReadService.getUnreadCount(2L, "p_1_2"));
    }

    @Test
    void loadConversationSkeletonsShouldUseIndexLastMessageAndUnreadOnly() {
        MessageDTO systemMessage = message(11L, 0L, 2L, null, "system", MessageType.SYSTEM,
                LocalDateTime.of(2026, 4, 15, 22, 1), false);
        MessageDTO groupMessage = message(12L, 3L, null, 8L, "group", MessageType.TEXT,
                LocalDateTime.of(2026, 4, 15, 22, 2), true);
        when(hotMessageRedisRepository.getConversationIdsForUser(2L, 500)).thenReturn(List.of("p_0_2", "g_8", "p_2_3"));
        when(hotMessageRedisRepository.getLastMessage("p_0_2")).thenReturn(systemMessage);
        when(hotMessageRedisRepository.getLastMessage("g_8")).thenReturn(groupMessage);
        when(hotMessageRedisRepository.getLastMessage("p_2_3")).thenReturn(null);
        when(hotMessageRedisRepository.getUnreadCount(2L, "p_0_2")).thenReturn(1L);
        when(hotMessageRedisRepository.getUnreadCount(2L, "g_8")).thenReturn(2L);

        List<HotConversationSkeleton> skeletons = hotConversationReadService.loadConversationSkeletons(2L, 500);

        assertEquals(2, skeletons.size());
        Map<String, HotConversationSkeleton> byConversationId = skeletons.stream()
                .collect(java.util.stream.Collectors.toMap(HotConversationSkeleton::conversationId, item -> item));
        HotConversationSkeleton systemConversation = byConversationId.get("p_0_2");
        assertEquals(1, systemConversation.conversationType());
        assertEquals(0L, systemConversation.peerUserId());
        assertEquals(1L, systemConversation.unreadCount());
        assertEquals(LocalDateTime.of(2026, 4, 15, 22, 1), systemConversation.lastMessageTime());

        HotConversationSkeleton groupConversation = byConversationId.get("g_8");
        assertEquals(2, groupConversation.conversationType());
        assertEquals(8L, groupConversation.groupId());
        assertEquals(2L, groupConversation.unreadCount());

        verify(hotMessageRedisRepository, never()).getUnreadCount(2L, "p_2_3");
        assertTrue(byConversationId.containsKey("p_0_2"));
        assertTrue(byConversationId.containsKey("g_8"));
    }

    private MessageDTO message(Long id,
                               Long senderId,
                               Long receiverId,
                               Long groupId,
                               String content,
                               MessageType messageType,
                               LocalDateTime createdTime,
                               boolean group) {
        MessageDTO message = MessageDTO.builder()
                .id(id)
                .senderId(senderId)
                .receiverId(receiverId)
                .groupId(groupId)
                .content(content)
                .messageType(messageType)
                .createdTime(createdTime)
                .build();
        message.setGroup(group);
        return message;
    }
}
