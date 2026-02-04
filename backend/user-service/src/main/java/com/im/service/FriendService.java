package com.im.service;

import com.im.common.PageResult;
import com.im.dto.FriendRequestResponseDTO;
import com.im.dto.FriendListDTO;
import com.im.dto.FriendRequestDTO;
import com.im.entity.Friend;
import com.im.entity.FriendRequest;
import com.im.entity.User;

import java.util.List;

public interface FriendService {
    
    /**
     * 发送好友请求
     * @param applicantId 申请人ID
     * @param targetUserId 目标用户ID
     * @param reason 申请理由
     */
    FriendRequestResponseDTO sendFriendRequest(Long applicantId, Long targetUserId, String reason);
    
    /**
     * 接受好友请求
     * @param currentUserId 当前用户ID
     * @param requestId 好友申请ID
     */
    FriendRequestResponseDTO acceptFriendRequest(Long currentUserId, Long requestId);
    
    /**
     * 拒绝好友请求
     * @param currentUserId 当前用户ID
     * @param requestId 好友申请ID
     * @param reason 拒绝理由
     */
    FriendRequestResponseDTO rejectFriendRequest(Long currentUserId, Long requestId, String reason);
    
    /**
     * 删除好友
     */
    FriendRequestResponseDTO removeFriend(Long userId, Long friendUserId);
    
    /**
     * 拉黑用户
     */
    FriendRequestResponseDTO blockUser(Long userId, Long targetUserId);
    
    /**
     * 获取好友列表
     */
    List<FriendListDTO> getFriendList(Long userId);
    
    /**
     * 获取好友申请记录（分页）
     */
    PageResult<FriendRequestDTO> getFriendRequests(Long userId, String cursor, Integer limit);
    
    /**
     * 获取黑名单列表
     */
    List<FriendListDTO> getBlockList(Long userId);
    
    /**
     * 检查是否为好友关系
     */
    boolean isFriend(Long userId, Long friendId);
    
    /**
     * 检查是否被拉黑
     */
    boolean isBlocked(Long userId, Long targetId);

    /**
     * 获取待处理的好友申请
     */
    List<FriendRequest> getPendingRequests(Long userId);
    
    /**
     * 获取用户的好友列表（User对象）
     * @param userId 用户ID
     * @return 好友用户列表
     */
    List<User> getFriends(Long userId);
    
    /**
     * 修改好友备注
     */
    FriendRequestResponseDTO updateFriendRemark(Long userId, Long friendUserId, String remark);
}