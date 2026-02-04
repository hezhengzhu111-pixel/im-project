package com.im.dto;

import lombok.Data;
import lombok.AllArgsConstructor;
import lombok.NoArgsConstructor;
import lombok.Builder;

import java.time.LocalDateTime;
import java.util.List;

/**
 * 消息已读状态DTO
 */
@Data
@Builder
@AllArgsConstructor
@NoArgsConstructor
public class MessageReadStatusDTO {
    private Long messageId;
    private Long totalReceivers;
    private Long readCount;
    private Long unreadCount;
    private List<ReadUserInfo> readUsers;
    private List<ReadUserInfo> unreadUsers;
    
    @Data
    @Builder
    @AllArgsConstructor
    @NoArgsConstructor
    public static class ReadUserInfo {
        private Long userId;
        private String username;
        private String nickname;
        private String avatar;
        private LocalDateTime readTime;
    }
}