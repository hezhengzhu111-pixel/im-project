package com.im.service.impl;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.conditions.update.LambdaUpdateWrapper;
import com.im.common.PageResult;
import com.im.dto.*;
import com.im.entity.Friend;
import com.im.entity.FriendRequest;
import com.im.entity.User;
import com.im.mapper.FriendMapper;
import com.im.mapper.FriendRequestMapper;
import com.im.mapper.UserMapper;
import com.im.service.FriendService;
import com.im.util.DTOConverter;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.*;
import java.util.stream.Collectors;

import com.im.enums.MessageType;
import com.im.service.ImService;

@Service
@RequiredArgsConstructor
@Slf4j
public class FriendServiceImpl implements FriendService {

    
    private final FriendMapper friendMapper;
    private final FriendRequestMapper friendRequestMapper;
    private final UserMapper userMapper;
    private final DTOConverter dtoConverter;
    private final ImService imService;
    
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
            
            // 构造系统通知消息
            MessageDTO messageDTO = new MessageDTO();
            messageDTO.setMessageType(MessageType.SYSTEM);
            messageDTO.setReceiverId(targetUserId);
            // 携带特殊指令，前端识别后自动刷新好友申请列表
            messageDTO.setContent("收到新的好友申请::CMD:REFRESH_FRIEND_REQUESTS");
            messageDTO.setCreatedTime(LocalDateTime.now());
            // 发送通知
            imService.sendMessage(messageDTO);
            
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
            imService.sendMessage(messageDTO);
            
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
            
            // TODO: 触发事件 OnFriendApplicationRejected
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
            friendMapper.update(null, new LambdaUpdateWrapper<Friend>()
                    .set(Friend::getStatus, 2)
                    .in(Friend::getStatus, 1, 3)
                    .and(w -> w.eq(Friend::getUserId, userId).eq(Friend::getFriendId, friendUserId)
                            .or()
                            .eq(Friend::getUserId, friendUserId).eq(Friend::getFriendId, userId)));
            
            // TODO: 触发事件 OnFriendDeleted
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
            
            // TODO: 触发事件 OnBlackAdded
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
        
        return friends.stream().map(friend -> {
            User friendUser = userMapper.selectById(friend.getFriendId());
            if (friendUser == null) return null;
            
            return dtoConverter.toFriendListDTO(friend, friendUser);
        }).filter(Objects::nonNull).collect(Collectors.toList());
    }
    
    @Override
    public PageResult<FriendRequestDTO> getFriendRequests(Long userId, String cursor, Integer limit) {
        int pageSize = limit != null ? limit : 20;
        List<FriendRequest> requests;
        
        if (cursor != null && !cursor.isEmpty()) {
            Long cursorId = Long.parseLong(cursor);
            requests = friendRequestMapper.selectList(new LambdaQueryWrapper<FriendRequest>()
                    .eq(FriendRequest::getTargetUserId, userId)
                    .lt(FriendRequest::getId, cursorId)
                    .orderByDesc(FriendRequest::getId)
                    .last("limit " + pageSize));
        } else {
            requests = friendRequestMapper.selectList(new LambdaQueryWrapper<FriendRequest>()
                    .eq(FriendRequest::getTargetUserId, userId)
                    .orderByDesc(FriendRequest::getId)
                    .last("limit " + pageSize));
        }
        
        List<FriendRequestDTO> requestList = requests.stream().map(request -> {
            User applicant = userMapper.selectById(request.getApplicantId());
            User target = userMapper.selectById(request.getTargetUserId());
            if (applicant == null) return null;
            
            return dtoConverter.toFriendRequestDTO(request, applicant, target);
        }).filter(Objects::nonNull).collect(Collectors.toList());
        
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
        
        return blockedUsers.stream().map(friend -> {
            User blockedUser = userMapper.selectById(friend.getFriendId());
            if (blockedUser == null) return null;
            
            return dtoConverter.toFriendListDTO(friend, blockedUser);
        }).filter(Objects::nonNull).collect(Collectors.toList());
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
}
