package com.im.dto.request;

import lombok.Data;
import jakarta.validation.constraints.NotNull;

/**
 * 退出群组请求DTO
 */
@Data
public class LeaveGroupRequest {
    
    /**
     * 群组ID
     */
    @NotNull(message = "群组ID不能为空")
    private Long groupId;
    
    /**
     * 用户ID
     */
    @NotNull(message = "用户ID不能为空")
    private Long userId;
}
