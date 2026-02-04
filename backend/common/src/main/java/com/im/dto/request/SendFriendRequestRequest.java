package com.im.dto.request;

import lombok.Data;

import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

/**
 * 发送好友请求
 */
@Data
public class SendFriendRequestRequest {
    
    @NotNull(message = "目标用户ID不能为空")
    private String targetUserId;
    
    @Size(max = 200, message = "申请理由不能超过200个字符")
    private String reason;
}
