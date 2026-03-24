package com.im.dto;

import lombok.Data;
import lombok.AllArgsConstructor;
import lombok.NoArgsConstructor;
import lombok.Builder;

import java.time.LocalDateTime;

/**
 * 群组成员DTO
 */
@Data
@Builder
@AllArgsConstructor
@NoArgsConstructor
public class GroupMemberDTO {
    private Long groupId;
    private Long userId;
    private String username;
    private String nickname;
    private String avatar;
    private Integer role; // 0-非成员, 1-普通成员, 2-管理员, 3-群主
    private String roleName;
    private Boolean isOnline;
    private LocalDateTime joinTime;
    private LocalDateTime lastActiveTime;
}
