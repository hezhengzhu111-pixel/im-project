package com.im.dto.request;

import lombok.Data;

import jakarta.validation.constraints.NotBlank;

/**
 * 获取文件信息请求
 */
@Data
public class GetFileInfoRequest {
    
    @NotBlank(message = "文件分类不能为空")
    private String category;
    
    @NotBlank(message = "日期不能为空")
    private String date;
    
    @NotBlank(message = "文件名不能为空")
    private String filename;
}
