package com.im.dto;

import lombok.Data;
import lombok.AllArgsConstructor;
import lombok.NoArgsConstructor;
import lombok.Builder;

/**
 * 消息操作响应DTO
 */
@Data
@Builder
@AllArgsConstructor
@NoArgsConstructor
public class MessageResponseDTO {
    private boolean success;
    private String message;
    private Long messageId;
    
    public static MessageResponseDTO success(String message, Long messageId) {
        return MessageResponseDTO.builder()
                .success(true)
                .message(message)
                .messageId(messageId)
                .build();
    }
    
    public static MessageResponseDTO success(String message) {
        return MessageResponseDTO.builder()
                .success(true)
                .message(message)
                .build();
    }
    
    public static MessageResponseDTO error(String message) {
        return MessageResponseDTO.builder()
                .success(false)
                .message(message)
                .build();
    }
}