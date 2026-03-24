package com.im.dto;

import lombok.Data;
import lombok.AllArgsConstructor;
import lombok.NoArgsConstructor;
import lombok.Builder;

/**
 * 用户认证响应DTO
 */
@Data
@Builder
@AllArgsConstructor
@NoArgsConstructor
public class UserAuthResponseDTO {
    private boolean success;
    private String message;
    private UserDTO user;
    private String token;
    private String refreshToken;
    private Long expiresInMs;
    private Long refreshExpiresInMs;
    private String imToken;
    
    public static UserAuthResponseDTO success(UserDTO user, String token, String imToken) {
        return UserAuthResponseDTO.builder()
                .success(true)
                .message("操作成功")
                .user(user)
                .token(token)
                .imToken(imToken)
                .build();
    }

    public static UserAuthResponseDTO success(UserDTO user, String token, String refreshToken, Long expiresInMs, Long refreshExpiresInMs) {
        return UserAuthResponseDTO.builder()
                .success(true)
                .message("操作成功")
                .user(user)
                .token(token)
                .refreshToken(refreshToken)
                .expiresInMs(expiresInMs)
                .refreshExpiresInMs(refreshExpiresInMs)
                .build();
    }
    
    public static UserAuthResponseDTO success(UserDTO user, String token) {
        return UserAuthResponseDTO.builder()
                .success(true)
                .message("操作成功")
                .user(user)
                .token(token)
                .build();
    }
    
    public static UserAuthResponseDTO error(String message) {
        return UserAuthResponseDTO.builder()
                .success(false)
                .message(message)
                .build();
    }
}
