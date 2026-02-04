package com.im.util;

import com.im.dto.*;
import com.im.entity.*;
import com.im.feign.ImServerFeignClient;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;

import java.util.Collections;
import java.util.Map;

@Slf4j
@Component
public class DTOConverter {
    
    @Autowired
    private ImServerFeignClient imServerFeignClient;
    
    /**
     * User实体转UserDTO
     */
    public UserDTO toUserDTO(User user) {
        if (user == null) {
            return null;
        }
        return UserDTO.builder()
                .id(user.getId().toString())
                .username(user.getUsername())
                .nickname(user.getNickname())
                .avatar(user.getAvatar())
                .email(user.getEmail())
                .phone(user.getPhone())
                .status(user.getStatus())
                .createTime(user.getCreatedTime())
                .updateTime(user.getUpdatedTime())
                .build();
    }

    /**
     * Friend实体转FriendListDTO
     */
    public FriendListDTO toFriendListDTO(Friend friend, User friendUser) {
        if (friend == null || friendUser == null) {
            return null;
        }
        
        boolean isOnline = false;
        if (imServerFeignClient != null) {
            try {
                ApiResponse<Map<String, Boolean>> resp = imServerFeignClient.heartbeat(
                        Collections.singletonList(friendUser.getId().toString())
                );
                Map<String, Boolean> onlineStatus = resp == null ? null : resp.getData();
                if (onlineStatus != null) {
                    isOnline = onlineStatus.getOrDefault(friendUser.getId().toString(), false);
                }
            } catch (Exception e) {
                log.warn("获取在线状态失败: userId={}", friendUser.getId(), e);
            }
        }
        
        return FriendListDTO.builder()
                .friendId(friendUser.getId().toString())
                .username(friendUser.getUsername())
                .nickname(friendUser.getNickname())
                .avatar(friendUser.getAvatar())
                .remark(friend.getRemark())
                .isOnline(isOnline)
                .lastActiveTime(friendUser.getLastLoginTime())
                .createdAt(friend.getCreatedTime())
                .build();
    }
    
    /**
     * FriendRequest实体转FriendRequestDTO
     */
    public FriendRequestDTO toFriendRequestDTO(FriendRequest request, User applicant, User target) {
        if (request == null) {
            return null;
        }
        return FriendRequestDTO.builder()
                .id(request.getId().toString())
                .applicantId(request.getApplicantId().toString())
                .applicantUsername(applicant != null ? applicant.getUsername() : null)
                .applicantNickname(applicant != null ? applicant.getNickname() : null)
                .applicantAvatar(applicant != null ? applicant.getAvatar() : null)
                .targetUserId(request.getTargetUserId().toString())
                .targetUsername(target != null ? target.getUsername() : null)
                .targetNickname(target != null ? target.getNickname() : null)
                .reason(request.getApplyReason())
                .status(convertStatusToString(request.getStatus()))
                .rejectReason(request.getRejectReason())
                .createTime(request.getApplyTime())
                .updateTime(request.getHandleTime())
                .build();
    }
    
    /**
     * 将状态码转换为字符串描述
     * @param status 状态码 (0-待处理, 1-已同意, 2-已拒绝)
     * @return 状态描述
     */
    private String convertStatusToString(Integer status) {
        if (status == null) {
            return "未知";
        }
        switch (status) {
            case 0: return "待处理";
            case 1: return "已同意";
            case 2: return "已拒绝";
            default: return "未知";
        }
    }
}
