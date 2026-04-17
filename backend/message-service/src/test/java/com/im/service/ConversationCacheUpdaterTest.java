package com.im.service;

import com.im.dto.MessageDTO;
import com.im.dto.MessageEvent;
import com.im.dto.ReadEvent;
import com.im.dto.StatusChangeEvent;
import com.im.enums.MessageEventType;
import com.im.enums.MessageType;
import com.im.service.support.HotMessageRedisRepository;
import com.im.service.support.UserProfileCache;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.data.redis.connection.RedisConnection;
import org.springframework.data.redis.core.HashOperations;
import org.springframework.data.redis.core.RedisCallback;
import org.springframework.data.redis.core.RedisTemplate;
import org.springframework.data.redis.core.ZSetOperations;
import org.springframework.data.redis.core.script.RedisScript;
import org.springframework.data.redis.serializer.RedisSerializer;
import org.springframework.data.redis.serializer.StringRedisSerializer;
import org.springframework.test.util.ReflectionTestUtils;

import java.time.Duration;
import java.time.LocalDateTime;
import java.util.List;
import java.util.concurrent.atomic.AtomicReference;

import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class ConversationCacheUpdaterTest {

    @Mock
    private RedisTemplate<String, Object> redisTemplate;

    @Mock
    private UserProfileCache userProfileCache;

    @Mock
    private HotMessageRedisRepository hotMessageRedisRepository;

    @Mock
    private HashOperations<String, Object, Object> hashOperations;

    @Mock
    private ZSetOperations<String, Object> zSetOperations;

    private final RedisConnection redisConnection = org.mockito.Mockito.mock(RedisConnection.class, RETURNS_DEEP_STUBS);

    private ConversationCacheUpdater updater;

    @BeforeEach
    @SuppressWarnings("unchecked")
    void setUp() {
        updater = new ConversationCacheUpdater(redisTemplate, userProfileCache, hotMessageRedisRepository);
        ReflectionTestUtils.setField(updater, "lastMessageKeyPrefix", "last_message:");
        ReflectionTestUtils.setField(updater, "userIndexKeyPrefix", "conversation:index:user:");
        ReflectionTestUtils.setField(updater, "userUnreadKeyPrefix", "conversation:unread:user:");
        ReflectionTestUtils.setField(updater, "userReadCursorKeyPrefix", "conversation:read-cursor:user:");
        ReflectionTestUtils.setField(updater, "legacyConversationListKeyPrefix", "conversations:user:");
        ReflectionTestUtils.setField(updater, "unreadAppliedKeyPrefix", "conversation:unread:applied:");
        ReflectionTestUtils.setField(updater, "cacheTtlSeconds", 3600L);
        ReflectionTestUtils.setField(updater, "unreadAppliedTtlSeconds", 86400L);
        when(redisTemplate.opsForHash()).thenReturn(hashOperations);
        lenient().when(redisTemplate.opsForZSet()).thenReturn(zSetOperations);
        RedisSerializer<Object> serializer =
                (RedisSerializer<Object>) (RedisSerializer<?>) new StringRedisSerializer();
        lenient().doReturn(serializer).when(redisTemplate).getKeySerializer();
        lenient().doReturn(serializer).when(redisTemplate).getHashKeySerializer();
        lenient().doAnswer(invocation -> {
            RedisCallback<?> callback = invocation.getArgument(0);
            return callback.doInRedis(redisConnection);
        }).when(redisTemplate).execute(any(RedisCallback.class));
        lenient().doReturn(1L)
                .when(redisTemplate)
                .execute(any(RedisScript.class), any(RedisSerializer.class), any(RedisSerializer.class), anyList(), any(), any(), any(), any());
    }

    @Test
    void applyFirstSeenAcceptedMessageShouldUpdatePrivateConversationHotProjection() {
        MessageDTO payload = MessageDTO.builder()
                .id(1001L)
                .senderId(1L)
                .receiverId(2L)
                .clientMessageId("client-1")
                .messageType(MessageType.TEXT)
                .content("hello")
                .build();
        MessageEvent event = MessageEvent.builder()
                .eventType(MessageEventType.MESSAGE)
                .messageId(1001L)
                .conversationId("p_1_2")
                .senderId(1L)
                .receiverId(2L)
                .clientMessageId("client-1")
                .messageType(MessageType.TEXT)
                .content("hello")
                .createdTime(LocalDateTime.of(2026, 4, 15, 18, 30))
                .payload(payload)
                .build();

        updater.applyFirstSeenAcceptedMessage(event);

        verify(hotMessageRedisRepository).addRecentMessage("p_1_2", 1001L, LocalDateTime.of(2026, 4, 15, 18, 30));
        verify(hashOperations).put("last_message:p_1_2", "message", payload);
        verify(redisTemplate).expire("last_message:p_1_2", Duration.ofSeconds(3600));
        verify(zSetOperations).add(eq("conversation:index:user:1"), eq("p_1_2"), anyDouble());
        verify(zSetOperations).add(eq("conversation:index:user:2"), eq("p_1_2"), anyDouble());
        verify(redisConnection.hashCommands()).hSetNX(any(), any(), any());
        verify(redisTemplate).execute(any(RedisScript.class), any(RedisSerializer.class), any(RedisSerializer.class), anyList(), any(), any(), any(), any());
        verify(redisTemplate).delete("conversations:user:1");
        verify(redisTemplate).delete("conversations:user:2");
    }

    @Test
    void applyFirstSeenAcceptedMessageShouldUseStableUnreadMarkerAcrossDuplicateReprojection() {
        MessageEvent event = MessageEvent.builder()
                .eventType(MessageEventType.MESSAGE)
                .messageId(1002L)
                .conversationId("p_1_2")
                .senderId(1L)
                .receiverId(2L)
                .clientMessageId("client-dup")
                .messageType(MessageType.TEXT)
                .content("hello")
                .createdTime(LocalDateTime.of(2026, 4, 15, 18, 32))
                .build();

        updater.applyFirstSeenAcceptedMessage(event);
        updater.applyFirstSeenAcceptedMessage(event);

        verify(redisTemplate, org.mockito.Mockito.times(2))
                .execute(any(RedisScript.class),
                        any(RedisSerializer.class),
                        any(RedisSerializer.class),
                        argThat(keys -> keys != null
                                && keys.size() == 2
                                && "conversation:unread:applied:2:p_1_2:1002".equals(keys.getFirst())
                                && "conversation:unread:user:2".equals(keys.get(1))),
                        eq("p_1_2"),
                        eq("3600"),
                        eq("86400"),
                        eq("1"));
    }

    @Test
    void applyFirstSeenAcceptedMessageShouldFanOutGroupProjectionToAllMembers() {
        MessageEvent event = MessageEvent.builder()
                .eventType(MessageEventType.MESSAGE)
                .messageId(2001L)
                .conversationId("g_8")
                .senderId(1L)
                .groupId(8L)
                .group(true)
                .clientMessageId("client-2")
                .messageType(MessageType.TEXT)
                .content("group hello")
                .createdTime(LocalDateTime.of(2026, 4, 15, 18, 31))
                .build();
        when(userProfileCache.getGroupMemberIds(8L)).thenReturn(List.of(1L, 2L, 3L));

        updater.applyFirstSeenAcceptedMessage(event);

        verify(hotMessageRedisRepository).addRecentMessage("g_8", 2001L, LocalDateTime.of(2026, 4, 15, 18, 31));
        verify(zSetOperations).add(eq("conversation:index:user:1"), eq("g_8"), anyDouble());
        verify(zSetOperations).add(eq("conversation:index:user:2"), eq("g_8"), anyDouble());
        verify(zSetOperations).add(eq("conversation:index:user:3"), eq("g_8"), anyDouble());
        verify(redisConnection.hashCommands()).hSetNX(any(), any(), any());
        verify(redisTemplate, org.mockito.Mockito.times(2))
                .execute(any(RedisScript.class), any(RedisSerializer.class), any(RedisSerializer.class), anyList(), any(), any(), any(), any());
        verify(redisTemplate).delete("conversations:user:1");
        verify(redisTemplate).delete("conversations:user:2");
        verify(redisTemplate).delete("conversations:user:3");
    }

    @Test
    void rehydrateAcceptedMessageShouldRestorePrivateConversationWithoutUnreadOrRecentSideEffects() {
        MessageDTO message = MessageDTO.builder()
                .id(2101L)
                .senderId(1L)
                .receiverId(2L)
                .clientMessageId("client-r")
                .messageType(MessageType.TEXT)
                .content("rehydrate")
                .createdTime(LocalDateTime.of(2026, 4, 15, 18, 40))
                .build();

        updater.rehydrateAcceptedMessage(message);

        verify(hotMessageRedisRepository, never()).addRecentMessage(any(), any(), any());
        verify(hashOperations).put("last_message:p_1_2", "message", message);
        verify(redisTemplate).expire("last_message:p_1_2", Duration.ofSeconds(3600));
        verify(zSetOperations).add(eq("conversation:index:user:1"), eq("p_1_2"), anyDouble());
        verify(zSetOperations).add(eq("conversation:index:user:2"), eq("p_1_2"), anyDouble());
        verify(redisTemplate).delete("conversations:user:1");
        verify(redisTemplate).delete("conversations:user:2");
        verify(redisConnection.hashCommands(), never()).hSetNX(any(), any(), any());
        verify(redisTemplate, never()).execute(any(RedisScript.class), any(RedisSerializer.class), any(RedisSerializer.class), anyList(), any(), any(), any(), any());
    }

    @Test
    void applyStatusChangeShouldRefreshHotMessageAndLastMessage() {
        MessageDTO cachedPayload = MessageDTO.builder()
                .id(3001L)
                .groupId(8L)
                .messageType(MessageType.TEXT)
                .content("before recall")
                .status("SENT")
                .isGroup(true)
                .build();
        MessageDTO recalledPayload = MessageDTO.builder()
                .id(3001L)
                .groupId(8L)
                .messageType(MessageType.TEXT)
                .content("before recall")
                .status("RECALLED")
                .isGroup(true)
                .build();
        when(hashOperations.get("last_message:g_8", "message")).thenReturn(cachedPayload);
        when(userProfileCache.getGroupMemberIds(8L)).thenReturn(List.of(1L, 2L, 3L));

        updater.applyStatusChange(StatusChangeEvent.builder()
                .messageId(3001L)
                .conversationId("g_8")
                .groupId(8L)
                .group(true)
                .newStatus(4)
                .payload(recalledPayload)
                .build());

        verify(hotMessageRedisRepository).saveHotMessage(recalledPayload);
        verify(hashOperations).put("last_message:g_8", "message", recalledPayload);
        verify(redisTemplate).delete("conversations:user:1");
        verify(redisTemplate).delete("conversations:user:2");
        verify(redisTemplate).delete("conversations:user:3");
        verifyNoInteractions(zSetOperations);
        verify(hotMessageRedisRepository, never()).addRecentMessage(any(), any(), any());
    }

    @Test
    void markConversationReadShouldBeIdempotentAcrossDuplicateEvents() {
        AtomicReference<Object> cachedCursorRef = new AtomicReference<>();
        when(hashOperations.get("conversation:read-cursor:user:2", "p_1_2"))
                .thenAnswer(invocation -> cachedCursorRef.get());
        doAnswer(invocation -> {
            if ("conversation:read-cursor:user:2".equals(invocation.getArgument(0))
                    && "p_1_2".equals(invocation.getArgument(1))) {
                cachedCursorRef.set(invocation.getArgument(2));
            }
            return null;
        }).when(hashOperations).put(anyString(), any(), any());
        when(hashOperations.get("last_message:p_1_2", "message")).thenReturn(MessageDTO.builder()
                .id(300L)
                .senderId(1L)
                .receiverId(2L)
                .messageType(MessageType.TEXT)
                .content("latest")
                .createdTime(LocalDateTime.of(2026, 4, 15, 18, 50))
                .build());
        ReadEvent event = ReadEvent.builder()
                .userId(2L)
                .conversationId("p_1_2")
                .lastReadMessageId(300L)
                .timestamp(LocalDateTime.of(2026, 4, 15, 18, 51))
                .build();

        updater.markConversationRead(event);
        updater.markConversationRead(event);

        verify(hashOperations, times(1)).put(eq("conversation:read-cursor:user:2"), eq("p_1_2"), any());
        verify(redisTemplate, times(1)).execute(any(RedisCallback.class));
        verify(redisTemplate, times(1)).delete("conversations:user:2");
    }

    @Test
    void markConversationReadShouldNotClearUnreadWhenLastMessageHasAdvancedPastCursor() {
        when(hashOperations.get("conversation:read-cursor:user:2", "p_1_2")).thenReturn(null);
        when(hashOperations.get("last_message:p_1_2", "message")).thenReturn(MessageDTO.builder()
                .id(301L)
                .senderId(1L)
                .receiverId(2L)
                .messageType(MessageType.TEXT)
                .content("newer")
                .createdTime(LocalDateTime.of(2026, 4, 15, 18, 55))
                .build());
        ReadEvent event = ReadEvent.builder()
                .userId(2L)
                .conversationId("p_1_2")
                .lastReadMessageId(300L)
                .timestamp(LocalDateTime.of(2026, 4, 15, 18, 54))
                .build();

        updater.markConversationRead(event);

        verify(hashOperations).put(eq("conversation:read-cursor:user:2"), eq("p_1_2"), any());
        verify(redisTemplate, never()).execute(any(RedisCallback.class));
        verify(redisTemplate).delete("conversations:user:2");
    }
}
