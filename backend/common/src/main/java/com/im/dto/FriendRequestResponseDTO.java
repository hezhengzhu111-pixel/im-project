package com.im.dto;

import lombok.Data;
import lombok.AllArgsConstructor;
import lombok.NoArgsConstructor;
import lombok.Builder;

/**
 * 好友请求响应DTO
 */
@Data
@Builder
@AllArgsConstructor
@NoArgsConstructor
public class FriendRequestResponseDTO {
    private boolean success;
    private String message;
    private Long requestId;
    
    public static FriendRequestResponseDTO success(String message, Long requestId) {
        return FriendRequestResponseDTO.builder()
                .success(true)
                .message(message)
                .requestId(requestId)
                .build();
    }
    
    public static FriendRequestResponseDTO success(String message) {
        return FriendRequestResponseDTO.builder()
                .success(true)
                .message(message)
                .build();
    }
    
    public static FriendRequestResponseDTO error(String message) {
        return FriendRequestResponseDTO.builder()
                .success(false)
                .message(message)
                .build();
    }
}