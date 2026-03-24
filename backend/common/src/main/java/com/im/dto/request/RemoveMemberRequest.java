package com.im.dto.request;

import lombok.Data;
import jakarta.validation.constraints.NotNull;

/**
 * 移除群成员请求DTO
 */
@Data
public class RemoveMemberRequest {
    
    /**
     * 群组ID
     */
    @NotNull(message = "群组ID不能为空")
    private Long groupId;
    
    /**
     * 操作者ID
     */
    @NotNull(message = "操作者ID不能为空")
    private Long operatorId;
    
    /**
     * 被移除的用户ID
     */
    @NotNull(message = "被移除的用户ID不能为空")
    private Long userId;
}
