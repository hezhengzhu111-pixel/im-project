package com.im.dto.request;

import lombok.Data;
import jakarta.validation.constraints.NotNull;

/**
 * 解散群组请求DTO
 */
@Data
public class DismissGroupRequest {
    
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
}
