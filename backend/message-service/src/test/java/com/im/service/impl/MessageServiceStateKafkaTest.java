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
import com.im.service.support.AcceptedMessageProjectionService;
import com.im.service.support.HotMessageRedisRepository;
import com.im.service.support.UserProfileCache;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.data.redis.core.RedisTemplate;
import org.springframework.kafka.core.KafkaTemplate;
import org.springframework.test.util.ReflectionTestUtils;

import java.time.LocalDateTime;
import java.util.List;
import java.util.concurrent.CompletableFuture;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

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
        ReflectionTestUtils.setField(messageService, "readTopic", "im-read-topic");
        ReflectionTestUtils.setField(messageService, "statusTopic", "im-status-topic");
        ReflectionTestUtils.setField(messageService, "kafkaSendTimeoutMs", 2000L);
    }

    @Test
    void markAsReadShouldPublishReadEventWithoutSynchronousUpdate() throws Exception {
        Message lastMessage = new Message();
        lastMessage.setId(200L);
        when(userServiceFeignClient.exists(1L)).thenReturn(true);
        when(userServiceFeignClient.exists(2L)).thenReturn(true);
        when(userProfileCache.isFriend(1L, 2L)).thenReturn(true);
        when(messageMapper.selectOne(any())).thenReturn(lastMessage);

        CompletableFuture<Object> future = CompletableFuture.completedFuture(null);
        when(readEventKafkaTemplate.send(eq("im-read-topic"), eq("p_1_2"), any(ReadEvent.class)))
                .thenReturn((CompletableFuture) future);

        messageService.markAsRead(1L, "1_2");

        ArgumentCaptor<ReadEvent> eventCaptor = ArgumentCaptor.forClass(ReadEvent.class);
        verify(readEventKafkaTemplate).send(eq("im-read-topic"), eq("p_1_2"), eventCaptor.capture());
        ReadEvent event = eventCaptor.getValue();
        assertEquals(1L, event.getUserId());
        assertEquals(2L, event.getTargetUserId());
        assertEquals("p_1_2", event.getConversationId());
        assertEquals(200L, event.getLastReadMessageId());
        verify(messageMapper, never()).update(any(), any());
        verify(groupReadCursorMapper, never()).updateById(any(com.im.message.entity.GroupReadCursor.class));
        verify(privateReadCursorMapper, never()).updateById(any(com.im.message.entity.PrivateReadCursor.class));
    }

    @Test
    void recallMessageShouldPublishStatusChangeEventWithoutSynchronousUpdate() throws Exception {
        Message storedMessage = new Message();
        storedMessage.setId(300L);
        storedMessage.setSenderId(1L);
        storedMessage.setReceiverId(2L);
        storedMessage.setIsGroupChat(false);
        storedMessage.setMessageType(MessageType.TEXT);
        storedMessage.setContent("hello");
        storedMessage.setStatus(Message.MessageStatus.SENT);
        storedMessage.setCreatedTime(LocalDateTime.now().minusMinutes(1));
        storedMessage.setUpdatedTime(storedMessage.getCreatedTime());
        when(messageMapper.selectById(300L)).thenReturn(storedMessage);

        CompletableFuture<Object> future = CompletableFuture.completedFuture(null);
        when(statusChangeEventKafkaTemplate.send(eq("im-status-topic"), eq("p_1_2"), any(StatusChangeEvent.class)))
                .thenReturn((CompletableFuture) future);

        MessageDTO result = messageService.recallMessage(1L, 300L);

        ArgumentCaptor<StatusChangeEvent> eventCaptor = ArgumentCaptor.forClass(StatusChangeEvent.class);
        verify(statusChangeEventKafkaTemplate).send(eq("im-status-topic"), eq("p_1_2"), eventCaptor.capture());
        StatusChangeEvent event = eventCaptor.getValue();
        assertEquals(300L, event.getMessageId());
        assertEquals(Message.MessageStatus.RECALLED, event.getNewStatus());
        assertNotNull(event.getPayload());
        assertEquals("RECALLED", event.getPayload().getStatus());
        assertEquals("RECALLED", result.getStatus());
        verify(messageMapper, never()).update(any(), any());
    }
}
