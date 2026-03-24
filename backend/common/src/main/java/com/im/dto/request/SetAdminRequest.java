package com.im.dto.request;

import lombok.Data;
import jakarta.validation.constraints.NotNull;

/**
 * 设置管理员请求DTO
 */
@Data
public class SetAdminRequest {
    
    /**
     * 群组ID
     */
    @NotNull(message = "群组ID不能为空")
    private Long groupId;
    
    /**
     * 操作者ID（群主）
     */
    @NotNull(message = "操作者ID不能为空")
    private Long operatorId;
    
    /**
     * 被设置为管理员的用户ID
     */
    @NotNull(message = "用户ID不能为空")
    private Long userId;
    
    /**
     * 是否设置为管理员（true: 设置为管理员, false: 取消管理员）
     */
    @NotNull(message = "管理员状态不能为空")
    private Boolean isAdmin;
}
