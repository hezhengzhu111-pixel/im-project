package com.im.dto.request;

import lombok.Data;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.NotNull;
import java.util.List;

/**
 * 批量添加群成员请求DTO
 */
@Data
public class AddGroupMembersRequest {
    
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
     * 要添加的成员ID列表
     */
    @NotEmpty(message = "成员ID列表不能为空")
    private List<Long> memberIds;
}
