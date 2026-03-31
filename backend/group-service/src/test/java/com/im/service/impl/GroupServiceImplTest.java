package com.im.service.impl;

import com.im.entity.Group;
import com.im.entity.GroupMember;
import com.im.feign.UserServiceFeignClient;
import com.im.mapper.GroupMapper;
import com.im.mapper.GroupMemberMapper;
import org.junit.jupiter.api.Assertions;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class GroupServiceImplTest {

    @Mock
    private GroupMapper groupMapper;
    @Mock
    private GroupMemberMapper groupMemberMapper;
    @Mock
    private UserServiceFeignClient userServiceFeignClient;

    private GroupServiceImpl service;

    @BeforeEach
    void setUp() {
        service = new GroupServiceImpl(groupMapper, groupMemberMapper, userServiceFeignClient);
    }

    @Test
    void createGroupShouldRejectUnknownOwner() {
        when(userServiceFeignClient.exists(10L)).thenReturn(false);

        assertThrows(IllegalArgumentException.class, () -> service.createGroup(10L, "test", 1, null, null));

        verify(groupMapper, never()).insert(any(Group.class));
        verify(groupMemberMapper, never()).insert(any(GroupMember.class));
    }

    @Test
    void createGroupShouldPersistAvatar() {
        when(userServiceFeignClient.exists(10L)).thenReturn(true);

        service.createGroup(10L, "test", 1, "notice", "https://cdn.example.com/group.png");

        ArgumentCaptor<Group> groupCaptor = ArgumentCaptor.forClass(Group.class);
        verify(groupMapper).insert(groupCaptor.capture());
        Assertions.assertEquals("https://cdn.example.com/group.png", groupCaptor.getValue().getAvatar());
    }

    @Test
    void addGroupMembersShouldRejectUnknownMemberBeforeWrite() {
        Group group = group(8L, 1L);
        when(groupMapper.selectById(8L)).thenReturn(group);
        when(userServiceFeignClient.exists(1L)).thenReturn(true);
        when(userServiceFeignClient.exists(2L)).thenReturn(false);
        when(groupMemberMapper.selectOne(any())).thenReturn(member(8L, 1L, 2, true));

        assertThrows(IllegalArgumentException.class, () -> service.addGroupMembers(8L, 1L, List.of(2L)));

        verify(groupMemberMapper, never()).insert(any(GroupMember.class));
        verify(groupMapper, never()).update(any(), any());
    }

    @Test
    void getUserGroupsShouldReturnEmptyWhenUserMissing() {
        when(userServiceFeignClient.exists(7L)).thenReturn(false);

        var result = service.getUserGroups(7L);

        assertTrue(result.isEmpty());
        verify(groupMapper, never()).selectGroupsByUserId(anyLong());
    }

    @Test
    void getUserRoleInGroupShouldReturnZeroWhenUserMissing() {
        when(groupMapper.selectById(8L)).thenReturn(group(8L, 1L));
        when(userServiceFeignClient.exists(7L)).thenReturn(false);

        Integer role = service.getUserRoleInGroup(8L, 7L);

        assertEquals(0, role);
        verify(groupMemberMapper, never()).selectOne(any());
    }

    @Test
    void getGroupMembersShouldRejectInactiveCursor() {
        GroupMember inactiveCursor = member(8L, 2L, 1, false);
        inactiveCursor.setId(99L);
        when(groupMapper.selectById(8L)).thenReturn(group(8L, 1L));
        when(groupMemberMapper.selectById(99L)).thenReturn(inactiveCursor);

        assertThrows(IllegalArgumentException.class, () -> service.getGroupMembers(8L, 99L, 20));

        verify(groupMemberMapper, never()).selectList(any());
    }

    private Group group(Long groupId, Long ownerId) {
        Group group = new Group();
        group.setId(groupId);
        group.setOwnerId(ownerId);
        group.setName("group-" + groupId);
        group.setType(1);
        group.setMemberCount(1);
        group.setMaxMembers(500);
        group.setStatus(true);
        return group;
    }

    private GroupMember member(Long groupId, Long userId, Integer role, Boolean status) {
        GroupMember member = new GroupMember();
        member.setGroupId(groupId);
        member.setUserId(userId);
        member.setRole(role);
        member.setStatus(status);
        return member;
    }
}
