package com.im.service.impl;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.conditions.update.UpdateWrapper;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.im.dto.GroupInfoDTO;
import com.im.dto.GroupMemberDTO;
import com.im.dto.GroupMemberPageDTO;
import com.im.dto.UserDTO;
import com.im.feign.UserServiceFeignClient;
import com.im.group.entity.Group;
import com.im.group.entity.GroupMember;
import com.im.mapper.GroupMapper;
import com.im.mapper.GroupMemberMapper;
import com.im.service.GroupService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.kafka.core.KafkaTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.*;
import java.util.stream.Collectors;

@Service
@RequiredArgsConstructor
@Slf4j
public class GroupServiceImpl implements GroupService {

    private static final String AUTHZ_CACHE_INVALIDATION_TOPIC = "im-authz-cache-invalidation-topic";
    private static final String SCOPE_GROUP_MEMBERSHIP = "GROUP_MEMBERSHIP";
    private static final ObjectMapper OBJECT_MAPPER = new ObjectMapper();
    
    private final GroupMapper groupMapper;
    private final GroupMemberMapper groupMemberMapper;
    private final UserServiceFeignClient userServiceFeignClient;
    private final KafkaTemplate<String, String> kafkaTemplate;

    @Value("${im.kafka.authz-cache-invalidation-topic:im-authz-cache-invalidation-topic}")
    private String authzCacheInvalidationTopic = AUTHZ_CACHE_INVALIDATION_TOPIC;
    
    @Override
    @Transactional
    public GroupInfoDTO createGroup(Long ownerId,
                                    String name,
                                    Integer type,
                                    String announcement,
                                    String avatar,
                                    List<Long> memberIds) {
        if (ownerId == null) {
            throw new IllegalArgumentException("群主不能为空");
        }
        if (name == null || name.isBlank()) {
            throw new IllegalArgumentException("群名称不能为空");
        }
        if (type == null) {
            throw new IllegalArgumentException("群类型不能为空");
        }
        requireUserExists(ownerId);
        List<Long> normalizedMemberIds = normalizeInitialMemberIds(ownerId, memberIds);
        for (Long memberId : normalizedMemberIds) {
            requireUserExists(memberId);
        }

        // 创建群组实体
        Group group = buildGroupEntity(ownerId, name, type, announcement, avatar, normalizedMemberIds.size());
        groupMapper.insert(group);
        Group savedGroup = group;

        // 添加群主为成员
        addOwnerAsMember(savedGroup.getId(), ownerId);
        for (Long memberId : normalizedMemberIds) {
            addMemberToGroup(savedGroup.getId(), memberId, 1);
        }

        log.info("用户{}创建群组: {}", ownerId, name);
        return convertToGroupInfoDTO(savedGroup);
    }
    
    @Override
    @Transactional
    public void addGroupMembers(Long groupId, Long operatorId, List<Long> memberIds) {
        validateGroupExists(groupId);
        requireUserExists(operatorId);
        validateUserPermission(operatorId, groupId, 2); // 至少是管理员

        if (memberIds == null || memberIds.isEmpty()) {
            return;
        }

        List<Long> normalizedMemberIds = memberIds.stream()
                .distinct()
                .collect(Collectors.toList());
        for (Long memberId : normalizedMemberIds) {
            requireUserExists(memberId);
        }

        Group group = findGroupById(groupId);
        List<Long> addedMemberIds = new java.util.ArrayList<>();

        for (Long memberId : normalizedMemberIds) {
            if (!isMember(groupId, memberId)) {
                if (group.getMemberCount() >= group.getMaxMembers()) {
                    log.warn("群组 {} 成员已满，无法添加新成员 {}", groupId, memberId);
                    continue; // 或者抛出异常，取决于业务需求
                }
                addMemberToGroup(groupId, memberId, 1); // 普通成员
                updateMemberCount(groupId, 1);
                group.setMemberCount(group.getMemberCount() + 1);
                addedMemberIds.add(memberId);
            }
        }
        publishGroupMembershipInvalidation("JOIN", groupId, addedMemberIds);
        log.info("操作员 {} 批量添加群成员到群组 {}: {}", operatorId, groupId, normalizedMemberIds);
    }
    
