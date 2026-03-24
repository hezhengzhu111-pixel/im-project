package com.im.dto.request;

import lombok.Data;

import jakarta.validation.constraints.NotNull;

/**
 * 获取用户在群组中的角色请求
 */
@Data
public class GetUserRoleRequest {
    
    @NotNull(message = "群组ID不能为空")
    private Long groupId;
    
    @NotNull(message = "用户ID不能为空")
    private Long userId;
}
