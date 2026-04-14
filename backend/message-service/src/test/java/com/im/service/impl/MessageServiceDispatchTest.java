package com.im.service.impl;

import com.im.dto.MessageDTO;
import com.im.enums.MessageType;
import com.im.exception.BusinessException;
import com.im.feign.GroupServiceFeignClient;
import com.im.feign.UserServiceFeignClient;
import com.im.handler.MessageHandler;
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
import org.springframework.transaction.support.TransactionTemplate;

import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.never;
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
    private MessageHandler privateMessageHandler;
    @Mock
    private MessageHandler groupMessageHandler;

    @Test
    void sendMessageShouldDispatchPrivateAndSystemToPrivateHandler() {
        MessageDTO dto = new MessageDTO();
        dto.setId(101L);
        MessageServiceImpl service = service(List.of(privateMessageHandler, groupMessageHandler));
        SendMessageCommand command = SendMessageCommand.builder()
                .senderId(1L)
                .receiverId(2L)
                .isGroup(false)
                .messageType(MessageType.TEXT)
                .content("hello")
                .build();

        when(privateMessageHandler.supports(command)).thenReturn(true);
        when(privateMessageHandler.handle(command)).thenReturn(dto);

        MessageDTO result = service.sendMessage(command);

        assertEquals(101L, result.getId());
        verify(privateMessageHandler).handle(command);
        verify(groupMessageHandler, never()).handle(any());
    }

    @Test
    void sendMessageShouldDispatchGroupToGroupHandler() {
        MessageDTO dto = new MessageDTO();
        dto.setId(202L);
        MessageServiceImpl service = service(List.of(privateMessageHandler, groupMessageHandler));
        SendMessageCommand command = SendMessageCommand.builder()
                .senderId(1L)
                .groupId(8L)
                .isGroup(true)
                .messageType(MessageType.TEXT)
                .content("hello")
                .build();

        when(privateMessageHandler.supports(command)).thenReturn(false);
        when(groupMessageHandler.supports(command)).thenReturn(true);
        when(groupMessageHandler.handle(command)).thenReturn(dto);

        MessageDTO result = service.sendMessage(command);

        assertEquals(202L, result.getId());
        verify(groupMessageHandler).handle(command);
    }

    @Test
    void sendMessageShouldThrowWhenNoHandlerMatches() {
        MessageServiceImpl service = service(List.of(privateMessageHandler, groupMessageHandler));
        SendMessageCommand command = SendMessageCommand.builder()
                .senderId(1L)
                .receiverId(2L)
                .isGroup(false)
                .messageType(MessageType.TEXT)
                .build();

        when(privateMessageHandler.supports(command)).thenReturn(false);
        when(groupMessageHandler.supports(command)).thenReturn(false);

        assertThrows(BusinessException.class, () -> service.sendMessage(command));
    }

    private MessageServiceImpl service(List<MessageHandler> handlers) {
        return new MessageServiceImpl(
                messageMapper,
                userServiceFeignClient,
                groupServiceFeignClient,
                redisTemplate,
                outboxService,
                groupReadCursorMapper,
                userProfileCache,
                redissonClient,
                transactionTemplate,
                handlers
        );
    }
}
