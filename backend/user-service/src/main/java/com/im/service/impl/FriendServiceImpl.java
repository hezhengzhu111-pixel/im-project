package com.im.service.impl;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.conditions.update.UpdateWrapper;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.im.common.PageResult;
import com.im.dto.FriendListDTO;
import com.im.dto.FriendRequestDTO;
import com.im.dto.FriendRequestResponseDTO;
import com.im.dto.MessageDTO;
import com.im.enums.MessageType;
import com.im.mapper.FriendMapper;
import com.im.mapper.FriendRequestMapper;
import com.im.mapper.UserMapper;
import com.im.service.FriendService;
import com.im.service.ImService;
import com.im.user.entity.Friend;
import com.im.user.entity.FriendRequest;
import com.im.user.entity.User;
import com.im.util.DTOConverter;
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
public class FriendServiceImpl implements FriendService {

    private static final String AUTHZ_CACHE_INVALIDATION_TOPIC = "im-authz-cache-invalidation-topic";
    private static final String SCOPE_FRIEND_RELATION = "FRIEND_RELATION";
    private static final ObjectMapper OBJECT_MAPPER = new ObjectMapper();

    
    private final FriendMapper friendMapper;
    private final FriendRequestMapper friendRequestMapper;
    private final UserMapper userMapper;
    private final DTOConverter dtoConverter;
    private final ImService imService;
    private final KafkaTemplate<String, String> kafkaTemplate;

    @Value("${im.kafka.authz-cache-invalidation-topic:im-authz-cache-invalidation-topic}")
    private String authzCacheInvalidationTopic = AUTHZ_CACHE_INVALIDATION_TOPIC;
    
    @Override
    @Transactional
    public FriendRequestResponseDTO sendFriendRequest(Long applicantId, Long targetUserId, String reason) {
        // ... 省略之前的检查代码 ...
        // 检查目标用户是否存在
        Long userCount = userMapper.selectCount(new LambdaQueryWrapper<User>()
                .eq(User::getId, targetUserId));
        if (userCount == null || userCount == 0) {
            return FriendRequestResponseDTO.error("目标用户不存在");
        }
        
        // 不能添加自己为好友
        if (applicantId.equals(targetUserId)) {
            return FriendRequestResponseDTO.error("不能添加自己为好友");
        }
        
        // 检查是否已经是好友
        if (isFriend(applicantId, targetUserId)) {
            return FriendRequestResponseDTO.error("已经是好友关系");
        }
        
        // 检查是否被拉黑
        if (isBlocked(targetUserId, applicantId)) {
            return FriendRequestResponseDTO.error("无法发送好友请求");
        }
        
        // 检查是否已有待处理的申请（双向互斥）
        Long pending1 = friendRequestMapper.selectCount(new LambdaQueryWrapper<FriendRequest>()
                .eq(FriendRequest::getApplicantId, applicantId)
                .eq(FriendRequest::getTargetUserId, targetUserId)
                .eq(FriendRequest::getStatus, 0));
        Long pending2 = friendRequestMapper.selectCount(new LambdaQueryWrapper<FriendRequest>()
                .eq(FriendRequest::getApplicantId, targetUserId)
                .eq(FriendRequest::getTargetUserId, applicantId)
                .eq(FriendRequest::getStatus, 0));
        if ((pending1 != null && pending1 > 0) || (pending2 != null && pending2 > 0)) {
            return FriendRequestResponseDTO.error("已有待处理的好友申请");
        }
        
        // 创建好友申请
        FriendRequest request = new FriendRequest();
        request.setApplicantId(applicantId);
        request.setTargetUserId(targetUserId);
        request.setApplyReason(reason);
        request.setStatus(0);
        request.setApplyTime(LocalDateTime.now());
        
        try {
            friendRequestMapper.insert(request);
            FriendRequest savedRequest = request;
            
            // 给目标用户发送通知
            sendSystemNotice(targetUserId, "收到新的好友申请::CMD:REFRESH_FRIEND_REQUESTS");
            // 给申请人发送通知
            sendSystemNotice(applicantId, "好友申请发送成功::CMD:REFRESH_FRIEND_REQUESTS");
            
            return FriendRequestResponseDTO.success("好友申请发送成功", savedRequest.getId());
        } catch (Exception e) {
            log.error("发送好友申请失败", e);
            return FriendRequestResponseDTO.error("发送失败: " + e.getMessage());
        }
    }
    