    @Override
    @Transactional
    public void joinGroup(Long groupId, Long userId) {
        validateGroupExists(groupId);
        requireUserExists(userId);

        Group group = findGroupById(groupId);

        if (group.getMemberCount() >= group.getMaxMembers()) {
            throw new IllegalStateException("群组 " + groupId + " 成员已满");
        }

        GroupMember existing = groupMemberMapper.selectOne(new LambdaQueryWrapper<GroupMember>()
                .eq(GroupMember::getGroupId, groupId)
                .eq(GroupMember::getUserId, userId)
                .last("limit 1"));

        if (existing != null) {
            if (Boolean.TRUE.equals(existing.getStatus())) {
                throw new IllegalStateException("用户 " + userId + " 已经是群组 " + groupId + " 的成员");
            }
            existing.setStatus(true);
            existing.setRole(1);
            existing.setJoinTime(LocalDateTime.now());
            groupMemberMapper.updateById(existing);
            updateMemberCount(groupId, 1);
        } else {
            addMemberToGroup(groupId, userId, 1); // 普通成员
            updateMemberCount(groupId, 1);
        }

        publishGroupMembershipInvalidation("JOIN", groupId, List.of(userId));
        log.info("用户 {} 加入群组 {}", userId, groupId);
    }
    
    @Override
    @Transactional
    public void leaveGroup(Long groupId, Long userId) {
        validateGroupExists(groupId);
        requireUserExists(userId);

        if (isOwner(groupId, userId)) {
            throw new IllegalStateException("群主不能退出群组，请先转让群主或解散群组");
        }

        if (!isMember(groupId, userId)) {
            throw new IllegalStateException("用户 " + userId + " 不是群组 " + groupId + " 的成员");
        }

        removeMemberFromGroup(groupId, userId);
        updateMemberCount(groupId, -1);

        publishGroupMembershipInvalidation("LEAVE", groupId, List.of(userId));
        log.info("用户 {} 退出群组 {}", userId, groupId);
    }
    
    @Override
    @Transactional
    public void removeMember(Long groupId, Long operatorId, Long memberId) {
        validateGroupExists(groupId);
        requireUserExists(operatorId);
        requireUserExists(memberId);

        if (Objects.equals(operatorId, memberId)) {
            throw new IllegalArgumentException("不能移除自己");
        }

        GroupMember operator = findGroupMember(groupId, operatorId);
        GroupMember memberToRemove = findGroupMember(groupId, memberId);

        // 权限检查：操作者必须是群主或管理员，且不能移除同级或更高级别的成员
        if (operator.getRole() < 2) {
            throw new SecurityException("权限不足，只有群主或管理员才能移除成员");
        }
        if (operator.getRole() <= memberToRemove.getRole()) {
            throw new SecurityException("不能移除同级别或更高级别的成员");
        }

        removeMemberFromGroup(groupId, memberId);
        updateMemberCount(groupId, -1);

        publishGroupMembershipInvalidation("KICK", groupId, List.of(memberId));
        log.info("用户 {} 从群组 {} 移除了用户 {}", operatorId, groupId, memberId);
    }
    
    @Override
    @Transactional
    public void dismissGroup(Long groupId, Long operatorId) {
        validateGroupExists(groupId);
        requireUserExists(operatorId);

        if (!isOwner(groupId, operatorId)) {
            throw new SecurityException("只有群主才能解散群组");
        }

        List<Long> activeMemberIds = groupMemberMapper.selectMembersByGroupId(groupId).stream()
                .map(GroupMember::getUserId)
                .filter(Objects::nonNull)
                .distinct()
                .collect(Collectors.toList());
        groupMemberMapper.delete(new LambdaQueryWrapper<GroupMember>().eq(GroupMember::getGroupId, groupId));
        groupMapper.deleteById(groupId);

        publishGroupMembershipInvalidation("DISBAND", groupId, activeMemberIds);
        log.info("用户 {} 解散了群组 {}", operatorId, groupId);
    }
    
