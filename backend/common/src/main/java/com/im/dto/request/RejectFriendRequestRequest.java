package com.im.dto.request;

import lombok.Data;

import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

/**
 * 拒绝好友请求
 */
@Data
public class RejectFriendRequestRequest {
    
    @NotNull(message = "好友申请ID不能为空")
    private Long requestId;
    
    @Size(max = 200, message = "拒绝理由不能超过200个字符")
    private String reason;
}