    @Override
    @Transactional
    public FriendRequestResponseDTO acceptFriendRequest(Long currentUserId, Long requestId) {
        // ... 省略之前的代码 ...
        // 根据requestId查找好友申请
        FriendRequest request = friendRequestMapper.selectById(requestId);
        if (request == null) {
            return FriendRequestResponseDTO.error("未找到好友申请记录");
        }
        
        // 验证当前用户是否为申请的目标用户
        if (!request.getTargetUserId().equals(currentUserId)) {
            return FriendRequestResponseDTO.error("无权限处理此好友申请");
        }
        
        // 验证申请状态
        if (request.getStatus() != 0) {
            return FriendRequestResponseDTO.error("该好友申请已被处理");
        }
        
        try {
            // 更新申请状态
            request.setStatus(1);
            request.setHandleTime(LocalDateTime.now());
            friendRequestMapper.updateById(request);
            
            // 创建双向好友关系
            createFriendship(currentUserId, request.getApplicantId());
            createFriendship(request.getApplicantId(), currentUserId);
            
            // 发送通知给申请人
            MessageDTO messageDTO = new MessageDTO();
            messageDTO.setMessageType(MessageType.SYSTEM);
            messageDTO.setReceiverId(request.getApplicantId());
            // 携带特殊指令，前端识别后自动刷新好友列表
            messageDTO.setContent("您的好友申请已被同意::CMD:REFRESH_FRIEND_LIST");
            messageDTO.setCreatedTime(LocalDateTime.now());
            imService.sendSystemMessage(messageDTO.getReceiverId(), messageDTO.getContent());
            publishFriendRelationInvalidation("ADD", currentUserId, request.getApplicantId());
            
            log.info("用户{}同意了用户{}的好友申请", currentUserId, request.getApplicantId());
            
            return FriendRequestResponseDTO.success("已同意好友申请", request.getId());
        } catch (Exception e) {
            log.error("同意好友申请失败", e);
            return FriendRequestResponseDTO.error("处理失败: " + e.getMessage());
        }
    }
    
    @Override
    @Transactional
    public FriendRequestResponseDTO rejectFriendRequest(Long currentUserId, Long requestId, String reason) {
        // 根据requestId查找好友申请
        FriendRequest request = friendRequestMapper.selectById(requestId);
        if (request == null) {
            return FriendRequestResponseDTO.error("未找到好友申请记录");
        }
        
        // 验证当前用户是否为申请的目标用户
        if (!request.getTargetUserId().equals(currentUserId)) {
            return FriendRequestResponseDTO.error("无权限处理此好友申请");
        }
        
        // 验证申请状态
        if (request.getStatus() != 0) {
            return FriendRequestResponseDTO.error("该好友申请已被处理");
        }
        
        try {
            request.setStatus(2);
            request.setRejectReason(reason);
            request.setHandleTime(LocalDateTime.now());
            friendRequestMapper.updateById(request);

            sendSystemNotice(request.getApplicantId(), "您的好友申请已被拒绝::CMD:REFRESH_FRIEND_REQUESTS");
            log.info("用户{}拒绝了用户{}的好友申请", currentUserId, request.getApplicantId());
            
            return FriendRequestResponseDTO.success("已拒绝好友申请", request.getId());
        } catch (Exception e) {
            log.error("拒绝好友申请失败", e);
            return FriendRequestResponseDTO.error("处理失败: " + e.getMessage());
        }
    }
    