    @Override
    @Transactional
    public void setAdmin(Long groupId, Long operatorId, Long userId, Boolean isAdmin) {
        validateGroupExists(groupId);
        requireUserExists(operatorId);
        requireUserExists(userId);

        if (!isOwner(groupId, operatorId)) {
            throw new SecurityException("只有群主才能设置管理员");
        }

        GroupMember member = findGroupMember(groupId, userId);

        if (isOwner(groupId, userId)) {
            throw new IllegalArgumentException("不能对群主进行操作");
        }

        int newRole = isAdmin ? 2 : 1; // 2=管理员, 1=普通成员
        if (member.getRole() != newRole) {
            member.setRole(newRole);
            groupMemberMapper.updateById(member);
            log.info("用户 {} 在群组 {} 中将用户 {} 设置为 {}", operatorId, groupId, userId, isAdmin ? "管理员" : "普通成员");
        }
    }
    
    @Override
    @Transactional
    public GroupInfoDTO updateGroupInfo(Long groupId, Long operatorId, String groupName, String description) {
        validateGroupExists(groupId);
        requireUserExists(operatorId);
        validateUserPermission(operatorId, groupId, 2); // 至少是管理员

        Group group = findGroupById(groupId);

        if (groupName != null && !groupName.trim().isEmpty()) {
            group.setName(groupName.trim());
        }
        if (description != null) {
            group.setAnnouncement(description);
        }

        groupMapper.updateById(group);
        Group savedGroup = group;
        log.info("用户 {} 更新了群组 {} 的信息", operatorId, groupId);

        return convertToGroupInfoDTO(savedGroup);
    }
    
    @Override
    public GroupMemberPageDTO getGroupMembers(Long groupId, Long cursor, Integer limit) {
        validateGroupExists(groupId);
        int pageSize = limit == null ? 20 : limit;
        List<GroupMember> members;
        if (cursor == null) {
            members = groupMemberMapper.selectList(new LambdaQueryWrapper<GroupMember>()
                    .eq(GroupMember::getGroupId, groupId)
                    .eq(GroupMember::getStatus, true)
                    .orderByDesc(GroupMember::getJoinTime)
                    .last("limit " + pageSize));
        } else {
            GroupMember cursorMember = groupMemberMapper.selectById(cursor);
            if (cursorMember == null
                    || !Objects.equals(cursorMember.getGroupId(), groupId)
                    || !Boolean.TRUE.equals(cursorMember.getStatus())) {
                throw new IllegalArgumentException("无效的cursor");
            }
            LocalDateTime cursorTime = cursorMember.getJoinTime();
            members = groupMemberMapper.selectList(new LambdaQueryWrapper<GroupMember>()
                    .eq(GroupMember::getGroupId, groupId)
                    .eq(GroupMember::getStatus, true)
                    .lt(GroupMember::getJoinTime, cursorTime)
                    .orderByDesc(GroupMember::getJoinTime)
                    .last("limit " + pageSize));
        }

        List<GroupMemberDTO> memberDTOs = members.stream()
                .map(this::convertToGroupMemberDTO)
                .filter(Objects::nonNull)
                .collect(Collectors.toList());

        Long nextCursor = null;
        if (!members.isEmpty() && members.size() == pageSize) {
            nextCursor = members.get(members.size() - 1).getId();
        }

        GroupMemberPageDTO pageDTO = new GroupMemberPageDTO();
        pageDTO.setMembers(memberDTOs);
        pageDTO.setNextCursor(nextCursor);

        return pageDTO;
    }
    

    
    @Override
    public List<GroupInfoDTO> getUserGroups(Long userId) {
        if (!userExists(userId)) {
            log.warn("getUserGroups: 用户不存在 userId={}", userId);
            return List.of();
        }
        
        List<Group> groups = groupMapper.selectGroupsByUserId(userId);
        
        return groups.stream()
                .map(this::convertToGroupInfoDTO)
                .collect(Collectors.toList());
    }
    
    private Group findGroupById(Long groupId) {
        Group group = groupMapper.selectById(groupId);
        if (group == null) {
            throw new IllegalArgumentException("群组不存在: " + groupId);
        }
        return group;
    }
    
