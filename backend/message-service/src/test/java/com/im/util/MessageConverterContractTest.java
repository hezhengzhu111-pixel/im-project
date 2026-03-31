package com.im.util;

import com.im.dto.MessageDTO;
import com.im.dto.GroupMemberDTO;
import com.im.entity.Message;
import com.im.enums.MessageType;
import org.junit.jupiter.api.Test;

import java.time.LocalDateTime;
import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;

class MessageConverterContractTest {

    @Test
    void convertToDTO_shouldKeepGroupMemberRoleContract() {
        Message message = new Message();
        message.setId(1L);
        message.setSenderId(10L);
        message.setGroupId(100L);
        message.setIsGroupChat(true);
        message.setMessageType(MessageType.TEXT);
        message.setContent("hello-group");
        message.setStatus(Message.MessageStatus.SENT);
        message.setCreatedTime(LocalDateTime.now());
        message.setUpdatedTime(LocalDateTime.now());

        GroupMemberDTO m1 = GroupMemberDTO.builder()
                .groupId(100L)
                .userId(11L)
                .nickname("member")
                .role(1)
                .joinTime(LocalDateTime.now())
                .build();

        GroupMemberDTO m2 = GroupMemberDTO.builder()
                .groupId(100L)
                .userId(12L)
                .nickname("admin")
                .role(2)
                .joinTime(LocalDateTime.now())
                .build();

        GroupMemberDTO m3 = GroupMemberDTO.builder()
                .groupId(100L)
                .userId(13L)
                .nickname("owner")
                .role(3)
                .joinTime(LocalDateTime.now())
                .build();

        MessageDTO dto = MessageConverter.convertToDTO(message, "sender", "avatar", null, null, List.of(m1, m2, m3));

        assertNotNull(dto);
        assertEquals(true, dto.getIsGroupMessage());
        assertEquals(true, dto.getIsGroupChat());
        assertEquals(true, dto.isGroup());
        assertNotNull(dto.getGroupMembers());
        assertEquals(3, dto.getGroupMembers().size());
        assertEquals("普通成员", dto.getGroupMembers().get(0).getRoleName());
        assertEquals("管理员", dto.getGroupMembers().get(1).getRoleName());
        assertEquals("群主", dto.getGroupMembers().get(2).getRoleName());
    }
}