    @Override
    @Transactional
    public FriendRequestResponseDTO removeFriend(Long userId, Long friendUserId) {
        if (!hasActiveRelation(userId, friendUserId)) {
            return FriendRequestResponseDTO.error("不是好友关系");
        }
        
        try {
            // 删除双向好友关系
            friendMapper.update(null, new UpdateWrapper<Friend>()
                    .set("status", 2)
                    .in("status", 1, 3)
                    .and(w -> w.eq("user_id", userId).eq("friend_id", friendUserId)
                            .or()
                            .eq("user_id", friendUserId).eq("friend_id", userId)));

            publishFriendRelationInvalidation("DELETE", userId, friendUserId);
            sendSystemNotice(friendUserId, "对方已解除好友关系::CMD:REFRESH_FRIEND_LIST");
            log.info("用户{}删除了好友{}", userId, friendUserId);
            
            return FriendRequestResponseDTO.success("已删除好友", null);
        } catch (Exception e) {
            log.error("删除好友失败", e);
            return FriendRequestResponseDTO.error("删除失败: " + e.getMessage());
        }
    }
    
    @Override
    @Transactional
    public FriendRequestResponseDTO blockUser(Long userId, Long targetUserId) {
        if (userId.equals(targetUserId)) {
            return FriendRequestResponseDTO.error("不能拉黑自己");
        }
        
        try {
            // 查找或创建关系记录
            Friend friend = friendMapper.selectOne(new LambdaQueryWrapper<Friend>()
                    .eq(Friend::getUserId, userId)
                    .eq(Friend::getFriendId, targetUserId)
                    .last("limit 1"));
            if (friend == null) {
                friend = new Friend();
                friend.setUserId(userId);
                friend.setFriendId(targetUserId);
            }
            
            friend.setStatus(3); // 拉黑状态
            if (friend.getId() == null) {
                friendMapper.insert(friend);
            } else {
                friendMapper.updateById(friend);
            }

            publishFriendRelationInvalidation("BLOCK", userId, targetUserId);
            sendSystemNotice(targetUserId, "对方已将您加入黑名单::CMD:REFRESH_FRIEND_LIST");
            log.info("用户{}拉黑了用户{}", userId, targetUserId);
            
            return FriendRequestResponseDTO.success("已拉黑用户", null);
        } catch (Exception e) {
            log.error("拉黑用户失败", e);
            return FriendRequestResponseDTO.error("拉黑失败: " + e.getMessage());
        }
    }
    
    @Override
    public List<FriendListDTO> getFriendList(Long userId) {
        List<Friend> friends = friendMapper.selectList(new LambdaQueryWrapper<Friend>()
                .eq(Friend::getUserId, userId)
                .eq(Friend::getStatus, 1));
        if (friends == null || friends.isEmpty()) {
            return List.of();
        }
        List<Long> friendIds = friends.stream()
                .map(Friend::getFriendId)
                .filter(Objects::nonNull)
                .distinct()
                .collect(Collectors.toList());
        Map<Long, User> userMap = loadUsersByIds(friendIds);
        Map<String, Boolean> onlineStatusMap = loadOnlineStatusMap(friendIds);
        return friends.stream()
                .map(friend -> buildFriendListDTO(friend, userMap.get(friend.getFriendId()), onlineStatusMap))
                .filter(Objects::nonNull)
                .collect(Collectors.toList());
    }
    
    @Override
    public PageResult<FriendRequestDTO> getFriendRequests(Long userId, String cursor, Integer limit) {
        int pageSize = limit != null ? limit : 20;
        List<FriendRequest> requests;
        
        if (cursor != null && !cursor.isEmpty()) {
            Long cursorId = Long.parseLong(cursor);
            requests = friendRequestMapper.selectList(new LambdaQueryWrapper<FriendRequest>()
                    .and(w -> w.eq(FriendRequest::getTargetUserId, userId)
                              .or()
                              .eq(FriendRequest::getApplicantId, userId))
                    .lt(FriendRequest::getId, cursorId)
                    .orderByDesc(FriendRequest::getId)
                    .last("limit " + pageSize));
        } else {
            requests = friendRequestMapper.selectList(new LambdaQueryWrapper<FriendRequest>()
                    .and(w -> w.eq(FriendRequest::getTargetUserId, userId)
                              .or()
                              .eq(FriendRequest::getApplicantId, userId))
                    .orderByDesc(FriendRequest::getId)
                    .last("limit " + pageSize));
        }
        
        List<Long> relatedUserIds = requests.stream()
                .flatMap(request -> Arrays.stream(new Long[]{request.getApplicantId(), request.getTargetUserId()}))
                .filter(Objects::nonNull)
                .distinct()
                .collect(Collectors.toList());
        Map<Long, User> userMap = loadUsersByIds(relatedUserIds);
        List<FriendRequestDTO> requestList = requests.stream()
                .map(request -> {
                    User applicant = userMap.get(request.getApplicantId());
                    User target = userMap.get(request.getTargetUserId());
                    if (applicant == null) {
                        return null;
                    }
                    return dtoConverter.toFriendRequestDTO(request, applicant, target);
                })
                .filter(Objects::nonNull)
                .collect(Collectors.toList());
        
        String nextCursor = null;
        boolean hasNext = false;
        if (!requests.isEmpty() && requests.size() == pageSize) {
            nextCursor = String.valueOf(requests.get(requests.size() - 1).getId());
            hasNext = true;
        }
        
        return PageResult.of(requestList, nextCursor, hasNext);
    }
    
