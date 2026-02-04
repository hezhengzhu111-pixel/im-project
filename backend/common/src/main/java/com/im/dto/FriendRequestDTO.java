package com.im.dto;

import lombok.Data;
import lombok.AllArgsConstructor;
import lombok.NoArgsConstructor;
import lombok.Builder;

import java.time.LocalDateTime;

/**
 * 好友请求DTO
 */
@Data
@Builder
@AllArgsConstructor
@NoArgsConstructor
public class FriendRequestDTO {
    private String id;
    private String applicantId;
    private String applicantUsername;
    private String applicantNickname;
    private String applicantAvatar;
    private String targetUserId;
    private String targetUsername;
    private String targetNickname;
    private String reason;
    private String status; // 待处理, 已同意, 已拒绝
    private String rejectReason;
    private LocalDateTime createTime;
    private LocalDateTime updateTime;
}