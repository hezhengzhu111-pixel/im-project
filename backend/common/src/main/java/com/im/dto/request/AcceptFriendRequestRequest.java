package com.im.dto.request;

import lombok.Data;

import jakarta.validation.constraints.NotNull;

/**
 * 接受好友请求
 */
@Data
public class AcceptFriendRequestRequest {
    
    @NotNull(message = "好友申请ID不能为空")
    private Long requestId;
}