    @Override
    public List<FriendListDTO> getBlockList(Long userId) {
        List<Friend> blockedUsers = friendMapper.selectList(new LambdaQueryWrapper<Friend>()
                .eq(Friend::getUserId, userId)
                .eq(Friend::getStatus, 3));
        if (blockedUsers == null || blockedUsers.isEmpty()) {
            return List.of();
        }
        List<Long> blockedIds = blockedUsers.stream()
                .map(Friend::getFriendId)
                .filter(Objects::nonNull)
                .distinct()
                .collect(Collectors.toList());
        Map<Long, User> userMap = loadUsersByIds(blockedIds);
        Map<String, Boolean> onlineStatusMap = loadOnlineStatusMap(blockedIds);
        return blockedUsers.stream()
                .map(friend -> buildFriendListDTO(friend, userMap.get(friend.getFriendId()), onlineStatusMap))
                .filter(Objects::nonNull)
                .collect(Collectors.toList());
    }
    
    @Override
    public boolean isFriend(Long userId, Long friendId) {
        Long count = friendMapper.selectCount(new LambdaQueryWrapper<Friend>()
                .eq(Friend::getUserId, userId)
                .eq(Friend::getFriendId, friendId)
                .eq(Friend::getStatus, 1));
        return count != null && count > 0;
    }
    
    @Override
    public boolean isBlocked(Long userId, Long targetId) {
        Long count = friendMapper.selectCount(new LambdaQueryWrapper<Friend>()
                .eq(Friend::getUserId, userId)
                .eq(Friend::getFriendId, targetId)
                .eq(Friend::getStatus, 3));
        return count != null && count > 0;
    }
    
    @Override
    public List<FriendRequest> getPendingRequests(Long userId) {
        return friendRequestMapper.selectList(new LambdaQueryWrapper<FriendRequest>()
                .eq(FriendRequest::getTargetUserId, userId)
                .eq(FriendRequest::getStatus, 0)
                .orderByDesc(FriendRequest::getId));
    }
    
    /**
     * 创建好友关系
     */
    private void createFriendship(Long userId, Long friendId) {
        Friend friend = new Friend();
        friend.setUserId(userId);
        friend.setFriendId(friendId);
        friend.setStatus(1);
        friendMapper.insert(friend);
    }
    
    @Override
    public List<User> getFriends(Long userId) {
        try {
            // 获取好友ID列表
            List<Friend> friends = friendMapper.selectList(new LambdaQueryWrapper<Friend>()
                    .select(Friend::getFriendId)
                    .eq(Friend::getUserId, userId)
                    .eq(Friend::getStatus, 1));
            List<Long> friendIds = friends.stream().map(Friend::getFriendId).collect(Collectors.toList());
            
            if (friendIds.isEmpty()) {
                return new ArrayList<>();
            }
            
            // 根据好友ID列表获取用户信息
            return userMapper.selectBatchIds(friendIds);
        } catch (Exception e) {
            log.error("获取好友列表失败，用户ID: {}", userId, e);
            return new ArrayList<>();
        }
    }
    
