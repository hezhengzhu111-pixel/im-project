package com.im.dto;

import lombok.Data;
import lombok.AllArgsConstructor;
import lombok.NoArgsConstructor;
import lombok.Builder;

import java.util.Map;

/**
 * 未读消息统计DTO
 */
@Data
@Builder
@AllArgsConstructor
@NoArgsConstructor
public class UnreadMessageCountDTO {
    private Long totalUnreadCount;
    private Long privateMessageCount;
    private Long groupMessageCount;
    private Map<Long, Long> privateUnreadDetails; // 私聊未读详情 <发送者ID, 未读数量>
    private Map<Long, Long> groupUnreadDetails;   // 群聊未读详情 <群组ID, 未读数量>
}