package com.im.dto.request;

import lombok.Data;

import jakarta.validation.constraints.Positive;

/**
 * 获取好友申请记录请求
 */
@Data
public class GetFriendRequestsRequest {
    
    private String cursor;
    
    @Positive(message = "每页数量必须大于0")
    private Integer limit = 20;
}