    private boolean isMember(Long groupId, Long userId) {
        return groupMemberMapper.existsActiveMember(groupId, userId);
    }
    

    
    private boolean isAdmin(Long groupId, Long userId) {
        return getUserRoleInGroup(groupId, userId) == 2;
    }
    
    private boolean isOwner(Long groupId, Long userId) {
        Group group = groupMapper.selectById(groupId);
        return group != null && Objects.equals(group.getOwnerId(), userId);
    }
    
    @Override
    public GroupInfoDTO getGroupInfo(Long groupId) {
        Group group = groupMapper.selectById(groupId);
        if (group == null) {
            throw new RuntimeException("群组不存在");
        }
        return convertToGroupInfoDTO(group);
    }
    
    @Override
    public Integer getUserRoleInGroup(Long groupId, Long userId) {
        validateGroupExists(groupId);
        if (!userExists(userId)) {
            log.warn("getUserRoleInGroup: 用户不存在 userId={}", userId);
            return 0;
        }
        // 0 表示非成员
        GroupMember member = groupMemberMapper.selectOne(new LambdaQueryWrapper<GroupMember>()
                .eq(GroupMember::getGroupId, groupId)
                .eq(GroupMember::getUserId, userId)
                .eq(GroupMember::getStatus, true)
                .last("limit 1"));
        return member == null ? 0 : member.getRole();
    }
    
    private void validateGroupExists(Long groupId) {
        if (groupMapper.selectById(groupId) == null) {
            throw new IllegalArgumentException("群组不存在: " + groupId);
        }
    }

    private void validateUserPermission(Long userId, Long groupId, int requiredRole) {
        Integer userRole = getUserRoleInGroup(groupId, userId);
        if (userRole < requiredRole) {
            throw new SecurityException("权限不足");
        }
    }
    
    // 私有辅助方法
    
    /**
     * 验证用户是否存在
     */
    private void requireUserExists(Long userId) {
        if (userId == null) {
            throw new IllegalArgumentException("用户ID不能为空");
        }
        if (!userExists(userId)) {
            throw new IllegalArgumentException("用户不存在: " + userId);
        }
    }

    private boolean userExists(Long userId) {
        return userId != null && Boolean.TRUE.equals(userServiceFeignClient.exists(userId));
    }
    
    /**
     * 构建群组实体
     */
    private Group buildGroupEntity(Long ownerId,
                                   String name,
                                   Integer type,
                                   String announcement,
                                   String avatar,
                                   int initialMemberCount) {
        Group group = new Group();
        group.setName(name.trim());
        group.setOwnerId(ownerId);
        group.setType(type);
        group.setMemberCount(initialMemberCount + 1);
        group.setStatus(true);
        if (announcement != null && !announcement.isBlank()) {
            group.setAnnouncement(announcement.trim());
        }
        if (avatar != null && !avatar.isBlank()) {
            group.setAvatar(avatar.trim());
        }
        return group;
    }

    private List<Long> normalizeInitialMemberIds(Long ownerId, List<Long> memberIds) {
        if (memberIds == null || memberIds.isEmpty()) {
            return List.of();
        }
        return memberIds.stream()
                .filter(Objects::nonNull)
                .filter(memberId -> !Objects.equals(memberId, ownerId))
                .distinct()
                .collect(Collectors.toList());
    }
    
    /**
     * 添加群主为成员
     */
    private void addOwnerAsMember(Long groupId, Long ownerId) {
        GroupMember ownerMember = new GroupMember();
        ownerMember.setGroupId(groupId);
        ownerMember.setUserId(ownerId);
        ownerMember.setRole(3); // 群主
        ownerMember.setStatus(true);
        ownerMember.setJoinTime(LocalDateTime.now());
        groupMemberMapper.insert(ownerMember);
    }
    
    /**
     * 添加成员到群组
     */
    private void addMemberToGroup(Long groupId, Long userId, int role) {
        GroupMember member = new GroupMember();
        member.setGroupId(groupId);
        member.setUserId(userId);
        member.setRole(role);
        member.setStatus(true);
        member.setJoinTime(LocalDateTime.now());
        groupMemberMapper.insert(member);
    }
    
