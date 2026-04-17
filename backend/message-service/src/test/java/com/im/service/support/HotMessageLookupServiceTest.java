package com.im.service.support;

import com.im.dto.MessageDTO;
import com.im.dto.UserDTO;
import com.im.enums.CommonErrorCode;
import com.im.enums.MessageType;
import com.im.exception.BusinessException;
import com.im.mapper.MessageMapper;
import com.im.message.entity.Message;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.test.util.ReflectionTestUtils;

import java.time.LocalDateTime;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class HotMessageLookupServiceTest {

    @Mock
    private HotMessageRedisRepository hotMessageRedisRepository;

    @Mock
    private MessageMapper messageMapper;

    @Mock
    private UserProfileCache userProfileCache;

    private HotMessageLookupService service;

    @BeforeEach
    void setUp() {
        service = new HotMessageLookupService(hotMessageRedisRepository, messageMapper, userProfileCache);
        ReflectionTestUtils.setField(service, "defaultSystemSenderId", 0L);
    }

    @Test
    void getHotOrPersistedMessageShouldPreferHotProjection() {
        MessageDTO hotMessage = MessageDTO.builder()
                .id(1001L)
                .senderId(1L)
                .receiverId(2L)
                .messageType(MessageType.TEXT)
                .content("hot")
                .status("SENT")
                .createdTime(LocalDateTime.of(2026, 4, 16, 13, 0))
                .build();
        when(hotMessageRedisRepository.getHotMessage(1001L)).thenReturn(hotMessage);

        MessageDTO result = service.getHotOrPersistedMessage(1001L);

        assertSame(hotMessage, result);
        verify(messageMapper, never()).selectById(1001L);
    }

    @Test
    void getHotOrPersistedMessageShouldFallbackToPersistedMessage() {
        when(hotMessageRedisRepository.getHotMessage(1002L)).thenReturn(null);
        Message persisted = new Message();
        persisted.setId(1002L);
        persisted.setSenderId(1L);
        persisted.setReceiverId(2L);
        persisted.setMessageType(MessageType.TEXT);
        persisted.setContent("db");
        persisted.setStatus(Message.MessageStatus.SENT);
        persisted.setIsGroupChat(false);
        persisted.setCreatedTime(LocalDateTime.of(2026, 4, 16, 13, 5));
        persisted.setUpdatedTime(persisted.getCreatedTime());
        when(messageMapper.selectById(1002L)).thenReturn(persisted);
        when(userProfileCache.getUser(1L)).thenReturn(UserDTO.builder().id("1").username("alice").avatar("a.png").build());
        when(userProfileCache.getUser(2L)).thenReturn(UserDTO.builder().id("2").username("bob").avatar("b.png").build());

        MessageDTO result = service.getHotOrPersistedMessage(1002L);

        assertNotNull(result);
        assertEquals(1002L, result.getId());
        assertEquals("db", result.getContent());
    }

    @Test
    void requireOwnedMessageForStatusChangeShouldBuildMinimalMessageFromHotProjection() {
        MessageDTO hotMessage = MessageDTO.builder()
                .id(1003L)
                .senderId(1L)
                .receiverId(2L)
                .messageType(MessageType.TEXT)
                .content("hot only")
                .status("SENT")
                .clientMessageId("client-1003")
                .createdTime(LocalDateTime.of(2026, 4, 16, 13, 10))
                .updatedTime(LocalDateTime.of(2026, 4, 16, 13, 10))
                .build();
        when(hotMessageRedisRepository.getHotMessage(1003L)).thenReturn(hotMessage);

        Message result = service.requireOwnedMessageForStatusChange(1L, 1003L, false, false);

        assertEquals(1003L, result.getId());
        assertEquals(1L, result.getSenderId());
        assertEquals(2L, result.getReceiverId());
        assertEquals("hot only", result.getContent());
        assertEquals(Message.MessageStatus.SENT, result.getStatus());
        verify(messageMapper, never()).selectById(1003L);
    }

    @Test
    void requireOwnedMessageForStatusChangeShouldEnforceOwnershipAndStatusFlags() {
        MessageDTO recalledMessage = MessageDTO.builder()
                .id(1004L)
                .senderId(1L)
                .receiverId(2L)
                .messageType(MessageType.TEXT)
                .content("recalled")
                .status("RECALLED")
                .createdTime(LocalDateTime.of(2026, 4, 16, 13, 15))
                .build();
        when(hotMessageRedisRepository.getHotMessage(1004L)).thenReturn(recalledMessage);

        BusinessException accessDenied = assertThrows(BusinessException.class,
                () -> service.requireOwnedMessageForStatusChange(9L, 1004L, false, false));
        assertEquals(CommonErrorCode.CONVERSATION_ACCESS_DENIED.getMessage(), accessDenied.getMessage());
        assertThrows(BusinessException.class,
                () -> service.requireOwnedMessageForStatusChange(1L, 1004L, false, false));
        assertDoesNotThrow(() -> service.requireOwnedMessageForStatusChange(1L, 1004L, true, false));
    }
}
