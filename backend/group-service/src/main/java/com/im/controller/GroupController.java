package com.im.controller;

import com.im.dto.ApiResponse;
import com.im.dto.GroupInfoDTO;
import com.im.dto.GroupMemberPageDTO;
import com.im.dto.request.*;
import com.im.dto.request.GetGroupMembersRequest;
import com.im.dto.request.GetUserRoleRequest;
import com.im.service.GroupService;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.*;

import jakarta.validation.Valid;
import jakarta.validation.constraints.Positive;
import java.util.List;

@RestController
@RequestMapping("/s")
@Slf4j
@Validated
public class GroupController {

    @Autowired
    private GroupService groupService;

    /**
     * 创建群组
     */
    @PostMapping("/create")
    public ApiResponse<GroupInfoDTO> createGroup(
            @RequestAttribute("userId") Long userId,
            @Valid @RequestBody CreateGroupRequest request) {
        GroupInfoDTO result = groupService.createGroup(
                userId,
                request.getName(),
                request.getType(),
                request.getAnnouncement()
        );
        return ApiResponse.success("创建群组成功", result);
    }

    /**
     * 批量添加群成员
     */
    @PostMapping("/{groupId}/members")
    public ApiResponse<String> addGroupMembers(
            @PathVariable Long groupId,
            @RequestAttribute("userId") Long userId,
            @Valid @RequestBody AddGroupMembersRequest request) {
        groupService.addGroupMembers(groupId, userId, request.getMemberIds());
        return ApiResponse.success("添加成功", "添加成功");
    }

    /**
     * 加入群组
     */
    @PostMapping("/{groupId}/join")
    public ApiResponse<String> joinGroup(
            @PathVariable Long groupId,
            @RequestAttribute("userId") Long userId) {
        groupService.joinGroup(groupId, userId);
        return ApiResponse.success("加入成功", "加入成功");
    }

    /**
     * 退出群组
     */
    @PostMapping("/{groupId}/leave")
    public ApiResponse<String> leaveGroup(
            @PathVariable Long groupId,
            @RequestAttribute("userId") Long userId) {
        groupService.leaveGroup(groupId, userId);
        return ApiResponse.success("退出成功", "退出成功");
    }

    /**
     * 移除群成员
     */
    @DeleteMapping("/{groupId}/members/{memberId}")
    public ApiResponse<String> removeMember(
            @PathVariable Long groupId,
            @PathVariable Long memberId,
            @RequestAttribute("userId") Long userId) {
        groupService.removeMember(groupId, userId, memberId);
        return ApiResponse.success("移除成功", "移除成功");
    }

    /**
     * 解散群组
     */
    @DeleteMapping("/{groupId}")
    public ApiResponse<String> dismissGroup(
            @PathVariable Long groupId,
            @RequestAttribute("userId") Long userId) {
        groupService.dismissGroup(groupId, userId);
        return ApiResponse.success("解散成功", "解散成功");
    }

    /**
     * 更新群组信息
     */
    @PutMapping("/{groupId}")
    public ApiResponse<GroupInfoDTO> updateGroupInfo(
            @PathVariable Long groupId,
            @RequestAttribute("userId") Long userId,
            @Valid @RequestBody UpdateGroupInfoRequest request) {
        GroupInfoDTO result = groupService.updateGroupInfo(
                groupId,
                userId,
                request.getGroupName(),
                request.getDescription()
        );
        return ApiResponse.success("更新成功", result);
    }

    /**
     * 获取群成员列表（分页）
     */
    @PostMapping("/members/list")
    public ApiResponse<GroupMemberPageDTO> getGroupMembers(
            @Valid @RequestBody GetGroupMembersRequest request) {
        GroupMemberPageDTO result = groupService.getGroupMembers(request.getGroupId(), request.getCursor(), request.getLimit());
        return ApiResponse.success("获取成功", result);
    }


    /**
     * 设置管理员
     */
    @PutMapping("/{groupId}/admin")
    public ApiResponse<String> setAdmin(
            @PathVariable Long groupId,
            @RequestAttribute("userId") Long userId,
            @Valid @RequestBody SetAdminRequest request) {
        groupService.setAdmin(groupId, userId, request.getUserId(), request.getIsAdmin());
        return ApiResponse.success(request.getIsAdmin() ? "设置管理员成功" : "取消管理员成功", "OK");
    }


    /**
     * 获取用户加入的群组列表
     */
    @GetMapping("/user/{userId}")
    public ApiResponse<List<GroupInfoDTO>> getUserGroups(@PathVariable Long userId) {
        List<GroupInfoDTO> result = groupService.getUserGroups(userId);
        return ApiResponse.success("获取成功", result);
    }

    /**
     * 获取群组详细信息
     */
    @GetMapping("/{groupId}/info")
    public ApiResponse<GroupInfoDTO> getGroupInfo(@PathVariable Long groupId) {
        GroupInfoDTO result = groupService.getGroupInfo(groupId);
        return ApiResponse.success("获取成功", result);
    }

    /**
     * 获取用户在群组中的角色
     */
    @PostMapping("/role/get")
    public ApiResponse<Integer> getUserRole(
            @Valid @RequestBody GetUserRoleRequest request) {
        Integer role = groupService.getUserRoleInGroup(request.getGroupId(), request.getUserId());
        return ApiResponse.success("获取成功", role);
    }


}
