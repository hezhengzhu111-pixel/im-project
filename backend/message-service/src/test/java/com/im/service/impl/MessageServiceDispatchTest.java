package com.im.service.impl;

import com.im.dto.MessageDTO;
import com.im.enums.MessageType;
import com.im.exception.BusinessException;
import com.im.feign.GroupServiceFeignClient;
import com.im.feign.UserServiceFeignClient;
import com.im.handler.GroupMessageHandler;
import com.im.handler.PrivateMessageHandler;
import com.im.handler.SystemMessageHandler;
import com.im.mapper.GroupReadCursorMapper;
import com.im.mapper.MessageMapper;
import com.im.service.OutboxService;
import com.im.service.command.SendMessageCommand;
import com.im.service.support.UserProfileCache;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.redisson.api.RedissonClient;
import org.springframework.data.redis.core.RedisTemplate;
import org.springframework.test.util.ReflectionTestUtils;
import org.springframework.transaction.support.TransactionTemplate;

import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class MessageServiceDispatchTest {

    @Mock
    private MessageMapper messageMapper;
    @Mock
    private UserServiceFeignClient userServiceFeignClient;
    @Mock
    private GroupServiceFeignClient groupServiceFeignClient;
    @Mock
    private RedisTemplate<String, Object> redisTemplate;
    @Mock
    private OutboxService outboxService;
    @Mock
    private GroupReadCursorMapper groupReadCursorMapper;
    @Mock
    private UserProfileCache userProfileCache;
    @Mock
    private RedissonClient redissonClient;
    @Mock
    private TransactionTemplate transactionTemplate;
    @Mock
    private PrivateMessageHandler privateMessageHandler;
    @Mock
    private GroupMessageHandler groupMessageHandler;
    @Mock
    private SystemMessageHandler systemMessageHandler;

    @Test
    void sendMessageShouldDispatchPrivateToPrivateHandler() {
        MessageDTO dto = new MessageDTO();
        dto.setId(101L);
        MessageServiceImpl service = service(List.of(privateMessageHandler, groupMessageHandler, systemMessageHandler));
        SendMessageCommand command = SendMessageCommand.builder()
                .senderId(1L)
                .receiverId(2L)
                .isGroup(false)
                .messageType(MessageType.TEXT)
                .content("hello")
                .build();

        when(privateMessageHandler.supports(MessageType.TEXT)).thenReturn(true);
        when(privateMessageHandler.handle(command)).thenReturn(dto);
        initHandlerCache(service);

        MessageDTO result = service.sendMessage(command);

        assertEquals(101L, result.getId());
        verify(privateMessageHandler).handle(command);
        verify(groupMessageHandler, never()).handle(any());
        verify(systemMessageHandler, never()).handle(any());
    }

    @Test
    void sendMessageShouldDispatchGroupToGroupHandler() {
        MessageDTO dto = new MessageDTO();
        dto.setId(202L);
        MessageServiceImpl service = service(List.of(privateMessageHandler, groupMessageHandler, systemMessageHandler));
        SendMessageCommand command = SendMessageCommand.builder()
                .senderId(1L)
                .groupId(8L)
                .isGroup(true)
                .messageType(MessageType.TEXT)
                .content("hello")
                .build();

        when(groupMessageHandler.handle(command)).thenReturn(dto);
        initHandlerCache(service);

        MessageDTO result = service.sendMessage(command);

        assertEquals(202L, result.getId());
        verify(groupMessageHandler).handle(command);
    }

    @Test
    void sendMessageShouldDispatchSystemToSystemHandler() {
        MessageDTO dto = new MessageDTO();
        dto.setId(303L);
        MessageServiceImpl service = service(List.of(privateMessageHandler, groupMessageHandler, systemMessageHandler));
        SendMessageCommand command = SendMessageCommand.builder()
                .senderId(1L)
                .receiverId(2L)
                .isGroup(false)
                .messageType(MessageType.SYSTEM)
                .content("system")
                .build();

        lenient().when(systemMessageHandler.supports(MessageType.SYSTEM)).thenReturn(true);
        when(systemMessageHandler.handle(command)).thenReturn(dto);
        initHandlerCache(service);

        MessageDTO result = service.sendMessage(command);

        assertEquals(303L, result.getId());
        verify(systemMessageHandler).handle(command);
        verify(privateMessageHandler, never()).handle(any());
    }

    @Test
    void sendMessageShouldThrowWhenNoHandlerMatches() {
        MessageServiceImpl service = service(List.of(groupMessageHandler, systemMessageHandler));
        SendMessageCommand command = SendMessageCommand.builder()
                .senderId(1L)
                .receiverId(2L)
                .isGroup(false)
                .messageType(MessageType.TEXT)
                .build();

        initHandlerCache(service);
        assertThrows(BusinessException.class, () -> service.sendMessage(command));
    }

    private MessageServiceImpl service(List<? extends com.im.handler.MessageHandler> handlers) {
        MessageServiceImpl service = new MessageServiceImpl(
                messageMapper,
                userServiceFeignClient,
                groupServiceFeignClient,
                redisTemplate,
                outboxService,
                groupReadCursorMapper,
                userProfileCache,
                redissonClient,
                transactionTemplate,
                List.copyOf(handlers)
        );
        return service;
    }

    private void initHandlerCache(MessageServiceImpl service) {
        ReflectionTestUtils.invokeMethod(service, "initHandlerCache");
    }
}
