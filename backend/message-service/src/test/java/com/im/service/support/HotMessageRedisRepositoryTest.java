package com.im.service.support;

import com.im.dto.MessageDTO;
import com.im.enums.MessageType;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.data.redis.core.HashOperations;
import org.springframework.data.redis.core.RedisTemplate;
import org.springframework.data.redis.core.ValueOperations;
import org.springframework.data.redis.core.ZSetOperations;
import org.springframework.data.redis.core.script.RedisScript;
import org.springframework.data.redis.serializer.RedisSerializer;
import org.springframework.test.util.ReflectionTestUtils;

import java.time.Duration;
import java.time.LocalDateTime;
import java.util.LinkedHashSet;
import java.util.List;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class HotMessageRedisRepositoryTest {

    @Mock
    private RedisTemplate<String, Object> redisTemplate;

    @Mock
    private ValueOperations<String, Object> valueOperations;

    @Mock
    private ZSetOperations<String, Object> zSetOperations;

    @Mock
    private HashOperations<String, Object, Object> hashOperations;

    private HotMessageRedisRepository repository;

    @BeforeEach
    void setUp() {
        repository = new HotMessageRedisRepository(redisTemplate);
        ReflectionTestUtils.setField(repository, "hotMessageKeyPrefix", "message:hot:");
        ReflectionTestUtils.setField(repository, "hotMessageTtlSeconds", 3600L);
        ReflectionTestUtils.setField(repository, "clientMessageKeyPrefix", "message:client:");
        ReflectionTestUtils.setField(repository, "conversationRecentKeyPrefix", "conversation:recent:");
        ReflectionTestUtils.setField(repository, "conversationRecentMaxSize", 500L);
        ReflectionTestUtils.setField(repository, "pendingPersistKeyPrefix", "conversation:pending:persist:");
        ReflectionTestUtils.setField(repository, "pendingPersistTtlSeconds", 86400L);
        ReflectionTestUtils.setField(repository, "persistedWatermarkKeyPrefix", "conversation:persisted:watermark:");
        ReflectionTestUtils.setField(repository, "persistedWatermarkTtlSeconds", 86400L);
        ReflectionTestUtils.setField(repository, "pendingStatusKeyPrefix", "message:pending:status:");
        ReflectionTestUtils.setField(repository, "pendingStatusTtlSeconds", 3600L);
        ReflectionTestUtils.setField(repository, "lastMessageKeyPrefix", "last_message:");
        ReflectionTestUtils.setField(repository, "userIndexKeyPrefix", "conversation:index:user:");
        ReflectionTestUtils.setField(repository, "userUnreadKeyPrefix", "conversation:unread:user:");
        lenient().when(redisTemplate.opsForValue()).thenReturn(valueOperations);
        lenient().when(redisTemplate.opsForZSet()).thenReturn(zSetOperations);
        lenient().when(redisTemplate.opsForHash()).thenReturn(hashOperations);
    }

    @Test
    void shouldStoreHotMessageClientMappingRecentWindowAndPendingPersistKeys() {
        MessageDTO message = MessageDTO.builder()
                .id(1001L)
                .clientMessageId("client-1")
                .senderId(1L)
                .receiverId(2L)
                .messageType(MessageType.TEXT)
                .content("hello")
                .createdTime(LocalDateTime.of(2026, 4, 15, 20, 10))
                .build();
        when(zSetOperations.zCard("conversation:recent:p_1_2")).thenReturn(1L);

        repository.saveHotMessage(message);
        repository.saveClientMessageMapping(1L, "client-1", 1001L);
        repository.addRecentMessage("p_1_2", 1001L, message.getCreatedTime());
        repository.addPendingPersistMessage("p_1_2", 1001L, LocalDateTime.of(2026, 4, 15, 20, 11));

        verify(valueOperations).set("message:hot:1001", message, Duration.ofSeconds(3600));
        verify(valueOperations).set("message:client:1:client-1", 1001L, Duration.ofSeconds(3600));
        verify(zSetOperations).add(eq("conversation:recent:p_1_2"), eq(1001L), anyDouble());
        verify(redisTemplate).expire("conversation:recent:p_1_2", Duration.ofSeconds(3600));
        verify(zSetOperations).add(eq("conversation:pending:persist:p_1_2"), eq(1001L), anyDouble());
        verify(redisTemplate).expire("conversation:pending:persist:p_1_2", Duration.ofSeconds(86400));
    }

    @Test
    void shouldReadHotConversationDataFromRedis() {
        MessageDTO first = MessageDTO.builder().id(3002L).content("newest").messageType(MessageType.TEXT).build();
        MessageDTO second = MessageDTO.builder().id(3001L).content("older").messageType(MessageType.TEXT).build();
        when(valueOperations.get("message:client:1:client-2")).thenReturn("3002");
        when(zSetOperations.reverseRange("conversation:recent:p_1_2", 0, 1))
                .thenReturn(new LinkedHashSet<>(List.of(3002L, 3001L)));
        when(valueOperations.multiGet(List.of("message:hot:3002", "message:hot:3001")))
                .thenReturn(List.of(first, second));
        when(zSetOperations.score("conversation:pending:persist:p_1_2", 3002L)).thenReturn(1D);
        when(hashOperations.get("last_message:p_1_2", "message")).thenReturn(first);
        when(hashOperations.get("conversation:unread:user:2", "p_1_2")).thenReturn("3");
        when(zSetOperations.reverseRange("conversation:index:user:2", 0, 1))
                .thenReturn(new LinkedHashSet<>(List.of("p_1_2", "g_8")));

        assertEquals(3002L, repository.getMessageIdByClientMessageId(1L, "client-2"));
        assertEquals(List.of(first, second), repository.getRecentMessages("p_1_2", 2));
        assertTrue(repository.hasPendingPersistMessage("p_1_2", 3002L));
        assertEquals(first, repository.getLastMessage("p_1_2"));
        assertEquals(3L, repository.getUnreadCount(2L, "p_1_2"));
        assertEquals(List.of("p_1_2", "g_8"), repository.getConversationIdsForUser(2L, 2));
    }

    @Test
    void savePersistedWatermarkShouldUseStringScriptArguments() {
        repository.savePersistedWatermark("p_1_2", 1001L);

        verify(redisTemplate).execute(
                any(RedisScript.class),
                any(RedisSerializer.class),
                any(RedisSerializer.class),
                eq(List.of("conversation:persisted:watermark:p_1_2")),
                eq("1001"),
                eq("86400")
        );
    }

    @Test
    void getPersistedWatermarkShouldIgnoreLegacyNonNumericValue() {
        when(valueOperations.get("conversation:persisted:watermark:p_1_2")).thenReturn("nil");

        assertNull(repository.getPersistedWatermark("p_1_2"));
    }
}
