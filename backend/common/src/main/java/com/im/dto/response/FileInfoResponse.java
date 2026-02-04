package com.im.dto.response;

import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

/**
 * 文件信息响应实体类
 */
@Data
@NoArgsConstructor
@AllArgsConstructor
public class FileInfoResponse {
    
    /**
     * 文件名
     */
    private String filename;
    
    /**
     * 文件大小（字节）
     */
    private Long size;
    
    /**
     * 文件类型
     */
    private String contentType;
    
    /**
     * 最后修改时间
     */
    private Long lastModified;
}