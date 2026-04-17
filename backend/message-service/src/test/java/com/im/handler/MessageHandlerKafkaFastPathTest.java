package com.im.handler;

import com.im.dto.MessageDTO;
import com.im.dto.MessageEvent;
import com.im.dto.UserDTO;
import com.im.enums.MessageEventType;
import com.im.enums.MessageType;
import com.im.exception.BusinessException;
import com.im.feign.GroupServiceFeignClient;
import com.im.feign.UserServiceFeignClient;
import com.im.service.command.SendMessageCommand;
import com.im.service.orchestrator.MessagePreparation;
import com.im.service.support.UserProfileCache;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class MessageHandlerKafkaFastPathTest {

    @Mock
    private UserProfileCache userProfileCache;

    @Mock
    private GroupServiceFeignClient groupServiceFeignClient;

    @Mock
    private UserServiceFeignClient userServiceFeignClient;

    @Test
    void privateMessageHandlerShouldOnlyPrepareTypeSpecificPayload() {
        PrivateMessageHandler handler = new PrivateMessageHandler(userProfileCache);
        when(userProfileCache.getUser(1L)).thenReturn(user("1", "alice"));
        when(userProfileCache.getUser(2L)).thenReturn(user("2", "bob"));
        when(userProfileCache.isFriend(1L, 2L)).thenReturn(true);

        MessagePreparation preparation = handler.prepare(privateCommand(), 9001L);

        MessageDTO result = preparation.response();
        MessageEvent event = preparation.event();
        assertEquals(9001L, result.getId());
        assertEquals("client-1", result.getClientMessageId());
        assertEquals("p_1_2", preparation.conversationId());
        assertEquals(MessageEventType.MESSAGE, event.getEventType());
        assertEquals("p_1_2", event.getConversationId());
        assertEquals(1L, event.getSenderId());
        assertEquals(2L, event.getReceiverId());
    }

    @Test
    void groupMessageHandlerShouldOnlyPrepareGroupContextAndPayload() {
        GroupMessageHandler handler = new GroupMessageHandler(groupServiceFeignClient, userProfileCache);
        when(userProfileCache.getUser(1L)).thenReturn(user("1", "alice"));
        when(groupServiceFeignClient.exists(8L)).thenReturn(true);
        when(userProfileCache.isGroupMember(8L, 1L)).thenReturn(true);

        MessagePreparation preparation = handler.prepare(groupCommand(), 9002L);

        assertEquals("g_8", preparation.conversationId());
        assertTrue(preparation.response().isGroup());
        assertEquals(8L, preparation.event().getGroupId());
        assertEquals(9002L, preparation.message().getId());
    }

    @Test
    void systemMessageHandlerShouldPrepareSyntheticClientMessageIdWhenMissing() {
        SystemMessageHandler handler = new SystemMessageHandler(userServiceFeignClient, userProfileCache);
        when(userServiceFeignClient.exists(2L)).thenReturn(true);
        when(userProfileCache.getUser(0L)).thenReturn(null);
        when(userProfileCache.getUser(2L)).thenReturn(user("2", "bob"));

        MessagePreparation preparation = handler.prepare(systemCommand(), 9003L);

        assertEquals("sys-9003", preparation.message().getClientMessageId());
        assertEquals("sys-9003", preparation.response().getClientMessageId());
        assertEquals("sys-9003", preparation.event().getClientMessageId());
    }

    @Test
    void privateMessageHandlerShouldRejectNonFriendReceiver() {
        PrivateMessageHandler handler = new PrivateMessageHandler(userProfileCache);
        when(userProfileCache.getUser(1L)).thenReturn(user("1", "alice"));
        when(userProfileCache.getUser(2L)).thenReturn(user("2", "bob"));
        when(userProfileCache.isFriend(1L, 2L)).thenReturn(false);

        assertThrows(BusinessException.class, () -> handler.prepare(privateCommand(), 9004L));
    }

    @Test
    void groupMessageHandlerShouldRejectNonMemberSender() {
        GroupMessageHandler handler = new GroupMessageHandler(groupServiceFeignClient, userProfileCache);
        when(userProfileCache.getUser(1L)).thenReturn(user("1", "alice"));
        when(groupServiceFeignClient.exists(8L)).thenReturn(true);
        when(userProfileCache.isGroupMember(8L, 1L)).thenReturn(false);

        assertThrows(BusinessException.class, () -> handler.prepare(groupCommand(), 9005L));
    }

    private SendMessageCommand privateCommand() {
        return SendMessageCommand.builder()
                .senderId(1L)
                .receiverId(2L)
                .messageType(MessageType.TEXT)
                .clientMessageId("client-1")
                .content("hello")
                .build();
    }

    private SendMessageCommand groupCommand() {
        return SendMessageCommand.builder()
                .senderId(1L)
                .groupId(8L)
                .isGroup(true)
                .messageType(MessageType.TEXT)
                .clientMessageId("client-2")
                .content("group-hi")
                .build();
    }

    private SendMessageCommand systemCommand() {
        return SendMessageCommand.builder()
                .senderId(0L)
                .receiverId(2L)
                .messageType(MessageType.SYSTEM)
                .content("system notice")
                .build();
    }

    private UserDTO user(String id, String username) {
        return UserDTO.builder()
                .id(id)
                .username(username)
                .nickname(username)
                .avatar(username + ".png")
                .build();
    }
}
