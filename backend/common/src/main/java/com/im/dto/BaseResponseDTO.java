package com.im.dto;

import lombok.Data;
import lombok.AllArgsConstructor;
import lombok.NoArgsConstructor;

/**
 * 基础响应DTO
 */
@Data
@AllArgsConstructor
@NoArgsConstructor
public class BaseResponseDTO {
    private boolean success;
    private String message;
    
    public static BaseResponseDTO success() {
        return new BaseResponseDTO(true, "操作成功");
    }
    
    public static BaseResponseDTO success(String message) {
        return new BaseResponseDTO(true, message);
    }
    
    public static BaseResponseDTO error(String message) {
        return new BaseResponseDTO(false, message);
    }
}