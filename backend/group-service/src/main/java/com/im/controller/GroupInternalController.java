package com.im.controller;

import com.im.dto.ApiResponse;
import com.im.dto.GroupInfoDTO;
import com.im.dto.UserDTO;
import com.im.feign.UserServiceFeignClient;
import com.im.group.entity.Group;
import com.im.group.entity.GroupMember;
import com.im.mapper.GroupMapper;
import com.im.mapper.GroupMemberMapper;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;
import java.util.stream.Collectors;

@RestController
@RequestMapping("/api/group/internal")
@RequiredArgsConstructor
public class GroupInternalController {

    private final GroupMapper groupMapper;
    private final GroupMemberMapper groupMemberMapper;
    private final UserServiceFeignClient userServiceFeignClient;

    @GetMapping("/exists/{groupId}")
    public ApiResponse<Boolean> exists(@PathVariable("groupId") Long groupId) {
        return ApiResponse.success(groupId != null && groupMapper.selectById(groupId) != null);
    }

    @GetMapping("/list/{userId}")
    public ApiResponse<List<GroupInfoDTO>> listUserGroups(@PathVariable("userId") Long userId) {
        if (userId == null) {
            return ApiResponse.success(List.of());
        }
        return ApiResponse.success(groupMapper.selectGroupsByUserId(userId).stream()
                .map(this::toGroupInfoDTO)
                .collect(Collectors.toList()));
    }

    @GetMapping("/isMember/{groupId}/{userId}")
    public ApiResponse<Boolean> isMember(@PathVariable("groupId") Long groupId,
                                         @PathVariable("userId") Long userId) {
        if (groupId == null || userId == null) {
            return ApiResponse.success(false);
        }
        return ApiResponse.success(groupMemberMapper.existsActiveMember(groupId, userId));
    }

    @GetMapping("/memberIds/{groupId}")
    public ApiResponse<List<Long>> memberIds(@PathVariable("groupId") Long groupId) {
        if (groupId == null) {
            return ApiResponse.success(List.of());
        }
        List<GroupMember> members = groupMemberMapper.selectMembersByGroupId(groupId);
        return ApiResponse.success(members.stream().map(GroupMember::getUserId).collect(Collectors.toList()));
    }

    private GroupInfoDTO toGroupInfoDTO(Group group) {
        UserDTO owner = group.getOwnerId() == null ? null : userServiceFeignClient.getUser(group.getOwnerId());
        return GroupInfoDTO.builder()
                .id(group.getId())
                .name(group.getName())
                .type(Integer.valueOf(group.getType()))
                .announcement(group.getAnnouncement())
                .avatar(group.getAvatar())
                .ownerId(group.getOwnerId())
                .ownerName(owner == null ? null : (owner.getNickname() != null ? owner.getNickname() : owner.getUsername()))
                .memberCount(group.getMemberCount())
                .maxMembers(group.getMaxMembers())
                .isMuted(false)
                .createTime(group.getCreatedTime())
                .updateTime(group.getUpdatedTime())
                .build();
    }
}
