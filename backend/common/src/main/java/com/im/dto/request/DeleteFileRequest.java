package com.im.dto.request;

import jakarta.validation.constraints.NotBlank;
import lombok.Data;

@Data
public class DeleteFileRequest {
    @NotBlank(message = "文件分类不能为空")
    private String category;

    @NotBlank(message = "日期不能为空")
    private String date;

    @NotBlank(message = "文件名不能为空")
    private String filename;
}
