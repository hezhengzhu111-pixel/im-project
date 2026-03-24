package com.im.dto.request;

import lombok.Data;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

/**
 * 更新群组信息请求DTO
 */
@Data
public class UpdateGroupInfoRequest {
    
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
     * 新的群组名称
     */
    @Size(max = 50, message = "群组名称不能超过50个字符")
    private String groupName;
    
    /**
     * 新的群组描述
     */
    @Size(max = 200, message = "群组描述不能超过200个字符")
    private String description;
}
