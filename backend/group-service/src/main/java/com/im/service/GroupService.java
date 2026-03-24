package com.im.service;

import com.im.dto.GroupInfoDTO;
import com.im.dto.GroupMemberDTO;
import com.im.dto.GroupMemberPageDTO;

import jakarta.validation.constraints.Size;
import java.util.List;

public interface GroupService {

    /**
     * 创建群组
     *
     * @param ownerId      群主ID
     * @param name         群组名称
     * @param type         群组类型
     * @param announcement 群公告
     * @return 创建的群组信息
     */
    GroupInfoDTO createGroup(Long ownerId, String name, Integer type, @Size(max = 500, message = "群公告不能超过500个字符") String announcement);

    /**
     * 批量添加群成员
     *
     * @param groupId    群组ID
     * @param operatorId 操作者ID
     * @param memberIds  成员ID列表
     */
    void addGroupMembers(Long groupId, Long operatorId, List<Long> memberIds);

    /**
     * 用户主动加入群组
     *
     * @param groupId 群组ID
     * @param userId  用户ID
     */
    void joinGroup(Long groupId, Long userId);

    /**
     * 用户主动退出群组
     *
     * @param groupId 群组ID
     * @param userId  用户ID
     */
    void leaveGroup(Long groupId, Long userId);

    /**
     * 将成员从群组中移除
     *
     * @param groupId    群组ID
     * @param operatorId 操作者ID (群主或管理员)
     * @param memberId   被移除的成员ID
     */
    void removeMember(Long groupId, Long operatorId, Long memberId);

    /**
     * 解散群组
     *
     * @param groupId    群组ID
     * @param operatorId 操作者ID (必须是群主)
     */
    void dismissGroup(Long groupId, Long operatorId);

    /**
     * 更新群组基本信息
     *
     * @param groupId      群组ID
     * @param operatorId   操作者ID (群主或管理员)
     * @param groupName    新群组名称
     * @param description  新群公告
     * @return 更新后的群组信息
     */
    GroupInfoDTO updateGroupInfo(Long groupId, Long operatorId, String groupName, String description);

    /**
     * 设置或取消群管理员
     *
     * @param groupId    群组ID
     * @param operatorId 操作者ID (必须是群主)
     * @param userId     目标用户ID
     * @param isAdmin    true表示设为管理员, false表示取消管理员
     */
    void setAdmin(Long groupId, Long operatorId, Long userId, Boolean isAdmin);

    /**
     * 分页获取群成员列表
     *
     * @param groupId 群组ID
     * @param cursor  上一页的最后一个成员ID，用于分页
     * @param limit   每页数量
     * @return 成员列表及下一页的cursor
     */
    GroupMemberPageDTO getGroupMembers(Long groupId, Long cursor, Integer limit);

    /**
     * 获取用户加入的所有群组列表
     *
     * @param userId 用户ID
     * @return 群组信息列表
     */
    List<GroupInfoDTO> getUserGroups(Long userId);

    /**
     * 获取指定群组的详细信息
     *
     * @param groupId 群组ID
     * @return 群组详细信息
     */
    GroupInfoDTO getGroupInfo(Long groupId);

    /**
     * 检查用户在群组中的角色
     *
     * @param groupId 群组ID
     * @param userId  用户ID
     * @return 角色标识 (例如: 0-非成员, 1-普通成员, 2-管理员, 3-群主)
     */
    Integer getUserRoleInGroup(Long groupId, Long userId);
}
