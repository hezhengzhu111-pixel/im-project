package com.im.dto.response;

import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

/**
 * 文件上传响应实体类
 */
@Data
@NoArgsConstructor
@AllArgsConstructor
public class FileUploadResponse {
    
    /**
     * 原始文件名
     */
    private String originalFilename;
    
    /**
     * 存储文件名
     */
    private String filename;
    
    /**
     * 文件访问URL
     */
    private String url;
    
    /**
     * 文件大小（字节）
     */
    private Long size;
    
    /**
     * 文件类型
     */
    private String contentType;
    
    /**
     * 文件分类
     */
    private String category;
    
    /**
     * 上传日期
     */
    private String uploadDate;
    
    /**
     * 上传时间戳
     */
    private Long uploadTime;
    
    /**
     * 上传者ID
     */
    private Long uploaderId;
}