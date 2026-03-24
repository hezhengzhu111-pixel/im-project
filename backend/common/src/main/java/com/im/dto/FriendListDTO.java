package com.im.dto;

import lombok.Data;
import lombok.AllArgsConstructor;
import lombok.NoArgsConstructor;
import lombok.Builder;

import java.time.LocalDateTime;

/**
 * 好友列表DTO
 */
@Data
@Builder
@AllArgsConstructor
@NoArgsConstructor
public class FriendListDTO {
    private String friendId;
    private String username;
    private String nickname;
    private String avatar;
    private String remark;
    private Boolean isOnline;
    private LocalDateTime lastActiveTime;
    private LocalDateTime createdAt;
}