    @Override
    @Transactional
    public FriendRequestResponseDTO updateFriendRemark(Long userId, Long friendUserId, String remark) {
        if (!hasActiveRelation(userId, friendUserId)) {
            return FriendRequestResponseDTO.error("不是好友关系");
        }
        
        try {
            // 查找好友关系记录
            Friend friend = friendMapper.selectOne(new LambdaQueryWrapper<Friend>()
                    .eq(Friend::getUserId, userId)
                    .eq(Friend::getFriendId, friendUserId)
                    .last("limit 1"));
            if (friend == null) {
                return FriendRequestResponseDTO.error("未找到好友关系记录");
            }
            
            // 更新备注
            friend.setRemark(remark);
            friendMapper.updateById(friend);
            
            log.info("用户{}更新了好友{}的备注: {}", userId, friendUserId, remark);
            
            return FriendRequestResponseDTO.success("备注更新成功", null);
        } catch (Exception e) {
            log.error("更新好友备注失败", e);
            return FriendRequestResponseDTO.error("更新失败: " + e.getMessage());
        }
    }

    private boolean hasActiveRelation(Long userId, Long friendId) {
        Long count = friendMapper.selectCount(new LambdaQueryWrapper<Friend>()
                .eq(Friend::getUserId, userId)
                .eq(Friend::getFriendId, friendId)
                .in(Friend::getStatus, 1, 3));
        return count != null && count > 0;
    }

    private void publishFriendRelationInvalidation(String changeType, Long userId, Long peerUserId) {
        if (userId == null || peerUserId == null) {
            return;
        }
        Map<String, Object> payload = new LinkedHashMap<>();
        payload.put("scope", SCOPE_FRIEND_RELATION);
        payload.put("changeType", changeType);
        payload.put("userIds", List.of(userId, peerUserId));
        publishAuthorizationCacheInvalidation("friend:" + userId + ":" + peerUserId, payload);
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

    private void sendSystemNotice(Long receiverId, String content) {
        try {
            MessageDTO messageDTO = new MessageDTO();
            messageDTO.setMessageType(MessageType.SYSTEM);
            messageDTO.setReceiverId(receiverId);
            messageDTO.setContent(content);
            messageDTO.setCreatedTime(LocalDateTime.now());
            imService.sendSystemMessage(messageDTO.getReceiverId(), messageDTO.getContent());
        } catch (Exception e) {
            log.warn("发送系统通知失败: receiverId={}, content={}", receiverId, content, e);
        }
    }

    private Map<Long, User> loadUsersByIds(Collection<Long> userIds) {
        if (userIds == null || userIds.isEmpty()) {
            return Map.of();
        }
        List<User> users = userMapper.selectBatchIds(userIds);
        if (users == null || users.isEmpty()) {
            return Map.of();
        }
        return users.stream()
                .filter(Objects::nonNull)
                .collect(Collectors.toMap(User::getId, user -> user, (a, b) -> a));
    }

    private Map<String, Boolean> loadOnlineStatusMap(Collection<Long> userIds) {
        if (userIds == null || userIds.isEmpty()) {
            return Map.of();
        }
        List<String> ids = userIds.stream()
                .filter(Objects::nonNull)
                .map(String::valueOf)
                .collect(Collectors.toList());
        Map<String, Boolean> onlineStatusMap = imService.checkUsersOnlineStatus(ids);
        return onlineStatusMap == null ? Map.of() : onlineStatusMap;
    }

    private FriendListDTO buildFriendListDTO(Friend friend, User friendUser, Map<String, Boolean> onlineStatusMap) {
        if (friend == null || friendUser == null) {
            return null;
        }
        return FriendListDTO.builder()
                .friendId(friendUser.getId() == null ? null : friendUser.getId().toString())
                .username(friendUser.getUsername())
                .nickname(friendUser.getNickname())
                .avatar(friendUser.getAvatar())
                .remark(friend.getRemark())
                .isOnline(Boolean.TRUE.equals(onlineStatusMap.getOrDefault(String.valueOf(friendUser.getId()), false)))
                .lastActiveTime(friendUser.getLastLoginTime())
                .createdAt(friend.getCreatedTime())
                .build();
    }
}