    /**
     * 从群组移除成员
     */
    private void removeMemberFromGroup(Long groupId, Long userId) {
        groupMemberMapper.update(null, new UpdateWrapper<GroupMember>()
                .eq("group_id", groupId)
                .eq("user_id", userId)
                .set("status", false));
    }

    private void publishGroupMembershipInvalidation(String changeType, Long groupId, Collection<Long> memberIds) {
        if (groupId == null) {
            return;
        }
        List<Long> affectedUserIds = memberIds == null ? List.of() : memberIds.stream()
                .filter(Objects::nonNull)
                .distinct()
                .collect(Collectors.toList());
        Map<String, Object> payload = new LinkedHashMap<>();
        payload.put("scope", SCOPE_GROUP_MEMBERSHIP);
        payload.put("changeType", changeType);
        payload.put("groupId", groupId);
        payload.put("userIds", affectedUserIds);
        publishAuthorizationCacheInvalidation("group:" + groupId, payload);
    }

    private void publishAuthorizationCacheInvalidation(String key, Map<String, Object> payload) {
        try {
            kafkaTemplate.send(authzCacheInvalidationTopic, key, OBJECT_MAPPER.writeValueAsString(payload));
        } catch (JsonProcessingException exception) {
            log.warn("Serialize authz cache invalidation event failed. key={}, error={}",
                    key, exception.getMessage(), exception);
        } catch (Exception exception) {
            log.warn("Publish authz cache invalidation event failed. key={}, error={}",
                    key, exception.getMessage(), exception);
        }
    }
    
    /**
     * 转换Group实体为GroupInfoDTO
     */
    private GroupInfoDTO convertToGroupInfoDTO(Group group) {
        UserDTO owner = group.getOwnerId() == null ? null : userServiceFeignClient.getUser(group.getOwnerId());
        return GroupInfoDTO.builder()
                .id(group.getId())
                .name(group.getName())
                .type(Integer.valueOf(group.getType()))
                .announcement(group.getAnnouncement())
                .avatar(group.getAvatar())
                .ownerId(group.getOwnerId())
                .ownerName(owner == null ? null : Optional.ofNullable(owner.getNickname()).orElse(owner.getUsername()))
                .memberCount(group.getMemberCount())
                .maxMembers(group.getMaxMembers())
                .isMuted(false)
                .createTime(group.getCreatedTime())
                .updateTime(group.getUpdatedTime())
                .build();
    }
    
    /**
     * 转换GroupMember实体为GroupMemberDTO
     */
    private GroupMemberDTO convertToGroupMemberDTO(GroupMember member) {
        UserDTO user = userServiceFeignClient.getUser(member.getUserId());
        if (user == null) {
            return null;
        }
        return GroupMemberDTO.builder()
                .groupId(member.getGroupId())
                .userId(member.getUserId())
                .username(user.getUsername())
                .nickname(user.getNickname())
                .avatar(user.getAvatar())
                .role(member.getRole())
                .roleName(resolveRoleName(member.getRole()))
                .isOnline(false)
                .joinTime(member.getJoinTime())
                .lastActiveTime(user.getLastLoginTime())
                .build();
    }

    private String resolveRoleName(Integer role) {
        if (role == null) {
            return "普通成员";
        }
        return switch (role) {
            case 2 -> "管理员";
            case 3 -> "群主";
            default -> "普通成员";
        };
    }

    private GroupMember findGroupMember(Long groupId, Long userId) {
        GroupMember member = groupMemberMapper.selectOne(new LambdaQueryWrapper<GroupMember>()
                .eq(GroupMember::getGroupId, groupId)
                .eq(GroupMember::getUserId, userId)
                .eq(GroupMember::getStatus, true)
                .last("limit 1"));
        if (member == null) {
            throw new IllegalArgumentException("用户 " + userId + " 不是群组 " + groupId + " 的成员");
        }
        return member;
    }

    private void updateMemberCount(Long groupId, int delta) {
        groupMapper.update(null, new UpdateWrapper<Group>()
                .eq("id", groupId)
                .setSql("member_count = member_count + " + delta));
    }
}
